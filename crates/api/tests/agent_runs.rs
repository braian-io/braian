//! Agent runs persist, keep working after the tab closes, and never apply
//! their own proposals. A later edit of the same object marks the proposal stale.

use std::time::Duration;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use braian_api::router;
use braian_store::testing::TestDb;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

const TOKENS: &str = "ada:human:token-ada";
const HUMAN: &str = "token-ada";

fn load_env() {
    if std::env::var_os("BRAIAN_TEST_DATABASE_URL").is_some() {
        return;
    }
    let Ok(start) = std::env::current_dir() else {
        return;
    };
    let mut dir = Some(start);
    for _ in 0..6 {
        let Some(current) = dir else { return };
        let path = current.join(".env");
        if let Ok(text) = std::fs::read_to_string(&path) {
            for line in text.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                let Some((key, value)) = line.split_once('=') else {
                    continue;
                };
                if std::env::var_os(key).is_none() {
                    unsafe { std::env::set_var(key, value.trim_matches('"')) };
                }
            }
            return;
        }
        dir = current.parent().map(std::path::Path::to_path_buf);
    }
}

fn mock_agent() {
    unsafe { std::env::set_var("BRAIAN_AGENT_MOCK", "1") };
}

async fn app() -> (TestDb, axum::Router) {
    load_env();
    mock_agent();
    let db = TestDb::create().await;
    let identities = braian_api::identities(db.store(), TOKENS).await.unwrap();
    let actor = identities
        .iter()
        .find(|item| item.handle == "ada")
        .expect("ada")
        .actor
        .clone();
    let app = router(db.store().clone(), identities);
    let defs: braian_model::DefinitionSet =
        serde_json::from_str(include_str!("../../../testdata/rules/definitions.json")).unwrap();
    db.store().put_definitions(&actor, &defs).await.unwrap();
    (db, app)
}

async fn call(
    app: &axum::Router,
    method: &str,
    path: &str,
    body: Option<&str>,
    extra: &[(&str, &str)],
) -> (StatusCode, Value) {
    let mut builder = Request::builder()
        .method(method)
        .uri(path)
        .header("authorization", format!("Bearer {HUMAN}"));
    if body.is_some() {
        builder = builder.header("content-type", "application/json");
    }
    for (name, value) in extra {
        builder = builder.header(*name, *value);
    }
    let request = builder
        .body(match body {
            Some(body) => Body::from(body.to_owned()),
            None => Body::empty(),
        })
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    (status, json)
}

async fn until_done(app: &axum::Router, id: &str) -> Value {
    for _ in 0..200 {
        let (status, body) = call(app, "GET", &format!("/v1/agent/runs/{id}"), None, &[]).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        if body["status"] != "working" {
            return body;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("agent run {id} stayed working");
}

async fn create_item(app: &axum::Router) -> String {
    let (status, body) = call(
        app,
        "POST",
        "/v1/objects",
        Some(
            r#"{"type":"item","groups":{"assortment":"root","webshop":"flat"},"values":{"sku":"SKU-AGENT","name":{"sv":"Stol"},"active":true}}"#,
        ),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body["id"].as_str().unwrap().to_owned()
}

#[tokio::test]
async fn a_run_is_stored_and_closing_the_tab_does_not_stop_it() {
    let (_db, app) = app().await;
    let (status, created) = call(
        &app,
        "POST",
        "/v1/agent/runs",
        Some(r#"{"messages":[{"role":"user","content":"hold the run"}]}"#),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{created}");
    assert_eq!(created["status"], "working");
    assert_eq!(created["tab_open"], true);
    let id = created["id"].as_str().unwrap();

    let (status, closed) = call(
        &app,
        "PATCH",
        &format!("/v1/agent/runs/{id}"),
        Some(r#"{"tab_open":false}"#),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{closed}");
    assert_eq!(closed["tab_open"], false);
    assert_eq!(closed["status"], "working");

    let finished = until_done(&app, id).await;
    assert_eq!(finished["status"], "done", "{finished}");
    assert_eq!(finished["tab_open"], false);
    let text = finished["messages"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|message| message["body"]["text"].as_str())
        .collect::<Vec<_>>()
        .join(" ");
    assert!(
        text.contains("No model is connected"),
        "the run finished after the tab closed: {finished}"
    );
}

#[tokio::test]
async fn two_runs_are_allowed_and_a_user_edit_marks_the_proposal_stale() {
    let (_db, app) = app().await;
    let object_id = create_item(&app).await;
    let prompt = json!({
        "messages": [{ "role": "user", "content": "propose a new name" }],
        "context": {
            "language": "sv",
            "selection": [{
                "id": object_id,
                "type": "item",
                "key": "SKU-AGENT",
                "name": "Stol",
                "version": "1"
            }]
        }
    });
    let (status, first) = call(
        &app,
        "POST",
        "/v1/agent/runs",
        Some(&prompt.to_string()),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{first}");
    let (status, second) = call(
        &app,
        "POST",
        "/v1/agent/runs",
        Some(r#"{"messages":[{"role":"user","content":"second agent"}]}"#),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{second}");

    let id = first["id"].as_str().unwrap();
    let finished = until_done(&app, id).await;
    assert_eq!(finished["status"], "done", "{finished}");
    assert_eq!(
        finished["proposals"].as_array().unwrap().len(),
        1,
        "{finished}"
    );
    assert_eq!(finished["proposal_count"], 1, "{finished}");
    let proposal_id = finished["proposals"][0]["id"].as_str().unwrap();
    assert_eq!(finished["proposals"][0]["status"], "open");
    assert_eq!(finished["proposals"][0]["stale"], false);
    assert_eq!(
        finished["proposals"][0]["patch"]["values"]["name"]["sv"], "Agent draft",
        "{finished}"
    );
    assert_eq!(finished["proposals"][0]["object_key"], "SKU-AGENT");

    let (status, object) = call(&app, "GET", &format!("/v1/objects/{object_id}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{object}");
    assert_eq!(
        object["values"]["name"]["sv"], "Stol",
        "the agent must not apply the proposal"
    );

    let (status, edited) = call(
        &app,
        "PATCH",
        &format!("/v1/objects/{object_id}"),
        Some(r#"{"values":{"name":{"sv":"Pall"}}}"#),
        &[("if-match", "1")],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{edited}");
    assert_eq!(edited["values"]["name"]["sv"], "Pall");

    let mut noticed = None;
    for _ in 0..20 {
        let (status, body) = call(&app, "GET", &format!("/v1/agent/runs/{id}"), None, &[]).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        let has_notice = body["messages"]
            .as_array()
            .unwrap()
            .iter()
            .any(|message| message["kind"] == "notice");
        if body["proposals"][0]["stale"] == true && has_notice {
            noticed = Some(body);
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let noticed = noticed.expect("the run should record that the proposal is stale");
    let notice = noticed["messages"]
        .as_array()
        .unwrap()
        .iter()
        .find(|message| message["kind"] == "notice")
        .unwrap();
    let reason = notice["body"]["text"].as_str().unwrap();
    assert!(reason.contains("stale"), "{notice}");
    assert!(reason.contains("name (sv)"), "{notice}");
    assert!(reason.contains("Pall"), "{notice}");
    assert!(reason.contains("ada"), "{notice}");
    assert!(
        reason.contains(" at 20") && reason.contains(':'),
        "{notice}"
    );
    assert_eq!(noticed["proposals"][0]["stale_reason"], reason);

    let (status, proposal) = call(
        &app,
        "GET",
        &format!("/v1/proposals/{proposal_id}"),
        None,
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{proposal}");
    assert_eq!(proposal["stale"], true);

    let (status, rejected) = call(
        &app,
        "POST",
        &format!("/v1/proposals/{proposal_id}/accept"),
        Some("{}"),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "{rejected}");
    assert_eq!(rejected["code"], "stale");

    let (status, object) = call(&app, "GET", &format!("/v1/objects/{object_id}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{object}");
    assert_eq!(object["values"]["name"]["sv"], "Pall");

    let (status, listed) = call(&app, "GET", "/v1/agent/runs", None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{listed}");
    assert!(listed["runs"].as_array().unwrap().len() >= 2, "{listed}");
}

#[tokio::test]
async fn undo_after_a_later_edit_is_precondition_failed() {
    let (_db, app) = app().await;
    let object_id = create_item(&app).await;
    let draft = json!({
        "title": "Rename",
        "rows": [{
            "object_id": object_id,
            "type_key": "item",
            "base_version": 1,
            "patch": { "values": { "name": { "sv": "Ny" } } }
        }]
    });
    let (status, proposal) =
        call(&app, "POST", "/v1/proposals", Some(&draft.to_string()), &[]).await;
    assert_eq!(status, StatusCode::OK, "{proposal}");
    let proposal_id = proposal["id"].as_str().unwrap();

    let (status, accepted) = call(
        &app,
        "POST",
        &format!("/v1/proposals/{proposal_id}/accept"),
        Some("{}"),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    let version = accepted["accepted"][0]["version"]
        .as_u64()
        .unwrap_or_else(|| panic!("{accepted}"));
    assert!(version >= 2, "{accepted}");

    let (status, later) = call(
        &app,
        "PATCH",
        &format!("/v1/objects/{object_id}"),
        Some(r#"{"values":{"name":{"sv":"Later"}}}"#),
        &[("if-match", &version.to_string())],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{later}");
    assert_eq!(later["values"]["name"]["sv"], "Later");

    let (status, undone) = call(
        &app,
        "PATCH",
        &format!("/v1/objects/{object_id}"),
        Some(r#"{"values":{"name":{"sv":"Stol"}}}"#),
        &[("if-match", &version.to_string())],
    )
    .await;
    assert_eq!(status, StatusCode::PRECONDITION_FAILED, "{undone}");

    let (status, object) = call(&app, "GET", &format!("/v1/objects/{object_id}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{object}");
    assert_eq!(object["values"]["name"]["sv"], "Later", "{object}");
}

#[tokio::test]
async fn revert_accept_marks_the_proposal_reverted() {
    let (_db, app) = app().await;
    let object_id = create_item(&app).await;
    let draft = json!({
        "title": "Rename",
        "rows": [{
            "object_id": object_id,
            "type_key": "item",
            "base_version": 1,
            "patch": { "values": { "name": { "sv": "Ny" } } }
        }]
    });
    let (status, proposal) =
        call(&app, "POST", "/v1/proposals", Some(&draft.to_string()), &[]).await;
    assert_eq!(status, StatusCode::OK, "{proposal}");
    let proposal_id = proposal["id"].as_str().unwrap();

    let (status, accepted) = call(
        &app,
        "POST",
        &format!("/v1/proposals/{proposal_id}/accept"),
        Some("{}"),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    let version = accepted["accepted"][0]["version"]
        .as_u64()
        .unwrap_or_else(|| panic!("{accepted}"));

    let (status, _) = call(
        &app,
        "PATCH",
        &format!("/v1/objects/{object_id}"),
        Some(r#"{"values":{"name":{"sv":"Stol"}}}"#),
        &[("if-match", &version.to_string())],
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = call(
        &app,
        "POST",
        &format!("/v1/proposals/{proposal_id}/revert-accept"),
        None,
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (status, detail) = call(
        &app,
        "GET",
        &format!("/v1/proposals/{proposal_id}"),
        None,
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{detail}");
    assert_eq!(detail["status"], "accepted", "{detail}");
    assert!(detail["reverted_at"].as_str().is_some(), "{detail}");
}

async fn until_status(app: &axum::Router, id: &str, status: &str) -> Value {
    for _ in 0..200 {
        let (code, body) = call(app, "GET", &format!("/v1/agent/runs/{id}"), None, &[]).await;
        assert_eq!(code, StatusCode::OK, "{body}");
        if body["status"] == status {
            return body;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!("agent run {id} did not become {status}");
}

#[tokio::test]
async fn a_run_can_move_to_the_background_and_back_with_no_cap() {
    let (_db, app) = app().await;
    let mut ids = Vec::new();
    for prompt in ["hold the run alpha", "hold the run beta"] {
        let body = json!({ "messages": [{ "role": "user", "content": prompt }] });
        let (status, created) =
            call(&app, "POST", "/v1/agent/runs", Some(&body.to_string()), &[]).await;
        assert_eq!(status, StatusCode::OK, "{created}");
        assert_eq!(created["mode"], "foreground");
        assert_eq!(created["proposal_count"], 0);
        ids.push(created["id"].as_str().unwrap().to_owned());
    }
    for id in &ids {
        let (status, patched) = call(
            &app,
            "PATCH",
            &format!("/v1/agent/runs/{id}"),
            Some(r#"{"mode":"background"}"#),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{patched}");
        assert_eq!(patched["mode"], "background");
        assert_eq!(patched["status"], "working", "{patched}");
    }
    let (status, listed) = call(&app, "GET", "/v1/agent/runs", None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{listed}");
    let background = listed["runs"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|run| run["mode"] == "background" && run["status"] == "working")
        .count();
    assert!(background >= 2, "no cap on background agents: {listed}");

    let id = &ids[0];
    let (status, front) = call(
        &app,
        "PATCH",
        &format!("/v1/agent/runs/{id}"),
        Some(r#"{"mode":"foreground"}"#),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{front}");
    assert_eq!(front["mode"], "foreground");
    assert_eq!(front["status"], "working");
}

#[tokio::test]
async fn a_run_waits_for_a_decision_and_resume_continues_it() {
    let (_db, app) = app().await;
    let (status, created) = call(
        &app,
        "POST",
        "/v1/agent/runs",
        Some(r#"{"messages":[{"role":"user","content":"ask me before you continue"}]}"#),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{created}");
    let id = created["id"].as_str().unwrap();
    let waiting = until_status(&app, id, "waiting").await;
    assert_eq!(waiting["status"], "waiting", "{waiting}");
    let question = waiting["messages"]
        .as_array()
        .unwrap()
        .iter()
        .find(|message| message["kind"] == "question")
        .expect("question");
    assert_eq!(
        question["body"]["text"],
        "Which value should I use? I will not guess."
    );
    assert_eq!(
        waiting["question"],
        "Which value should I use? I will not guess."
    );
    assert!(waiting["finished_at"].is_null(), "{waiting}");

    let (status, resumed) = call(
        &app,
        "POST",
        &format!("/v1/agent/runs/{id}/messages"),
        Some(r#"{"content":"Use the existing name"}"#),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{resumed}");
    assert_eq!(resumed["status"], "working");
    let done = until_done(&app, id).await;
    assert_eq!(done["status"], "done", "{done}");
    let answered = done["messages"]
        .as_array()
        .unwrap()
        .iter()
        .any(|message| message["body"]["text"] == "Use the existing name");
    assert!(answered, "{done}");
}

#[tokio::test]
async fn the_agent_starts_in_a_hidden_session_unless_it_needs_the_screen() {
    let (_db, app) = app().await;
    let body = r#"{"messages":[{"role":"user","content":"hold the run in your own session"}],"context":{"focused":"products","panes":[{"id":"products","type":"object_table","title":"Products"},{"id":"detail","type":"object_detail","title":"Detail"}]}}"#;
    let (status, created) = call(&app, "POST", "/v1/agent/runs", Some(body), &[]).await;
    assert_eq!(status, StatusCode::OK, "{created}");
    assert_eq!(created["session_kind"], "own");
    assert_eq!(created["hidden"], true);
    assert_eq!(created["status"], "working");
    assert_eq!(created["session"]["views"][0], "products");
    assert_eq!(created["session"]["focus"], "products");
    let id = created["id"].as_str().unwrap();
    let (status, shown) = call(
        &app,
        "PATCH",
        &format!("/v1/agent/runs/{id}"),
        Some(r#"{"hidden":false}"#),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{shown}");
    assert_eq!(shown["hidden"], false);
    assert_eq!(shown["session_kind"], "own");
}

#[tokio::test]
async fn take_over_stops_the_agent_and_keeps_it_stopped() {
    let (_db, app) = app().await;
    let (status, created) = call(
        &app,
        "POST",
        "/v1/agent/runs",
        Some(
            r#"{"messages":[{"role":"user","content":"open the product view and hold the run"}]}"#,
        ),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{created}");
    assert_eq!(created["session_kind"], "user");
    assert_eq!(created["hidden"], false);
    assert_eq!(created["status"], "working");
    let id = created["id"].as_str().unwrap();
    let (status, paused) = call(
        &app,
        "POST",
        &format!("/v1/agent/runs/{id}/take-over"),
        None,
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{paused}");
    assert_eq!(paused["status"], "paused");
    tokio::time::sleep(Duration::from_millis(600)).await;
    let (status, again) = call(&app, "GET", &format!("/v1/agent/runs/{id}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{again}");
    assert_eq!(again["status"], "paused", "{again}");
}

#[tokio::test]
async fn an_edit_while_viewing_the_agent_session_is_a_proposal() {
    let (_db, app) = app().await;
    let object_id = create_item(&app).await;
    let (status, created) = call(
        &app,
        "POST",
        "/v1/agent/runs",
        Some(r#"{"messages":[{"role":"user","content":"work in your own session"}]}"#),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{created}");
    let id = created["id"].as_str().unwrap();
    let done = until_done(&app, id).await;
    assert_eq!(done["session_kind"], "own", "{done}");
    let proposal = format!(
        r#"{{"object_id":"{object_id}","object_key":"SKU-AGENT","type_key":"item","base_version":1,"values":{{"name":{{"sv":"Agent draft"}}}}}}"#
    );
    let (status, filed) = call(
        &app,
        "POST",
        &format!("/v1/agent/runs/{id}/proposals"),
        Some(&proposal),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{filed}");
    assert_eq!(filed["proposal_count"], 1, "{filed}");
    assert_eq!(filed["proposals"][0]["status"], "open");
    let (status, object) = call(&app, "GET", &format!("/v1/objects/{object_id}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{object}");
    assert_eq!(object["values"]["name"]["sv"], "Stol", "{object}");
}

async fn create_named(app: &axum::Router, sku: &str, name: &str) -> String {
    let body = json!({
        "type": "item",
        "groups": {"assortment": "root", "webshop": "flat"},
        "values": {"sku": sku, "name": {"sv": name}, "active": true}
    });
    let (status, created) = call(app, "POST", "/v1/objects", Some(&body.to_string()), &[]).await;
    assert_eq!(status, StatusCode::OK, "{created}");
    created["id"].as_str().unwrap().to_owned()
}

fn assistant_text(run: &Value) -> String {
    run["messages"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|message| message["kind"] == "assistant" || message["kind"] == "error")
        .filter_map(|message| message["body"]["text"].as_str())
        .collect::<Vec<_>>()
        .join(" ")
}

async fn finish_prompt(app: &axum::Router, prompt: &str, context: Value) -> Value {
    let body = json!({
        "messages": [{ "role": "user", "content": prompt }],
        "context": context,
    });
    let (status, created) = call(app, "POST", "/v1/agent/runs", Some(&body.to_string()), &[]).await;
    assert_eq!(status, StatusCode::OK, "{created}");
    let id = created["id"].as_str().unwrap();
    until_done(app, id).await
}

fn did_not_claim_a_proposal(run: &Value) {
    let text = assistant_text(run);
    assert!(
        !text.contains("I proposed"),
        "must not claim a proposal was filed: {run}"
    );
    assert!(
        text.contains("did not"),
        "must say the proposal was not filed: {text}"
    );
    assert_eq!(run["proposals"].as_array().unwrap().len(), 0, "{run}");
}

#[tokio::test]
async fn named_product_rename_proposes_the_display_name_and_leaves_the_key() {
    let (_db, app) = app().await;
    let cheddar = create_named(&app, "SKU-CHED", "Cheddar").await;
    let gouda = create_named(&app, "SKU-GOUDA", "Gouda").await;
    // The selected product is Gouda. The request names Cheddar, so Gouda stays.
    let finished = finish_prompt(
        &app,
        "rename Cheddar to Blue",
        json!({
            "language": "sv",
            "selection": [{
                "id": gouda,
                "type": "item",
                "key": "SKU-GOUDA",
                "name": "Gouda",
                "version": 1
            }]
        }),
    )
    .await;
    assert_eq!(finished["status"], "done", "{finished}");
    assert_eq!(
        finished["proposals"].as_array().unwrap().len(),
        1,
        "{finished}"
    );
    let proposal = &finished["proposals"][0];
    assert_eq!(proposal["object_id"], json!(cheddar), "{proposal}");
    assert_eq!(proposal["object_key"], "SKU-CHED", "{proposal}");
    assert_eq!(
        proposal["patch"]["values"]["name"]["sv"], "Blue",
        "{proposal}"
    );
    assert!(
        proposal["patch"]["values"].get("sku").is_none(),
        "{proposal}"
    );
    assert!(
        assistant_text(&finished).contains("I proposed"),
        "{finished}"
    );
    let (status, before) = call(&app, "GET", &format!("/v1/objects/{cheddar}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{before}");
    assert_eq!(before["values"]["name"]["sv"], "Cheddar");
    assert_eq!(before["values"]["sku"], "SKU-CHED");

    let proposal_id = proposal["id"].as_str().unwrap();
    let (status, accepted) = call(
        &app,
        "POST",
        &format!("/v1/proposals/{proposal_id}/accept"),
        Some("{}"),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    let (status, after) = call(&app, "GET", &format!("/v1/objects/{cheddar}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{after}");
    assert_eq!(after["values"]["name"]["sv"], "Blue", "{after}");
    assert_eq!(after["values"]["sku"], "SKU-CHED", "{after}");

    let rejected = finish_prompt(&app, "rename Gouda to Edam", json!({ "language": "sv" })).await;
    assert_eq!(
        rejected["proposals"].as_array().unwrap().len(),
        1,
        "{rejected}"
    );
    let rejected_id = rejected["proposals"][0]["id"].as_str().unwrap();
    assert_eq!(
        rejected["proposals"][0]["object_id"],
        json!(gouda),
        "{rejected}"
    );
    let (status, discarded) = call(
        &app,
        "POST",
        &format!("/v1/proposals/{rejected_id}/discard"),
        None,
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{discarded}");
    let (status, gouda_object) =
        call(&app, "GET", &format!("/v1/objects/{gouda}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{gouda_object}");
    assert_eq!(
        gouda_object["values"]["name"]["sv"], "Gouda",
        "{gouda_object}"
    );
    assert_eq!(gouda_object["values"]["sku"], "SKU-GOUDA", "{gouda_object}");
}

#[tokio::test]
async fn rename_fails_safely_when_the_product_is_ambiguous_missing_or_read_only() {
    let (db, app) = app().await;
    let first = create_named(&app, "SKU-A", "Cheddar").await;
    let _second = create_named(&app, "SKU-B", "Cheddar").await;
    let gouda = create_named(&app, "SKU-G", "Gouda").await;

    let ambiguous =
        finish_prompt(&app, "rename Cheddar to Blue", json!({ "language": "sv" })).await;
    did_not_claim_a_proposal(&ambiguous);
    assert!(assistant_text(&ambiguous).contains("SKU-A"), "{ambiguous}");
    assert!(assistant_text(&ambiguous).contains("SKU-B"), "{ambiguous}");
    let (status, still) = call(&app, "GET", &format!("/v1/objects/{first}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{still}");
    assert_eq!(still["values"]["name"]["sv"], "Cheddar");

    let missing = finish_prompt(&app, "rename Nobody to Blue", json!({ "language": "sv" })).await;
    did_not_claim_a_proposal(&missing);
    assert!(assistant_text(&missing).contains("Nobody"), "{missing}");

    let unselected = finish_prompt(
        &app,
        "rename this product to Blue",
        json!({ "language": "sv" }),
    )
    .await;
    did_not_claim_a_proposal(&unselected);

    let hash = braian_api::hash_password("viewer-secret").unwrap();
    db.store()
        .create_user("viewer-rename@braian.local", &hash, "viewer", "Viewer")
        .await
        .unwrap();
    let cookie = login_cookie(&app, "viewer-rename@braian.local", "viewer-secret").await;
    let prompt = json!({
        "messages": [{ "role": "user", "content": "rename Gouda to Blue" }],
        "context": { "language": "sv" }
    });
    let (status, created) = call_as(
        &app,
        "POST",
        "/v1/agent/runs",
        Some(&prompt.to_string()),
        &cookie,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{created}");
    let id = created["id"].as_str().unwrap();
    let readonly = until_done_as(&app, id, &cookie).await;
    did_not_claim_a_proposal(&readonly);
    assert!(
        assistant_text(&readonly).contains("read-only"),
        "{readonly}"
    );
    let (status, gouda_object) =
        call(&app, "GET", &format!("/v1/objects/{gouda}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{gouda_object}");
    assert_eq!(gouda_object["values"]["name"]["sv"], "Gouda");
    assert_eq!(gouda_object["values"]["sku"], "SKU-G");

    let key_change = finish_prompt(
        &app,
        "rename the key of Gouda to SKU-NEW",
        json!({ "language": "sv" }),
    )
    .await;
    assert_eq!(
        key_change["proposals"].as_array().unwrap().len(),
        1,
        "{key_change}"
    );
    let patch = &key_change["proposals"][0]["patch"]["values"];
    assert_eq!(patch["sku"], "SKU-NEW", "{key_change}");
    assert!(patch.get("name").is_none(), "{key_change}");
    let proposal_id = key_change["proposals"][0]["id"].as_str().unwrap();
    let (status, accepted) = call(
        &app,
        "POST",
        &format!("/v1/proposals/{proposal_id}/accept"),
        Some("{}"),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    let (status, renamed_key) = call(&app, "GET", &format!("/v1/objects/{gouda}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{renamed_key}");
    assert_eq!(renamed_key["values"]["sku"], "SKU-NEW", "{renamed_key}");
    assert_eq!(
        renamed_key["values"]["name"]["sv"], "Gouda",
        "{renamed_key}"
    );
}

async fn login_cookie(app: &axum::Router, email: &str, password: &str) -> String {
    let request = Request::builder()
        .method("POST")
        .uri("/v1/login")
        .header("content-type", "application/json")
        .body(Body::from(format!(
            r#"{{"email":"{email}","password":"{password}"}}"#
        )))
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    response
        .headers()
        .get("set-cookie")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .expect("session cookie")
        .to_owned()
}

async fn call_as(
    app: &axum::Router,
    method: &str,
    path: &str,
    body: Option<&str>,
    cookie: &str,
) -> (StatusCode, Value) {
    let mut builder = Request::builder()
        .method(method)
        .uri(path)
        .header("cookie", cookie);
    if body.is_some() {
        builder = builder.header("content-type", "application/json");
    }
    let request = builder
        .body(match body {
            Some(body) => Body::from(body.to_owned()),
            None => Body::empty(),
        })
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    (status, json)
}

fn filed_nothing(run: &Value) {
    assert!(
        !assistant_text(run).contains("I proposed"),
        "must not claim a proposal was filed: {run}"
    );
    assert_eq!(run["proposals"].as_array().unwrap().len(), 0, "{run}");
}

#[tokio::test]
async fn uncertain_wording_does_not_file_a_rename_proposal() {
    let (_db, app) = app().await;
    let cheddar = create_named(&app, "SKU-CHED", "Cheddar").await;
    let price = create_named(&app, "SKU-PRICE", "Price").await;
    let prompts = [
        "how do I rename Cheddar to Blue?",
        "don't rename Cheddar to Blue",
        "do not rename Cheddar to Blue",
        "rename Cheddar to Blue and set price to 5",
        "rename Cheddar to Back to Basics",
        "rename the column Price to Cost",
        "byt namn på gruppen Ost till Mejeri",
        "rename the attribute Color to Colour",
        "rename the view Products to Items",
        "rename the type item to product",
        "change the number of Cheddar to 5",
    ];
    for prompt in prompts {
        let finished = finish_prompt(&app, prompt, json!({ "language": "sv" })).await;
        filed_nothing(&finished);
    }
    let (status, object) = call(&app, "GET", &format!("/v1/objects/{cheddar}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{object}");
    assert_eq!(object["values"]["name"]["sv"], "Cheddar", "{object}");
    assert_eq!(object["values"]["sku"], "SKU-CHED", "{object}");
    let (status, priced) = call(&app, "GET", &format!("/v1/objects/{price}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{priced}");
    assert_eq!(priced["values"]["name"]["sv"], "Price", "{priced}");

    let quoted = finish_prompt(
        &app,
        "rename Cheddar to \"A to B\"",
        json!({ "language": "sv" }),
    )
    .await;
    assert_eq!(quoted["proposals"].as_array().unwrap().len(), 1, "{quoted}");
    assert_eq!(
        quoted["proposals"][0]["object_id"],
        json!(cheddar),
        "{quoted}"
    );
    assert_eq!(
        quoted["proposals"][0]["patch"]["values"]["name"]["sv"], "A to B",
        "{quoted}"
    );
    assert!(
        quoted["proposals"][0]["patch"]["values"]
            .get("sku")
            .is_none(),
        "{quoted}"
    );
    let proposal_id = quoted["proposals"][0]["id"].as_str().unwrap();
    let (status, accepted) = call(
        &app,
        "POST",
        &format!("/v1/proposals/{proposal_id}/accept"),
        Some("{}"),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    let (status, renamed) = call(&app, "GET", &format!("/v1/objects/{cheddar}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{renamed}");
    assert_eq!(renamed["values"]["name"]["sv"], "A to B", "{renamed}");
    assert_eq!(renamed["values"]["sku"], "SKU-CHED", "{renamed}");
}

#[tokio::test]
async fn a_rename_keeps_the_other_language_and_a_selected_key_is_explicit() {
    let (_db, app) = app().await;
    let body = json!({
        "type": "item",
        "groups": {"assortment": "root", "webshop": "flat"},
        "values": {"sku": "SKU-LANG", "name": {"sv": "Cheddar", "en-GB": "Cheese"}, "active": true}
    });
    let (status, created) = call(&app, "POST", "/v1/objects", Some(&body.to_string()), &[]).await;
    assert_eq!(status, StatusCode::OK, "{created}");
    let id = created["id"].as_str().unwrap();
    let finished = finish_prompt(&app, "rename Cheddar to Blue", json!({ "language": "sv" })).await;
    assert_eq!(
        finished["proposals"].as_array().unwrap().len(),
        1,
        "{finished}"
    );
    let patch = &finished["proposals"][0]["patch"]["values"]["name"];
    assert_eq!(patch["sv"], "Blue", "{finished}");
    assert!(patch.get("en-GB").is_none(), "{finished}");
    let proposal_id = finished["proposals"][0]["id"].as_str().unwrap();
    let (status, accepted) = call(
        &app,
        "POST",
        &format!("/v1/proposals/{proposal_id}/accept"),
        Some("{}"),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    let (status, object) = call(&app, "GET", &format!("/v1/objects/{id}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{object}");
    assert_eq!(object["values"]["name"]["sv"], "Blue", "{object}");
    assert_eq!(object["values"]["name"]["en-GB"], "Cheese", "{object}");
    assert_eq!(object["values"]["sku"], "SKU-LANG", "{object}");

    let gouda = create_named(&app, "SKU-GOUDA", "Gouda").await;
    let key_change = finish_prompt(
        &app,
        "rename the key of this product to SKU-NEW",
        json!({
            "language": "sv",
            "selection": [{
                "id": gouda,
                "type": "item",
                "key": "SKU-GOUDA",
                "name": "Gouda",
                "version": 1
            }]
        }),
    )
    .await;
    assert_eq!(
        key_change["proposals"].as_array().unwrap().len(),
        1,
        "{key_change}"
    );
    assert_eq!(
        key_change["proposals"][0]["object_id"],
        json!(gouda),
        "{key_change}"
    );
    assert_eq!(
        key_change["proposals"][0]["patch"]["values"]["sku"], "SKU-NEW",
        "{key_change}"
    );
    assert!(
        key_change["proposals"][0]["patch"]["values"]
            .get("name")
            .is_none(),
        "{key_change}"
    );
    let proposal_id = key_change["proposals"][0]["id"].as_str().unwrap();
    let (status, accepted) = call(
        &app,
        "POST",
        &format!("/v1/proposals/{proposal_id}/accept"),
        Some("{}"),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    let (status, renamed_key) = call(&app, "GET", &format!("/v1/objects/{gouda}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{renamed_key}");
    assert_eq!(renamed_key["values"]["sku"], "SKU-NEW", "{renamed_key}");
    assert_eq!(
        renamed_key["values"]["name"]["sv"], "Gouda",
        "{renamed_key}"
    );

    let swedish = finish_prompt(
        &app,
        "byt nyckel på Gouda till SKU-SV",
        json!({ "language": "sv" }),
    )
    .await;
    assert_eq!(
        swedish["proposals"].as_array().unwrap().len(),
        1,
        "{swedish}"
    );
    assert_eq!(
        swedish["proposals"][0]["object_id"],
        json!(gouda),
        "{swedish}"
    );
    assert_eq!(
        swedish["proposals"][0]["patch"]["values"]["sku"], "SKU-SV",
        "{swedish}"
    );
    assert!(
        swedish["proposals"][0]["patch"]["values"]
            .get("name")
            .is_none(),
        "{swedish}"
    );
    let (status, still) = call(&app, "GET", &format!("/v1/objects/{gouda}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{still}");
    assert_eq!(still["values"]["sku"], "SKU-NEW", "{still}");
    assert_eq!(still["values"]["name"]["sv"], "Gouda", "{still}");
}

#[tokio::test]
async fn a_missing_name_is_refused_when_no_model_is_connected() {
    let (_db, app) = app().await;
    let cheddar = create_named(&app, "SKU-CHED", "Cheddar").await;
    let prompts = [
        "rename Price to Cost",
        "rename the Price column to Cost",
        "byt namn på Ost-gruppen till Mejeri",
        "rename the Products view to Items",
    ];
    for prompt in prompts {
        let finished = finish_prompt(&app, prompt, json!({ "language": "sv" })).await;
        did_not_claim_a_proposal(&finished);
        assert!(
            assistant_text(&finished).contains("could not find"),
            "{prompt}: {finished}"
        );
    }
    let (status, object) = call(&app, "GET", &format!("/v1/objects/{cheddar}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{object}");
    assert_eq!(object["values"]["name"]["sv"], "Cheddar", "{object}");
    assert_eq!(object["values"]["sku"], "SKU-CHED", "{object}");
}

#[tokio::test]
async fn a_shared_name_does_not_rename_a_different_type() {
    let (db, app) = app().await;
    add_note_type(&db).await;
    let item = create_named(&app, "SKU-ITEM", "Cheddar").await;
    let note = create_typed(&app, "note", "SKU-NOTE", "Cheddar").await;

    let ambiguous =
        finish_prompt(&app, "rename Cheddar to Blue", json!({ "language": "sv" })).await;
    filed_nothing(&ambiguous);
    let text = assistant_text(&ambiguous);
    assert!(text.contains("item"), "{ambiguous}");
    assert!(text.contains("note"), "{ambiguous}");

    let typed = finish_prompt(
        &app,
        "rename the item Cheddar to Blue",
        json!({ "language": "sv" }),
    )
    .await;
    assert_eq!(typed["proposals"].as_array().unwrap().len(), 1, "{typed}");
    assert_eq!(typed["proposals"][0]["object_id"], json!(item), "{typed}");
    assert_ne!(typed["proposals"][0]["object_id"], json!(note), "{typed}");
    assert_eq!(
        typed["proposals"][0]["patch"]["values"]["name"]["sv"], "Blue",
        "{typed}"
    );

    let (status, item_object) = call(&app, "GET", &format!("/v1/objects/{item}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{item_object}");
    assert_eq!(
        item_object["values"]["name"]["sv"], "Cheddar",
        "{item_object}"
    );
    let (status, note_object) = call(&app, "GET", &format!("/v1/objects/{note}"), None, &[]).await;
    assert_eq!(status, StatusCode::OK, "{note_object}");
    assert_eq!(
        note_object["values"]["name"]["sv"], "Cheddar",
        "{note_object}"
    );
    assert_eq!(note_object["values"]["sku"], "SKU-NOTE", "{note_object}");
}

async fn create_typed(app: &axum::Router, type_key: &str, sku: &str, name: &str) -> String {
    let body = json!({
        "type": type_key,
        "groups": {"assortment": "root", "webshop": "flat"},
        "values": {"sku": sku, "name": {"sv": name}, "active": true}
    });
    let (status, created) = call(app, "POST", "/v1/objects", Some(&body.to_string()), &[]).await;
    assert_eq!(status, StatusCode::OK, "{created}");
    created["id"].as_str().unwrap().to_owned()
}

async fn add_note_type(db: &TestDb) {
    let identities = braian_api::identities(db.store(), TOKENS).await.unwrap();
    let actor = identities
        .iter()
        .find(|item| item.handle == "ada")
        .expect("ada")
        .actor
        .clone();
    let mut raw: Value =
        serde_json::from_str(include_str!("../../../testdata/rules/definitions.json")).unwrap();
    raw["model_revision"] = json!(2);
    let mut note = raw["types"][0].clone();
    note["id"] = json!("018f0000-0000-7000-8000-000000000201");
    note["key"] = json!("note");
    note["labels"] = json!({ "sv": "Anteckning", "en-GB": "Note" });
    raw["types"].as_array_mut().unwrap().push(note);
    let defs: braian_model::DefinitionSet = serde_json::from_value(raw).unwrap();
    db.store().put_definitions(&actor, &defs).await.unwrap();
}

async fn until_done_as(app: &axum::Router, id: &str, cookie: &str) -> Value {
    for _ in 0..200 {
        let (status, body) =
            call_as(app, "GET", &format!("/v1/agent/runs/{id}"), None, cookie).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        if body["status"] != "working" {
            return body;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("agent run {id} stayed working");
}
