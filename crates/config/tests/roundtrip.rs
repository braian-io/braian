use std::collections::BTreeMap;

use braian_config::{ConfigDocument, export_documents};
use braian_model::{
    Cardinality, DefinitionSet, LinkLabel, LinkSpec, ObjectType, SharedValueList, TypeId, TypeKind,
    Uuid, ValueListId, ValueOption,
};
use serde::Deserialize;

fn definitions() -> DefinitionSet {
    let mut defs: DefinitionSet =
        serde_json::from_str(include_str!("../../../testdata/rules/definitions.json"))
            .expect("test fixture is a definition set");
    let item = defs
        .types
        .iter()
        .find(|item| item.key == "item")
        .expect("item type")
        .clone();
    let sku = defs
        .attributes
        .iter()
        .find(|item| item.key == "sku")
        .expect("sku attribute")
        .id;

    let supplier = ObjectType {
        id: TypeId::from_uuid(Uuid::from_u128(0x9000)),
        key: "supplier".into(),
        labels: BTreeMap::new(),
        singular: BTreeMap::from([(
            braian_model::LanguageTag::parse("en").expect("language"),
            "Supplier".into(),
        )]),
        plural: BTreeMap::new(),
        key_attribute: sku,
        attributes: vec![sku],
        structures: None,
        defaults: BTreeMap::new(),
        kind: TypeKind::Entity,
        link: None,
    };
    let link = ObjectType {
        id: TypeId::from_uuid(Uuid::from_u128(0x9001)),
        key: "item_supplier".into(),
        labels: BTreeMap::new(),
        singular: BTreeMap::new(),
        plural: BTreeMap::new(),
        key_attribute: sku,
        attributes: vec![],
        structures: None,
        defaults: BTreeMap::new(),
        kind: TypeKind::Link,
        link: Some(LinkSpec {
            from_types: vec![item.id],
            to_types: vec![supplier.id],
            from_label: LinkLabel {
                key: "item".into(),
                labels: BTreeMap::new(),
            },
            to_label: LinkLabel {
                key: "supplier".into(),
                labels: BTreeMap::new(),
            },
            from_cardinality: Cardinality::One,
            to_cardinality: Cardinality::Many,
        }),
    };
    defs.types.push(supplier);
    defs.types.push(link);
    defs.value_lists.push(SharedValueList {
        id: ValueListId::from_uuid(Uuid::from_u128(0x9002)),
        key: "colors".into(),
        labels: BTreeMap::new(),
        options: vec![ValueOption {
            code: "red".into(),
            labels: BTreeMap::new(),
        }],
    });
    defs
}

fn to_yaml(documents: &[ConfigDocument]) -> String {
    let parts: Vec<String> = documents
        .iter()
        .map(|document| serde_norway::to_string(document).expect("yaml document"))
        .map(|text| text.trim_end().to_owned())
        .collect();
    format!("{}\n", parts.join("\n---\n"))
}

fn from_yaml(text: &str) -> Vec<ConfigDocument> {
    serde_norway::Deserializer::from_str(text)
        .map(ConfigDocument::deserialize)
        .collect::<Result<_, _>>()
        .expect("yaml roundtrip")
}

#[test]
fn yaml_and_json_roundtrip_with_keys_and_no_uuids() {
    let defs = definitions();
    let documents = export_documents(&defs).expect("export");

    let json = serde_json::to_string(&documents).expect("json");
    let from_json: Vec<ConfigDocument> = serde_json::from_str(&json).expect("json roundtrip");
    assert_eq!(documents, from_json);

    let yaml = to_yaml(&documents);
    assert_eq!(documents, from_yaml(&yaml));

    assert!(!json.contains("018f0000-"), "ids leaked into JSON: {json}");
    assert!(!yaml.contains("018f0000-"), "ids leaked into YAML: {yaml}");

    let ConfigDocument::Model(model) = &documents[0] else {
        panic!("model comes first");
    };
    let link = model
        .types
        .iter()
        .find(|item| item.key == "item_supplier")
        .expect("link type is exported");
    assert_eq!(link.kind, braian_config::TypeKindConfig::Link);
    let spec = link.link.as_ref().expect("link ends");
    assert_eq!(spec.from_types, ["item"]);
    assert_eq!(spec.to_types, ["supplier"]);
    assert!(model.types.iter().any(|item| item.key == "item"));
    assert_eq!(model.languages, ["sv", "en-GB"]);

    assert!(documents.iter().any(|document| matches!(
        document,
        ConfigDocument::ValueList(list) if list.key == "colors"
    )));
    assert!(documents.iter().any(|document| matches!(
        document,
        ConfigDocument::UnitFamily(family) if family.key == "mass"
            && family.units.iter().any(|unit| unit.code == "g" && unit.factor == "0.001")
    )));
}

#[test]
fn the_schema_accepts_exported_documents() {
    let schema = serde_json::to_value(braian_config::schema()).expect("schema value");
    let validator = jsonschema::validator_for(&schema).expect("valid schema");
    let documents = export_documents(&definitions()).expect("export");
    for document in &documents {
        let value = serde_json::to_value(document).expect("document value");
        assert!(
            validator.is_valid(&value),
            "schema rejected exported document: {value}"
        );
    }
}

#[test]
fn the_schema_rejects_invalid_documents() {
    let schema = serde_json::to_value(braian_config::schema()).expect("schema value");
    let validator = jsonschema::validator_for(&schema).expect("valid schema");

    let missing_version = serde_json::json!({ "kind": "Model" });
    assert!(!validator.is_valid(&missing_version));

    let wrong_version = serde_json::json!({
        "apiVersion": "braian.io/v2",
        "kind": "Model"
    });
    assert!(!validator.is_valid(&wrong_version));

    let unknown_kind = serde_json::json!({
        "apiVersion": "braian.io/v1",
        "kind": "Bogus"
    });
    assert!(!validator.is_valid(&unknown_kind));

    let wrong_factor_type = serde_json::json!({
        "apiVersion": "braian.io/v1",
        "kind": "UnitFamily",
        "key": "mass",
        "baseUnit": "kg",
        "units": [{ "code": "kg", "factor": 1 }]
    });
    assert!(!validator.is_valid(&wrong_factor_type));
}
