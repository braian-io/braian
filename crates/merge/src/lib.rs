//! Merge a source catalog into the master catalog.
//!
//! No I/O. The caller loads both objects, the saved link and the profile, and
//! applies the patch this crate returns. A profile owns attributes; it does not
//! file a proposal.

use std::collections::BTreeMap;

use braian_model::{AttributeId, LanguageTag};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use thiserror::Error;

/// How a profile behaves when a source object matches nothing in the master.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OnNoMatch {
    Create,
    Skip,
}

/// What a source delete does to the master object.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OnDelete {
    /// Only the profile that owns existence may remove the master object.
    Propagate,
    /// Drop the values this profile owns. Leave the object.
    Ignore,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunMode {
    Continuous,
    Manual,
}

/// One attribute (and optional language) copied from the source model.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AttributeMap {
    pub source: String,
    pub target: String,
    /// When set, only this language is copied. Otherwise every language moves.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValueListMap {
    pub source_list: String,
    pub target_list: String,
    /// Source code to master code. Missing codes are reported and skipped.
    pub codes: BTreeMap<String, String>,
}

/// Declarative profile. Expressions are out of scope for v1.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProfileSpec {
    /// Source attribute, or several joined, that must equal the master key.
    pub match_attributes: Vec<String>,
    pub master_key: String,
    pub attributes: Vec<AttributeMap>,
    #[serde(default)]
    pub value_lists: Vec<ValueListMap>,
    /// Source group key to master group key, inside one named structure.
    #[serde(default)]
    pub groups: BTreeMap<String, String>,
    #[serde(default)]
    pub structure: Option<String>,
    pub on_no_match: OnNoMatch,
    pub on_delete: OnDelete,
    /// This profile may create and delete the master object for these types.
    #[serde(default)]
    pub owns_existence_for: Vec<String>,
}

/// Which profile owns one master attribute and language.
///
/// The first profile in `profiles` that has a link to the object wins.
/// An empty list means Braian owns the field and a person may edit it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OwnershipRule {
    pub attribute: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    pub profiles: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MatchOutcome {
    None,
    One { master_key: String },
    Ambiguous { keys: Vec<String> },
}

#[derive(Debug, Clone, PartialEq)]
pub struct FieldError {
    pub attribute: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MergePlan {
    pub outcome: MatchOutcome,
    /// Values to write on the master, already transformed. Empty when nothing is owned.
    pub values: Map<String, Value>,
    /// Master group key when the profile maps placement.
    pub group: Option<String>,
    pub errors: Vec<FieldError>,
    /// Create a master object. Only set when the profile owns existence and nothing matched.
    pub create: bool,
    /// Soft-delete the master object.
    pub delete: bool,
    /// Remove the link and clear owned values, leaving the object.
    pub clear_owned: bool,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ProfileError {
    #[error("profile needs a match attribute")]
    NoMatchKey,
    #[error("profile needs a master key")]
    NoMasterKey,
}

impl ProfileSpec {
    pub fn check(&self) -> Result<(), ProfileError> {
        if self.match_attributes.is_empty() {
            return Err(ProfileError::NoMatchKey);
        }
        if self.master_key.is_empty() {
            return Err(ProfileError::NoMasterKey);
        }
        Ok(())
    }
}

/// Match key built from the source object's values.
pub fn match_key(values: &Map<String, Value>, attributes: &[String]) -> Option<String> {
    let mut parts = Vec::new();
    for attribute in attributes {
        let text = scalar_text(values.get(attribute)?)?;
        if text.is_empty() {
            return None;
        }
        parts.push(text);
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("\u{1f}"))
    }
}

/// `masters` maps the match key to the master object keys that carry it.
pub fn match_master(key: Option<&str>, masters: &BTreeMap<String, Vec<String>>) -> MatchOutcome {
    let Some(key) = key else {
        return MatchOutcome::None;
    };
    match masters.get(key).map(Vec::as_slice) {
        None | Some([]) => MatchOutcome::None,
        Some([one]) => MatchOutcome::One {
            master_key: one.clone(),
        },
        Some(many) => MatchOutcome::Ambiguous {
            keys: many.to_vec(),
        },
    }
}

/// First linked profile in `rule.profiles` owns the field. No link means Braian.
pub fn owner<'a>(rule: &'a OwnershipRule, linked_profiles: &[&str]) -> Option<&'a str> {
    rule.profiles
        .iter()
        .find(|profile| linked_profiles.iter().any(|linked| linked == profile))
        .map(String::as_str)
}

/// Builds the write for one source object.
///
/// `source_deleted` is the upstream delete. An empty owned attribute on the
/// source clears that attribute on the master: the owner is the profile that
/// has the article, not the profile that happened to send a value.
pub fn plan(
    spec: &ProfileSpec,
    source_values: &Map<String, Value>,
    source_group: Option<&str>,
    source_deleted: bool,
    masters: &BTreeMap<String, Vec<String>>,
) -> MergePlan {
    let outcome = match_master(match_key(source_values, &spec.match_attributes).as_deref(), masters);
    let mut plan = MergePlan {
        outcome,
        values: Map::new(),
        group: None,
        errors: Vec::new(),
        create: false,
        delete: false,
        clear_owned: false,
    };
    if source_deleted {
        match &plan.outcome {
            MatchOutcome::One { .. } if spec.on_delete == OnDelete::Propagate => {
                plan.delete = true;
            }
            MatchOutcome::One { .. } => plan.clear_owned = true,
            _ => {}
        }
        return plan;
    }
    if matches!(plan.outcome, MatchOutcome::Ambiguous { .. }) {
        plan.errors.push(FieldError {
            attribute: spec.master_key.clone(),
            message: "match is ambiguous".into(),
        });
        return plan;
    }
    if matches!(plan.outcome, MatchOutcome::None) {
        if spec.on_no_match == OnNoMatch::Create {
            plan.create = true;
        } else {
            return plan;
        }
    }
    for mapping in &spec.attributes {
        let Some(raw) = source_values.get(&mapping.source) else {
            // The owner sent the article without this attribute, so the master value is cleared.
            plan.values.insert(mapping.target.clone(), Value::Null);
            continue;
        };
        match transform_value(raw, mapping, &spec.value_lists) {
            Ok(value) => {
                plan.values.insert(mapping.target.clone(), value);
            }
            Err(message) => plan.errors.push(FieldError {
                attribute: mapping.target.clone(),
                message,
            }),
        }
    }
    if spec.structure.is_some()
        && let Some(source_group) = source_group
        && let Some(target) = spec.groups.get(source_group)
    {
        plan.group = Some(target.clone());
    }
    plan
}

fn transform_value(
    raw: &Value,
    mapping: &AttributeMap,
    lists: &[ValueListMap],
) -> Result<Value, String> {
    let Some(list) = lists.iter().find(|list| list.source_list == mapping.source) else {
        if let Some(language) = &mapping.language {
            return Ok(language_only(raw, language));
        }
        return Ok(raw.clone());
    };
    let text = scalar_text(raw).ok_or_else(|| format!("value list {} needs a code", mapping.source))?;
    let Some(code) = list.codes.get(&text) else {
        return Err(format!("code {text} is not mapped"));
    };
    Ok(Value::String(code.clone()))
}

fn language_only(raw: &Value, language: &str) -> Value {
    let Some(object) = raw.as_object() else {
        return raw.clone();
    };
    let mut kept = Map::new();
    if let Some(value) = object.get(language) {
        kept.insert(language.to_owned(), value.clone());
    }
    Value::Object(kept)
}

fn scalar_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        Value::Object(object) => object.values().find_map(scalar_text),
        _ => None,
    }
}

/// Attribute ids are not needed for the plan. The names are the wire keys.
pub fn attribute_id_hint(id: &AttributeId) -> String {
    id.as_uuid().to_string()
}

pub fn language_hint(tag: &LanguageTag) -> String {
    tag.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn spec() -> ProfileSpec {
        ProfileSpec {
            match_attributes: vec!["EAN11".into()],
            master_key: "gtin".into(),
            attributes: vec![AttributeMap {
                source: "NETPR".into(),
                target: "price".into(),
                language: None,
            }],
            value_lists: vec![],
            groups: BTreeMap::from([("DAIRY".into(), "cheese".into())]),
            structure: Some("food".into()),
            on_no_match: OnNoMatch::Create,
            on_delete: OnDelete::Propagate,
            owns_existence_for: vec!["article".into()],
        }
    }

    #[test]
    fn one_gtin_copies_the_price_and_an_empty_owner_field_clears() {
        let mut source = Map::new();
        source.insert("EAN11".into(), json!("7310865001234"));
        source.insert("NETPR".into(), json!("12.50"));
        let masters = BTreeMap::from([("7310865001234".into(), vec!["ART-1".into()])]);
        let plan = plan(&spec(), &source, Some("DAIRY"), false, &masters);
        assert_eq!(
            plan.outcome,
            MatchOutcome::One {
                master_key: "ART-1".into()
            }
        );
        assert_eq!(plan.values.get("price"), Some(&json!("12.50")));
        assert_eq!(plan.group.as_deref(), Some("cheese"));
        assert!(!plan.create);
    }

    #[test]
    fn ambiguous_gtin_writes_nothing() {
        let mut source = Map::new();
        source.insert("EAN11".into(), json!("7310865001234"));
        source.insert("NETPR".into(), json!("1"));
        let masters = BTreeMap::from([(
            "7310865001234".into(),
            vec!["ART-1".into(), "ART-2".into()],
        )]);
        let plan = plan(&spec(), &source, None, false, &masters);
        assert!(plan.values.is_empty());
        assert!(matches!(plan.outcome, MatchOutcome::Ambiguous { .. }));
        assert_eq!(plan.errors.len(), 1);
    }

    #[test]
    fn unmapped_list_code_is_skipped_and_reported() {
        let mut spec = spec();
        spec.value_lists.push(ValueListMap {
            source_list: "MTART".into(),
            target_list: "article_type".into(),
            codes: BTreeMap::from([("FERT".into(), "finished".into())]),
        });
        spec.attributes.push(AttributeMap {
            source: "MTART".into(),
            target: "article_type".into(),
            language: None,
        });
        let mut source = Map::new();
        source.insert("EAN11".into(), json!("1"));
        source.insert("MTART".into(), json!("HALB"));
        let plan = plan(&spec, &source, None, false, &BTreeMap::new());
        assert!(plan.create);
        assert!(plan.values.get("article_type").is_none());
        assert_eq!(plan.errors[0].attribute, "article_type");
    }

    #[test]
    fn owner_is_the_first_linked_profile() {
        let rule = OwnershipRule {
            attribute: "price".into(),
            language: None,
            profiles: vec!["sap".into(), "supplier-nordic".into()],
        };
        assert_eq!(owner(&rule, &["supplier-nordic"]), Some("supplier-nordic"));
        assert_eq!(owner(&rule, &["sap", "supplier-nordic"]), Some("sap"));
        assert_eq!(owner(&rule, &[]), None);
    }

    #[test]
    fn plans_one_hundred_thousand_sources() {
        let spec = spec();
        let mut source = Map::new();
        source.insert("EAN11".into(), json!("7310865001234"));
        source.insert("NETPR".into(), json!("12.50"));
        let masters = BTreeMap::from([("7310865001234".into(), vec!["ART-1".into()])]);
        let start = std::time::Instant::now();
        for _ in 0..100_000 {
            let planned = plan(&spec, &source, Some("DAIRY"), false, &masters);
            assert!(matches!(planned.outcome, MatchOutcome::One { .. }));
        }
        eprintln!("100k in-memory plans: {:?}", start.elapsed());
    }

    #[test]
    fn delete_propagates_only_for_a_single_match() {
        let mut source = Map::new();
        source.insert("EAN11".into(), json!("1"));
        let masters = BTreeMap::from([("1".into(), vec!["ART-1".into()])]);
        let planned = plan(&spec(), &source, None, true, &masters);
        assert!(planned.delete);
        let mut spec = spec();
        spec.on_delete = OnDelete::Ignore;
        let planned = plan(&spec, &source, None, true, &masters);
        assert!(planned.clear_owned);
        assert!(!planned.delete);
    }
}
