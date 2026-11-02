//! Convert a definition set into config documents, replacing every id with a
//! stable key.

use std::collections::BTreeMap;

use braian_model::{
    Attribute, AttributeKind, Cardinality, Class, DefinitionSet, Group, ObjectType, Structure,
    TextForm, TypeKind, UnitFamily,
};

use crate::{
    ApiVersion, AttributeConfig, AttributeKindConfig, CardinalityConfig, ClassConfig,
    ConfigDocument, GroupConfig, IndexFlagsConfig, LinkLabelConfig, LinkSpecConfig, ModelDocument,
    ModelKind, OptionConfig, StructureConfig, TextFormConfig, TypeConfig, TypeKindConfig,
    UnitConfig, UnitFamilyDocument, UnitFamilyKind, ValueListDocument, ValueListKind,
};

/// An exported document could not be built because a reference had no key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfigError {
    message: String,
}

impl ConfigError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ConfigError {}

type Keys<K> = BTreeMap<K, String>;

/// The model document first, then one document per value list and unit family.
pub fn export_documents(defs: &DefinitionSet) -> Result<Vec<ConfigDocument>, ConfigError> {
    let attributes: Keys<_> = defs
        .attributes
        .iter()
        .map(|item| (item.id, item.key.clone()))
        .collect();
    let types: Keys<_> = defs
        .types
        .iter()
        .map(|item| (item.id, item.key.clone()))
        .collect();
    let structures: Keys<_> = defs
        .structures
        .iter()
        .map(|item| (item.id, item.key.clone()))
        .collect();
    let groups: Keys<_> = defs
        .structures
        .iter()
        .flat_map(|structure| structure.groups.iter())
        .map(|item| (item.id, item.key.clone()))
        .collect();
    let classes: Keys<_> = defs
        .structures
        .iter()
        .flat_map(|structure| structure.classes.iter())
        .map(|item| (item.id, item.key.clone()))
        .collect();
    let units: Keys<_> = defs
        .unit_families
        .iter()
        .map(|item| (item.id, item.key.clone()))
        .collect();

    let model = ModelDocument {
        api_version: ApiVersion::BraianIoV1,
        kind: ModelKind::Model,
        languages: defs
            .languages
            .iter()
            .map(|tag| tag.as_str().to_owned())
            .collect(),
        attributes: defs
            .attributes
            .iter()
            .map(|item| attribute(item, &units))
            .collect::<Result<_, _>>()?,
        types: defs
            .types
            .iter()
            .map(|item| object_type(item, &attributes, &types, &structures))
            .collect::<Result<_, _>>()?,
        structures: defs
            .structures
            .iter()
            .map(|item| structure(item, &attributes, &groups, &classes))
            .collect::<Result<_, _>>()?,
    };

    let mut documents = vec![ConfigDocument::Model(model)];
    for list in &defs.value_lists {
        documents.push(ConfigDocument::ValueList(ValueListDocument {
            api_version: ApiVersion::BraianIoV1,
            kind: ValueListKind::ValueList,
            key: list.key.clone(),
            labels: labels(&list.labels),
            options: list.options.iter().map(option).collect(),
        }));
    }
    for family in &defs.unit_families {
        documents.push(ConfigDocument::UnitFamily(unit_family(family)));
    }
    Ok(documents)
}

fn attribute(
    attribute: &Attribute,
    units: &Keys<braian_model::UnitFamilyId>,
) -> Result<AttributeConfig, ConfigError> {
    Ok(AttributeConfig {
        key: attribute.key.clone(),
        labels: labels(&attribute.labels),
        language_dependent: attribute.language_dependent,
        multiple: attribute.multiple,
        required: attribute.required,
        kind: match &attribute.kind {
            AttributeKind::Text { max_length, form } => AttributeKindConfig::Text {
                max_length: *max_length,
                form: match form {
                    TextForm::Short => TextFormConfig::Short,
                    TextForm::Long => TextFormConfig::Long,
                },
            },
            AttributeKind::Number {
                unit_family,
                min,
                max,
                integer,
            } => AttributeKindConfig::Number {
                unit_family: optional_key(units, *unit_family, "unit family")?,
                min: min.as_ref().map(ToString::to_string),
                max: max.as_ref().map(ToString::to_string),
                integer: *integer,
            },
            AttributeKind::Range { unit_family } => AttributeKindConfig::Range {
                unit_family: optional_key(units, *unit_family, "unit family")?,
            },
            AttributeKind::ValueList { options, list } => AttributeKindConfig::ValueList {
                options: options.iter().map(option).collect(),
                list: list.clone(),
            },
            AttributeKind::Boolean => AttributeKindConfig::Boolean,
            AttributeKind::Date => AttributeKindConfig::Date,
            AttributeKind::ObjectRef { type_key } => AttributeKindConfig::ObjectRef {
                type_key: type_key.clone(),
            },
            AttributeKind::FileRef { media } => AttributeKindConfig::FileRef { media: *media },
        },
        index: IndexFlagsConfig {
            searchable: attribute.index.searchable,
            filterable: attribute.index.filterable,
            sortable: attribute.index.sortable,
        },
    })
}

fn object_type(
    object_type: &ObjectType,
    attributes: &Keys<braian_model::AttributeId>,
    types: &Keys<braian_model::TypeId>,
    structures: &Keys<braian_model::StructureId>,
) -> Result<TypeConfig, ConfigError> {
    Ok(TypeConfig {
        key: object_type.key.clone(),
        labels: labels(&object_type.labels),
        singular: labels(&object_type.singular),
        plural: labels(&object_type.plural),
        key_attribute: key(attributes, object_type.key_attribute, "attribute")?,
        attributes: object_type
            .attributes
            .iter()
            .map(|id| key(attributes, *id, "attribute"))
            .collect::<Result<_, _>>()?,
        structures: object_type
            .structures
            .as_ref()
            .map(|ids| {
                ids.iter()
                    .map(|id| key(structures, *id, "structure"))
                    .collect::<Result<Vec<_>, _>>()
            })
            .transpose()?,
        defaults: object_type.defaults.clone(),
        kind: match object_type.kind {
            TypeKind::Entity => TypeKindConfig::Entity,
            TypeKind::Link => TypeKindConfig::Link,
        },
        link: object_type
            .link
            .as_ref()
            .map(|link| {
                Ok(LinkSpecConfig {
                    from_types: link
                        .from_types
                        .iter()
                        .map(|id| key(types, *id, "type"))
                        .collect::<Result<_, ConfigError>>()?,
                    to_types: link
                        .to_types
                        .iter()
                        .map(|id| key(types, *id, "type"))
                        .collect::<Result<_, ConfigError>>()?,
                    from_label: LinkLabelConfig {
                        key: link.from_label.key.clone(),
                        labels: labels(&link.from_label.labels),
                    },
                    to_label: LinkLabelConfig {
                        key: link.to_label.key.clone(),
                        labels: labels(&link.to_label.labels),
                    },
                    from_cardinality: cardinality(link.from_cardinality),
                    to_cardinality: cardinality(link.to_cardinality),
                })
            })
            .transpose()?,
    })
}

fn structure(
    structure: &Structure,
    attributes: &Keys<braian_model::AttributeId>,
    groups: &Keys<braian_model::GroupId>,
    classes: &Keys<braian_model::ClassId>,
) -> Result<StructureConfig, ConfigError> {
    Ok(StructureConfig {
        key: structure.key.clone(),
        labels: labels(&structure.labels),
        groups: structure
            .groups
            .iter()
            .map(|item| group(item, attributes, groups))
            .collect::<Result<_, _>>()?,
        classes: structure
            .classes
            .iter()
            .map(|item| class(item, attributes, groups, classes))
            .collect::<Result<_, _>>()?,
    })
}

fn group(
    group: &Group,
    attributes: &Keys<braian_model::AttributeId>,
    groups: &Keys<braian_model::GroupId>,
) -> Result<GroupConfig, ConfigError> {
    Ok(GroupConfig {
        key: group.key.clone(),
        labels: labels(&group.labels),
        parent: optional_key(groups, group.parent, "group")?,
        attributes: group
            .attributes
            .iter()
            .map(|id| key(attributes, *id, "attribute"))
            .collect::<Result<_, _>>()?,
    })
}

fn class(
    class: &Class,
    attributes: &Keys<braian_model::AttributeId>,
    groups: &Keys<braian_model::GroupId>,
    classes: &Keys<braian_model::ClassId>,
) -> Result<ClassConfig, ConfigError> {
    Ok(ClassConfig {
        key: class.key.clone(),
        group: key(groups, class.group, "group")?,
        parent: optional_key(classes, class.parent, "class")?,
        attributes: class
            .attributes
            .iter()
            .map(|id| key(attributes, *id, "attribute"))
            .collect::<Result<_, _>>()?,
    })
}

fn unit_family(family: &UnitFamily) -> UnitFamilyDocument {
    UnitFamilyDocument {
        api_version: ApiVersion::BraianIoV1,
        kind: UnitFamilyKind::UnitFamily,
        key: family.key.clone(),
        dimension: family.dimension.clone(),
        base_unit: family.base_unit.clone(),
        units: family
            .units
            .iter()
            .map(|unit| UnitConfig {
                code: unit.code.clone(),
                factor: unit.factor.to_string(),
            })
            .collect(),
    }
}

fn option(option: &braian_model::ValueOption) -> OptionConfig {
    OptionConfig {
        code: option.code.clone(),
        labels: labels(&option.labels),
    }
}

fn cardinality(value: Cardinality) -> CardinalityConfig {
    match value {
        Cardinality::One => CardinalityConfig::One,
        Cardinality::Many => CardinalityConfig::Many,
    }
}

fn labels(values: &BTreeMap<braian_model::LanguageTag, String>) -> BTreeMap<String, String> {
    values
        .iter()
        .map(|(tag, text)| (tag.as_str().to_owned(), text.clone()))
        .collect()
}

fn key<K: Ord + Copy + std::fmt::Display>(
    keys: &Keys<K>,
    id: K,
    what: &'static str,
) -> Result<String, ConfigError> {
    keys.get(&id)
        .cloned()
        .ok_or_else(|| ConfigError::new(format!("{what} {id} has no key")))
}

fn optional_key<K: Ord + Copy + std::fmt::Display>(
    keys: &Keys<K>,
    id: Option<K>,
    what: &'static str,
) -> Result<Option<String>, ConfigError> {
    id.map(|id| key(keys, id, what)).transpose()
}
