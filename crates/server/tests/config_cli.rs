//! The config CLI against a live API test server.

use braian_config::ConfigDocument;
use braian_server::config_cli::{
    ApplyOutcome, ConfigClient, ExportFormat, load_documents, plan_exit_code,
};
use braian_store::testing::TestDb;

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

async fn app() -> (TestDb, String) {
    load_env();
    let db = TestDb::create().await;
    let identities = braian_api::identities(db.store(), TOKENS).await.unwrap();
    let actor = identities
        .iter()
        .find(|item| item.handle == "ada")
        .expect("ada")
        .actor
        .clone();
    let app = braian_api::router(db.store().clone(), identities);
    let defs: braian_model::DefinitionSet =
        serde_json::from_str(include_str!("../../../testdata/rules/definitions.json")).unwrap();
    db.store().put_definitions(&actor, &defs).await.unwrap();

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    (db, format!("http://{addr}"))
}

#[tokio::test]
async fn export_plan_and_apply_round_trip() {
    let (_db, url) = app().await;
    let client = ConfigClient::new(url, Some(HUMAN.to_owned()));

    let exported = client.export(ExportFormat::Json).await.unwrap();
    let mut documents: Vec<ConfigDocument> = serde_json::from_slice(&exported).unwrap();

    let dir = std::env::temp_dir().join(format!("braian-config-cli-{}", uuid::Uuid::now_v7()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("model.json");
    std::fs::write(&file, &exported).unwrap();
    let loaded = load_documents(std::slice::from_ref(&dir)).unwrap();
    assert_eq!(loaded, documents);
    std::fs::remove_dir_all(&dir).unwrap();

    let unchanged = client.plan(&loaded).await.unwrap();
    assert!(unchanged.steps.is_empty(), "{unchanged:?}");
    assert_eq!(plan_exit_code(&unchanged), 0);

    let braian_config::ConfigDocument::Model(model) = &mut documents[0] else {
        panic!("the export starts with the model document");
    };
    model.attributes.push(
        serde_json::from_value(serde_json::json!({
            "key": "barcode",
            "languageDependent": false,
            "multiple": false,
            "kind": { "type": "text", "maxLength": 40 },
            "index": { "searchable": true, "filterable": true, "sortable": true }
        }))
        .unwrap(),
    );

    let changed = client.plan(&documents).await.unwrap();
    assert!(
        changed.steps.iter().any(|step| {
            step.action == braian_config::PlanAction::Create
                && step.kind == braian_config::PlanKind::Attribute
                && step.key == "barcode"
        }),
        "{changed:?}"
    );
    assert_eq!(plan_exit_code(&changed), 2);

    // Catalogs, merge profiles and ownership export but cannot be applied yet.
    documents.retain(ConfigDocument::is_applyable);
    match client.apply(&documents, false).await.unwrap() {
        ApplyOutcome::Accepted(accepted) => {
            assert!(!accepted.proposal_id.is_empty());
            assert!(accepted.groups["Model"]["steps"].as_u64().unwrap() >= 1);
        }
        other => panic!("expected an accepted apply, got {other:?}"),
    }
}
