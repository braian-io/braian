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

async fn login(app: &axum::Router, db: &TestDb, email: &str, password: &str) -> String {
    let hash = braian_api::hash_password(password).unwrap();
    db.store()
        .create_user(email, &hash, "editor", "Editor")
        .await
        .unwrap();
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
    response
        .headers()
        .get("set-cookie")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .unwrap()
        .to_owned()
}

#[tokio::test]
async fn save_view_rejects_non_string_table_sort_and_normalizes_bare_column_ids() {
    let (db, app) = app().await;
    let cookie = login(&app, &db, "table-prefs@braian.local", "secret").await;
    let owner = db
        .store()
        .user_by_email("table-prefs@braian.local")
        .await
        .unwrap()
        .unwrap()
        .id;
    let workspace = Uuid::now_v7();
    let view = Uuid::now_v7();
    db.store()
        .save_workspace(workspace, owner, "Prefs", false, None, &json!({}))
        .await
        .unwrap();

    let body = json!({
        "id": view,
        "workspace_id": workspace,
        "type": "object_table",
        "title": "Items",
        "pane": "main",
        "position": 0,
        "state": { "table": { "sort": 42, "groupBy": "", "sizes": {} } }
    });
    let (status, _) = call(&app, "/v1/views", &cookie, &body.to_string()).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    let body = json!({
        "id": view,
        "workspace_id": workspace,
        "type": "object_table",
        "title": "Items",
        "pane": "main",
        "position": 0,
        "state": { "table": { "sort": "number", "groupBy": "missing", "sizes": {} } }
    });
    let (status, _) = call(&app, "/v1/views", &cookie, &body.to_string()).await;
    assert_eq!(status, StatusCode::OK);

    let stored = db.store().view_state(view).await.unwrap().unwrap();
    let sort = stored["table"]["sort"].as_str().unwrap();
    assert!(sort.ends_with(":asc"), "{sort}");
    assert_eq!(stored["table"]["groupBy"], "");
}
