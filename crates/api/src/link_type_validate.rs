//! Block link-type edits that existing data would violate.

use braian_model::{Cardinality, DefinitionSet, ModelChange};
use braian_store::{LinkViolator, Store};

use crate::problem::{Problem, store_status};
use crate::state::AppState;

const LIST_LIMIT: i64 = 21;
const SHOWN: usize = 20;

pub(crate) async fn reject_blocked_link_type_changes(
    store: &Store,
    before: &DefinitionSet,
    after: &DefinitionSet,
    changes: &[ModelChange],
) -> Result<(), Problem> {
    for change in changes {
        let ModelChange::UpdateLinkType {
            key,
            from_types,
            to_types,
            ..
        } = change
        else {
            continue;
        };
        let Some(before_type) = before.types.iter().find(|item| item.key == *key) else {
            continue;
        };
        let Some(after_type) = after.types.iter().find(|item| item.key == *key) else {
            continue;
        };
        if !before_type.is_link() || !after_type.is_link() {
            continue;
        }
        let before_spec = before_type.link.as_ref();
        let after_spec = after_type
            .link
            .as_ref()
            .ok_or_else(|| bad(format!("link type {key} has no ends")))?;
        let type_id = after_type.id;

        let tighten_from = after_spec.from_cardinality == Cardinality::One
            && before_spec
                .map(|spec| spec.from_cardinality == Cardinality::Many)
                .unwrap_or(false);
        if tighten_from {
            let violators = store
                .link_type_from_many_violators(type_id, LIST_LIMIT)
                .await
                .map_err(store_status)?;
            if let Some(message) = violator_message(key, "from", &violators) {
                return Err(bad(message));
            }
        }

        let tighten_to = after_spec.to_cardinality == Cardinality::One
            && before_spec
                .map(|spec| spec.to_cardinality == Cardinality::Many)
                .unwrap_or(false);
        if tighten_to {
            let violators = store
                .link_type_to_many_violators(type_id, LIST_LIMIT)
                .await
                .map_err(store_status)?;
            if let Some(message) = violator_message(key, "to", &violators) {
                return Err(bad(message));
            }
        }

        if from_types.is_some() {
            let violators = store
                .link_type_invalid_from_types(type_id, &after_spec.from_types, LIST_LIMIT)
                .await
                .map_err(store_status)?;
            if let Some(message) = type_violator_message(key, "source", &violators) {
                return Err(bad(message));
            }
        }

        if to_types.is_some() {
            let violators = store
                .link_type_invalid_to_types(type_id, &after_spec.to_types, LIST_LIMIT)
                .await
                .map_err(store_status)?;
            if let Some(message) = type_violator_message(key, "target", &violators) {
                return Err(bad(message));
            }
        }
    }
    Ok(())
}

pub(crate) async fn validate_for_app(
    state: &AppState,
    before: &DefinitionSet,
    after: &DefinitionSet,
    changes: &[ModelChange],
) -> Result<(), String> {
    reject_blocked_link_type_changes(&state.store, before, after, changes)
        .await
        .map_err(|problem| problem.detail)
}

fn bad(message: String) -> Problem {
    Problem::new(
        axum::http::StatusCode::UNPROCESSABLE_ENTITY,
        "link_type_blocked",
        message,
    )
}

fn violator_message(link_type: &str, side: &str, violators: &[LinkViolator]) -> Option<String> {
    if violators.is_empty() {
        return None;
    }
    let extra = violators.len().saturating_sub(SHOWN);
    let shown = violators.iter().take(SHOWN);
    let list = shown
        .map(|item| format!("{} ({})", item.name, item.key))
        .collect::<Vec<_>>()
        .join(", ");
    let tail = if extra > 0 {
        format!(" and {extra} more")
    } else {
        String::new()
    };
    Some(format!(
        "Cannot set link type {link_type} to one on the {side} side: {list}{tail} already have multiple links of this type."
    ))
}

fn type_violator_message(
    link_type: &str,
    side: &str,
    violators: &[LinkViolator],
) -> Option<String> {
    if violators.is_empty() {
        return None;
    }
    let extra = violators.len().saturating_sub(SHOWN);
    let list = violators
        .iter()
        .take(SHOWN)
        .map(|item| format!("{} ({})", item.name, item.key))
        .collect::<Vec<_>>()
        .join(", ");
    let tail = if extra > 0 {
        format!(" and {extra} more")
    } else {
        String::new()
    };
    Some(format!(
        "Cannot change the {side} type on link type {link_type}: existing links involve {list}{tail}."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_violators_with_cap() {
        let violators: Vec<LinkViolator> = (0..25)
            .map(|index| LinkViolator {
                key: format!("OBJ-{index}"),
                name: format!("Name {index}"),
            })
            .collect();
        let message = violator_message("pairs_with", "from", &violators).expect("message");
        assert!(message.contains("and 5 more"));
        assert!(message.contains("Name 0 (OBJ-0)"));
        assert!(!message.contains("OBJ-24"));
    }
}