//! Catalog key lock, and infer / cleanup as proposals.

use axum::body::Body;
use axum::http::{Request, StatusCode};
use braian_api::router;
use braian_store::testing::TestDb;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

const TOKENS: &str = "ada:human:token-ada;bot:agent@ada:token-bot";
const HUMAN: &str = "token-ada";
const AGENT: &str = "token-bot";

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
    body: Option<&str>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(method).uri(path);
    if let Some(token) = token {
        builder = builder.header("authorization", format!("Bearer {token}"));
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
    let principal = db
        .store()
        .principal_by_handle("ada")
        .await
        .unwrap()
        .expect("ada");
    db.store()
        .attach_user(principal, "ada@example.com", "x", "admin", "Ada")
        .await
        .unwrap();
    (db, app)
}

fn catalog_step(key: &str, renamed_from: Option<&str>, name: &str, kind: &str) -> Value {
    json!({
        "op": "upsert_catalog",
        "catalog": {
            "key": key,
            "renamed_from": renamed_from,
            "name": name,
            "kind": kind,
            "editable": kind != "master",
        }
    })
}

async fn stage_and_save(app: &axum::Router, step: &Value) -> (StatusCode, Value) {
    let body = json!({ "steps": [step] }).to_string();
    let (status, staged) = call(
        app,
        "POST",
        "/v1/model/draft/steps",
        Some(HUMAN),
        Some(&body),
    )
    .await;
    if status != StatusCode::OK {
        return (status, staged);
    }
    call(app, "POST", "/v1/model/draft/save", Some(HUMAN), Some("{}")).await
}

async fn save_source(app: &axum::Router, key: &str) {
    let (status, body) = stage_and_save(app, &catalog_step(key, None, "SAP", "source")).await;
    assert_eq!(status, StatusCode::OK, "{body}");
}

#[tokio::test]
async fn master_key_change_is_rejected_on_the_draft_and_on_accept() {
    let (_db, app) = app().await;
    let (status, body) = stage_and_save(
        &app,
        &catalog_step("renamed", Some("master"), "Master catalog", "master"),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    assert_eq!(body["code"], "catalog_key_locked");
    assert!(
        body["detail"]
            .as_str()
            .unwrap_or("")
            .contains("master catalog key"),
        "{body}"
    );
    let (status, master) = call(&app, "GET", "/v1/catalogs/master", Some(HUMAN), None).await;
    assert_eq!(status, StatusCode::OK, "{master}");
    assert_eq!(master["key"], "master");
    let (status, missing) = call(&app, "GET", "/v1/catalogs/renamed", Some(HUMAN), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{missing}");

    let proposal = json!({
        "title": "Rename the master catalog",
        "rows": [{
            "type_key": "model",
            "patch": catalog_step("renamed", Some("master"), "Master catalog", "master"),
        }]
    });
    let (status, filed) = call(
        &app,
        "POST",
        "/v1/proposals",
        Some(HUMAN),
        Some(&proposal.to_string()),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{filed}");
    let id = filed["id"].as_str().unwrap();
    let (status, denied) = call(
        &app,
        "POST",
        &format!("/v1/proposals/{id}/accept"),
        Some(HUMAN),
        Some("{}"),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{denied}");
    assert!(
        denied["accepted"].as_array().unwrap().is_empty(),
        "{denied}"
    );
    assert_eq!(denied["failed"][0]["code"], "catalog_key_locked");
    assert!(
        denied["failed"][0]["detail"]
            .as_str()
            .unwrap_or("")
            .contains("master catalog key"),
        "{denied}"
    );
    let (status, master) = call(&app, "GET", "/v1/catalogs/master", Some(HUMAN), None).await;
    assert_eq!(status, StatusCode::OK, "{master}");
    assert_eq!(master["key"], "master");
}

#[tokio::test]
async fn source_key_change_is_rejected_and_the_same_key_can_be_renamed() {
    let (_db, app) = app().await;
    save_source(&app, "sap").await;
    let (status, denied) =
        stage_and_save(&app, &catalog_step("erp", Some("sap"), "SAP ERP", "source")).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{denied}");
    assert_eq!(denied["code"], "catalog_key_locked");
    assert!(
        denied["detail"]
            .as_str()
            .unwrap_or("")
            .contains("cannot be changed after creation"),
        "{denied}"
    );
    let (status, sap) = call(&app, "GET", "/v1/catalogs/sap", Some(HUMAN), None).await;
    assert_eq!(status, StatusCode::OK, "{sap}");
    assert_eq!(sap["key"], "sap");

    let (status, saved) =
        stage_and_save(&app, &catalog_step("sap", None, "SAP renamed", "source")).await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    let (status, sap) = call(&app, "GET", "/v1/catalogs/sap", Some(HUMAN), None).await;
    assert_eq!(status, StatusCode::OK, "{sap}");
    assert_eq!(sap["name"], "SAP renamed");
    assert_eq!(sap["key"], "sap");
}

#[tokio::test]
async fn post_catalog_stages_a_draft_or_a_proposal_and_does_not_write() {
    let (_db, app) = app().await;
    let body = json!({ "key": "sap", "name": "SAP", "kind": "source", "editable": true });
    let (status, staged) = call(
        &app,
        "POST",
        "/v1/catalogs",
        Some(HUMAN),
        Some(&body.to_string()),
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED, "{staged}");
    assert_eq!(staged["applied"], false);
    assert_eq!(staged["staged"], true);
    let (status, missing) = call(&app, "GET", "/v1/catalogs/sap", Some(HUMAN), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{missing}");

    let (status, saved) = call(
        &app,
        "POST",
        "/v1/model/draft/save",
        Some(HUMAN),
        Some("{}"),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    let (status, sap) = call(&app, "GET", "/v1/catalogs/sap", Some(HUMAN), None).await;
    assert_eq!(status, StatusCode::OK, "{sap}");
    assert_eq!(sap["key"], "sap");

    let (status, proposed) = call(
        &app,
        "POST",
        "/v1/catalogs",
        Some(AGENT),
        Some(&json!({ "key": "pim", "name": "PIM", "kind": "source" }).to_string()),
    )
    .await;
    assert_eq!(status, StatusCode::ACCEPTED, "{proposed}");
    assert_eq!(proposed["applied"], false);
    assert_eq!(proposed["needs_approval"], true);
    let proposal_id = proposed["proposal_id"].as_str().expect("proposal id");
    let (status, missing) = call(&app, "GET", "/v1/catalogs/pim", Some(HUMAN), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{missing}");
    let (status, accepted) = call(
        &app,
        "POST",
        &format!("/v1/proposals/{proposal_id}/accept"),
        Some(HUMAN),
        Some("{}"),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    let (status, pim) = call(&app, "GET", "/v1/catalogs/pim", Some(HUMAN), None).await;
    assert_eq!(status, StatusCode::OK, "{pim}");
    assert_eq!(pim["name"], "PIM");
}

#[tokio::test]
async fn infer_and_cleanup_change_nothing_until_the_proposal_is_approved() {
    let (db, app) = app().await;
    save_source(&app, "sap").await;
    let sap = db.store().catalog_by_key("sap").await.unwrap().unwrap();
    let scoped = db.store().with_catalog(sap.id);
    let actor_id = db
        .store()
        .principal_by_handle("ada")
        .await
        .unwrap()
        .expect("ada");
    let defs: braian_model::DefinitionSet =
        serde_json::from_str(include_str!("../../../testdata/rules/definitions.json")).unwrap();
    scoped
        .put_definitions(
            &braian_store::Actor {
                actor: actor_id,
                on_behalf_of: None,
                kind: braian_store::BatchKind::Interactive,
                source: "test".into(),
            },
            &defs,
        )
        .await
        .unwrap();
    let (status, created) = call(
        &app,
        "POST",
        "/v1/catalogs/sap/objects",
        Some(HUMAN),
        Some(
            r#"{
                "type": "item",
                "groups": { "assortment": "root" },
                "values": { "sku": "SKU-9", "name": { "sv": "Stol" } }
            }"#,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{created}");
    let object_id = created["id"].as_str().unwrap().to_owned();

    let (status, inferred) = call(
        &app,
        "POST",
        "/v1/catalogs/sap/infer",
        Some(HUMAN),
        Some(r#"{"headers":["Shelf code"]}"#),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{inferred}");
    assert_eq!(inferred["applied"], false);
    assert_eq!(inferred["needs_approval"], true);
    let proposal_id = inferred["proposal_id"].as_str().expect("infer proposal");
    let (status, defs) = call(
        &app,
        "GET",
        "/v1/catalogs/sap/definitions",
        Some(HUMAN),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{defs}");
    assert!(
        defs["attributes"]
            .as_array()
            .unwrap()
            .iter()
            .all(|attribute| attribute["key"] != "shelfcode"),
        "{defs}"
    );
    let (status, accepted) = call(
        &app,
        "POST",
        &format!("/v1/catalogs/sap/proposals/{proposal_id}/accept"),
        Some(HUMAN),
        Some("{}"),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    let (status, defs) = call(
        &app,
        "GET",
        "/v1/catalogs/sap/definitions",
        Some(HUMAN),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        defs["attributes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|attribute| attribute["key"] == "shelfcode"),
        "{defs}"
    );

    let (status, cleanup) = call(
        &app,
        "POST",
        "/v1/catalogs/sap/cleanup",
        Some(HUMAN),
        Some("{}"),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{cleanup}");
    assert_eq!(cleanup["applied"], false);
    assert_eq!(cleanup["removed"], 0);
    assert!(cleanup["objects"].as_u64().unwrap_or(0) >= 1, "{cleanup}");
    let proposal_id = cleanup["proposal_id"].as_str().expect("cleanup proposal");
    let (status, still) = call(
        &app,
        "GET",
        &format!("/v1/catalogs/sap/objects/{object_id}"),
        Some(HUMAN),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{still}");
    let (status, accepted) = call(
        &app,
        "POST",
        &format!("/v1/catalogs/sap/proposals/{proposal_id}/accept"),
        Some(HUMAN),
        Some("{}"),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    let (status, gone) = call(
        &app,
        "GET",
        &format!("/v1/catalogs/sap/objects/{object_id}"),
        Some(HUMAN),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::GONE, "{gone}");
    assert_eq!(gone["code"], "deleted");
}
