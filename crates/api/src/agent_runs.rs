//! Agent sessions that outlive the browser tab.
//!
//! `POST /v1/agent/runs` records the prompt and returns immediately. The model
//! loop runs on a task of its own, so closing the tab does not stop it.
//! Every write the agent makes is a proposal. A person accepts or discards
//! it. A later edit of the same object marks that proposal stale and appends
//! a notice on the run.

use std::collections::BTreeMap;
use std::time::Duration;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use braian_model::ObjectId;
use chrono::Utc;
use serde_json::{Map, Value, json};
use uuid::Uuid;

use crate::auth::{Auth, Identity, Role};
use crate::http_schema::{
    AgentMessageView, AgentProposalView, AgentRunCreate, AgentRunDetail, AgentRunFollowUp,
    AgentRunPatch, AgentRunSummary, AgentSessionProposal,
};
use crate::platform::{drive_agent, run_operation};
use crate::problem::{Problem, store_status};
use crate::state::AppState;

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/v1/agent/runs", get(list_runs).post(create_run))
        .route("/v1/agent/runs/{id}", get(get_run).patch(patch_run))
        .route("/v1/agent/runs/{id}/messages", post(follow_up))
        .route("/v1/agent/runs/{id}/take-over", post(take_over))
        .route("/v1/agent/runs/{id}/proposals", post(propose_in_session))
}

fn require_viewer(identity: &Identity) -> Result<(), Problem> {
    crate::platform::require(identity, Role::Viewer)
}

async fn create_run(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Json(body): Json<AgentRunCreate>,
) -> Result<Json<AgentRunDetail>, Problem> {
    require_viewer(&identity)?;
    let prompt = latest_user_text(&body.messages);
    if prompt.is_empty() {
        return Err(Problem::new(
            StatusCode::BAD_REQUEST,
            "empty_prompt",
            "say what the agent should do",
        ));
    }
    let id = Uuid::now_v7();
    let user_id = resolve_user_id(&state, &identity).await?;
    let context = if body.context.is_null() {
        json!({})
    } else {
        body.context.clone()
    };
    state
        .store
        .insert_agent_run(&braian_store::NewAgentRun {
            id,
            user_id,
            principal_id: identity.actor.actor.as_uuid(),
            workspace_id: body.workspace_id,
            title: title_from(&prompt),
            context: context.clone(),
        })
        .await
        .map_err(store_status)?;
    for message in &body.messages {
        let role = message
            .get("role")
            .and_then(Value::as_str)
            .unwrap_or("user");
        let content = message
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        if content.is_empty() {
            continue;
        }
        let kind = if role == "assistant" {
            "assistant"
        } else {
            "user"
        };
        state
            .store
            .append_agent_message(id, kind, &json!({ "text": content }))
            .await
            .map_err(store_status)?;
    }
    let (kind, hidden) = session_choice(&prompt);
    let session = session_document(&context);
    state
        .store
        .ensure_agent_session(id, kind, hidden, &session)
        .await
        .map_err(store_status)?;
    spawn_run(state.clone(), identity.clone(), id);
    Ok(Json(load_detail(&state, &identity, id).await?))
}

async fn list_runs(
    State(state): State<AppState>,
    Auth(identity): Auth,
) -> Result<Json<crate::http_schema::AgentRunList>, Problem> {
    require_viewer(&identity)?;
    let user_id = resolve_user_id(&state, &identity).await?;
    let runs = state
        .store
        .list_agent_runs(identity.actor.actor.as_uuid(), user_id)
        .await
        .map_err(store_status)?;
    Ok(Json(crate::http_schema::AgentRunList {
        runs: runs.into_iter().map(summary_of).collect(),
    }))
}

async fn get_run(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Path(id): Path<Uuid>,
) -> Result<Json<AgentRunDetail>, Problem> {
    require_viewer(&identity)?;
    Ok(Json(load_detail(&state, &identity, id).await?))
}

async fn patch_run(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Path(id): Path<Uuid>,
    Json(body): Json<AgentRunPatch>,
) -> Result<Json<AgentRunDetail>, Problem> {
    require_viewer(&identity)?;
    if let Some(mode) = body.mode.as_deref()
        && !matches!(mode, "foreground" | "background")
    {
        return Err(Problem::new(
            StatusCode::BAD_REQUEST,
            "invalid_mode",
            "mode is foreground or background",
        ));
    }
    if let Some(kind) = body.session_kind.as_deref()
        && !matches!(kind, "own" | "user")
    {
        return Err(Problem::new(
            StatusCode::BAD_REQUEST,
            "invalid_session_kind",
            "session_kind is own or user",
        ));
    }
    let user_id = resolve_user_id(&state, &identity).await?;
    let updated = state
        .store
        .patch_agent_run(
            id,
            identity.actor.actor.as_uuid(),
            user_id,
            &braian_store::AgentRunUpdate {
                tab_open: body.tab_open,
                view_id: body.view_id,
                set_view: body.view_id.is_some(),
                mode: body.mode.as_deref(),
                hidden: body.hidden,
                session_kind: body.session_kind.as_deref(),
            },
        )
        .await
        .map_err(store_status)?;
    if !updated {
        return Err(Problem::new(
            StatusCode::NOT_FOUND,
            "not_found",
            "agent run",
        ));
    }
    Ok(Json(load_detail(&state, &identity, id).await?))
}

async fn follow_up(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Path(id): Path<Uuid>,
    Json(body): Json<AgentRunFollowUp>,
) -> Result<Json<AgentRunDetail>, Problem> {
    require_viewer(&identity)?;
    let content = body.content.trim();
    if content.is_empty() {
        return Err(Problem::new(
            StatusCode::BAD_REQUEST,
            "empty_prompt",
            "say what the agent should do",
        ));
    }
    let user_id = resolve_user_id(&state, &identity).await?;
    let current = state
        .store
        .agent_run_for(id, identity.actor.actor.as_uuid(), user_id)
        .await
        .map_err(store_status)?
        .ok_or_else(|| Problem::new(StatusCode::NOT_FOUND, "not_found", "agent run"))?;
    if current.status == "working" {
        return Err(Problem::new(
            StatusCode::CONFLICT,
            "agent_working",
            "the agent is still working",
        ));
    }
    state
        .store
        .append_agent_message(id, "user", &json!({ "text": content }))
        .await
        .map_err(store_status)?;
    state
        .store
        .set_agent_run_status(id, "working", None)
        .await
        .map_err(store_status)?;
    spawn_run(state.clone(), identity.clone(), id);
    Ok(Json(load_detail(&state, &identity, id).await?))
}

async fn take_over(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Path(id): Path<Uuid>,
) -> Result<Json<AgentRunDetail>, Problem> {
    require_viewer(&identity)?;
    let user_id = resolve_user_id(&state, &identity).await?;
    let stopped = state
        .store
        .take_over_agent_run(id, identity.actor.actor.as_uuid(), user_id)
        .await
        .map_err(store_status)?;
    if !stopped {
        return Err(Problem::new(
            StatusCode::CONFLICT,
            "agent_not_controlling",
            "the agent is not using your session",
        ));
    }
    state
        .store
        .append_agent_message(
            id,
            "notice",
            &json!({ "text": "You took over. The agent stopped." }),
        )
        .await
        .map_err(store_status)?;
    Ok(Json(load_detail(&state, &identity, id).await?))
}

async fn propose_in_session(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Path(id): Path<Uuid>,
    Json(body): Json<AgentSessionProposal>,
) -> Result<Json<AgentRunDetail>, Problem> {
    crate::platform::require(&identity, Role::Editor)?;
    let user_id = resolve_user_id(&state, &identity).await?;
    let run = state
        .store
        .agent_run_for(id, identity.actor.actor.as_uuid(), user_id)
        .await
        .map_err(store_status)?
        .ok_or_else(|| Problem::new(StatusCode::NOT_FOUND, "not_found", "agent run"))?;
    if run.session_kind != "own" {
        return Err(Problem::new(
            StatusCode::CONFLICT,
            "not_agent_session",
            "proposals from the screen belong to the agent's own session",
        ));
    }
    let title = body
        .title
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .unwrap_or("Edit while viewing the agent's session");
    let proposal_id = Uuid::now_v7();
    let row = braian_store::ProposalRow {
        id: Uuid::now_v7(),
        object_id: Some(body.object_id),
        object_key: body.object_key.clone(),
        type_key: Some(body.type_key.clone()),
        base_version: Some(body.base_version),
        patch: json!({ "values": body.values }),
        status: "pending".into(),
        conflict: false,
        position: 0,
    };
    state
        .store
        .create_proposal(
            proposal_id,
            title,
            "user",
            identity.actor.actor,
            identity.actor.on_behalf_of,
            false,
            &[row],
        )
        .await
        .map_err(store_status)?;
    state
        .store
        .attach_proposal_to_run(proposal_id, id)
        .await
        .map_err(store_status)?;
    state
        .store
        .append_agent_message(
            id,
            "proposal",
            &json!({ "proposal_id": proposal_id, "text": "Proposed while viewing the agent's session." }),
        )
        .await
        .map_err(store_status)?;
    Ok(Json(load_detail(&state, &identity, id).await?))
}

fn spawn_run(state: AppState, identity: Identity, run_id: Uuid) {
    tokio::spawn(async move {
        if let Err(error) = execute_run(&state, &identity, run_id).await {
            tracing::error!(%error, %run_id, "agent run failed");
            let _ = state
                .store
                .finish_agent_run_if_working(run_id, "failed", Some(&error))
                .await;
        }
    });
}

async fn execute_run(state: &AppState, identity: &Identity, run_id: Uuid) -> Result<(), String> {
    let user_id = resolve_user_id(state, identity)
        .await
        .map_err(|problem| problem.detail)?;
    let run = state
        .store
        .agent_run_for(run_id, identity.actor.actor.as_uuid(), user_id)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "agent run disappeared".to_owned())?;
    let stored = state
        .store
        .agent_messages(run_id)
        .await
        .map_err(|error| error.to_string())?;
    let prompt = stored
        .iter()
        .rev()
        .find(|message| message.kind == "user")
        .and_then(|message| message.body.get("text").and_then(Value::as_str))
        .unwrap_or("")
        .to_owned();
    if model_unavailable() && prompt.to_lowercase().contains("fail this run") {
        // Stay working long enough for the client to show the retry, then fail.
        tokio::time::sleep(Duration::from_secs(1)).await;
        return Err("openai error: the model request failed (status 500)".into());
    }
    if model_unavailable() && prompt.to_lowercase().contains("hold the run") {
        // A long hold leaves time to open the hidden session or take over.
        let steps = hold_steps(&prompt);
        for _ in 0..steps {
            if !state
                .store
                .agent_run_is_working(run_id)
                .await
                .map_err(|error| error.to_string())?
            {
                return Ok(());
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    }
    if !state
        .store
        .agent_run_is_working(run_id)
        .await
        .map_err(|error| error.to_string())?
    {
        return Ok(());
    }
    // The mock stops for a decision instead of inventing an answer.
    if model_unavailable() && prompt.to_lowercase().contains("ask me before") {
        state
            .store
            .append_agent_message(
                run_id,
                "question",
                &json!({ "text": "Which value should I use? I will not guess." }),
            )
            .await
            .map_err(|error| error.to_string())?;
        state
            .store
            .finish_agent_run_if_working(run_id, "waiting", None)
            .await
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
    // A clear rename is resolved here, with or without a model. The same
    // patch_object proposal path files it. The model is not asked to invent
    // a second write.
    if let Some(request) = parse_rename(&prompt) {
        propose_parsed_rename(state, identity, run_id, &run.context, &request)
            .await
            .map_err(|problem| problem.detail)?;
    } else if model_unavailable() && prompt.to_lowercase().contains("propose a new name") {
        propose_mock_name(state, identity, run_id, &run.context, None)
            .await
            .map_err(|problem| problem.detail)?;
    } else {
        let messages = model_messages(&stored);
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let persist_state = state.clone();
        let persist = tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                if let Err(error) = persist_event(&persist_state, run_id, &event).await {
                    tracing::warn!(%error, "could not store an agent event");
                }
            }
        });
        drive_agent(state, identity, messages, run.context, &tx).await;
        drop(tx);
        let _ = persist.await;
    }
    if !state
        .store
        .agent_run_is_working(run_id)
        .await
        .map_err(|error| error.to_string())?
    {
        return Ok(());
    }
    if decision_pending(state, run_id).await? {
        state
            .store
            .finish_agent_run_if_working(run_id, "waiting", None)
            .await
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
    acknowledge_notices(state, run_id)
        .await
        .map_err(|error| error.to_string())?;
    state
        .store
        .finish_agent_run_if_working(run_id, "done", None)
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// Own hidden session unless the task needs the person's screen, such as opening a product view.
pub fn session_choice(prompt: &str) -> (&'static str, bool) {
    let text = prompt.to_lowercase();
    if text.contains("own session") || text.contains("hidden session") {
        return ("own", true);
    }
    let user_screen = text.contains("my session")
        || text.contains("my view")
        || text.contains("take control")
        || (text.contains("open") && (text.contains("product") || text.contains("view")));
    if user_screen {
        return ("user", false);
    }
    ("own", true)
}

fn hold_steps(prompt: &str) -> u32 {
    let text = prompt.to_lowercase();
    if text.contains("own session")
        || text.contains("product view")
        || text.contains("agents table")
    {
        return 150;
    }
    40
}

/// Views the agent is working in. A product table wins over the focused pane.
pub fn session_document(context: &Value) -> Value {
    let mut products = Vec::new();
    let mut tables = Vec::new();
    if let Some(panes) = context.get("panes").and_then(Value::as_array) {
        for pane in panes.iter().take(24) {
            let id = pane
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_owned();
            if id.is_empty() {
                continue;
            }
            let kind = pane.get("type").and_then(Value::as_str).unwrap_or("");
            let title = pane.get("title").and_then(Value::as_str).unwrap_or("");
            if title.to_lowercase().contains("product") {
                if !products.contains(&id) {
                    products.push(id);
                }
            } else if kind == "object_table" && !tables.contains(&id) {
                tables.push(id);
            }
        }
    }
    let mut views = products;
    views.extend(tables);
    if views.is_empty()
        && let Some(focused) = context.get("focused").and_then(Value::as_str)
    {
        let focused = focused.trim();
        if !focused.is_empty() {
            views.push(focused.to_owned());
        }
    }
    json!({
        "views": views,
        "focus": views.first(),
    })
}

/// A question after the latest user message means the run is waiting.
async fn decision_pending(state: &AppState, run_id: Uuid) -> Result<bool, String> {
    let messages = state
        .store
        .agent_messages(run_id)
        .await
        .map_err(|error| error.to_string())?;
    let last_user = messages
        .iter()
        .rposition(|message| message.kind == "user")
        .unwrap_or(0);
    Ok(messages
        .iter()
        .skip(last_user)
        .any(|message| message.kind == "question"))
}

// english-check: allow
/// A clear request to rename one product. `subject` is empty when the person
/// means the selected object. `identifier` is set only when they asked to
/// change the key, id, or number — a display-name request leaves those alone.
struct ParsedRename {
    subject: String,
    value: String,
    identifier: bool,
}

/// The new name in a direct rename, such as "byt namn ... till Test 1" or
/// "rename ... to Test 1". A clear task proposes the change instead of asking.
fn rename_target(prompt: &str) -> Option<String> {
    let lower = prompt.to_lowercase();
    if !asks_for_rename(&lower) {
        return None;
    }
    for marker in [" till ", " to "] {
        let Some(at) = lower.rfind(marker) else {
            continue;
        };
        let target = trim_name(&prompt[at + marker.len()..]);
        if !target.is_empty() {
            return Some(target);
        }
    }
    None
}

fn asks_for_rename(lower: &str) -> bool {
    lower.contains("byt namn")
        || lower.contains("ändra namnet")
        || lower.contains("rename")
        || lower.contains("change the name")
        || lower.contains("change name")
        || lower.contains("set the name")
        || explicit_identifier(lower)
}

fn explicit_identifier(lower: &str) -> bool {
    const PHRASES: &[&str] = &[
        "rename the key",
        "rename key",
        "change the key",
        "change key",
        "rename the id",
        "change the id",
        "rename the number",
        "change the number",
        "byt nyckel",
        "ändra nyckeln",
        "byt id",
        "ändra id",
        "byt nummer",
        "ändra numret",
    ];
    PHRASES.iter().any(|phrase| lower.contains(phrase))
}

fn parse_rename(prompt: &str) -> Option<ParsedRename> {
    let value = rename_target(prompt)?;
    let lower = prompt.to_lowercase();
    let subject = rename_subject(prompt);
    Some(ParsedRename {
        subject,
        value,
        identifier: explicit_identifier(&lower),
    })
}

fn rename_subject(prompt: &str) -> String {
    let lower = prompt.to_lowercase();
    let mut cut = prompt.len();
    for marker in [" till ", " to "] {
        if let Some(at) = lower.rfind(marker) {
            cut = cut.min(at);
        }
    }
    let mut subject = strip_rename_prefix(prompt[..cut].trim()).trim().to_owned();
    subject = trim_name(&subject);
    if subject_is_deictic(&subject) {
        return String::new();
    }
    if let Some(rest) = strip_type_prefix(&subject)
        && !rest.is_empty()
        && !subject_is_deictic(rest)
    {
        subject = trim_name(rest);
    }
    if subject_is_deictic(&subject) {
        String::new()
    } else {
        subject
    }
}

fn strip_rename_prefix(text: &str) -> &str {
    const PREFIXES: &[&str] = &[
        "rename the key of ",
        "rename the id of ",
        "rename the number of ",
        "change the key of ",
        "change the id of ",
        "change the number of ",
        "byt namn på ",
        "ändra namnet på ",
        "change the name of ",
        "set the name of ",
        "change name of ",
        "set name of ",
        "rename ",
        "change the name ",
        "change name ",
        "set the name ",
        "set name ",
    ];
    let mut rest = text;
    let mut changed = true;
    while changed {
        changed = false;
        for prefix in PREFIXES {
            if let Some(next) = strip_prefix_ci(rest, prefix) {
                rest = next;
                changed = true;
                break;
            }
        }
    }
    rest
}

fn strip_type_prefix(text: &str) -> Option<&str> {
    const PREFIXES: &[&str] = &[
        "the product ",
        "the article ",
        "the item ",
        "produkten ",
        "artikeln ",
        "product ",
        "article ",
        "item ",
    ];
    for prefix in PREFIXES {
        if let Some(rest) = strip_prefix_ci(text, prefix)
            && !rest.is_empty()
        {
            return Some(rest);
        }
    }
    None
}

fn subject_is_deictic(subject: &str) -> bool {
    const PHRASES: &[&str] = &[
        "",
        "this",
        "it",
        "this product",
        "this object",
        "this item",
        "this article",
        "the product",
        "the object",
        "the item",
        "the article",
        "selected",
        "the selected",
        "the selected product",
        "selected product",
        "den här",
        "den här produkten",
        "det här",
        "det här objektet",
        "denna",
        "denna produkt",
        "produkten",
        "markerade",
        "den markerade",
        "den markerade produkten",
    ];
    let folded = subject.split_whitespace().collect::<Vec<_>>().join(" ");
    PHRASES
        .iter()
        .any(|phrase| folded.eq_ignore_ascii_case(phrase) || folded == *phrase)
}

fn strip_prefix_ci<'a>(text: &'a str, prefix: &str) -> Option<&'a str> {
    let mut rest = text.chars();
    for expected in prefix.chars() {
        let next = rest.next()?;
        if next.to_lowercase().to_string() != expected.to_lowercase().to_string() {
            return None;
        }
    }
    Some(rest.as_str().trim())
}

fn trim_name(text: &str) -> String {
    text.trim_matches(|character: char| {
        character.is_whitespace()
            || matches!(
                character,
                '"' | '\'' | '“' | '”' | '‘' | '’' | '.' | '!' | '?'
            )
    })
    .trim()
    .to_owned()
}
// english-check: end

async fn propose_mock_name(
    state: &AppState,
    identity: &Identity,
    run_id: Uuid,
    context: &Value,
    requested: Option<&str>,
) -> Result<(), Problem> {
    let Some((object_id, type_key, base_version)) = selection_target(context) else {
        state
            .store
            .append_agent_message(
                run_id,
                "assistant",
                &json!({ "text": "Select one object, then ask me to propose a new name." }),
            )
            .await
            .map_err(store_status)?;
        return Ok(());
    };
    let language = context
        .get("language")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or("en");
    let name = requested.unwrap_or("Agent draft");
    let mut args = json!({
        "id": object_id,
        "type": type_key,
        "values": { "name": { language: name } },
    });
    if let Some(version) = base_version {
        args["base_version"] = json!(version);
    }
    let result = run_operation(state, identity, "patch_object", &args, true).await?;
    let Some(proposal_id) = result
        .get("proposal_id")
        .and_then(Value::as_str)
        .and_then(|text| Uuid::parse_str(text).ok())
    else {
        return say(
            state,
            run_id,
            "I could not file the proposal. I did not change the product.",
        )
        .await;
    };
    state
        .store
        .attach_proposal_to_run(proposal_id, run_id)
        .await
        .map_err(store_status)?;
    state
        .store
        .append_agent_message(
            run_id,
            "proposal",
            &json!({ "proposal_id": proposal_id, "text": "Proposed a new name." }),
        )
        .await
        .map_err(store_status)?;
    say(
        state,
        run_id,
        "I proposed a new name. Approve or reject it here. I will not apply it myself.",
    )
    .await
}

/// Finds the product the person named and files one display-name proposal.
/// An explicit key, id, or number request is the only path that patches the
/// identifier. Everything else leaves the key alone.
async fn propose_parsed_rename(
    state: &AppState,
    identity: &Identity,
    run_id: Uuid,
    context: &Value,
    request: &ParsedRename,
) -> Result<(), Problem> {
    if !identity.role.allows(Role::Editor) {
        return say(
            state,
            run_id,
            "You have read-only access, so I did not file a proposal.",
        )
        .await;
    }
    let cached = state.models.get(&state.store).await?;
    let resolved = resolve_rename_target(state, &cached, context, request).await?;
    let target = match resolved {
        RenameTarget::One(target) => target,
        RenameTarget::Missing { named } => {
            let text = if named {
                format!(
                    "I could not find a product named {}. I did not file a proposal.",
                    request.subject
                )
            } else {
                "Select one product, then ask me to rename it. I did not file a proposal."
                    .to_owned()
            };
            return say(state, run_id, &text).await;
        }
        RenameTarget::Many(labels) => {
            let listed = if labels.is_empty() {
                request.subject.clone()
            } else {
                labels.join(", ")
            };
            return say(
                state,
                run_id,
                &format!(
                    "Several products match {}. I did not file a proposal. Name the number, or select one product: {listed}.",
                    request.subject
                ),
            )
            .await;
        }
    };
    let (values, told) = if request.identifier {
        let Some(field) = key_attribute_key(&cached, target.type_id) else {
            return say(
                state,
                run_id,
                "I could not file a proposal because this product has no identifier field.",
            )
            .await;
        };
        (
            json!({ field: request.value }),
            format!(
                "I proposed a new identifier for {}. Approve or reject it here. I will not apply it myself.",
                target.key
            ),
        )
    } else {
        let language = name_language(&cached, context, &target.name);
        (
            json!({ "name": { language: request.value } }),
            format!(
                "I proposed a new name for {}. Approve or reject it here. I will not apply it myself.",
                target.key
            ),
        )
    };
    let args = json!({
        "id": target.id,
        "type": target.type_key,
        "values": values,
        "base_version": target.version,
    });
    let result = run_operation(state, identity, "patch_object", &args, true).await;
    let result = match result {
        Ok(result) => result,
        Err(problem) => {
            return say(
                state,
                run_id,
                &format!(
                    "I could not file the proposal. {} I did not change the product.",
                    problem.detail
                ),
            )
            .await;
        }
    };
    let Some(proposal_id) = result
        .get("proposal_id")
        .and_then(Value::as_str)
        .and_then(|text| Uuid::parse_str(text).ok())
    else {
        return say(
            state,
            run_id,
            "I could not file the proposal. I did not change the product.",
        )
        .await;
    };
    state
        .store
        .attach_proposal_to_run(proposal_id, run_id)
        .await
        .map_err(store_status)?;
    state
        .store
        .append_agent_message(
            run_id,
            "proposal",
            &json!({ "proposal_id": proposal_id, "text": "Proposed a new name." }),
        )
        .await
        .map_err(store_status)?;
    say(state, run_id, &told).await
}

async fn say(state: &AppState, run_id: Uuid, text: &str) -> Result<(), Problem> {
    state
        .store
        .append_agent_message(
            run_id,
            "assistant",
            &json!({ "text": text, "available": true }),
        )
        .await
        .map_err(store_status)?;
    Ok(())
}

struct ResolvedObject {
    id: Uuid,
    key: String,
    type_id: braian_model::TypeId,
    type_key: String,
    version: i64,
    name: Value,
}

enum RenameTarget {
    One(ResolvedObject),
    Many(Vec<String>),
    Missing { named: bool },
}

async fn resolve_rename_target(
    state: &AppState,
    cached: &crate::state::CachedModel,
    context: &Value,
    request: &ParsedRename,
) -> Result<RenameTarget, Problem> {
    if request.subject.is_empty() {
        let items = context
            .get("selection")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let ids: Vec<Uuid> = items
            .iter()
            .filter_map(|item| {
                item.get("id")
                    .and_then(Value::as_str)
                    .and_then(|text| Uuid::parse_str(text).ok())
            })
            .collect();
        if ids.len() > 1 {
            let labels = items
                .iter()
                .map(|item| {
                    let key = item.get("key").and_then(Value::as_str).unwrap_or("");
                    let name = item.get("name").and_then(Value::as_str).unwrap_or("");
                    match (key.is_empty(), name.is_empty()) {
                        (false, false) => format!("{key} ({name})"),
                        (false, true) => key.to_owned(),
                        (true, false) => name.to_owned(),
                        (true, true) => item
                            .get("id")
                            .and_then(Value::as_str)
                            .unwrap_or("object")
                            .to_owned(),
                    }
                })
                .take(8)
                .collect();
            return Ok(RenameTarget::Many(labels));
        }
        let Some(id) = ids.first().copied() else {
            return Ok(RenameTarget::Missing { named: false });
        };
        return load_rename_target(state, cached, id)
            .await
            .map(|target| match target {
                Some(target) => RenameTarget::One(target),
                None => RenameTarget::Missing { named: false },
            });
    }
    let ids = name_attribute_ids(&cached.defs);
    let rows = state
        .store
        .objects_matching_label(&request.subject, &ids, 9)
        .await
        .map_err(store_status)?;
    if rows.is_empty() {
        return Ok(RenameTarget::Missing { named: true });
    }
    if rows.len() > 1 {
        let labels = rows
            .iter()
            .take(8)
            .map(|(_, key, _, _)| key.clone())
            .collect();
        return Ok(RenameTarget::Many(labels));
    }
    let id = rows[0].0;
    load_rename_target(state, cached, id)
        .await
        .map(|target| match target {
            Some(target) => RenameTarget::One(target),
            None => RenameTarget::Missing { named: true },
        })
}

fn name_attribute_ids(defs: &braian_model::DefinitionSet) -> Vec<String> {
    let mut ids = Vec::new();
    let standard = braian_model::name_id();
    if defs
        .attributes
        .iter()
        .any(|attribute| attribute.id == standard)
    {
        ids.push(standard.as_uuid().to_string());
    }
    for attribute in &defs.attributes {
        if attribute.key == "name" {
            let text = attribute.id.as_uuid().to_string();
            if !ids.contains(&text) {
                ids.push(text);
            }
        }
    }
    ids
}

async fn load_rename_target(
    state: &AppState,
    cached: &crate::state::CachedModel,
    id: Uuid,
) -> Result<Option<ResolvedObject>, Problem> {
    let Some(stored) = state
        .store
        .get_object(ObjectId::from_uuid(id))
        .await
        .map_err(store_status)?
    else {
        return Ok(None);
    };
    if stored.deleted_at.is_some() {
        return Ok(None);
    }
    let name_id = cached
        .model
        .attribute_by_key("name")
        .map(|attribute| attribute.id)
        .unwrap_or_else(braian_model::name_id);
    let name = stored
        .object
        .values
        .get(&name_id)
        .cloned()
        .unwrap_or_else(|| json!({}));
    Ok(Some(ResolvedObject {
        id,
        key: stored.key,
        type_id: stored.object.type_id,
        type_key: crate::wire::type_key(&cached.defs, stored.object.type_id),
        version: i64::try_from(stored.version).unwrap_or(i64::MAX),
        name,
    }))
}

fn key_attribute_key(
    cached: &crate::state::CachedModel,
    type_id: braian_model::TypeId,
) -> Option<String> {
    let id = cached.model.key_attribute(type_id)?;
    cached
        .model
        .attribute(id)
        .map(|attribute| attribute.key.clone())
}

fn name_language(cached: &crate::state::CachedModel, context: &Value, current: &Value) -> String {
    let known: Vec<String> = cached
        .defs
        .languages
        .iter()
        .map(|tag| tag.as_str().to_owned())
        .collect();
    let requested = context
        .get("language")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("");
    if known.iter().any(|tag| tag == requested) {
        return requested.to_owned();
    }
    if let Some(map) = current.as_object() {
        for tag in ["en", "sv", "de"] {
            if map.contains_key(tag) && known.iter().any(|known| known == tag) {
                return tag.to_owned();
            }
        }
        if let Some(tag) = map
            .keys()
            .find(|tag| known.iter().any(|known| known == *tag))
        {
            return tag.clone();
        }
    }
    known.first().cloned().unwrap_or_else(|| "en".to_owned())
}

async fn persist_event(
    state: &AppState,
    run_id: Uuid,
    event: &Value,
) -> Result<(), braian_store::Error> {
    match event.get("type").and_then(Value::as_str) {
        Some("question") => {
            state
                .store
                .append_agent_message(
                    run_id,
                    "question",
                    &json!({
                        "text": event.get("text").and_then(Value::as_str).unwrap_or_default(),
                    }),
                )
                .await?;
        }
        Some("answer") => {
            state
                .store
                .append_agent_message(
                    run_id,
                    "assistant",
                    &json!({
                        "text": event.get("text").and_then(Value::as_str).unwrap_or_default(),
                        "available": event.get("available").and_then(Value::as_bool).unwrap_or(true),
                    }),
                )
                .await?;
        }
        Some("error") => {
            state
                .store
                .append_agent_message(
                    run_id,
                    "error",
                    &json!({ "text": event.get("text").and_then(Value::as_str).unwrap_or_default() }),
                )
                .await?;
        }
        Some("proposal") => {
            let proposal = event.get("proposal").cloned().unwrap_or(json!({}));
            if let Some(proposal_id) = proposal
                .get("proposal_id")
                .and_then(Value::as_str)
                .and_then(|text| Uuid::parse_str(text).ok())
            {
                state
                    .store
                    .attach_proposal_to_run(proposal_id, run_id)
                    .await?;
                state
                    .store
                    .append_agent_message(
                        run_id,
                        "proposal",
                        &json!({ "proposal_id": proposal_id }),
                    )
                    .await?;
            }
        }
        Some("tool") | Some("step") => {
            state
                .store
                .append_agent_message(
                    run_id,
                    event.get("type").and_then(Value::as_str).unwrap_or("step"),
                    event,
                )
                .await?;
        }
        _ => {}
    }
    Ok(())
}

async fn acknowledge_notices(state: &AppState, run_id: Uuid) -> Result<(), braian_store::Error> {
    let messages = state.store.agent_messages(run_id).await?;
    let last_notice = messages
        .iter()
        .rposition(|message| message.kind == "notice");
    let Some(notice_at) = last_notice else {
        return Ok(());
    };
    let already = messages
        .iter()
        .skip(notice_at + 1)
        .any(|message| message.kind == "assistant");
    if already {
        return Ok(());
    }
    state
        .store
        .append_agent_message(
            run_id,
            "assistant",
            &json!({
                "text": "I was told that proposal is stale. I will not overwrite the edit."
            }),
        )
        .await?;
    Ok(())
}

fn model_messages(stored: &[braian_store::AgentMessageRow]) -> Vec<Value> {
    stored
        .iter()
        .filter_map(|message| match message.kind.as_str() {
            "user" => Some(json!({
                "role": "user",
                "content": message.body.get("text").and_then(Value::as_str).unwrap_or_default(),
            })),
            "assistant" => Some(json!({
                "role": "assistant",
                "content": message.body.get("text").and_then(Value::as_str).unwrap_or_default(),
            })),
            "notice" => Some(json!({
                "role": "user",
                "content": format!(
                    "System notice: {}",
                    message.body.get("text").and_then(Value::as_str).unwrap_or_default()
                ),
            })),
            _ => None,
        })
        .collect()
}

fn selection_target(context: &Value) -> Option<(Uuid, String, Option<i64>)> {
    let item = context.get("selection")?.as_array()?.first()?;
    let id = Uuid::parse_str(item.get("id")?.as_str()?).ok()?;
    let type_key = item
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let version = item.get("version").and_then(Value::as_i64).or_else(|| {
        item.get("version")
            .and_then(Value::as_str)
            .and_then(|text| text.parse().ok())
    });
    Some((id, type_key, version))
}

fn model_unavailable() -> bool {
    let key = std::env::var("OPENAI_API_KEY").unwrap_or_default();
    key.trim().is_empty() || std::env::var("BRAIAN_AGENT_MOCK").ok().as_deref() == Some("1")
}

fn latest_user_text(messages: &[Value]) -> String {
    messages
        .iter()
        .rev()
        .find_map(|message| {
            let role = message
                .get("role")
                .and_then(Value::as_str)
                .unwrap_or("user");
            if role != "user" {
                return None;
            }
            message
                .get("content")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(str::to_owned)
        })
        .unwrap_or_default()
}

fn title_from(prompt: &str) -> String {
    let trimmed = prompt.trim();
    let mut title: String = trimmed.chars().take(80).collect();
    if trimmed.chars().count() > 80 {
        title.push('…');
    }
    if title.is_empty() {
        "Agent".to_owned()
    } else {
        title
    }
}

async fn resolve_user_id(state: &AppState, identity: &Identity) -> Result<Option<Uuid>, Problem> {
    if identity.user_id.is_some() {
        return Ok(identity.user_id);
    }
    state
        .store
        .user_id_for_principal(identity.actor.actor.as_uuid())
        .await
        .map_err(store_status)
}

async fn load_detail(
    state: &AppState,
    identity: &Identity,
    id: Uuid,
) -> Result<AgentRunDetail, Problem> {
    let user_id = resolve_user_id(state, identity).await?;
    let run = state
        .store
        .agent_run_for(id, identity.actor.actor.as_uuid(), user_id)
        .await
        .map_err(store_status)?
        .ok_or_else(|| Problem::new(StatusCode::NOT_FOUND, "not_found", "agent run"))?;
    let messages = state.store.agent_messages(id).await.map_err(store_status)?;
    let proposals = state
        .store
        .agent_run_proposals(id)
        .await
        .map_err(store_status)?;
    Ok(detail_of(run, messages, proposals))
}

fn summary_of(run: braian_store::AgentRunRow) -> AgentRunSummary {
    AgentRunSummary {
        id: run.id,
        title: run.title,
        status: run.status,
        mode: run.mode,
        session_kind: run.session_kind,
        hidden: run.hidden,
        session: run.session,
        tab_open: run.tab_open,
        view_id: run.view_id,
        workspace_id: run.workspace_id,
        error: run.error,
        created_at: run.created_at.to_rfc3339(),
        updated_at: run.updated_at.to_rfc3339(),
        finished_at: run.finished_at.map(|value| value.to_rfc3339()),
        proposal_count: run.proposal_count,
        question: run.question,
    }
}

fn detail_of(
    run: braian_store::AgentRunRow,
    messages: Vec<braian_store::AgentMessageRow>,
    proposals: Vec<braian_store::AgentProposalLink>,
) -> AgentRunDetail {
    let summary = summary_of(run);
    AgentRunDetail {
        id: summary.id,
        title: summary.title,
        status: summary.status,
        mode: summary.mode,
        session_kind: summary.session_kind,
        hidden: summary.hidden,
        session: summary.session,
        tab_open: summary.tab_open,
        view_id: summary.view_id,
        workspace_id: summary.workspace_id,
        error: summary.error,
        created_at: summary.created_at,
        updated_at: summary.updated_at,
        finished_at: summary.finished_at,
        proposal_count: summary.proposal_count,
        question: summary.question,
        messages: messages
            .into_iter()
            .map(|message| AgentMessageView {
                id: message.id,
                kind: message.kind,
                body: message.body,
                created_at: message.created_at.to_rfc3339(),
            })
            .collect(),
        proposals: proposals
            .into_iter()
            .map(|proposal| AgentProposalView {
                id: proposal.id,
                title: proposal.title,
                status: proposal.status,
                stale: proposal.stale,
                stale_reason: proposal.stale_reason,
                object_id: proposal.object_id,
                object_key: proposal.object_key,
                patch: proposal.patch,
                resolved_at: proposal.resolved_at.map(|value| value.to_rfc3339()),
                reverted_at: proposal.reverted_at.map(|value| value.to_rfc3339()),
            })
            .collect(),
    }
}

/// A person edited an object. Pending agent proposals on it become stale.
pub async fn note_object_edited(
    state: &AppState,
    identity: &Identity,
    object_id: ObjectId,
    values: &BTreeMap<String, Value>,
    except: Option<Uuid>,
) {
    let who = identity
        .display_name
        .clone()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| identity.handle.clone());
    let edit = braian_store::StaleEdit {
        who,
        at: Utc::now(),
        fields: stale_fields(values),
    };
    if let Err(error) = state
        .store
        .mark_agent_proposals_stale(object_id.as_uuid(), except, &edit)
        .await
    {
        tracing::warn!(%error, "could not mark agent proposals stale");
    }
}

fn stale_fields(values: &BTreeMap<String, Value>) -> Vec<(String, String)> {
    let mut fields = Vec::new();
    for (key, value) in values {
        if let Some(map) = value.as_object().filter(|map| is_language_map(map)) {
            for (language, text) in map {
                fields.push((format!("{key} ({language})"), display_value(text)));
            }
            continue;
        }
        fields.push((key.clone(), display_value(value)));
    }
    fields
}

fn is_language_map(map: &Map<String, Value>) -> bool {
    !map.is_empty()
        && map.keys().all(|key| {
            let mut parts = key.split('-');
            let language = parts.next().unwrap_or("");
            let region = parts.next();
            parts.next().is_none()
                && (2..=3).contains(&language.len())
                && language.chars().all(|char| char.is_ascii_lowercase())
                && region.is_none_or(|part| {
                    (2..=4).contains(&part.len())
                        && part.chars().all(|char| char.is_ascii_alphanumeric())
                })
        })
}

fn display_value(value: &Value) -> String {
    let text = match value {
        Value::String(text) => text.clone(),
        Value::Number(number) => number.to_string(),
        Value::Bool(flag) => flag.to_string(),
        Value::Null => "empty".to_owned(),
        other => other.to_string(),
    };
    let mut chars = text.chars();
    let short: String = chars.by_ref().take(120).collect();
    if chars.next().is_some() {
        format!("{short}…")
    } else {
        short
    }
}

#[cfg(test)]
mod session_tests {
    use super::{parse_rename, rename_target, session_choice, session_document};
    use serde_json::json;

    #[test]
    fn a_direct_rename_names_the_new_value_without_a_question() {
        // english-check: allow
        assert_eq!(
            rename_target("byt namn på den här produkten till Test 1").as_deref(),
            Some("Test 1")
        );
        assert_eq!(
            rename_target("rename this product to Test 2").as_deref(),
            Some("Test 2")
        );
        assert_eq!(
            rename_target("change the name to \"Test 3\".").as_deref(),
            Some("Test 3")
        );
        assert_eq!(rename_target("how many products are there"), None);
    }

    #[test]
    fn a_named_product_is_the_subject_and_a_key_request_is_separate() {
        let named = parse_rename("rename Cheddar to Blue").expect("rename");
        assert_eq!(named.subject, "Cheddar");
        assert_eq!(named.value, "Blue");
        assert!(!named.identifier);

        let typed = parse_rename("rename the product Mature cheddar to Blue").expect("typed");
        assert_eq!(typed.subject, "Mature cheddar");
        assert!(!typed.identifier);

        // english-check: allow
        let selected = parse_rename("byt namn på den här produkten till Test 1").expect("selected");
        assert_eq!(selected.subject, "");
        assert_eq!(selected.value, "Test 1");
        assert!(!selected.identifier);
        let swedish = parse_rename("byt namn på Cheddar till Blå").expect("swedish");
        assert_eq!(swedish.subject, "Cheddar");
        assert_eq!(swedish.value, "Blå");
        assert!(!swedish.identifier);
        // english-check: end

        let key = parse_rename("rename the key of Cheddar to SKU-2").expect("key");
        assert_eq!(key.subject, "Cheddar");
        assert_eq!(key.value, "SKU-2");
        assert!(key.identifier);

        assert!(parse_rename("how many products are there").is_none());
    }

    #[test]
    fn the_agent_keeps_its_own_hidden_session_unless_the_task_needs_the_screen() {
        assert_eq!(session_choice("hold the run"), ("own", true));
        assert_eq!(session_choice("ask me before you continue"), ("own", true));
        assert_eq!(
            session_choice("hold the run in your own session"),
            ("own", true)
        );
        assert_eq!(
            session_choice("open the product view and hold the run"),
            ("user", false)
        );
        assert_eq!(
            session_choice("take control of my session"),
            ("user", false)
        );
    }

    #[test]
    fn the_session_document_prefers_the_product_table() {
        let context = json!({
            "focused": "detail",
            "panes": [
                { "id": "detail", "type": "object_detail", "title": "Detail" },
                { "id": "products", "type": "object_table", "title": "Products" },
                { "id": "other", "type": "object_table", "title": "Suppliers" }
            ]
        });
        let session = session_document(&context);
        assert_eq!(session["views"][0], "products");
        assert_eq!(session["views"][1], "other");
        assert_eq!(session["focus"], "products");
    }
}
