//! Config-as-code documents for the Braian model.
//!
//! A document names its wire version in `apiVersion` and its shape in `kind`.
//! References between entities use stable keys such as `article` or
//! `net_weight`, never database ids. [`export_documents`] turns a stored
//! [`braian_model::DefinitionSet`] into an ordered list of documents.

mod convert;
mod plan;

use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

pub use convert::{ConfigError, export_documents};
pub use plan::{
    ConfigApplication, ConfigMode, ConfigPlan, PlanAction, PlanAffected, PlanKind, PlanStep,
    apply_documents, plan_documents,
};

/// The only wire version this crate reads and writes.
pub const API_VERSION: &str = "braian.io/v1";

/// Wire version header. The enum keeps the JSON Schema to one allowed value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum ApiVersion {
    #[serde(rename = "braian.io/v1")]
    BraianIoV1,
}

/// One exported config document.
///
/// Untagged so every document serializes as its own object instead of a
/// wrapper around one. The required `apiVersion` and `kind` fields still make
/// an unknown or missing header fail to deserialize.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(untagged)]
pub enum ConfigDocument {
    Model(ModelDocument),
    ValueList(ValueListDocument),
    UnitFamily(UnitFamilyDocument),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "PascalCase")]
pub enum ModelKind {
    Model,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "PascalCase")]
pub enum ValueListKind {
    ValueList,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "PascalCase")]
pub enum UnitFamilyKind {
    UnitFamily,
}

/// The model: languages, attributes, object types (including link types) and
/// structures.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelDocument {
    #[serde(rename = "apiVersion")]
    pub api_version: ApiVersion,
    pub kind: ModelKind,
    /// `full` makes this document the whole truth for the model sections.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<ConfigMode>,
    #[serde(default)]
    pub languages: Vec<String>,
    #[serde(default)]
    pub attributes: Vec<AttributeConfig>,
    #[serde(default)]
    pub types: Vec<TypeConfig>,
    #[serde(default)]
    pub structures: Vec<StructureConfig>,
}

/// A shared value list, exported as its own document.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ValueListDocument {
    #[serde(rename = "apiVersion")]
    pub api_version: ApiVersion,
    pub kind: ValueListKind,
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub renamed_from: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<ConfigMode>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub labels: BTreeMap<String, String>,
    #[serde(default)]
    pub options: Vec<OptionConfig>,
}

/// A family of units that convert to one base unit, exported as its own
/// document.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnitFamilyDocument {
    #[serde(rename = "apiVersion")]
    pub api_version: ApiVersion,
    pub kind: UnitFamilyKind,
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub renamed_from: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<ConfigMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dimension: Option<String>,
    pub base_unit: String,
    #[serde(default)]
    pub units: Vec<UnitConfig>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnitConfig {
    pub code: String,
    /// Multiplier into the base unit, as a decimal string.
    pub factor: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OptionConfig {
    pub code: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub labels: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AttributeConfig {
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub renamed_from: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub labels: BTreeMap<String, String>,
    pub language_dependent: bool,
    pub multiple: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    pub required: bool,
    pub kind: AttributeKindConfig,
    pub index: IndexFlagsConfig,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IndexFlagsConfig {
    pub searchable: bool,
    pub filterable: bool,
    pub sortable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum AttributeKindConfig {
    Text {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        max_length: Option<u32>,
        #[serde(default, skip_serializing_if = "TextFormConfig::is_short")]
        form: TextFormConfig,
    },
    Number {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        unit_family: Option<String>,
        /// Lower bound in the base unit, as a decimal string.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        min: Option<String>,
        /// Upper bound in the base unit, as a decimal string.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        max: Option<String>,
        #[serde(default, skip_serializing_if = "is_false")]
        integer: bool,
    },
    Range {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        unit_family: Option<String>,
    },
    ValueList {
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        options: Vec<OptionConfig>,
        /// Key of a shared value list document.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        list: Option<String>,
    },
    Boolean,
    Date,
    ObjectRef {
        /// Key of the type this reference points at.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        type_key: Option<String>,
    },
    FileRef {
        #[serde(default, skip_serializing_if = "is_false")]
        media: bool,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TextFormConfig {
    #[default]
    Short,
    Long,
}

impl TextFormConfig {
    fn is_short(&self) -> bool {
        matches!(self, Self::Short)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TypeKindConfig {
    #[default]
    Entity,
    Link,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CardinalityConfig {
    One,
    Many,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LinkLabelConfig {
    pub key: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub labels: BTreeMap<String, String>,
}

/// Ends of a link type. Every type is named by key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LinkSpecConfig {
    pub from_types: Vec<String>,
    pub to_types: Vec<String>,
    pub from_label: LinkLabelConfig,
    pub to_label: LinkLabelConfig,
    pub from_cardinality: CardinalityConfig,
    pub to_cardinality: CardinalityConfig,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TypeConfig {
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub renamed_from: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub labels: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub singular: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub plural: BTreeMap<String, String>,
    /// Key of the attribute copied into the object key.
    pub key_attribute: String,
    #[serde(default)]
    pub attributes: Vec<String>,
    /// Keys of the structures this type may be placed in. Missing means any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub structures: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub defaults: BTreeMap<String, String>,
    #[serde(default)]
    pub kind: TypeKindConfig,
    /// Present only when `kind` is `link`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<LinkSpecConfig>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StructureConfig {
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub renamed_from: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub labels: BTreeMap<String, String>,
    #[serde(default)]
    pub groups: Vec<GroupConfig>,
    #[serde(default)]
    pub classes: Vec<ClassConfig>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GroupConfig {
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub renamed_from: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub labels: BTreeMap<String, String>,
    /// Key of the parent group in the same structure.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    #[serde(default)]
    pub attributes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClassConfig {
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub renamed_from: Option<String>,
    /// Key of the group this class belongs to.
    pub group: String,
    /// Key of the parent class.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    #[serde(default)]
    pub attributes: Vec<String>,
}

fn is_false(value: &bool) -> bool {
    !*value
}

/// JSON Schema for every document kind. The committed copy lives in
/// `schemas/config/braian.io-v1.schema.json`.
pub fn schema() -> schemars::Schema {
    schemars::schema_for!(ConfigDocument)
}

#[cfg(test)]
mod tests {
    #[test]
    fn committed_schema_matches_the_generated_one() {
        let generated = format!(
            "{}\n",
            serde_json::to_string_pretty(&super::schema()).expect("schema serializes")
        );
        let committed = include_str!("../../../schemas/config/braian.io-v1.schema.json");
        assert_eq!(
            committed, generated,
            "schemas/config/braian.io-v1.schema.json is stale. Run `just config-schema`."
        );
    }
}
