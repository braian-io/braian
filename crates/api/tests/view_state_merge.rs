use axum::body::Body;
use axum::http::{Request, StatusCode};
use braian_api::router;
use braian_store::testing::TestDb;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;
use uuid::Uuid;

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

async fn call(app: &axum::Router, path: &str, cookie: &str, body: &str) -> (StatusCode, Value) {
    let request = Request::builder()
        .method("POST")
        .uri(path)
        .header("cookie", cookie)
        .header("content-type", "application/json")
        .body(Body::from(body.to_owned()))
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or_else(|_| json!(String::from_utf8_lossy(&bytes)))
    };
    (status, json)
}

async fn app() -> (TestDb, axum::Router) {
    load_env();
    let db = TestDb::create().await;
    let identities = braian_api::identities(db.store(), "ada:human:token-ada")
        .await
        .unwrap();
    let app = router(db.store().clone(), identities);
    (db, app)
}

async fn editor(app: &axum::Router, db: &TestDb, email: &str) -> (String, Uuid, Uuid) {
    let password = "secret-view-merge";
    let hash = braian_api::hash_password(password).unwrap();
    let user = db
        .store()
        .create_user(email, &hash, "editor", "Editor")
        .await
        .unwrap()
        .id;
    let request = Request::builder()
        .method("POST")
        .uri("/v1/login")
        .header("content-type", "application/json")
        .body(Body::from(
            json!({ "email": email, "password": password }).to_string(),
        ))
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let cookie = response
        .headers()
        .get("set-cookie")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .unwrap()
        .to_owned();
    let workspace = Uuid::now_v7();
    db.store()
        .save_workspace(workspace, user, "Views", false, None, &json!({}))
        .await
        .unwrap();
    (cookie, workspace, user)
}

fn view_body(workspace: Uuid, view: Uuid, state: Value, expected: Option<Value>) -> Value {
    let mut body = json!({
        "id": view,
        "workspace_id": workspace,
        "type": "graph",
        "title": "Graph",
        "pane": "main",
        "position": 0,
        "state": state,
    });
    if let Some(expected) = expected {
        body["expected_updated_at"] = expected;
    }
    body
}

#[tokio::test]
async fn two_versioned_writes_to_different_keys_both_survive() {
    let (db, app) = app().await;
    let (cookie, workspace, _) = editor(&app, &db, "view-merge-keys@braian.local").await;
    let view = Uuid::now_v7();
    let (status, created) = call(
        &app,
        "/v1/views",
        &cookie,
        &view_body(workspace, view, json!({"alpha": 1}), Some(Value::Null)).to_string(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{created}");
    let version = created["updated_at"].as_str().unwrap().to_owned();
    let (status, saved) = call(
        &app,
        "/v1/views",
        &cookie,
        &view_body(
            workspace,
            view,
            json!({"beta": 2}),
            Some(Value::String(version)),
        )
        .to_string(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    let stored = db.store().view_state(view).await.unwrap().unwrap();
    assert_eq!(stored["alpha"], 1, "{stored}");
    assert_eq!(stored["beta"], 2, "{stored}");
}

#[tokio::test]
async fn a_stale_write_to_the_same_key_is_a_conflict() {
    let (db, app) = app().await;
    let (cookie, workspace, _) = editor(&app, &db, "view-merge-stale@braian.local").await;
    let view = Uuid::now_v7();
    let (status, created) = call(
        &app,
        "/v1/views",
        &cookie,
        &view_body(workspace, view, json!({"alpha": 1}), Some(Value::Null)).to_string(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{created}");
    let version = created["updated_at"].as_str().unwrap().to_owned();
    let (status, saved) = call(
        &app,
        "/v1/views",
        &cookie,
        &view_body(
            workspace,
            view,
            json!({"alpha": 2}),
            Some(Value::String(version.clone())),
        )
        .to_string(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_ne!(saved["updated_at"].as_str().unwrap(), version);
    let (status, conflict) = call(
        &app,
        "/v1/views",
        &cookie,
        &view_body(
            workspace,
            view,
            json!({"alpha": 3}),
            Some(Value::String(version)),
        )
        .to_string(),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "{conflict}");
    assert_eq!(conflict["code"], "stale_view");
    let stored = db.store().view_state(view).await.unwrap().unwrap();
    assert_eq!(stored["alpha"], 2, "{stored}");

    let (status, bad) = call(
        &app,
        "/v1/views",
        &cookie,
        &view_body(
            workspace,
            view,
            json!({"alpha": 4}),
            Some(json!("not-a-timestamp")),
        )
        .to_string(),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{bad}");
    assert_eq!(bad["code"], "expected_updated_at");
}

#[tokio::test]
async fn a_present_null_on_an_existing_view_is_a_conflict() {
    let (db, app) = app().await;
    let (cookie, workspace, _) = editor(&app, &db, "view-merge-null@braian.local").await;
    let view = Uuid::now_v7();
    let (status, created) = call(
        &app,
        "/v1/views",
        &cookie,
        &view_body(workspace, view, json!({"alpha": 1}), None).to_string(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{created}");
    let (status, conflict) = call(
        &app,
        "/v1/views",
        &cookie,
        &view_body(workspace, view, json!({"alpha": 9}), Some(Value::Null)).to_string(),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "{conflict}");
    assert_eq!(conflict["code"], "stale_view");
    let stored = db.store().view_state(view).await.unwrap().unwrap();
    assert_eq!(stored["alpha"], 1, "{stored}");
}

#[tokio::test]
async fn omitting_the_version_merges_per_key() {
    let (db, app) = app().await;
    let (cookie, workspace, _) = editor(&app, &db, "view-merge-omit@braian.local").await;
    let view = Uuid::now_v7();
    let (status, created) = call(
        &app,
        "/v1/views",
        &cookie,
        &view_body(workspace, view, json!({"alpha": 1, "beta": 1}), None).to_string(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{created}");
    let (status, saved) = call(
        &app,
        "/v1/views",
        &cookie,
        &view_body(workspace, view, json!({"beta": 2}), None).to_string(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    let stored = db.store().view_state(view).await.unwrap().unwrap();
    assert_eq!(stored, json!({"alpha": 1, "beta": 2}), "{stored}");

    let (status, replaced) = call(
        &app,
        "/v1/views",
        &cookie,
        &view_body(workspace, view, json!({"alpha": null, "beta": 3}), None).to_string(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{replaced}");
    let stored = db.store().view_state(view).await.unwrap().unwrap();
    assert_eq!(stored, json!({"beta": 3}), "{stored}");
}
