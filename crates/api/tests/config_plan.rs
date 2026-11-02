//! Config-as-code plan: partial, full, rename and the destructive guard.

use std::collections::BTreeMap;

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

async fn call(
    app: &axum::Router,
    method: &str,
    path: &str,
    token: Option<&str>,
    extra: &[(&str, &str)],
    body: Option<&str>,
) -> (StatusCode, BTreeMap<String, String>, Vec<u8>) {
    let mut builder = Request::builder().method(method).uri(path);
    if let Some(token) = token {
        builder = builder.header("authorization", format!("Bearer {token}"));
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
    let mut headers = BTreeMap::new();
    for (name, value) in response.headers() {
        if let Ok(text) = value.to_str() {
            headers.insert(name.as_str().to_owned(), text.to_owned());
        }
    }
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, headers, bytes.to_vec())
}

async fn app() -> (TestDb, axum::Router) {
    load_env();
    let db = TestDb::create().await;
    let identities = braian_api::identities(db.store(), TOKENS).await.unwrap();
    let actor = identities
        .iter()
        .find(|item| item.handle == "ada")
        .expect("ada")
        .actor
        .clone();
    let app = router(db.store().clone(), identities);

    let mut defs: braian_model::DefinitionSet =
        serde_json::from_str(include_str!("../../../testdata/rules/definitions.json")).unwrap();
    defs.value_lists = serde_json::from_value(json!([{
        "id": "018f0000-0000-7000-8000-000000000600",
        "key": "colors",
        "labels": { "en": "Colors" },
        "options": [
            { "code": "red", "labels": { "en": "Red" } },
            { "code": "blue", "labels": { "en": "Blue" } }
        ]
    }]))
    .unwrap();
    db.store().put_definitions(&actor, &defs).await.unwrap();
    (db, app)
}

async fn exported(app: &axum::Router) -> Vec<Value> {
    let (status, _, body) = call(
        app,
        "GET",
        "/v1/config/export?format=json",
        Some(HUMAN),
        &[],
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    serde_json::from_slice(&body).unwrap()
}

fn model(documents: &mut [Value]) -> &mut Value {
    documents
        .iter_mut()
        .find(|document| document["kind"] == "Model")
        .expect("model document")
}

fn without_weight(documents: &mut [Value]) {
    let model = model(documents);
    model["mode"] = json!("full");
    let attributes = model["attributes"].as_array_mut().expect("attributes");
    attributes.retain(|attribute| attribute["key"] != "weight");
}

#[tokio::test]
async fn partial_plan_returns_creates_without_deleting() {
    let (_db, app) = app().await;
    let mut documents = exported(&app).await;
    let model = model(&mut documents);
    model["attributes"].as_array_mut().unwrap().push(json!({
        "key": "barcode",
        "languageDependent": false,
        "multiple": false,
        "kind": { "type": "text", "maxLength": 40 },
        "index": { "searchable": true, "filterable": true, "sortable": true }
    }));

    let (status, headers, body) = call(
        &app,
        "POST",
        "/v1/config/plan",
        Some(HUMAN),
        &[("content-type", "application/json")],
        Some(&serde_json::to_string(&documents).unwrap()),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
    assert_eq!(
        headers.get("content-type").map(String::as_str),
        Some("application/json")
    );
    let plan: Value = serde_json::from_slice(&body).unwrap();
    let steps = plan["steps"].as_array().unwrap();
    assert!(
        steps.iter().any(|step| step["action"] == "create"
            && step["kind"] == "attribute"
            && step["key"] == "barcode"),
        "{plan}"
    );
    assert!(
        steps.iter().all(|step| step["action"] != "delete"),
        "{plan}"
    );
    assert!(
        steps.iter().all(|step| step["destructive"] == false),
        "{plan}"
    );
}

#[tokio::test]
async fn yaml_multi_document_plan_is_accepted() {
    let (_db, app) = app().await;
    let (status, _, yaml) = call(&app, "GET", "/v1/config/export", Some(HUMAN), &[], None).await;
    assert_eq!(status, StatusCode::OK);
    let yaml = String::from_utf8(yaml).unwrap();

    let (status, _, body) = call(
        &app,
        "POST",
        "/v1/config/plan",
        Some(HUMAN),
        &[("content-type", "application/yaml")],
        Some(&yaml),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
    let plan: Value = serde_json::from_slice(&body).unwrap();
    assert!(plan["steps"].as_array().unwrap().is_empty(), "{plan}");
}

#[tokio::test]
async fn destructive_steps_are_flagged_blocked_with_affected_counts_and_200() {
    let (db, app) = app().await;
    let (status, _, body) = call(
        &app,
        "POST",
        "/v1/objects",
        Some(HUMAN),
        &[("content-type", "application/json")],
        Some(r#"{"type":"item","values":{"sku":"SKU-PLAN","weight":{"value":"2","unit":"kg"}}}"#),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
    let before = db.store().definition_set().await.unwrap();

    let mut documents = exported(&app).await;
    without_weight(&mut documents);
    let payload = serde_json::to_string(&documents).unwrap();

    let (status, _, body) = call(
        &app,
        "POST",
        "/v1/config/plan",
        Some(HUMAN),
        &[("content-type", "application/json")],
        Some(&payload),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
    let plan: Value = serde_json::from_slice(&body).unwrap();
    let step = plan["steps"]
        .as_array()
        .unwrap()
        .iter()
        .find(|step| {
            step["action"] == "delete" && step["kind"] == "attribute" && step["key"] == "weight"
        })
        .expect("weight delete step");
    assert_eq!(step["destructive"], true, "{plan}");
    assert_eq!(step["blocked"], true, "{plan}");
    assert!(step["affected"]["objects"].as_i64().unwrap() >= 1, "{plan}");
    assert!(step["affected"]["values"].as_i64().unwrap() >= 1, "{plan}");

    let after = db.store().definition_set().await.unwrap();
    assert_eq!(before, after, "plan must not write definitions");
}

#[tokio::test]
async fn allow_destructive_in_the_body_does_not_change_the_plan() {
    let (_db, app) = app().await;
    let mut documents = exported(&app).await;
    without_weight(&mut documents);

    let (status, _, body) = call(
        &app,
        "POST",
        "/v1/config/plan",
        Some(HUMAN),
        &[("content-type", "application/json")],
        Some(
            &json!({
                "documents": documents,
                "allowDestructive": true
            })
            .to_string(),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
    let plan: Value = serde_json::from_slice(&body).unwrap();
    assert!(
        plan["steps"].as_array().unwrap().iter().any(|step| {
            step["action"] == "delete"
                && step["kind"] == "attribute"
                && step["key"] == "weight"
                && step["destructive"] == true
                && step["blocked"] == true
        }),
        "{plan}"
    );
}

#[tokio::test]
async fn plan_requires_a_token_and_rejects_a_wrong_version() {
    let (_db, app) = app().await;
    let (status, _, _) = call(
        &app,
        "POST",
        "/v1/config/plan",
        None,
        &[("content-type", "application/json")],
        Some("[]"),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (status, _, _) = call(
        &app,
        "POST",
        "/v1/config/plan",
        Some(HUMAN),
        &[("content-type", "application/json")],
        Some(r#"{"apiVersion":"braian.io/v2","kind":"Model"}"#),
    )
    .await;
    assert!(
        status == StatusCode::BAD_REQUEST || status == StatusCode::UNPROCESSABLE_ENTITY,
        "{status}"
    );
}
