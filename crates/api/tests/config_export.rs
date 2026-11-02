//! Config-as-code export and its JSON Schema.

use std::collections::BTreeMap;
use std::io::{Cursor, Read};

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

#[tokio::test]
async fn export_serves_yaml_json_and_zip() {
    let (_db, app) = app().await;

    let (status, headers, body) =
        call(&app, "GET", "/v1/config/export", Some(HUMAN), &[], None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        headers.get("content-type").map(String::as_str),
        Some("application/yaml")
    );
    let yaml = String::from_utf8(body).unwrap();
    assert!(yaml.contains("apiVersion: braian.io/v1"), "{yaml}");
    assert!(yaml.contains("kind: Model"), "{yaml}");
    assert!(yaml.contains("kind: ValueList"), "{yaml}");
    assert!(yaml.contains("kind: UnitFamily"), "{yaml}");
    assert!(yaml.contains("key: item"), "{yaml}");
    assert!(!yaml.contains("018f0000-"), "ids leaked into YAML: {yaml}");

    let (status, headers, body) = call(
        &app,
        "GET",
        "/v1/config/export",
        Some(HUMAN),
        &[("accept", "application/json")],
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        headers.get("content-type").map(String::as_str),
        Some("application/json")
    );
    let documents: Vec<Value> = serde_json::from_slice(&body).unwrap();
    let kinds: Vec<&str> = documents
        .iter()
        .filter_map(|document| document["kind"].as_str())
        .collect();
    assert!(kinds.contains(&"Model"));
    assert!(kinds.contains(&"ValueList"));
    assert!(kinds.contains(&"UnitFamily"));
    let model = documents
        .iter()
        .find(|document| document["kind"] == "Model")
        .unwrap();
    assert!(
        model["types"]
            .as_array()
            .unwrap()
            .iter()
            .any(|item| item["key"] == "item")
    );
    assert!(
        !String::from_utf8_lossy(&body).contains("018f0000-"),
        "ids leaked into JSON"
    );

    let (status, headers, body) = call(
        &app,
        "GET",
        "/v1/config/export?format=zip",
        Some(HUMAN),
        &[],
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        headers.get("content-type").map(String::as_str),
        Some("application/zip")
    );
    let mut archive = zip::ZipArchive::new(Cursor::new(body)).unwrap();
    let names: Vec<String> = (0..archive.len())
        .map(|index| archive.by_index(index).unwrap().name().to_owned())
        .collect();
    assert!(names.contains(&"model/model.yaml".to_owned()), "{names:?}");
    assert!(
        names.contains(&"value-lists/colors.yaml".to_owned()),
        "{names:?}"
    );
    assert!(names.contains(&"units/mass.yaml".to_owned()), "{names:?}");
    let mut model = archive.by_name("model/model.yaml").unwrap();
    let mut text = String::new();
    model.read_to_string(&mut text).unwrap();
    assert!(text.contains("key: item"), "{text}");
}

#[tokio::test]
async fn schema_is_served_and_requires_a_token() {
    let (_db, app) = app().await;

    let (status, headers, body) =
        call(&app, "GET", "/v1/config/schema", Some(HUMAN), &[], None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        headers.get("content-type").map(String::as_str),
        Some("application/schema+json")
    );
    let schema: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(
        schema["$schema"],
        "https://json-schema.org/draft/2020-12/schema"
    );
    assert!(schema["$defs"]["ModelDocument"].is_object());

    let (status, _, _) = call(&app, "GET", "/v1/config/schema", None, &[], None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, _, _) = call(&app, "GET", "/v1/config/export", None, &[], None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
