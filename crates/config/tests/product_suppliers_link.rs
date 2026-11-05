//! Existing demos get `product_suppliers` through config apply, not a DB reset.
use braian_config::{ConfigDocument, PlanAction, PlanKind, plan_documents};
use braian_model::DefinitionSet;
use serde::Deserialize;

fn demo_definitions() -> DefinitionSet {
    serde_json::from_str(include_str!("../../server/demo/definitions.json"))
        .expect("demo definitions")
}

fn product_suppliers_document() -> Vec<ConfigDocument> {
    let text = include_str!("../../server/demo/config/product-suppliers-link.yaml");
    serde_norway::Deserializer::from_str(text)
        .map(ConfigDocument::deserialize)
        .collect::<Result<_, _>>()
        .expect("product-suppliers-link.yaml")
}

#[test]
fn additive_document_creates_product_suppliers_on_an_older_demo_model() {
    let mut defs = demo_definitions();
    let before = defs.types.len();
    defs.types.retain(|item| item.key != "product_suppliers");
    assert_eq!(
        defs.types.len(),
        before - 1,
        "fixture must include the new type"
    );

    let plan = plan_documents(&defs, &product_suppliers_document()).expect("plan");
    assert!(
        plan.steps.iter().any(|step| {
            step.action == PlanAction::Create
                && step.kind == PlanKind::Type
                && step.key == "product_suppliers"
                && !step.destructive
        }),
        "expected a non-destructive create for product_suppliers, got {:?}",
        plan.steps
    );
    assert!(
        plan.steps.iter().all(|step| !step.destructive),
        "additive link must not delete anything: {:?}",
        plan.steps
    );
}

#[test]
fn fresh_demo_definitions_already_include_product_suppliers() {
    let defs = demo_definitions();
    let link = defs
        .types
        .iter()
        .find(|item| item.key == "product_suppliers")
        .expect("product_suppliers");
    assert!(link.is_link());
    let spec = link.link.as_ref().expect("ends");
    assert_eq!(spec.from_label.key, "product");
    assert_eq!(spec.to_label.key, "suppliers");
}
