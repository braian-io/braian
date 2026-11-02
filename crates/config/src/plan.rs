//! Compare config documents with the stored model and describe the steps.
//!
//! Nothing here writes. The plan only names create, update, rename and delete
//! steps. A destructive step carries the [`braian_model::DataPurge`] the API
//! uses to count affected objects and values.

use std::collections::{BTreeMap, BTreeSet};

use braian_model::{
    Attribute, AttributeId, AttributeKind, Cardinality, Class, ClassId, DataPurge, DefinitionSet,
    Group, GroupId, IndexFlags, LanguageTag, LinkLabel, LinkSpec, ModelChange, ObjectType,
    SharedValueList, Structure, StructureId, TextForm, TypeId, TypeKind, Unit, UnitFamily,
    UnitFamilyId, Uuid, ValueOption, purge_for,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    AttributeConfig, ClassConfig, ConfigDocument, ConfigError, GroupConfig, ModelDocument,
    StructureConfig, TypeConfig, UnitFamilyDocument, ValueListDocument, export_documents,
};

/// How a document treats entities missing from it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConfigMode {
    /// Only the entities in the document change. Everything else stays.
    Partial,
    /// The document is the whole truth for its section. Missing entities are deleted.
    Full,
}

/// What a plan step does.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum PlanAction {
    Create,
    Update,
    Rename,
    Delete,
}

/// The entity a plan step works on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum PlanKind {
    Language,
    Attribute,
    Type,
    Structure,
    Group,
    Class,
    ValueList,
    UnitFamily,
}

/// Stored rows a destructive step touches.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PlanAffected {
    pub objects: i64,
    pub values: i64,
    pub links: i64,
    pub selections: i64,
}

/// One step in a config plan.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PlanStep {
    pub action: PlanAction,
    pub kind: PlanKind,
    /// Key after the step. Groups and classes use `structure/key`.
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub renamed_from: Option<String>,
    /// Top-level fields that differ from the stored entity.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fields: Vec<String>,
    /// The step removes or invalidates stored data.
    pub destructive: bool,
    /// A destructive step the caller has not yet allowed.
    #[serde(default)]
    pub blocked: bool,
    #[serde(default)]
    pub affected: PlanAffected,
    /// Counting plan for a destructive step. Never serialized.
    #[serde(skip)]
    #[schemars(skip)]
    pub purge: Option<DataPurge>,
}

/// Every step needed to move the stored model to the documents.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConfigPlan {
    #[serde(default)]
    pub steps: Vec<PlanStep>,
}

impl ConfigPlan {
    pub fn is_destructive(&self) -> bool {
        self.steps.iter().any(|step| step.destructive)
    }
}

#[derive(Debug, Clone, Default)]
struct ModelView {
    languages: BTreeSet<String>,
    attributes: BTreeMap<String, AttributeConfig>,
    types: BTreeMap<String, TypeConfig>,
    structures: BTreeMap<String, StructureConfig>,
    groups: BTreeMap<String, GroupEntry>,
    classes: BTreeMap<String, ClassEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GroupEntry {
    structure: String,
    config: GroupConfig,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ClassEntry {
    structure: String,
    config: ClassConfig,
}

#[derive(Debug, Default)]
struct Desired {
    model_present: bool,
    model_full: bool,
    model: ModelView,
    value_lists_present: bool,
    value_lists_full: bool,
    value_lists: BTreeMap<String, ValueListDocument>,
    units_present: bool,
    units_full: bool,
    unit_families: BTreeMap<String, UnitFamilyDocument>,
}

/// Plan every create, update, rename and delete step from `documents`.
///
/// `current` is only read. Destructive steps have `purge` set so the caller can
/// count the stored rows they touch.
pub fn plan_documents(
    current: &DefinitionSet,
    documents: &[ConfigDocument],
) -> Result<ConfigPlan, ConfigError> {
    let current_documents = export_documents(current)?;
    let mut existing = ModelView::default();
    let mut current_value_lists = BTreeMap::new();
    let mut current_unit_families = BTreeMap::new();
    for document in &current_documents {
        match document {
            ConfigDocument::Model(model) => existing = view_from_model(model)?,
            ConfigDocument::ValueList(list) => {
                current_value_lists.insert(list.key.clone(), list.clone());
            }
            ConfigDocument::UnitFamily(family) => {
                current_unit_families.insert(family.key.clone(), family.clone());
            }
        }
    }

    let desired = desired_from(documents)?;
    let structure_aliases: BTreeMap<String, String> = desired
        .model
        .structures
        .iter()
        .filter_map(|(key, structure)| {
            let old = structure.renamed_from.as_ref()?;
            (existing.structures.contains_key(old) && !existing.structures.contains_key(key))
                .then(|| (key.clone(), old.clone()))
        })
        .collect();
    let desired_groups = rekey_entries(&desired.model.groups, &structure_aliases);
    let desired_classes = rekey_entries(&desired.model.classes, &structure_aliases);
    let deleted_structures: BTreeSet<String> = if desired.model_full {
        existing
            .structures
            .keys()
            .filter(|key| {
                !desired.model.structures.contains_key(*key)
                    && !structure_aliases.values().any(|old| old == *key)
            })
            .cloned()
            .collect()
    } else {
        BTreeSet::new()
    };
    let current_groups = without_deleted_structures(&existing.groups, &deleted_structures);
    let current_classes = without_deleted_structures(&existing.classes, &deleted_structures);
    let mut steps = Vec::new();

    steps.extend(plan_section(
        &existing.attributes,
        &desired.model.attributes,
        PlanKind::Attribute,
        desired.model_full,
        |_, item| item.renamed_from.clone(),
        changed_fields,
        |key, _| delete_purge(current, PlanKind::Attribute, key, None),
        |key, before, after, _| attribute_update_purge(current, key, before, after),
    ));

    steps.extend(plan_section(
        &existing.types,
        &desired.model.types,
        PlanKind::Type,
        desired.model_full,
        |_, item| item.renamed_from.clone(),
        changed_fields,
        |key, _| delete_purge(current, PlanKind::Type, key, None),
        |_, before, after, _| {
            if before.kind != after.kind {
                Some(non_counting_purge())
            } else {
                None
            }
        },
    ));

    steps.extend(plan_section(
        &existing.structures,
        &desired.model.structures,
        PlanKind::Structure,
        desired.model_full,
        |_, item| item.renamed_from.clone(),
        structure_fields,
        |key, _| delete_purge(current, PlanKind::Structure, key, None),
        |_, _, _, _| None,
    ));

    steps.extend(plan_section(
        &current_groups,
        &desired_groups,
        PlanKind::Group,
        desired.model_full,
        |_, item| {
            item.config
                .renamed_from
                .as_ref()
                .map(|old| group_key(&item.structure, old))
        },
        |before, after| changed_fields(&before.config, &after.config),
        |_, item| {
            delete_purge(
                current,
                PlanKind::Group,
                &item.config.key,
                Some(&item.structure),
            )
        },
        |_, _, _, _| None,
    ));

    steps.extend(plan_section(
        &current_classes,
        &desired_classes,
        PlanKind::Class,
        desired.model_full,
        |_, item| {
            item.config
                .renamed_from
                .as_ref()
                .map(|old| group_key(&item.structure, old))
        },
        |before, after| changed_fields(&before.config, &after.config),
        |_, _| Some(non_counting_purge()),
        |_, _, _, _| None,
    ));

    if desired.model_present {
        for language in desired.model.languages.difference(&existing.languages) {
            steps.push(step(
                PlanAction::Create,
                PlanKind::Language,
                language.clone(),
                None,
                Vec::new(),
                false,
                None,
            ));
        }
        if desired.model_full {
            for language in existing.languages.difference(&desired.model.languages) {
                steps.push(step(
                    PlanAction::Delete,
                    PlanKind::Language,
                    language.clone(),
                    None,
                    Vec::new(),
                    true,
                    Some(non_counting_purge()),
                ));
            }
        }
    }

    steps.extend(plan_section(
        &current_value_lists,
        &desired.value_lists,
        PlanKind::ValueList,
        desired.value_lists_present && desired.value_lists_full,
        |_, item| item.renamed_from.clone(),
        changed_fields,
        |key, _| delete_purge(current, PlanKind::ValueList, key, None),
        |key, before, after, _| value_list_update_purge(current, key, before, after),
    ));

    steps.extend(plan_section(
        &current_unit_families,
        &desired.unit_families,
        PlanKind::UnitFamily,
        desired.units_present && desired.units_full,
        |_, item| item.renamed_from.clone(),
        changed_fields,
        |key, _| delete_purge(current, PlanKind::UnitFamily, key, None),
        |key, before, after, _| unit_family_update_purge(current, key, before, after),
    ));

    Ok(ConfigPlan { steps })
}

fn desired_from(documents: &[ConfigDocument]) -> Result<Desired, ConfigError> {
    let mut desired = Desired::default();
    for document in documents {
        match document {
            ConfigDocument::Model(model) => {
                desired.model_present = true;
                desired.model_full |= model.mode == Some(ConfigMode::Full);
                merge_view(&mut desired.model, view_from_model(model)?)?;
            }
            ConfigDocument::ValueList(list) => {
                desired.value_lists_present = true;
                desired.value_lists_full |= list.mode == Some(ConfigMode::Full);
                insert_entity(
                    &mut desired.value_lists,
                    list.key.clone(),
                    list.clone(),
                    "value list",
                )?;
            }
            ConfigDocument::UnitFamily(family) => {
                desired.units_present = true;
                desired.units_full |= family.mode == Some(ConfigMode::Full);
                insert_entity(
                    &mut desired.unit_families,
                    family.key.clone(),
                    family.clone(),
                    "unit family",
                )?;
            }
        }
    }
    Ok(desired)
}

fn view_from_model(model: &ModelDocument) -> Result<ModelView, ConfigError> {
    let mut view = ModelView::default();
    view.languages.extend(model.languages.iter().cloned());
    for attribute in &model.attributes {
        insert_entity(
            &mut view.attributes,
            attribute.key.clone(),
            attribute.clone(),
            "attribute",
        )?;
    }
    for object_type in &model.types {
        insert_entity(
            &mut view.types,
            object_type.key.clone(),
            object_type.clone(),
            "type",
        )?;
    }
    for structure in &model.structures {
        insert_entity(
            &mut view.structures,
            structure.key.clone(),
            structure.clone(),
            "structure",
        )?;
        for group in &structure.groups {
            insert_entity(
                &mut view.groups,
                group_key(&structure.key, &group.key),
                GroupEntry {
                    structure: structure.key.clone(),
                    config: group.clone(),
                },
                "group",
            )?;
        }
        for class in &structure.classes {
            insert_entity(
                &mut view.classes,
                group_key(&structure.key, &class.key),
                ClassEntry {
                    structure: structure.key.clone(),
                    config: class.clone(),
                },
                "class",
            )?;
        }
    }
    Ok(view)
}

fn without_deleted_structures<T: Clone + HasStructure>(
    entries: &BTreeMap<String, T>,
    deleted: &BTreeSet<String>,
) -> BTreeMap<String, T> {
    entries
        .iter()
        .filter(|(_, entry)| !deleted.contains(entry.structure()))
        .map(|(key, entry)| (key.clone(), entry.clone()))
        .collect()
}

fn rekey_entries<T: Clone + HasStructure>(
    entries: &BTreeMap<String, T>,
    aliases: &BTreeMap<String, String>,
) -> BTreeMap<String, T> {
    entries
        .values()
        .map(|entry| {
            let mut entry = entry.clone();
            if let Some(old) = aliases.get(entry.structure()) {
                entry.set_structure(old.clone());
            }
            (group_key(entry.structure(), entry.key()), entry)
        })
        .collect()
}

trait HasStructure {
    fn structure(&self) -> &str;
    fn key(&self) -> &str;
    fn set_structure(&mut self, structure: String);
}

impl HasStructure for GroupEntry {
    fn structure(&self) -> &str {
        &self.structure
    }

    fn key(&self) -> &str {
        &self.config.key
    }

    fn set_structure(&mut self, structure: String) {
        self.structure = structure;
    }
}

impl HasStructure for ClassEntry {
    fn structure(&self) -> &str {
        &self.structure
    }

    fn key(&self) -> &str {
        &self.config.key
    }

    fn set_structure(&mut self, structure: String) {
        self.structure = structure;
    }
}

fn merge_view(target: &mut ModelView, source: ModelView) -> Result<(), ConfigError> {
    target.languages.extend(source.languages);
    for (key, value) in source.attributes {
        insert_entity(&mut target.attributes, key, value, "attribute")?;
    }
    for (key, value) in source.types {
        insert_entity(&mut target.types, key, value, "type")?;
    }
    for (key, value) in source.structures {
        insert_entity(&mut target.structures, key, value, "structure")?;
    }
    for (key, value) in source.groups {
        insert_entity(&mut target.groups, key, value, "group")?;
    }
    for (key, value) in source.classes {
        insert_entity(&mut target.classes, key, value, "class")?;
    }
    Ok(())
}

fn insert_entity<T: PartialEq>(
    map: &mut BTreeMap<String, T>,
    key: String,
    value: T,
    label: &str,
) -> Result<(), ConfigError> {
    match map.get(&key) {
        None => {
            map.insert(key, value);
            Ok(())
        }
        Some(existing) if *existing == value => Ok(()),
        Some(_) => Err(ConfigError::new(format!("{label} {key} is defined twice"))),
    }
}

#[allow(clippy::too_many_arguments)]
fn plan_section<T: Clone + PartialEq>(
    current: &BTreeMap<String, T>,
    desired: &BTreeMap<String, T>,
    kind: PlanKind,
    full: bool,
    renamed_from: impl Fn(&str, &T) -> Option<String>,
    field_diff: impl Fn(&T, &T) -> Vec<String>,
    delete_purge: impl Fn(&str, &T) -> Option<DataPurge>,
    update_purge: impl Fn(&str, &T, &T, &[String]) -> Option<DataPurge>,
) -> Vec<PlanStep> {
    let mut steps = Vec::new();
    let mut consumed = BTreeSet::new();

    for (key, item) in desired {
        if let Some(old_key) = renamed_from(key, item)
            && !current.contains_key(key)
            && let Some(old_item) = current.get(&old_key)
        {
            let fields = field_diff(old_item, item);
            let purge = update_purge(&old_key, old_item, item, &fields);
            steps.push(step(
                PlanAction::Rename,
                kind,
                key.clone(),
                Some(old_key.clone()),
                fields,
                purge.is_some(),
                purge,
            ));
            consumed.insert(old_key);
            continue;
        }
        match current.get(key) {
            Some(old_item) => {
                let fields = field_diff(old_item, item);
                if !fields.is_empty() {
                    let purge = update_purge(key, old_item, item, &fields);
                    steps.push(step(
                        PlanAction::Update,
                        kind,
                        key.clone(),
                        None,
                        fields,
                        purge.is_some(),
                        purge,
                    ));
                }
                consumed.insert(key.clone());
            }
            None => steps.push(step(
                PlanAction::Create,
                kind,
                key.clone(),
                None,
                Vec::new(),
                false,
                None,
            )),
        }
    }

    if full {
        for key in current.keys() {
            if desired.contains_key(key) || consumed.contains(key) {
                continue;
            }
            let item = current.get(key).expect("iterated key");
            steps.push(step(
                PlanAction::Delete,
                kind,
                key.clone(),
                None,
                Vec::new(),
                true,
                delete_purge(key, item),
            ));
        }
    }
    steps
}

fn step(
    action: PlanAction,
    kind: PlanKind,
    key: String,
    renamed_from: Option<String>,
    fields: Vec<String>,
    destructive: bool,
    purge: Option<DataPurge>,
) -> PlanStep {
    PlanStep {
        action,
        kind,
        key,
        renamed_from,
        fields,
        destructive,
        blocked: false,
        affected: PlanAffected::default(),
        purge,
    }
}

fn group_key(structure: &str, key: &str) -> String {
    format!("{structure}/{key}")
}

fn changed_fields<T: Serialize>(before: &T, after: &T) -> Vec<String> {
    let mut before = serde_json::to_value(before).expect("config document serializes");
    let mut after = serde_json::to_value(after).expect("config document serializes");
    let keys: BTreeSet<String> = match (before.as_object_mut(), after.as_object_mut()) {
        (Some(before), Some(after)) => {
            let keys = before
                .keys()
                .chain(after.keys())
                .filter(|key| !matches!(key.as_str(), "key" | "mode" | "renamedFrom"))
                .cloned()
                .collect();
            before.remove("key");
            before.remove("mode");
            before.remove("renamedFrom");
            after.remove("key");
            after.remove("mode");
            after.remove("renamedFrom");
            keys
        }
        _ => BTreeSet::new(),
    };
    keys.into_iter()
        .filter(|key| before.get(key) != after.get(key))
        .collect()
}

fn structure_fields(before: &StructureConfig, after: &StructureConfig) -> Vec<String> {
    let mut before = before.clone();
    let mut after = after.clone();
    before.groups.clear();
    before.classes.clear();
    after.groups.clear();
    after.classes.clear();
    changed_fields(&before, &after)
}

fn attribute_update_purge(
    current: &DefinitionSet,
    key: &str,
    before: &AttributeConfig,
    after: &AttributeConfig,
) -> Option<DataPurge> {
    if std::mem::discriminant(&before.kind) != std::mem::discriminant(&after.kind) {
        delete_purge(current, PlanKind::Attribute, key, None)
    } else {
        None
    }
}

fn value_list_update_purge(
    current: &DefinitionSet,
    key: &str,
    before: &ValueListDocument,
    after: &ValueListDocument,
) -> Option<DataPurge> {
    let old_codes: BTreeSet<&str> = before
        .options
        .iter()
        .map(|item| item.code.as_str())
        .collect();
    let new_codes: BTreeSet<&str> = after
        .options
        .iter()
        .map(|item| item.code.as_str())
        .collect();
    let removed: Vec<ModelChange> = old_codes
        .difference(&new_codes)
        .map(|code| ModelChange::DeleteValueOption {
            list: key.to_owned(),
            option: (*code).to_owned(),
        })
        .collect();
    purge(current, removed)
}

fn unit_family_update_purge(
    current: &DefinitionSet,
    key: &str,
    before: &UnitFamilyDocument,
    after: &UnitFamilyDocument,
) -> Option<DataPurge> {
    if before.base_unit != after.base_unit {
        return purge(
            current,
            vec![ModelChange::DeleteUnitFamily {
                key: key.to_owned(),
            }],
        );
    }
    let old_codes: BTreeSet<&str> = before.units.iter().map(|item| item.code.as_str()).collect();
    let new_codes: BTreeSet<&str> = after.units.iter().map(|item| item.code.as_str()).collect();
    let removed: Vec<ModelChange> = old_codes
        .difference(&new_codes)
        .map(|code| ModelChange::DeleteUnit {
            family: key.to_owned(),
            unit: (*code).to_owned(),
        })
        .collect();
    purge(current, removed)
}

fn delete_purge(
    current: &DefinitionSet,
    kind: PlanKind,
    key: &str,
    structure: Option<&str>,
) -> Option<DataPurge> {
    let change = match kind {
        PlanKind::Attribute => ModelChange::DeleteAttribute {
            key: key.to_owned(),
        },
        PlanKind::Type => {
            let is_link = current
                .types
                .iter()
                .find(|item| item.key == key)
                .is_some_and(|item| item.kind == TypeKind::Link);
            if is_link {
                ModelChange::DeleteLinkType {
                    key: key.to_owned(),
                }
            } else {
                ModelChange::DeleteType {
                    key: key.to_owned(),
                }
            }
        }
        PlanKind::Structure => ModelChange::DeleteStructure {
            structure: key.to_owned(),
        },
        PlanKind::Group => ModelChange::DeleteGroup {
            structure: structure.unwrap_or_default().to_owned(),
            group: key.to_owned(),
            move_to: None,
        },
        PlanKind::Class => return Some(non_counting_purge()),
        PlanKind::ValueList => ModelChange::DeleteValueList {
            key: key.to_owned(),
        },
        PlanKind::UnitFamily => ModelChange::DeleteUnitFamily {
            key: key.to_owned(),
        },
        PlanKind::Language => return Some(non_counting_purge()),
    };
    purge(current, vec![change])
}

fn purge(current: &DefinitionSet, changes: Vec<ModelChange>) -> Option<DataPurge> {
    if changes.is_empty() {
        return None;
    }
    let purge = purge_for(current, &changes);
    if purge.destructive { Some(purge) } else { None }
}

fn non_counting_purge() -> DataPurge {
    DataPurge {
        destructive: true,
        ..DataPurge::default()
    }
}

/// A plan and the model steps that carry it out.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfigApplication {
    pub plan: ConfigPlan,
    pub changes: Vec<ModelChange>,
}

/// Plan the documents and build the model steps an approval would apply.
///
/// The steps use the existing [`ModelChange`] vocabulary so the proposal
/// pipeline does not need a second writer for config documents.
pub fn apply_documents(
    current: &DefinitionSet,
    documents: &[ConfigDocument],
) -> Result<ConfigApplication, ConfigError> {
    let plan = plan_documents(current, documents)?;
    let desired = desired_from(documents)?;
    let changes = changes_for(current, &desired, &plan)?;
    Ok(ConfigApplication { plan, changes })
}

fn changes_for(
    current: &DefinitionSet,
    desired: &Desired,
    plan: &ConfigPlan,
) -> Result<Vec<ModelChange>, ConfigError> {
    let mut changes = Vec::new();

    let unit_ids = unit_family_ids(current, desired);
    let attribute_ids = attribute_ids(current, desired);
    let structure_ids = structure_ids(current, desired);
    let type_ids = type_ids(current, desired);

    for (key, family) in &desired.unit_families {
        let id = unit_ids[key];
        let target = unit_family_from_config(family, id)?;
        if !current
            .unit_families
            .iter()
            .any(|item| item.id == id && item == &target)
        {
            changes.push(ModelChange::UpsertUnitFamily {
                family: Box::new(target),
            });
        }
    }

    for (key, attribute) in &desired.model.attributes {
        let id = attribute_ids[key];
        let target = attribute_from_config(attribute, id, &unit_ids, current)?;
        if !current
            .attributes
            .iter()
            .any(|item| item.id == id && item == &target)
        {
            changes.push(ModelChange::UpsertAttribute {
                attribute: Box::new(target),
            });
        }
    }

    for (key, structure) in &desired.model.structures {
        let id = structure_ids[key];
        let target = structure_from_config(structure, id, &attribute_ids, current)?;
        if !current
            .structures
            .iter()
            .any(|item| item.id == id && item == &target)
        {
            changes.push(ModelChange::UpsertStructure {
                structure: Box::new(target),
            });
        }
    }

    for (key, object_type) in &desired.model.types {
        let id = type_ids[key];
        let target = type_from_config(
            object_type,
            id,
            &attribute_ids,
            &structure_ids,
            &type_ids,
            current,
        )?;
        if !current
            .types
            .iter()
            .any(|item| item.id == id && item == &target)
        {
            changes.push(ModelChange::UpsertType {
                object_type: Box::new(target),
            });
        }
    }

    for (key, list) in &desired.value_lists {
        push_value_list_change(current, key, list, &mut changes);
    }

    for step in plan
        .steps
        .iter()
        .filter(|step| step.action == PlanAction::Delete)
    {
        match step.kind {
            PlanKind::Attribute => changes.push(ModelChange::DeleteAttribute {
                key: step.key.clone(),
            }),
            PlanKind::Type => {
                let link = current
                    .types
                    .iter()
                    .find(|item| item.key == step.key)
                    .is_some_and(|item| item.kind == TypeKind::Link);
                if link {
                    changes.push(ModelChange::DeleteLinkType {
                        key: step.key.clone(),
                    });
                } else {
                    changes.push(ModelChange::DeleteType {
                        key: step.key.clone(),
                    });
                }
            }
            PlanKind::Structure => changes.push(ModelChange::DeleteStructure {
                structure: step.key.clone(),
            }),
            PlanKind::ValueList => changes.push(ModelChange::DeleteValueList {
                key: step.key.clone(),
            }),
            PlanKind::UnitFamily => changes.push(ModelChange::DeleteUnitFamily {
                key: step.key.clone(),
            }),
            // Group and class deletes arrive with their structure upsert.
            // A language list has no model step; see the apply endpoint notes.
            PlanKind::Group | PlanKind::Class | PlanKind::Language => {}
        }
    }

    Ok(changes)
}

fn unit_family_ids(current: &DefinitionSet, desired: &Desired) -> BTreeMap<String, UnitFamilyId> {
    let mut ids = BTreeMap::new();
    for (key, family) in &desired.unit_families {
        let id = current
            .unit_families
            .iter()
            .find(|item| item.key == *key)
            .or_else(|| {
                family
                    .renamed_from
                    .as_ref()
                    .and_then(|old| current.unit_families.iter().find(|item| item.key == *old))
            })
            .map(|item| item.id)
            .unwrap_or_else(|| UnitFamilyId::from_uuid(Uuid::now_v7()));
        ids.insert(key.clone(), id);
    }
    ids
}

fn attribute_ids(current: &DefinitionSet, desired: &Desired) -> BTreeMap<String, AttributeId> {
    let mut ids = BTreeMap::new();
    for (key, attribute) in &desired.model.attributes {
        let id = current
            .attributes
            .iter()
            .find(|item| item.key == *key)
            .or_else(|| {
                attribute
                    .renamed_from
                    .as_ref()
                    .and_then(|old| current.attributes.iter().find(|item| item.key == *old))
            })
            .map(|item| item.id)
            .unwrap_or_else(|| AttributeId::from_uuid(Uuid::now_v7()));
        ids.insert(key.clone(), id);
    }
    ids
}

fn structure_ids(current: &DefinitionSet, desired: &Desired) -> BTreeMap<String, StructureId> {
    let mut ids = BTreeMap::new();
    for (key, structure) in &desired.model.structures {
        let id = current
            .structures
            .iter()
            .find(|item| item.key == *key)
            .or_else(|| {
                structure
                    .renamed_from
                    .as_ref()
                    .and_then(|old| current.structures.iter().find(|item| item.key == *old))
            })
            .map(|item| item.id)
            .unwrap_or_else(|| StructureId::from_uuid(Uuid::now_v7()));
        ids.insert(key.clone(), id);
    }
    ids
}

fn type_ids(current: &DefinitionSet, desired: &Desired) -> BTreeMap<String, TypeId> {
    let mut ids = BTreeMap::new();
    for (key, object_type) in &desired.model.types {
        let id = current
            .types
            .iter()
            .find(|item| item.key == *key)
            .or_else(|| {
                object_type
                    .renamed_from
                    .as_ref()
                    .and_then(|old| current.types.iter().find(|item| item.key == *old))
            })
            .map(|item| item.id)
            .unwrap_or_else(|| TypeId::from_uuid(Uuid::now_v7()));
        ids.insert(key.clone(), id);
    }
    ids
}

fn unit_family_from_config(
    document: &UnitFamilyDocument,
    id: UnitFamilyId,
) -> Result<UnitFamily, ConfigError> {
    Ok(UnitFamily {
        id,
        key: document.key.clone(),
        dimension: document.dimension.clone(),
        base_unit: document.base_unit.clone(),
        units: document
            .units
            .iter()
            .map(|unit| {
                Ok(Unit {
                    code: unit.code.clone(),
                    factor: parse_decimal(&unit.factor)?,
                })
            })
            .collect::<Result<_, ConfigError>>()?,
    })
}

fn attribute_from_config(
    config: &AttributeConfig,
    id: AttributeId,
    unit_ids: &BTreeMap<String, UnitFamilyId>,
    current: &DefinitionSet,
) -> Result<Attribute, ConfigError> {
    Ok(Attribute {
        id,
        key: config.key.clone(),
        labels: language_labels(&config.labels)?,
        language_dependent: config.language_dependent,
        multiple: config.multiple,
        required: config.required,
        kind: attribute_kind(&config.kind, unit_ids, current)?,
        index: IndexFlags {
            searchable: config.index.searchable,
            filterable: config.index.filterable,
            sortable: config.index.sortable,
        },
    })
}

fn attribute_kind(
    kind: &crate::AttributeKindConfig,
    unit_ids: &BTreeMap<String, UnitFamilyId>,
    current: &DefinitionSet,
) -> Result<AttributeKind, ConfigError> {
    use crate::AttributeKindConfig;
    Ok(match kind {
        AttributeKindConfig::Text { max_length, form } => AttributeKind::Text {
            max_length: *max_length,
            form: match form {
                crate::TextFormConfig::Short => TextForm::Short,
                crate::TextFormConfig::Long => TextForm::Long,
            },
        },
        AttributeKindConfig::Number {
            unit_family,
            min,
            max,
            integer,
        } => AttributeKind::Number {
            unit_family: unit_family
                .as_ref()
                .map(|key| unit_id(key, unit_ids, current))
                .transpose()?,
            min: min.as_ref().map(|value| parse_decimal(value)).transpose()?,
            max: max.as_ref().map(|value| parse_decimal(value)).transpose()?,
            integer: *integer,
        },
        AttributeKindConfig::Range { unit_family } => AttributeKind::Range {
            unit_family: unit_family
                .as_ref()
                .map(|key| unit_id(key, unit_ids, current))
                .transpose()?,
        },
        AttributeKindConfig::ValueList { options, list } => AttributeKind::ValueList {
            options: options
                .iter()
                .map(|option| {
                    Ok(ValueOption {
                        code: option.code.clone(),
                        labels: language_labels(&option.labels)?,
                    })
                })
                .collect::<Result<_, ConfigError>>()?,
            list: list.clone(),
        },
        AttributeKindConfig::Boolean => AttributeKind::Boolean,
        AttributeKindConfig::Date => AttributeKind::Date,
        AttributeKindConfig::ObjectRef { type_key } => AttributeKind::ObjectRef {
            type_key: type_key.clone(),
        },
        AttributeKindConfig::FileRef { media } => AttributeKind::FileRef { media: *media },
    })
}

fn type_from_config(
    config: &TypeConfig,
    id: TypeId,
    attribute_ids: &BTreeMap<String, AttributeId>,
    structure_ids: &BTreeMap<String, StructureId>,
    type_ids: &BTreeMap<String, TypeId>,
    current: &DefinitionSet,
) -> Result<ObjectType, ConfigError> {
    Ok(ObjectType {
        id,
        key: config.key.clone(),
        labels: language_labels(&config.labels)?,
        singular: language_labels(&config.singular)?,
        plural: language_labels(&config.plural)?,
        key_attribute: attribute_id(&config.key_attribute, attribute_ids, current)?,
        attributes: config
            .attributes
            .iter()
            .map(|key| attribute_id(key, attribute_ids, current))
            .collect::<Result<_, _>>()?,
        structures: config
            .structures
            .as_ref()
            .map(|keys| {
                keys.iter()
                    .map(|key| structure_id(key, structure_ids, current))
                    .collect::<Result<Vec<_>, ConfigError>>()
            })
            .transpose()?,
        defaults: config.defaults.clone(),
        kind: match config.kind {
            crate::TypeKindConfig::Entity => TypeKind::Entity,
            crate::TypeKindConfig::Link => TypeKind::Link,
        },
        link: config
            .link
            .as_ref()
            .map(|link| {
                Ok(LinkSpec {
                    from_types: link
                        .from_types
                        .iter()
                        .map(|key| type_id(key, type_ids, current))
                        .collect::<Result<_, ConfigError>>()?,
                    to_types: link
                        .to_types
                        .iter()
                        .map(|key| type_id(key, type_ids, current))
                        .collect::<Result<_, ConfigError>>()?,
                    from_label: LinkLabel {
                        key: link.from_label.key.clone(),
                        labels: language_labels(&link.from_label.labels)?,
                    },
                    to_label: LinkLabel {
                        key: link.to_label.key.clone(),
                        labels: language_labels(&link.to_label.labels)?,
                    },
                    from_cardinality: cardinality(link.from_cardinality),
                    to_cardinality: cardinality(link.to_cardinality),
                })
            })
            .transpose()?,
    })
}

fn structure_from_config(
    config: &StructureConfig,
    id: StructureId,
    attribute_ids: &BTreeMap<String, AttributeId>,
    current: &DefinitionSet,
) -> Result<Structure, ConfigError> {
    let existing = current.structures.iter().find(|item| item.id == id);
    let mut group_ids = BTreeMap::new();
    for group in &config.groups {
        let group_id = existing
            .and_then(|structure| {
                structure
                    .groups
                    .iter()
                    .find(|item| item.key == group.key)
                    .or_else(|| {
                        group
                            .renamed_from
                            .as_ref()
                            .and_then(|old| structure.groups.iter().find(|item| item.key == *old))
                    })
            })
            .map(|item| item.id)
            .unwrap_or_else(|| GroupId::from_uuid(Uuid::now_v7()));
        group_ids.insert(group.key.clone(), group_id);
    }
    let mut class_ids = BTreeMap::new();
    for class in &config.classes {
        let class_id = existing
            .and_then(|structure| {
                structure
                    .classes
                    .iter()
                    .find(|item| item.key == class.key)
                    .or_else(|| {
                        class
                            .renamed_from
                            .as_ref()
                            .and_then(|old| structure.classes.iter().find(|item| item.key == *old))
                    })
            })
            .map(|item| item.id)
            .unwrap_or_else(|| ClassId::from_uuid(Uuid::now_v7()));
        class_ids.insert(class.key.clone(), class_id);
    }

    let groups = config
        .groups
        .iter()
        .map(|group| {
            Ok(Group {
                id: group_ids[&group.key],
                key: group.key.clone(),
                labels: language_labels(&group.labels)?,
                parent: group
                    .parent
                    .as_ref()
                    .map(|key| group_ref(key, &group_ids, existing))
                    .transpose()?,
                attributes: group
                    .attributes
                    .iter()
                    .map(|key| attribute_id(key, attribute_ids, current))
                    .collect::<Result<_, _>>()?,
            })
        })
        .collect::<Result<Vec<_>, ConfigError>>()?;

    let classes = config
        .classes
        .iter()
        .map(|class| {
            Ok(Class {
                id: class_ids[&class.key],
                key: class.key.clone(),
                group: group_ref(&class.group, &group_ids, existing)?,
                parent: class
                    .parent
                    .as_ref()
                    .map(|key| class_ref(key, &class_ids, existing))
                    .transpose()?,
                attributes: class
                    .attributes
                    .iter()
                    .map(|key| attribute_id(key, attribute_ids, current))
                    .collect::<Result<_, _>>()?,
            })
        })
        .collect::<Result<Vec<_>, ConfigError>>()?;

    Ok(Structure {
        id,
        key: config.key.clone(),
        labels: language_labels(&config.labels)?,
        groups,
        classes,
    })
}

fn push_value_list_change(
    current: &DefinitionSet,
    key: &str,
    document: &ValueListDocument,
    changes: &mut Vec<ModelChange>,
) {
    let existing = current
        .value_lists
        .iter()
        .find(|item| item.key == key)
        .or_else(|| {
            document
                .renamed_from
                .as_ref()
                .and_then(|old| current.value_lists.iter().find(|item| item.key == *old))
        });
    let options = document
        .options
        .iter()
        .map(|option| braian_model::NamedOption {
            code: option.code.clone(),
            label: option
                .labels
                .get("en")
                .or_else(|| option.labels.values().next())
                .cloned()
                .unwrap_or_default(),
        })
        .collect::<Vec<_>>();
    let label = document
        .labels
        .get("en")
        .or_else(|| document.labels.values().next())
        .cloned()
        .unwrap_or_default();

    let Some(existing) = existing else {
        changes.push(ModelChange::CreateValueList {
            key: key.to_owned(),
            label,
            options,
        });
        return;
    };

    let renamed = existing.key != key;
    if renamed {
        changes.push(ModelChange::RenameValueListKey {
            key: existing.key.clone(),
            new_key: key.to_owned(),
        });
    }
    let target = SharedValueList {
        id: existing.id,
        key: key.to_owned(),
        labels: document
            .labels
            .iter()
            .filter_map(|(tag, text)| LanguageTag::parse(tag).ok().map(|tag| (tag, text.clone())))
            .collect(),
        options: document
            .options
            .iter()
            .map(|option| ValueOption {
                code: option.code.clone(),
                labels: option
                    .labels
                    .iter()
                    .filter_map(|(tag, text)| {
                        LanguageTag::parse(tag).ok().map(|tag| (tag, text.clone()))
                    })
                    .collect(),
            })
            .collect(),
    };
    if existing != &target {
        changes.push(ModelChange::UpdateValueList {
            key: key.to_owned(),
            label: (!label.is_empty()).then_some(label),
            options: Some(options),
        });
    }
}

fn unit_id(
    key: &str,
    desired: &BTreeMap<String, UnitFamilyId>,
    current: &DefinitionSet,
) -> Result<UnitFamilyId, ConfigError> {
    desired
        .get(key)
        .copied()
        .or_else(|| {
            current
                .unit_families
                .iter()
                .find(|item| item.key == key)
                .map(|item| item.id)
        })
        .ok_or_else(|| ConfigError::new(format!("unknown unit family key {key}")))
}

fn attribute_id(
    key: &str,
    desired: &BTreeMap<String, AttributeId>,
    current: &DefinitionSet,
) -> Result<AttributeId, ConfigError> {
    desired
        .get(key)
        .copied()
        .or_else(|| {
            current
                .attributes
                .iter()
                .find(|item| item.key == key)
                .map(|item| item.id)
        })
        .ok_or_else(|| ConfigError::new(format!("unknown attribute key {key}")))
}

fn structure_id(
    key: &str,
    desired: &BTreeMap<String, StructureId>,
    current: &DefinitionSet,
) -> Result<StructureId, ConfigError> {
    desired
        .get(key)
        .copied()
        .or_else(|| {
            current
                .structures
                .iter()
                .find(|item| item.key == key)
                .map(|item| item.id)
        })
        .ok_or_else(|| ConfigError::new(format!("unknown structure key {key}")))
}

fn type_id(
    key: &str,
    desired: &BTreeMap<String, TypeId>,
    current: &DefinitionSet,
) -> Result<TypeId, ConfigError> {
    desired
        .get(key)
        .copied()
        .or_else(|| {
            current
                .types
                .iter()
                .find(|item| item.key == key)
                .map(|item| item.id)
        })
        .ok_or_else(|| ConfigError::new(format!("unknown type key {key}")))
}

fn group_ref(
    key: &str,
    desired: &BTreeMap<String, GroupId>,
    existing: Option<&Structure>,
) -> Result<GroupId, ConfigError> {
    desired
        .get(key)
        .copied()
        .or_else(|| {
            existing.and_then(|structure| {
                structure
                    .groups
                    .iter()
                    .find(|item| item.key == key)
                    .map(|item| item.id)
            })
        })
        .ok_or_else(|| ConfigError::new(format!("unknown group key {key}")))
}

fn class_ref(
    key: &str,
    desired: &BTreeMap<String, ClassId>,
    existing: Option<&Structure>,
) -> Result<ClassId, ConfigError> {
    desired
        .get(key)
        .copied()
        .or_else(|| {
            existing.and_then(|structure| {
                structure
                    .classes
                    .iter()
                    .find(|item| item.key == key)
                    .map(|item| item.id)
            })
        })
        .ok_or_else(|| ConfigError::new(format!("unknown class key {key}")))
}

fn cardinality(value: crate::CardinalityConfig) -> Cardinality {
    match value {
        crate::CardinalityConfig::One => Cardinality::One,
        crate::CardinalityConfig::Many => Cardinality::Many,
    }
}

fn language_labels(
    labels: &BTreeMap<String, String>,
) -> Result<BTreeMap<LanguageTag, String>, ConfigError> {
    labels
        .iter()
        .map(|(tag, text)| {
            let tag =
                LanguageTag::parse(tag).map_err(|error| ConfigError::new(error.to_string()))?;
            Ok((tag, text.clone()))
        })
        .collect()
}

fn parse_decimal(value: &str) -> Result<rust_decimal::Decimal, ConfigError> {
    value
        .parse()
        .map_err(|_| ConfigError::new(format!("invalid decimal {value}")))
}
