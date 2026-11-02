//! Config-as-code apply: one proposal, grouped changes and approve.

use std::collections::BTreeMap;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use braian_api::router;
use braian_store::testing::TestDb;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

const TOKENS: &str = "ada:human:token-ada;bot:agent@ada:token-bot";
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
    let defs: braian_model::DefinitionSet =
        serde_json::from_str(include_str!("../../../testdata/rules/definitions.json")).unwrap();
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

async fn definitions(app: &axum::Router) -> Value {
    let (status, _, body) = call(app, "GET", "/v1/definitions", Some(HUMAN), &[], None).await;
    assert_eq!(status, StatusCode::OK);
    serde_json::from_slice(&body).unwrap()
}

async fn apply(app: &axum::Router, body: &str) -> (StatusCode, Value) {
    let (status, _, bytes) = call(
        app,
        "POST",
        "/v1/config/apply",
        Some(HUMAN),
        &[("content-type", "application/json")],
        Some(body),
    )
    .await;
    let value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    (status, value)
}

async fn accept(app: &axum::Router, proposal: &str) -> (StatusCode, Value) {
    let (status, _, bytes) = call(
        app,
        "POST",
        &format!("/v1/proposals/{proposal}/accept"),
        Some(HUMAN),
        &[("content-type", "application/json")],
        Some("{}"),
    )
    .await;
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

#[tokio::test]
async fn apply_makes_one_grouped_proposal_and_only_approve_writes() {
    let (_db, app) = app().await;
    let mut documents = exported(&app).await;
    model(&mut documents)["attributes"]
        .as_array_mut()
        .unwrap()
        .push(json!({
            "key": "barcode",
            "languageDependent": false,
            "multiple": false,
            "kind": { "type": "text", "maxLength": 40 },
            "index": { "searchable": true, "filterable": true, "sortable": true }
        }));
    documents.push(json!({
        "apiVersion": "braian.io/v1",
        "kind": "ValueList",
        "key": "materials",
        "options": [{ "code": "wood", "labels": { "en": "Wood" } }]
    }));
    documents.push(json!({
        "apiVersion": "braian.io/v1",
        "kind": "UnitFamily",
        "key": "time",
        "baseUnit": "s",
        "units": [
            { "code": "s", "factor": "1" },
            { "code": "min", "factor": "60" }
        ]
    }));

    let before = definitions(&app).await;
    let (status, proposed) = apply(&app, &serde_json::to_string(&documents).unwrap()).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{proposed}");
    assert_eq!(proposed["needs_approval"], true, "{proposed}");
    assert!(proposed["proposal_id"].as_str().is_some(), "{proposed}");
    assert!(
        proposed["groups"]["Model"]["steps"].as_u64().unwrap() >= 1,
        "{proposed}"
    );
    assert_eq!(proposed["groups"]["ValueList"]["steps"], 1, "{proposed}");
    assert_eq!(proposed["groups"]["UnitFamily"]["steps"], 1, "{proposed}");

    let after_apply = definitions(&app).await;
    assert_eq!(after_apply["model_revision"], before["model_revision"]);
    assert!(
        !after_apply["attributes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["key"] == "barcode"),
        "{after_apply}"
    );

    let proposal_id = proposed["proposal_id"].as_str().unwrap();
    let (status, _, body) = call(
        &app,
        "GET",
        &format!("/v1/proposals/{proposal_id}"),
        Some(HUMAN),
        &[],
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let proposal: Value = serde_json::from_slice(&body).unwrap();
    let rows = proposal["rows"].as_array().expect("rows");
    assert!(!rows.is_empty(), "{proposal}");
    assert!(
        rows.iter().all(|row| row["type_key"] == "model"),
        "{proposal}"
    );

    let (status, accepted) = accept(&app, proposal_id).await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    assert!(
        accepted["failed"].as_array().unwrap().is_empty(),
        "{accepted}"
    );

    let after = definitions(&app).await;
    assert!(
        after["attributes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["key"] == "barcode"),
        "{after}"
    );
    assert!(
        after["value_lists"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["key"] == "materials"),
        "{after}"
    );
    assert!(
        after["unit_families"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["key"] == "time"),
        "{after}"
    );
}

#[tokio::test]
async fn destructive_apply_is_blocked_with_counts_until_the_body_allows_it() {
    let (_db, app) = app().await;
    let (status, _, body) = call(
        &app,
        "POST",
        "/v1/objects",
        Some(HUMAN),
        &[("content-type", "application/json")],
        Some(r#"{"type":"item","values":{"sku":"SKU-APPLY","weight":{"value":"2","unit":"kg"}}}"#),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));

    let before = definitions(&app).await;
    let mut documents = exported(&app).await;
    let model = model(&mut documents);
    model["mode"] = json!("full");
    model["attributes"]
        .as_array_mut()
        .unwrap()
        .retain(|attribute| attribute["key"] != "weight");

    let (status, blocked) = apply(&app, &serde_json::to_string(&documents).unwrap()).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{blocked}");
    let step = blocked["steps"]
        .as_array()
        .unwrap()
        .iter()
        .find(|step| {
            step["action"] == "delete" && step["kind"] == "attribute" && step["key"] == "weight"
        })
        .expect("weight delete step");
    assert_eq!(step["blocked"], true, "{blocked}");
    assert!(
        step["affected"]["objects"].as_i64().unwrap() >= 1,
        "{blocked}"
    );
    assert!(
        step["affected"]["values"].as_i64().unwrap() >= 1,
        "{blocked}"
    );
    assert_eq!(definitions(&app).await, before);

    let wrapped = json!({
        "documents": documents,
        "allowDestructive": true
    });
    let (status, proposed) = apply(&app, &wrapped.to_string()).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{proposed}");
    let proposal_id = proposed["proposal_id"].as_str().expect("proposal");
    assert_eq!(definitions(&app).await, before);

    let (status, accepted) = accept(&app, proposal_id).await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    let after = definitions(&app).await;
    assert!(
        !after["attributes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["key"] == "weight"),
        "{after}"
    );
}

#[tokio::test]
async fn apply_without_changes_makes_no_proposal_and_put_definitions_is_gone() {
    let (_db, app) = app().await;
    let documents = exported(&app).await;
    let (status, body) = apply(&app, &serde_json::to_string(&documents).unwrap()).await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");
    assert_eq!(body["code"], "no_changes", "{body}");

    let defs = include_str!("../../../testdata/rules/definitions.json");
    let (status, _, _) = call(
        &app,
        "PUT",
        "/v1/definitions",
        Some(HUMAN),
        &[("content-type", "application/json")],
        Some(defs),
    )
    .await;
    assert!(
        status == StatusCode::NOT_FOUND || status == StatusCode::METHOD_NOT_ALLOWED,
        "{status}"
    );
}
