//! Export and plan for catalogs, merge profiles, workspace templates and ownership rules.

use braian_config::{
    ApiVersion, CatalogDocument, CatalogKind, CatalogSourceKind, ConfigDocument, ConfigExtras,
    MergeModeConfig, MergeProfileDocument, MergeProfileKind, OwnershipDocument, OwnershipKind,
    OwnershipRuleConfig, PlanAction, PlanKind, WorkspaceTemplateDocument, WorkspaceTemplateKind,
    export_documents_with, plan_documents_with,
};
use braian_model::DefinitionSet;
use serde::Deserialize;
use serde_json::json;

fn definitions() -> DefinitionSet {
    serde_json::from_str(include_str!("../../../testdata/rules/definitions.json"))
        .expect("test fixture is a definition set")
}

fn extras() -> ConfigExtras {
    ConfigExtras {
        catalogs: vec![
            CatalogDocument {
                api_version: ApiVersion::BraianIoV1,
                kind: CatalogKind::Catalog,
                key: "master".into(),
                renamed_from: None,
                mode: None,
                name: "Master catalog".into(),
                catalog_kind: CatalogSourceKind::Master,
                editable: true,
            },
            CatalogDocument {
                api_version: ApiVersion::BraianIoV1,
                kind: CatalogKind::Catalog,
                key: "sap".into(),
                renamed_from: None,
                mode: None,
                name: "SAP ERP".into(),
                catalog_kind: CatalogSourceKind::Source,
                editable: true,
            },
        ],
        merge_profiles: vec![MergeProfileDocument {
            api_version: ApiVersion::BraianIoV1,
            kind: MergeProfileKind::MergeProfile,
            key: "sap-brand".into(),
            renamed_from: None,
            mode: None,
            name: "SAP brand".into(),
            source_catalog: "sap".into(),
            spec: json!({
                "match_attributes": ["number"],
                "master_key": "number",
                "attributes": [{ "source": "brand", "target": "brand" }],
                "on_no_match": "create",
                "on_delete": "ignore",
                "owns_existence_for": ["product"]
            }),
            run_mode: MergeModeConfig::Manual,
        }],
        workspace_templates: vec![WorkspaceTemplateDocument {
            api_version: ApiVersion::BraianIoV1,
            kind: WorkspaceTemplateKind::WorkspaceTemplate,
            key: "supplier-review".into(),
            renamed_from: None,
            mode: None,
            name: "Supplier review".into(),
            definition: json!({
                "views": [{ "type": "object_table", "title": "Suppliers", "typeKey": "supplier" }]
            }),
        }],
        ownership: Some(OwnershipDocument {
            api_version: ApiVersion::BraianIoV1,
            kind: OwnershipKind::Ownership,
            mode: None,
            rules: vec![OwnershipRuleConfig {
                attribute: "brand".into(),
                language: None,
                profiles: vec!["sap-brand".into()],
            }],
        }),
    }
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
fn new_kinds_export_and_roundtrip_without_ids() {
    let documents = export_documents_with(&definitions(), &extras()).expect("export");
    let kinds: Vec<&str> = documents.iter().map(ConfigDocument::kind_name).collect();
    assert!(kinds.contains(&"Catalog"), "{kinds:?}");
    assert!(kinds.contains(&"MergeProfile"), "{kinds:?}");
    assert!(kinds.contains(&"WorkspaceTemplate"), "{kinds:?}");
    assert!(kinds.contains(&"Ownership"), "{kinds:?}");

    let json = serde_json::to_string(&documents).expect("json");
    let from_json: Vec<ConfigDocument> = serde_json::from_str(&json).expect("json roundtrip");
    assert_eq!(documents, from_json);

    let yaml = to_yaml(&documents);
    assert_eq!(documents, from_yaml(&yaml));

    assert!(!json.contains("018f0000-"), "ids leaked into JSON: {json}");
    assert!(!yaml.contains("018f0000-"), "ids leaked into YAML: {yaml}");
    assert!(yaml.contains("kind: Catalog"), "{yaml}");
    assert!(yaml.contains("kind: MergeProfile"), "{yaml}");
    assert!(yaml.contains("kind: WorkspaceTemplate"), "{yaml}");
    assert!(yaml.contains("kind: Ownership"), "{yaml}");
    assert!(yaml.contains("sourceCatalog: sap"), "{yaml}");
}

#[test]
fn unchanged_new_kinds_plan_no_steps() {
    let defs = definitions();
    let extras = extras();
    let documents = export_documents_with(&defs, &extras).expect("export");
    let plan = plan_documents_with(&defs, &extras, &documents).expect("plan");
    assert!(plan.steps.is_empty(), "{:?}", plan.steps);
}

#[test]
fn new_kinds_plan_create_update_rename_and_delete() {
    let defs = definitions();
    let extras = extras();
    let mut documents = export_documents_with(&defs, &extras).expect("export");

    let sap = documents
        .iter_mut()
        .find_map(|document| match document {
            ConfigDocument::Catalog(catalog) if catalog.key == "sap" => Some(catalog),
            _ => None,
        })
        .expect("sap catalog");
    sap.renamed_from = Some("sap".into());
    sap.key = "sap-erp".into();

    let profile = documents
        .iter_mut()
        .find_map(|document| match document {
            ConfigDocument::MergeProfile(profile) if profile.key == "sap-brand" => Some(profile),
            _ => None,
        })
        .expect("sap-brand profile");
    profile.name = "SAP brand v2".into();

    documents.push(ConfigDocument::Catalog(CatalogDocument {
        api_version: ApiVersion::BraianIoV1,
        kind: CatalogKind::Catalog,
        key: "erp".into(),
        renamed_from: None,
        mode: None,
        name: "ERP".into(),
        catalog_kind: CatalogSourceKind::Source,
        editable: false,
    }));

    let ownership = documents
        .iter_mut()
        .find_map(|document| match document {
            ConfigDocument::Ownership(ownership) => Some(ownership),
            _ => None,
        })
        .expect("ownership");
    ownership.mode = Some(braian_config::ConfigMode::Full);
    ownership.rules.clear();

    let plan = plan_documents_with(&defs, &extras, &documents).expect("plan");
    assert!(
        plan.steps
            .iter()
            .any(|step| step.action == PlanAction::Rename
                && step.kind == PlanKind::Catalog
                && step.key == "sap-erp"
                && step.renamed_from.as_deref() == Some("sap")),
        "{:?}",
        plan.steps
    );
    assert!(
        plan.steps
            .iter()
            .any(|step| step.action == PlanAction::Create
                && step.kind == PlanKind::Catalog
                && step.key == "erp"),
        "{:?}",
        plan.steps
    );
    assert!(
        plan.steps
            .iter()
            .any(|step| step.action == PlanAction::Update
                && step.kind == PlanKind::MergeProfile
                && step.key == "sap-brand"
                && step.fields.contains(&"name".to_owned())),
        "{:?}",
        plan.steps
    );
    let ownership = plan
        .steps
        .iter()
        .find(|step| step.kind == PlanKind::Ownership)
        .expect("ownership step");
    assert_eq!(ownership.action, PlanAction::Update);
    assert!(ownership.destructive, "{:?}", plan.steps);

    let mut delete_documents = documents.clone();
    for document in &mut delete_documents {
        if let ConfigDocument::Catalog(catalog) = document
            && catalog.key == "sap-erp"
        {
            catalog.mode = Some(braian_config::ConfigMode::Full);
        }
    }
    delete_documents.retain(|document| {
        !matches!(document, ConfigDocument::Catalog(catalog) if catalog.key == "master" || catalog.key == "erp")
    });
    let blocked_delete = plan_documents_with(&defs, &extras, &delete_documents).expect("plan");
    let catalog = blocked_delete
        .steps
        .iter()
        .find(|step| step.kind == PlanKind::Catalog && step.action == PlanAction::Delete)
        .expect("catalog delete");
    assert_eq!(catalog.key, "master");
    assert!(catalog.destructive);
    assert!(catalog.purge.is_some());
    let ownership = blocked_delete
        .steps
        .iter()
        .find(|step| step.kind == PlanKind::Ownership)
        .expect("ownership step");
    assert_eq!(ownership.action, PlanAction::Update);
    assert!(ownership.destructive);
    assert!(ownership.purge.is_some());
}

#[test]
fn workspace_templates_plan_create_rename_and_delete() {
    let defs = definitions();
    let extras = extras();
    let mut documents = export_documents_with(&defs, &extras).expect("export");

    let template = documents
        .iter_mut()
        .find_map(|document| match document {
            ConfigDocument::WorkspaceTemplate(template) => Some(template),
            _ => None,
        })
        .expect("workspace template");
    template.renamed_from = Some("supplier-review".into());
    template.key = "supplier-review-v2".into();
    template.name = "Supplier review v2".into();

    let plan = plan_documents_with(&defs, &extras, &documents).expect("plan");
    assert!(
        plan.steps
            .iter()
            .any(|step| step.action == PlanAction::Rename
                && step.kind == PlanKind::WorkspaceTemplate
                && step.key == "supplier-review-v2"
                && step.renamed_from.as_deref() == Some("supplier-review")),
        "{:?}",
        plan.steps
    );

    documents.push(ConfigDocument::WorkspaceTemplate(
        WorkspaceTemplateDocument {
            api_version: ApiVersion::BraianIoV1,
            kind: WorkspaceTemplateKind::WorkspaceTemplate,
            key: "product-review".into(),
            renamed_from: None,
            mode: None,
            name: "Product review".into(),
            definition: json!({ "views": [] }),
        },
    ));
    let plan = plan_documents_with(&defs, &extras, &documents).expect("plan");
    assert!(
        plan.steps
            .iter()
            .any(|step| step.action == PlanAction::Create
                && step.kind == PlanKind::WorkspaceTemplate
                && step.key == "product-review"),
        "{:?}",
        plan.steps
    );

    let delete_documents = vec![ConfigDocument::WorkspaceTemplate(
        WorkspaceTemplateDocument {
            api_version: ApiVersion::BraianIoV1,
            kind: WorkspaceTemplateKind::WorkspaceTemplate,
            key: "product-review".into(),
            renamed_from: None,
            mode: Some(braian_config::ConfigMode::Full),
            name: "Product review".into(),
            definition: json!({ "views": [] }),
        },
    )];
    let plan = plan_documents_with(&defs, &extras, &delete_documents).expect("plan");
    let step = plan
        .steps
        .iter()
        .find(|step| {
            step.action == PlanAction::Delete
                && step.kind == PlanKind::WorkspaceTemplate
                && step.key == "supplier-review"
        })
        .expect("workspace template delete");
    assert!(step.destructive);
}

#[test]
fn apply_builds_changes_for_the_new_kinds() {
    use braian_model::ModelChange;

    let application = braian_config::apply_documents_with(
        &definitions(),
        &ConfigExtras::default(),
        &extras_documents(),
    )
    .expect("apply plan");
    assert!(
        application
            .changes
            .iter()
            .any(|change| matches!(change, ModelChange::UpsertCatalog { catalog } if catalog.key == "sap")),
        "{:?}",
        application.changes
    );
    assert!(
        application.changes.iter().any(|change| matches!(
            change,
            ModelChange::UpsertMergeProfile { profile } if profile.key == "sap-brand" && profile.source_catalog == "sap"
        )),
        "{:?}",
        application.changes
    );
    assert!(
        application.changes.iter().any(|change| matches!(
            change,
            ModelChange::UpsertWorkspaceTemplate { template } if template.key == "supplier-review"
        )),
        "{:?}",
        application.changes
    );
    assert!(
        application.changes.iter().any(|change| matches!(
            change,
            ModelChange::SetOwnershipRules { rules } if rules.iter().any(|rule| rule.attribute == "brand")
        )),
        "{:?}",
        application.changes
    );
    let (after, _) =
        braian_model::preview(&definitions(), &application.changes).expect("steps apply");
    assert_eq!(after, definitions());
}

fn extras_documents() -> Vec<ConfigDocument> {
    export_documents_with(&definitions(), &extras()).expect("export")
}

#[test]
fn the_schema_accepts_new_kind_documents() {
    let schema = serde_json::to_value(braian_config::schema()).expect("schema value");
    let validator = jsonschema::validator_for(&schema).expect("valid schema");
    for document in export_documents_with(&definitions(), &extras()).expect("export") {
        let value = serde_json::to_value(document).expect("document value");
        assert!(
            validator.is_valid(&value),
            "schema rejected exported document: {value}"
        );
    }
}
