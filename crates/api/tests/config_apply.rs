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

async fn seed_extras(db: &TestDb) {
    let sap = db
        .store()
        .create_catalog(
            braian_store::CatalogId::new(),
            "sap",
            "SAP ERP",
            braian_store::CatalogKind::Source,
            true,
        )
        .await
        .unwrap();
    db.store()
        .put_merge_profile(
            uuid::Uuid::now_v7(),
            "sap-brand",
            "SAP brand",
            sap.id,
            &json!({
                "match_attributes": ["number"],
                "master_key": "number",
                "attributes": [{ "source": "brand", "target": "brand" }],
                "on_no_match": "create",
                "on_delete": "ignore",
                "owns_existence_for": ["product"]
            }),
            "manual",
        )
        .await
        .unwrap();
    db.store()
        .put_ownership_rules(&json!([{
            "attribute": "brand",
            "profiles": ["sap-brand"]
        }]))
        .await
        .unwrap();
}

async fn seed_object_in_catalog(db: &TestDb, catalog: braian_store::CatalogId) {
    let defs: braian_model::DefinitionSet =
        serde_json::from_str(include_str!("../../../testdata/rules/definitions.json")).unwrap();
    let scoped = db.store().with_catalog(catalog);
    let actor = scoped
        .upsert_principal("filler", braian_store::PrincipalKind::Human, "Filler")
        .await
        .unwrap();
    let actor = braian_store::Actor {
        actor,
        on_behalf_of: None,
        kind: braian_store::BatchKind::Interactive,
        source: "test".into(),
    };
    scoped.put_definitions(&actor, &defs).await.unwrap();
    let object = braian_model::Object {
        id: braian_model::ObjectId::from_uuid(uuid::Uuid::now_v7()),
        type_id: braian_model::TypeId::from_uuid(
            uuid::Uuid::parse_str("018f0000-0000-7000-8000-000000000200").unwrap(),
        ),
        model_revision: defs.model_revision,
        groups: BTreeMap::from([(
            braian_model::StructureId::from_uuid(
                uuid::Uuid::parse_str("018f0000-0000-7000-8000-000000000300").unwrap(),
            ),
            braian_model::GroupId::from_uuid(
                uuid::Uuid::parse_str("018f0000-0000-7000-8000-000000000400").unwrap(),
            ),
        )]),
        values: BTreeMap::from([(
            braian_model::AttributeId::from_uuid(
                uuid::Uuid::parse_str("018f0000-0000-7000-8000-000000000100").unwrap(),
            ),
            json!("OBJ-IN-TEMP"),
        )]),
    };
    scoped
        .write_batch(&actor, vec![braian_store::ObjectOp::Create(object)])
        .await
        .unwrap();
}

async fn seed_catalog_history(
    db: &TestDb,
    catalog: braian_store::CatalogId,
) -> (uuid::Uuid, uuid::Uuid) {
    let scoped = db.store().with_catalog(catalog);
    let principal = scoped
        .upsert_principal("history", braian_store::PrincipalKind::Human, "History")
        .await
        .unwrap();
    let actor = braian_store::Actor {
        actor: principal,
        on_behalf_of: None,
        kind: braian_store::BatchKind::Interactive,
        source: "test".into(),
    };
    let defs: braian_model::DefinitionSet =
        serde_json::from_str(include_str!("../../../testdata/rules/definitions.json")).unwrap();
    scoped.put_definitions(&actor, &defs).await.unwrap();

    let proposal = uuid::Uuid::now_v7();
    scoped
        .create_proposal(
            proposal,
            "Old config",
            "user",
            principal,
            None,
            false,
            &[braian_store::ProposalRow {
                id: uuid::Uuid::now_v7(),
                object_id: None,
                object_key: None,
                type_key: Some("model".into()),
                base_version: None,
                patch: json!({}),
                status: "pending".into(),
                conflict: false,
                position: 0,
            }],
        )
        .await
        .unwrap();
    let lock = scoped.claim_proposal(proposal).await.unwrap();
    scoped
        .set_proposal_status(proposal, "accepted", lock.token(), false)
        .await
        .unwrap();
    drop(lock);

    let session = uuid::Uuid::now_v7();
    scoped
        .insert_import_session(
            session,
            principal.as_uuid(),
            None,
            "old.csv",
            "csv",
            i64::try_from(defs.model_revision).unwrap_or(0),
        )
        .await
        .unwrap();
    scoped
        .copy_import_rows(
            session,
            0,
            &[braian_store::ImportRowIn {
                session_id: session,
                row_no: 1,
                status: "new".into(),
                object_id: None,
                object_key: None,
                base_version: None,
                cells: json!({}),
                patch: None,
                errors: json!([]),
            }],
        )
        .await
        .unwrap();
    scoped
        .update_import_upload(session, 10, "saved", None)
        .await
        .unwrap();
    (proposal, session)
}

async fn catalog_count(client: &tokio_postgres::Client, table: &str, id: uuid::Uuid) -> i64 {
    let sql = format!("SELECT count(*)::bigint FROM {table} WHERE catalog_id = $1");
    client.query_one(&sql, &[&id]).await.unwrap().get(0)
}

async fn open_catalog_proposal(db: &TestDb, catalog: braian_store::CatalogId) -> uuid::Uuid {
    let scoped = db.store().with_catalog(catalog);
    let principal = scoped
        .upsert_principal("open", braian_store::PrincipalKind::Human, "Open")
        .await
        .unwrap();
    let proposal = uuid::Uuid::now_v7();
    scoped
        .create_proposal(
            proposal,
            "Open config",
            "user",
            principal,
            None,
            false,
            &[braian_store::ProposalRow {
                id: uuid::Uuid::now_v7(),
                object_id: None,
                object_key: None,
                type_key: Some("model".into()),
                base_version: None,
                patch: json!({}),
                status: "pending".into(),
                conflict: false,
                position: 0,
            }],
        )
        .await
        .unwrap();
    proposal
}

fn model(documents: &mut [Value]) -> &mut Value {
    documents
        .iter_mut()
        .find(|document| document["kind"] == "Model")
        .expect("model document")
}

fn delete_catalog_documents(mut documents: Vec<Value>, key: &str) -> Vec<Value> {
    documents.retain(|document| {
        !(document["kind"] == "Catalog" && (document["key"] == key || document["key"] == "master"))
    });
    documents.push(json!({
        "apiVersion": "braian.io/v1",
        "kind": "Catalog",
        "key": "master",
        "mode": "full",
        "name": "Master catalog",
        "catalogKind": "master",
        "editable": true
    }));
    documents.retain(|document| {
        !matches!(
            document["kind"].as_str(),
            Some("MergeProfile" | "Ownership")
        )
    });
    documents
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

#[tokio::test]
async fn apply_adds_a_language() {
    let (_db, app) = app().await;
    let mut documents = exported(&app).await;
    model(&mut documents)["languages"]
        .as_array_mut()
        .unwrap()
        .push(json!("de"));

    let (status, proposed) = apply(&app, &serde_json::to_string(&documents).unwrap()).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{proposed}");
    assert_eq!(proposed["groups"]["Model"]["steps"], 1, "{proposed}");

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
    assert!(
        proposal["rows"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["patch"]["op"] == "set_languages"),
        "{proposal}"
    );

    let (status, accepted) = accept(&app, proposal_id).await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    assert!(
        accepted["failed"].as_array().unwrap().is_empty(),
        "{accepted}"
    );

    let after = definitions(&app).await;
    assert_eq!(after["languages"], json!(["sv", "en-GB", "de"]), "{after}");
}

#[tokio::test]
async fn apply_full_removes_a_language_with_allow_destructive() {
    let (_db, app) = app().await;
    let mut documents = exported(&app).await;
    let model = model(&mut documents);
    model["mode"] = json!("full");
    model["languages"]
        .as_array_mut()
        .unwrap()
        .retain(|language| language.as_str() != Some("en-GB"));

    let (status, blocked) = apply(&app, &serde_json::to_string(&documents).unwrap()).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{blocked}");
    let step = blocked["steps"]
        .as_array()
        .unwrap()
        .iter()
        .find(|step| {
            step["action"] == "delete" && step["kind"] == "language" && step["key"] == "en-GB"
        })
        .expect("en-GB delete step");
    assert_eq!(step["blocked"], true, "{blocked}");

    let wrapped = json!({ "documents": documents, "allowDestructive": true });
    let (status, proposed) = apply(&app, &wrapped.to_string()).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{proposed}");
    let proposal_id = proposed["proposal_id"].as_str().unwrap();
    let (status, accepted) = accept(&app, proposal_id).await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    assert!(
        accepted["failed"].as_array().unwrap().is_empty(),
        "{accepted}"
    );

    let after = definitions(&app).await;
    assert_eq!(after["languages"], json!(["sv"]), "{after}");
}

#[tokio::test]
async fn apply_creates_one_proposal_for_catalogs_merge_profiles_and_ownership() {
    let (_db, app) = app().await;
    let before = definitions(&app).await;
    let documents = json!([
        {
            "apiVersion": "braian.io/v1",
            "kind": "Catalog",
            "key": "erp",
            "name": "ERP",
            "catalogKind": "source",
            "editable": true
        },
        {
            "apiVersion": "braian.io/v1",
            "kind": "MergeProfile",
            "key": "erp-brand",
            "name": "ERP brand",
            "sourceCatalog": "erp",
            "spec": {
                "match_attributes": ["number"],
                "master_key": "number",
                "attributes": [{ "source": "brand", "target": "brand" }],
                "on_no_match": "create",
                "on_delete": "ignore"
            },
            "runMode": "manual"
        },
        {
            "apiVersion": "braian.io/v1",
            "kind": "Ownership",
            "rules": [{ "attribute": "brand", "profiles": ["erp-brand"] }]
        }
    ]);

    let (status, proposed) = apply(&app, &documents.to_string()).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{proposed}");
    assert!(
        proposed["groups"]["Catalog"]["steps"].as_u64().unwrap() >= 1,
        "{proposed}"
    );
    assert_eq!(proposed["groups"]["MergeProfile"]["steps"], 1, "{proposed}");
    assert_eq!(proposed["groups"]["Ownership"]["steps"], 1, "{proposed}");
    assert_eq!(definitions(&app).await, before);

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
    let ops: Vec<&str> = proposal["rows"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|row| row["patch"]["op"].as_str())
        .collect();
    assert!(ops.contains(&"upsert_catalog"), "{proposal}");
    assert!(ops.contains(&"upsert_merge_profile"), "{proposal}");
    assert!(ops.contains(&"set_ownership_rules"), "{proposal}");

    let (status, accepted) = accept(&app, proposal_id).await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    assert!(
        accepted["failed"].as_array().unwrap().is_empty(),
        "{accepted}"
    );

    let (status, _, body) = call(&app, "GET", "/v1/catalogs", Some(HUMAN), &[], None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        String::from_utf8_lossy(&body).contains("erp"),
        "{}",
        String::from_utf8_lossy(&body)
    );
    let (status, _, body) = call(&app, "GET", "/v1/merge/profiles", Some(HUMAN), &[], None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        String::from_utf8_lossy(&body).contains("erp-brand"),
        "{}",
        String::from_utf8_lossy(&body)
    );
    let (status, _, body) = call(&app, "GET", "/v1/merge/ownership", Some(HUMAN), &[], None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        String::from_utf8_lossy(&body).contains("erp-brand"),
        "{}",
        String::from_utf8_lossy(&body)
    );
}

#[tokio::test]
async fn apply_upsert_workspace_template_writes_config_and_list_returns_it() {
    let (_db, app) = app().await;
    let documents = json!([{
        "apiVersion": "braian.io/v1",
        "kind": "WorkspaceTemplate",
        "key": "supplier-review",
        "name": "Supplier review",
        "definition": {
            "views": [{ "type": "object_table", "title": "Suppliers", "typeKey": "supplier" }]
        }
    }]);

    let (status, proposed) = apply(&app, &documents.to_string()).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{proposed}");
    assert_eq!(
        proposed["groups"]["WorkspaceTemplate"]["steps"], 1,
        "{proposed}"
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
    let ops: Vec<&str> = proposal["rows"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|row| row["patch"]["op"].as_str())
        .collect();
    assert!(ops.contains(&"upsert_workspace_template"), "{proposal}");

    let (status, accepted) = accept(&app, proposal_id).await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    assert!(
        accepted["failed"].as_array().unwrap().is_empty(),
        "{accepted}"
    );

    let (status, _, body) = call(
        &app,
        "GET",
        "/v1/workspace-templates",
        Some(HUMAN),
        &[],
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let templates: Value = serde_json::from_slice(&body).unwrap();
    let template = templates
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["key"] == "supplier-review")
        .expect("workspace template is listed");
    assert_eq!(template["name"], "Supplier review", "{template}");
    assert_eq!(
        template["definition"]["views"][0]["type"], "object_table",
        "{template}"
    );
    assert!(
        template["updated_at"]
            .as_str()
            .is_some_and(|text| !text.is_empty()),
        "{template}"
    );

    let (status, _, _) = call(&app, "GET", "/v1/workspace-templates", None, &[], None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn apply_delete_workspace_template_removes_only_the_template() {
    let (_db, app) = app().await;
    let created = json!([{
        "apiVersion": "braian.io/v1",
        "kind": "WorkspaceTemplate",
        "key": "supplier-review",
        "name": "Supplier review",
        "definition": { "views": [{ "type": "object_table", "title": "Suppliers" }] }
    }]);
    let (status, proposed) = apply(&app, &created.to_string()).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{proposed}");
    let proposal_id = proposed["proposal_id"].as_str().unwrap();
    let (status, accepted) = accept(&app, proposal_id).await;
    assert_eq!(status, StatusCode::OK, "{accepted}");

    let documents = json!({
        "documents": [{
            "apiVersion": "braian.io/v1",
            "kind": "WorkspaceTemplate",
            "key": "product-review",
            "name": "Product review",
            "definition": { "views": [] },
            "mode": "full"
        }],
        "allowDestructive": true
    });
    let (status, proposed) = apply(&app, &documents.to_string()).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{proposed}");
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
    let ops: Vec<&str> = proposal["rows"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|row| row["patch"]["op"].as_str())
        .collect();
    assert!(ops.contains(&"delete_workspace_template"), "{proposal}");

    let (status, accepted) = accept(&app, proposal_id).await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    assert!(
        accepted["failed"].as_array().unwrap().is_empty(),
        "{accepted}"
    );

    let (status, _, body) = call(
        &app,
        "GET",
        "/v1/workspace-templates",
        Some(HUMAN),
        &[],
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let templates: Value = serde_json::from_slice(&body).unwrap();
    let keys: Vec<&str> = templates
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|item| item["key"].as_str())
        .collect();
    assert!(!keys.contains(&"supplier-review"), "{keys:?}");
    assert!(keys.contains(&"product-review"), "{keys:?}");
}

#[tokio::test]
async fn apply_delete_catalog_is_blocked_until_allowed() {
    let (db, app) = app().await;
    db.store()
        .create_catalog(
            braian_store::CatalogId::new(),
            "temp",
            "Temporary",
            braian_store::CatalogKind::Source,
            true,
        )
        .await
        .unwrap();

    let mut documents = exported(&app).await;
    documents.retain(|document| {
        !(document["kind"] == "Catalog"
            && (document["key"] == "temp" || document["key"] == "master"))
    });
    documents.push(json!({
        "apiVersion": "braian.io/v1",
        "kind": "Catalog",
        "key": "master",
        "mode": "full",
        "name": "Master catalog",
        "catalogKind": "master",
        "editable": true
    }));
    documents.retain(|document| {
        !matches!(
            document["kind"].as_str(),
            Some("MergeProfile" | "Ownership")
        )
    });

    let (status, blocked) = apply(&app, &serde_json::to_string(&documents).unwrap()).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{blocked}");
    let step = blocked["steps"]
        .as_array()
        .unwrap()
        .iter()
        .find(|step| {
            step["action"] == "delete" && step["kind"] == "catalog" && step["key"] == "temp"
        })
        .expect("temp delete step");
    assert_eq!(step["blocked"], true, "{blocked}");

    let wrapped = json!({ "documents": documents, "allowDestructive": true });
    let (status, proposed) = apply(&app, &wrapped.to_string()).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{proposed}");
    let proposal_id = proposed["proposal_id"].as_str().unwrap();
    let (_, _, body) = call(
        &app,
        "GET",
        &format!("/v1/proposals/{proposal_id}"),
        Some(HUMAN),
        &[],
        None,
    )
    .await;
    let proposal: Value = serde_json::from_slice(&body).unwrap();
    assert!(
        proposal["rows"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["patch"]["op"] == "delete_catalog"),
        "{proposal}"
    );
    let (status, accepted) = accept(&app, proposal_id).await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    assert!(
        accepted["failed"].as_array().unwrap().is_empty(),
        "{accepted}"
    );
    let (status, _, body) = call(&app, "GET", "/v1/catalogs", Some(HUMAN), &[], None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        !String::from_utf8_lossy(&body).contains("temp"),
        "{}",
        String::from_utf8_lossy(&body)
    );
}

#[tokio::test]
async fn apply_delete_catalog_with_objects_is_rejected() {
    let (db, app) = app().await;
    let temp = db
        .store()
        .create_catalog(
            braian_store::CatalogId::new(),
            "temp",
            "Temporary",
            braian_store::CatalogKind::Source,
            true,
        )
        .await
        .unwrap();
    seed_object_in_catalog(&db, temp.id).await;

    let documents = delete_catalog_documents(exported(&app).await, "temp");
    let wrapped = json!({ "documents": documents, "allowDestructive": true });
    let (status, proposed) = apply(&app, &wrapped.to_string()).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{proposed}");
    let proposal_id = proposed["proposal_id"].as_str().unwrap();

    let (status, rejected) = accept(&app, proposal_id).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{rejected}");
    assert_eq!(rejected["code"], "catalog_in_use", "{rejected}");
    assert_eq!(
        rejected["detail"],
        "catalog temp is in use: 1 object, 0 import sessions, 0 proposals, 0 workspaces, 0 model drafts",
        "{rejected}"
    );

    let (status, _, body) = call(&app, "GET", "/v1/catalogs", Some(HUMAN), &[], None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        String::from_utf8_lossy(&body).contains("temp"),
        "{}",
        String::from_utf8_lossy(&body)
    );
}

#[tokio::test]
async fn apply_delete_catalog_removes_finished_history() {
    let (db, app) = app().await;
    let temp = db
        .store()
        .create_catalog(
            braian_store::CatalogId::new(),
            "temp",
            "Temporary",
            braian_store::CatalogKind::Source,
            true,
        )
        .await
        .unwrap();
    let (proposal, session) = seed_catalog_history(&db, temp.id).await;

    let (client, connection) = tokio_postgres::connect(&db.database_url(), tokio_postgres::NoTls)
        .await
        .unwrap();
    tokio::spawn(async move {
        let _ = connection.await;
    });
    let id = temp.id.as_uuid();
    assert!(catalog_count(&client, "changes", id).await > 0);
    assert!(catalog_count(&client, "batches", id).await > 0);
    assert!(catalog_count(&client, "import_sessions", id).await > 0);
    assert!(catalog_count(&client, "proposals", id).await > 0);
    let rows: i64 = client
        .query_one(
            "SELECT count(*)::bigint FROM proposal_rows WHERE proposal_id = $1",
            &[&proposal],
        )
        .await
        .unwrap()
        .get(0);
    assert_eq!(rows, 1);
    let import_rows: i64 = client
        .query_one(
            "SELECT count(*)::bigint FROM import_rows WHERE session_id = $1",
            &[&session],
        )
        .await
        .unwrap()
        .get(0);
    assert_eq!(import_rows, 1);

    let documents = delete_catalog_documents(exported(&app).await, "temp");
    let wrapped = json!({ "documents": documents, "allowDestructive": true });
    let (status, proposed) = apply(&app, &wrapped.to_string()).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{proposed}");
    let proposal_id = proposed["proposal_id"].as_str().unwrap();
    let (status, accepted) = accept(&app, proposal_id).await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    assert!(
        accepted["failed"].as_array().unwrap().is_empty(),
        "{accepted}"
    );

    assert!(catalog_count(&client, "changes", id).await > 0);
    assert!(catalog_count(&client, "batches", id).await > 0);
    assert!(catalog_count(&client, "import_sessions", id).await > 0);
    assert!(catalog_count(&client, "proposals", id).await > 0);
    db.store()
        .purge_soft_deleted_before(chrono::Utc::now() + chrono::Duration::seconds(1))
        .await
        .unwrap();
    assert_eq!(catalog_count(&client, "changes", id).await, 0);
    assert_eq!(catalog_count(&client, "batches", id).await, 0);
    assert_eq!(catalog_count(&client, "import_sessions", id).await, 0);
    assert_eq!(catalog_count(&client, "proposals", id).await, 0);
    let rows: i64 = client
        .query_one(
            "SELECT count(*)::bigint FROM proposal_rows WHERE proposal_id = $1",
            &[&proposal],
        )
        .await
        .unwrap()
        .get(0);
    assert_eq!(rows, 0);
    let import_rows: i64 = client
        .query_one(
            "SELECT count(*)::bigint FROM import_rows WHERE session_id = $1",
            &[&session],
        )
        .await
        .unwrap()
        .get(0);
    assert_eq!(import_rows, 0);

    let (status, _, body) = call(&app, "GET", "/v1/catalogs", Some(HUMAN), &[], None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        !String::from_utf8_lossy(&body).contains("temp"),
        "{}",
        String::from_utf8_lossy(&body)
    );
}

#[tokio::test]
async fn apply_delete_catalog_with_another_open_proposal_is_rejected() {
    let (db, app) = app().await;
    let temp = db
        .store()
        .create_catalog(
            braian_store::CatalogId::new(),
            "temp",
            "Temporary",
            braian_store::CatalogKind::Source,
            true,
        )
        .await
        .unwrap();
    open_catalog_proposal(&db, temp.id).await;

    let documents = delete_catalog_documents(exported(&app).await, "temp");
    let wrapped = json!({ "documents": documents, "allowDestructive": true });
    let (status, proposed) = apply(&app, &wrapped.to_string()).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{proposed}");
    let proposal_id = proposed["proposal_id"].as_str().unwrap();

    let (status, rejected) = accept(&app, proposal_id).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{rejected}");
    assert_eq!(rejected["code"], "catalog_in_use", "{rejected}");
    assert_eq!(
        rejected["detail"],
        "catalog temp is in use: 0 objects, 0 import sessions, 1 proposal, 0 workspaces, 0 model drafts",
        "{rejected}"
    );

    let (status, _, body) = call(&app, "GET", "/v1/catalogs", Some(HUMAN), &[], None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        String::from_utf8_lossy(&body).contains("temp"),
        "{}",
        String::from_utf8_lossy(&body)
    );
}

#[tokio::test]
async fn plan_shows_catalog_active_and_history_counts() {
    let (db, app) = app().await;
    let temp = db
        .store()
        .create_catalog(
            braian_store::CatalogId::new(),
            "temp",
            "Temporary",
            braian_store::CatalogKind::Source,
            true,
        )
        .await
        .unwrap();
    seed_catalog_history(&db, temp.id).await;
    open_catalog_proposal(&db, temp.id).await;

    let documents = delete_catalog_documents(exported(&app).await, "temp");
    let (status, _, body) = call(
        &app,
        "POST",
        "/v1/config/plan",
        Some(HUMAN),
        &[("content-type", "application/json")],
        Some(&serde_json::to_string(&documents).unwrap()),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
    let plan: Value = serde_json::from_slice(&body).unwrap();
    let step = plan["steps"]
        .as_array()
        .unwrap()
        .iter()
        .find(|step| {
            step["action"] == "delete" && step["kind"] == "catalog" && step["key"] == "temp"
        })
        .expect("temp delete step");
    assert_eq!(step["affected"]["proposals"], 1, "{plan}");
    assert_eq!(step["affected"]["importSessions"], 0, "{plan}");
    assert_eq!(step["affected"]["closedProposals"], 1, "{plan}");
    assert_eq!(step["affected"]["finishedImportSessions"], 1, "{plan}");
}

#[tokio::test]
async fn plan_shows_catalog_delete_counts() {
    let (db, app) = app().await;
    let temp = db
        .store()
        .create_catalog(
            braian_store::CatalogId::new(),
            "temp",
            "Temporary",
            braian_store::CatalogKind::Source,
            true,
        )
        .await
        .unwrap();
    seed_object_in_catalog(&db, temp.id).await;

    let documents = delete_catalog_documents(exported(&app).await, "temp");
    let (status, _, body) = call(
        &app,
        "POST",
        "/v1/config/plan",
        Some(HUMAN),
        &[("content-type", "application/json")],
        Some(&serde_json::to_string(&documents).unwrap()),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{}", String::from_utf8_lossy(&body));
    let plan: Value = serde_json::from_slice(&body).unwrap();
    let step = plan["steps"]
        .as_array()
        .unwrap()
        .iter()
        .find(|step| {
            step["action"] == "delete" && step["kind"] == "catalog" && step["key"] == "temp"
        })
        .expect("temp delete step");
    assert_eq!(step["affected"]["objects"], 1, "{plan}");
    assert!(step["affected"]["values"].as_i64().unwrap() >= 1, "{plan}");
}

#[tokio::test]
async fn apply_delete_merge_profile_referenced_by_ownership_is_rejected() {
    let (db, app) = app().await;
    seed_extras(&db).await;

    let mut documents = exported(&app).await;
    documents
        .retain(|document| !matches!(document["kind"].as_str(), Some("Catalog" | "Ownership")));
    documents
        .retain(|document| !(document["kind"] == "MergeProfile" && document["key"] == "sap-brand"));
    documents.push(json!({
        "apiVersion": "braian.io/v1",
        "kind": "MergeProfile",
        "key": "keep-brand",
        "mode": "full",
        "name": "Keep brand",
        "sourceCatalog": "sap",
        "spec": {
            "match_attributes": ["number"],
            "master_key": "number",
            "attributes": [{ "source": "brand", "target": "brand" }],
            "on_no_match": "create",
            "on_delete": "ignore"
        },
        "runMode": "manual"
    }));

    let wrapped = json!({ "documents": documents, "allowDestructive": true });
    let (status, proposed) = apply(&app, &wrapped.to_string()).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{proposed}");
    let proposal_id = proposed["proposal_id"].as_str().unwrap();

    let (status, rejected) = accept(&app, proposal_id).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{rejected}");
    assert_eq!(
        rejected["code"], "ownership_references_profile",
        "{rejected}"
    );
    assert!(
        rejected["detail"]
            .as_str()
            .is_some_and(|detail| detail.contains("sap-brand") && detail.contains("brand")),
        "{rejected}"
    );
}

#[tokio::test]
async fn apply_delete_merge_profile_with_ownership_update_is_accepted() {
    let (db, app) = app().await;
    seed_extras(&db).await;

    let mut documents = exported(&app).await;
    documents.retain(|document| !matches!(document["kind"].as_str(), Some("Catalog")));
    documents
        .retain(|document| !(document["kind"] == "MergeProfile" && document["key"] == "sap-brand"));
    let ownership = documents
        .iter_mut()
        .find(|document| document["kind"] == "Ownership")
        .expect("ownership document");
    ownership["mode"] = json!("full");
    ownership["rules"] = json!([]);
    documents.push(json!({
        "apiVersion": "braian.io/v1",
        "kind": "MergeProfile",
        "key": "keep-brand",
        "mode": "full",
        "name": "Keep brand",
        "sourceCatalog": "sap",
        "spec": {
            "match_attributes": ["number"],
            "master_key": "number",
            "attributes": [{ "source": "brand", "target": "brand" }],
            "on_no_match": "create",
            "on_delete": "ignore"
        },
        "runMode": "manual"
    }));

    let wrapped = json!({ "documents": documents, "allowDestructive": true });
    let (status, proposed) = apply(&app, &wrapped.to_string()).await;
    assert_eq!(status, StatusCode::ACCEPTED, "{proposed}");
    let proposal_id = proposed["proposal_id"].as_str().unwrap();

    let (status, accepted) = accept(&app, proposal_id).await;
    assert_eq!(status, StatusCode::OK, "{accepted}");
    assert!(
        accepted["failed"].as_array().unwrap().is_empty(),
        "{accepted}"
    );

    let (status, _, body) = call(&app, "GET", "/v1/merge/profiles", Some(HUMAN), &[], None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        !String::from_utf8_lossy(&body).contains("sap-brand"),
        "{}",
        String::from_utf8_lossy(&body)
    );
    let (status, _, body) = call(&app, "GET", "/v1/merge/ownership", Some(HUMAN), &[], None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        !String::from_utf8_lossy(&body).contains("sap-brand"),
        "{}",
        String::from_utf8_lossy(&body)
    );
}
