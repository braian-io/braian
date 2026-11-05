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
