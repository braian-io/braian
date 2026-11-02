use braian_config::{ConfigDocument, ConfigMode, apply_documents, export_documents};
use braian_model::{DefinitionSet, ModelChange, preview};

fn definitions() -> DefinitionSet {
    serde_json::from_str(include_str!("../../../testdata/rules/definitions.json"))
        .expect("test fixture is a definition set")
}

fn documents() -> Vec<ConfigDocument> {
    export_documents(&definitions()).expect("export")
}

#[test]
fn unchanged_documents_produce_no_steps() {
    let defs = definitions();
    let application = apply_documents(&defs, &documents()).expect("apply plan");
    assert!(
        application.changes.is_empty(),
        "unchanged documents should not write: {:?}",
        application.changes
    );
}

#[test]
fn apply_builds_steps_for_new_attributes_lists_and_units() {
    let defs = definitions();
    let mut desired = documents();
    let ConfigDocument::Model(model) = &mut desired[0] else {
        panic!("model comes first");
    };
    let mut barcode = model
        .attributes
        .iter()
        .find(|item| item.key == "notes")
        .expect("notes")
        .clone();
    barcode.key = "barcode".into();
    barcode.labels.clear();
    model.attributes.push(barcode);
    desired.push(ConfigDocument::ValueList(
        braian_config::ValueListDocument {
            api_version: braian_config::ApiVersion::BraianIoV1,
            kind: braian_config::ValueListKind::ValueList,
            key: "materials".into(),
            renamed_from: None,
            mode: None,
            labels: Default::default(),
            options: vec![braian_config::OptionConfig {
                code: "wood".into(),
                labels: Default::default(),
            }],
        },
    ));
    desired.push(ConfigDocument::UnitFamily(
        braian_config::UnitFamilyDocument {
            api_version: braian_config::ApiVersion::BraianIoV1,
            kind: braian_config::UnitFamilyKind::UnitFamily,
            key: "time".into(),
            renamed_from: None,
            mode: None,
            dimension: None,
            base_unit: "s".into(),
            units: vec![braian_config::UnitConfig {
                code: "s".into(),
                factor: "1".into(),
            }],
        },
    ));

    let application = apply_documents(&defs, &desired).expect("apply plan");
    assert!(
        application
            .changes
            .iter()
            .any(|change| matches!(change, ModelChange::UpsertAttribute { .. }))
    );
    assert!(
        application
            .changes
            .iter()
            .any(|change| matches!(change, ModelChange::CreateValueList { .. }))
    );
    assert!(
        application
            .changes
            .iter()
            .any(|change| matches!(change, ModelChange::UpsertUnitFamily { .. }))
    );
    let (after, _) = preview(&defs, &application.changes).expect("steps apply");
    assert!(after.attributes.iter().any(|item| item.key == "barcode"));
    assert!(after.value_lists.iter().any(|item| item.key == "materials"));
    assert!(after.unit_families.iter().any(|item| item.key == "time"));
}

#[test]
fn full_mode_deletes_are_model_steps() {
    let defs = definitions();
    let mut desired = documents();
    let ConfigDocument::Model(model) = &mut desired[0] else {
        panic!("model comes first");
    };
    model.mode = Some(ConfigMode::Full);
    model.attributes.retain(|item| item.key != "weight");

    let application = apply_documents(&defs, &desired).expect("apply plan");
    assert!(application.plan.is_destructive());
    assert!(
        application.changes.iter().any(
            |change| matches!(change, ModelChange::DeleteAttribute { key } if key == "weight")
        )
    );
}

#[test]
fn empty_store_plans_from_config_documents() {
    let empty = DefinitionSet {
        model_revision: 0,
        languages: Vec::new(),
        unit_families: Vec::new(),
        value_lists: Vec::new(),
        attributes: Vec::new(),
        types: Vec::new(),
        structures: Vec::new(),
    };
    let documents: Vec<ConfigDocument> =
        serde_json::from_str(include_str!("../../../testdata/config/definitions.json"))
            .expect("config fixture is a document list");

    let application = apply_documents(&empty, &documents).expect("apply plan");
    assert!(!application.changes.is_empty());
    let (after, _) = preview(&empty, &application.changes).expect("steps apply");
    assert!(after.attributes.iter().any(|item| item.key == "sku"));
    assert!(after.types.iter().any(|item| item.key == "item"));
}
