use axum::body::Body;
use axum::http::{Request, StatusCode};
use braian_api::router;
use braian_model::type_share_token;
use braian_store::testing::TestDb;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;
use uuid::Uuid;

const HUMAN: &str = "ada:human:token-ada";

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

async fn call(
    app: &axum::Router,
    method: &str,
    path: &str,
    cookie: Option<&str>,
    body: Option<&str>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(method).uri(path);
    if let Some(cookie) = cookie {
        builder = builder.header("cookie", cookie);
    }
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
        serde_json::from_slice(&bytes).unwrap_or_else(|_| json!(String::from_utf8_lossy(&bytes)))
    };
    (status, json)
}

async fn app() -> (TestDb, axum::Router, Uuid) {
    load_env();
    let db = TestDb::create().await;
    let identities = braian_api::identities(db.store(), HUMAN).await.unwrap();
    let actor = identities
        .iter()
        .find(|item| item.handle == "ada")
        .expect("ada")
        .actor
        .clone();
    let principal = db
        .store()
        .principal_by_handle("ada")
        .await
        .unwrap()
        .expect("ada principal");
    let user = db
        .store()
        .attach_user(principal, "ada@example.com", "x", "admin", "Ada")
        .await
        .unwrap();
    let app = router(db.store().clone(), identities);
    let defs: braian_model::DefinitionSet =
        serde_json::from_str(include_str!("../../../testdata/rules/definitions.json")).unwrap();
    db.store().put_definitions(&actor, &defs).await.unwrap();
    (db, app, user)
}

#[tokio::test]
async fn deleting_a_type_removes_only_its_canonical_workspace() {
    let (db, app, user) = app().await;
    let key = format!("row222_{}", Uuid::now_v7());
    let token = type_share_token(&key);

    let (status, body) = call(
        &app,
        "POST",
        "/v1/model/draft/steps",
        Some(HUMAN),
        Some(&format!(
            r#"{{"steps":[{{"op":"create_type","key":"{key}","label":"Row222","plural":"Rows222"}}]}}"#
        )),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let (status, body) = call(
        &app,
        "POST",
        "/v1/model/draft/save",
        Some(HUMAN),
        Some("{}"),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["applied"], true);

    let canonical = Uuid::now_v7();
    db.store()
        .save_workspace(canonical, user, "Rows222", false, Some(&token), &json!({}))
        .await
        .unwrap();
    let personal = Uuid::now_v7();
    db.store()
        .save_workspace(
            personal,
            user,
            "Rows222 copy",
            false,
            Some(&format!("user-{}", personal.as_simple())),
            &json!({}),
        )
        .await
        .unwrap();

    let (status, body) = call(
        &app,
        "DELETE",
        &format!("/v1/types/{key}"),
        Some(HUMAN),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    let (status, listed) = call(&app, "GET", "/v1/workspaces", Some(HUMAN), None).await;
    assert_eq!(status, StatusCode::OK, "{listed}");
    let rows = listed["workspaces"].as_array().unwrap();
    let tokens: Vec<_> = rows
        .iter()
        .filter_map(|row| row["share_token"].as_str())
        .collect();
    assert!(
        !tokens.iter().any(|item| *item == token),
        "canonical type workspace should be gone: {tokens:?}"
    );
    assert!(
        tokens
            .iter()
            .any(|item| *item == format!("user-{}", personal.as_simple())),
        "personal workspace copy must survive: {tokens:?}"
    );
}
