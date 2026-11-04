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
    AgentRunPatch, AgentRunSummary,
};
use crate::platform::{drive_agent, run_operation};
use crate::problem::{Problem, store_status};
use crate::state::AppState;

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/v1/agent/runs", get(list_runs).post(create_run))
        .route("/v1/agent/runs/{id}", get(get_run).patch(patch_run))
        .route("/v1/agent/runs/{id}/messages", post(follow_up))
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

fn spawn_run(state: AppState, identity: Identity, run_id: Uuid) {
    tokio::spawn(async move {
        if let Err(error) = execute_run(&state, &identity, run_id).await {
            tracing::error!(%error, %run_id, "agent run failed");
            let _ = state
                .store
                .set_agent_run_status(run_id, "failed", Some(&error))
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
        tokio::time::sleep(Duration::from_secs(8)).await;
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
            .set_agent_run_status(run_id, "waiting", None)
            .await
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
    if model_unavailable() && prompt.to_lowercase().contains("propose a new name") {
        propose_mock_name(state, identity, run_id, &run.context)
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
    if decision_pending(state, run_id).await? {
        state
            .store
            .set_agent_run_status(run_id, "waiting", None)
            .await
            .map_err(|error| error.to_string())?;
        return Ok(());
    }
    acknowledge_notices(state, run_id)
        .await
        .map_err(|error| error.to_string())?;
    state
        .store
        .set_agent_run_status(run_id, "done", None)
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
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

async fn propose_mock_name(
    state: &AppState,
    identity: &Identity,
    run_id: Uuid,
    context: &Value,
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
    let mut args = json!({
        "id": object_id,
        "type": type_key,
        "values": { "name": { language: "Agent draft" } },
    });
    if let Some(version) = base_version {
        args["base_version"] = json!(version);
    }
    let result = run_operation(state, identity, "patch_object", &args, true).await?;
    if let Some(proposal_id) = result
        .get("proposal_id")
        .and_then(Value::as_str)
        .and_then(|text| Uuid::parse_str(text).ok())
    {
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
    }
    state
        .store
        .append_agent_message(
            run_id,
            "assistant",
            &json!({
                "text": "I proposed a new name. Approve or reject it here. I will not apply it myself.",
                "available": true
            }),
        )
        .await
        .map_err(store_status)?;
    Ok(())
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
