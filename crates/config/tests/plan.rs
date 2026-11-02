use braian_config::{
    AttributeKindConfig, ConfigDocument, ConfigMode, PlanAction, PlanKind, TextFormConfig,
    export_documents, plan_documents,
};
use braian_model::DefinitionSet;

fn definitions() -> DefinitionSet {
    serde_json::from_str(include_str!("../../../testdata/rules/definitions.json"))
        .expect("test fixture is a definition set")
}

fn documents() -> Vec<ConfigDocument> {
    export_documents(&definitions()).expect("export")
}

fn model(documents: &mut [ConfigDocument]) -> &mut braian_config::ModelDocument {
    match &mut documents[0] {
        ConfigDocument::Model(model) => model,
        _ => panic!("model comes first"),
    }
}

#[test]
fn partial_plan_creates_and_updates_without_deleting() {
    let defs = definitions();
    let mut desired = documents();
    let model = model(&mut desired);
    let mut barcode = model
        .attributes
        .iter()
        .find(|item| item.key == "notes")
        .expect("notes")
        .clone();
    barcode.key = "barcode".into();
    barcode.labels.clear();
    model.attributes.push(barcode);
    model
        .attributes
        .iter_mut()
        .find(|item| item.key == "sku")
        .expect("sku")
        .labels
        .insert("en".into(), "SKU".into());

    let plan = plan_documents(&defs, &desired).expect("plan");
    assert!(
        plan.steps
            .iter()
            .any(|step| step.action == PlanAction::Create
                && step.kind == PlanKind::Attribute
                && step.key == "barcode"),
        "{:?}",
        plan.steps
    );
    assert!(
        plan.steps
            .iter()
            .any(|step| step.action == PlanAction::Update
                && step.kind == PlanKind::Attribute
                && step.key == "sku"
                && step.fields.contains(&"labels".to_owned())),
        "{:?}",
        plan.steps
    );
    assert!(
        plan.steps
            .iter()
            .all(|step| step.action != PlanAction::Delete)
    );
    assert!(!plan.is_destructive());
}

#[test]
fn full_mode_deletes_entities_missing_from_the_document() {
    let defs = definitions();
    let mut desired = documents();
    let model = model(&mut desired);
    model.mode = Some(ConfigMode::Full);
    model.attributes.retain(|item| item.key != "weight");

    let plan = plan_documents(&defs, &desired).expect("plan");
    let step = plan
        .steps
        .iter()
        .find(|step| {
            step.action == PlanAction::Delete
                && step.kind == PlanKind::Attribute
                && step.key == "weight"
        })
        .expect("weight is deleted in full mode");
    assert!(step.destructive);
    assert!(step.purge.is_some());
}

#[test]
fn renamed_from_makes_a_rename_instead_of_delete_and_create() {
    let defs = definitions();
    let mut desired = documents();
    let model = model(&mut desired);
    let attribute = model
        .attributes
        .iter_mut()
        .find(|item| item.key == "weight")
        .expect("weight");
    attribute.renamed_from = Some("weight".into());
    attribute.key = "mass_weight".into();

    let plan = plan_documents(&defs, &desired).expect("plan");
    let step = plan
        .steps
        .iter()
        .find(|step| {
            step.action == PlanAction::Rename
                && step.kind == PlanKind::Attribute
                && step.key == "mass_weight"
        })
        .expect("rename step");
    assert_eq!(step.renamed_from.as_deref(), Some("weight"));
    assert!(
        plan.steps
            .iter()
            .all(|step| !(step.kind == PlanKind::Attribute
                && step.key == "mass_weight"
                && step.action == PlanAction::Create))
    );
    assert!(
        plan.steps
            .iter()
            .all(|step| !(step.kind == PlanKind::Attribute
                && step.key == "weight"
                && step.action == PlanAction::Delete))
    );
}

#[test]
fn full_mode_with_a_rename_does_not_delete_the_old_key() {
    let defs = definitions();
    let mut desired = documents();
    let model = model(&mut desired);
    model.mode = Some(ConfigMode::Full);
    let attribute = model
        .attributes
        .iter_mut()
        .find(|item| item.key == "weight")
        .expect("weight");
    attribute.renamed_from = Some("weight".into());
    attribute.key = "mass_weight".into();

    let plan = plan_documents(&defs, &desired).expect("plan");
    assert!(
        plan.steps
            .iter()
            .all(|step| !(step.kind == PlanKind::Attribute
                && step.key == "weight"
                && step.action == PlanAction::Delete)),
        "{:?}",
        plan.steps
    );
}

#[test]
fn a_data_type_change_is_destructive() {
    let defs = definitions();
    let mut desired = documents();
    let model = model(&mut desired);
    let attribute = model
        .attributes
        .iter_mut()
        .find(|item| item.key == "weight")
        .expect("weight");
    attribute.kind = AttributeKindConfig::Text {
        max_length: Some(32),
        form: TextFormConfig::Short,
    };

    let plan = plan_documents(&defs, &desired).expect("plan");
    let step = plan
        .steps
        .iter()
        .find(|step| {
            step.action == PlanAction::Update
                && step.kind == PlanKind::Attribute
                && step.key == "weight"
        })
        .expect("update step");
    assert!(step.destructive);
    assert!(step.purge.is_some());
    assert!(plan.is_destructive());
}

#[test]
fn a_full_value_list_document_deletes_missing_lists() {
    let defs = definitions();
    let mut desired = documents();
    desired.retain(
        |document| !matches!(document, ConfigDocument::ValueList(list) if list.key == "mass"),
    );
    let empty = braian_config::ValueListDocument {
        api_version: braian_config::ApiVersion::BraianIoV1,
        kind: braian_config::ValueListKind::ValueList,
        key: "unrelated".into(),
        renamed_from: None,
        mode: Some(ConfigMode::Full),
        labels: Default::default(),
        options: Vec::new(),
    };
    desired.push(ConfigDocument::ValueList(empty));

    let plan = plan_documents(&defs, &desired).expect("plan");
    assert!(
        plan.steps
            .iter()
            .all(|step| !(step.kind == PlanKind::ValueList && step.key == "mass")),
        "the fixture has no shared value lists"
    );
    assert!(
        plan.steps
            .iter()
            .any(|step| step.kind == PlanKind::ValueList
                && step.key == "unrelated"
                && step.action == PlanAction::Create)
    );
}

#[test]
fn a_structure_rename_keeps_its_groups() {
    let defs = definitions();
    let mut desired = documents();
    let model = model(&mut desired);
    let structure = model
        .structures
        .iter_mut()
        .find(|item| item.key == "assortment")
        .expect("assortment");
    structure.renamed_from = Some("assortment".into());
    structure.key = "catalog".into();

    let plan = plan_documents(&defs, &desired).expect("plan");
    assert!(
        plan.steps
            .iter()
            .any(|step| step.action == PlanAction::Rename
                && step.kind == PlanKind::Structure
                && step.key == "catalog"),
        "{:?}",
        plan.steps
    );
    assert!(
        plan.steps
            .iter()
            .all(|step| step.kind != PlanKind::Group && step.kind != PlanKind::Class),
        "{:?}",
        plan.steps
    );
}

#[test]
fn a_deleted_structure_does_not_repeat_its_groups() {
    let defs = definitions();
    let mut desired = documents();
    let model = model(&mut desired);
    model.mode = Some(ConfigMode::Full);
    model.structures.retain(|item| item.key != "assortment");

    let plan = plan_documents(&defs, &desired).expect("plan");
    assert!(
        plan.steps
            .iter()
            .any(|step| step.action == PlanAction::Delete
                && step.kind == PlanKind::Structure
                && step.key == "assortment"),
        "{:?}",
        plan.steps
    );
    assert!(
        plan.steps
            .iter()
            .all(|step| !matches!(step.kind, PlanKind::Group | PlanKind::Class)),
        "{:?}",
        plan.steps
    );
}
