//! Idempotent repair of saved views.
//!
//! A view bound to a link type lists no rows, because a link type is not a
//! record type. The repair moves such a view to the link's source entity
//! (`from_types[0]`). It also rewrites a legacy string `state.catalog` key into
//! the structured `catalogOverride` the resolver reads. Finally it deletes views
//! that no workspace or personal layout places in a tab, so the dock never keeps
//! a view the user cannot reach. All edits are no-ops the second time they run.

use std::collections::{HashMap, HashSet};

use braian_model::DefinitionSet;
use serde_json::Value;
use tokio_postgres::Client;
use uuid::Uuid;

use crate::catalog_resolve::normalize_legacy_catalog;
use crate::error::Error;
use crate::ids::CatalogId;

/// Apply both repairs to one view `state`. Returns true when it changed.
pub fn repair_view_state(
    state: &mut Value,
    defs: &DefinitionSet,
    catalog_id_by_key: &HashMap<String, CatalogId>,
) -> bool {
    let mut changed = remap_link_source(state, defs);
    changed |= normalize_legacy_catalog(state, |key| catalog_id_by_key.get(key).copied());
    changed
}

/// Rewrite `object_type` / `type_key` naming a link type to the link's source
/// entity. Returns true when the state changed.
fn remap_link_source(state: &mut Value, defs: &DefinitionSet) -> bool {
    let Some(object) = state.as_object_mut() else {
        return false;
    };
    let token = object
        .get("object_type")
        .or_else(|| object.get("type_key"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let Ok(id) = braian_model::refs::type_id(defs, token) else {
        return false;
    };
    let Some(link) = defs.types.iter().find(|item| item.id == id) else {
        return false;
    };
    if !link.is_link() {
        return false;
    }
    let Some(source_id) = link
        .link
        .as_ref()
        .and_then(|spec| spec.from_types.first().copied())
    else {
        return false;
    };
    let Some(source) = defs.types.iter().find(|item| item.id == source_id) else {
        return false;
    };
    let next_id = source.id.as_uuid().to_string();
    let changed = object.get("object_type").and_then(Value::as_str) != Some(next_id.as_str())
        || object.get("type_key").and_then(Value::as_str) != Some(source.key.as_str());
    object.insert("object_type".into(), Value::String(next_id));
    object.insert("type_key".into(), Value::String(source.key.clone()));
    changed
}

/// Collect the view ids a layout document places in a tab.
fn collect_layout_view_ids(layout: &Value, placed: &mut HashSet<Uuid>) {
    match layout {
        Value::Array(items) => {
            for item in items {
                collect_layout_view_ids(item, placed);
            }
        }
        Value::Object(fields) => {
            if let Some(views) = fields.get("views").and_then(Value::as_array) {
                for view in views {
                    if let Some(id) = view.as_str().and_then(|token| Uuid::parse_str(token).ok()) {
                        placed.insert(id);
                    }
                }
            }
            for child in fields.values() {
                collect_layout_view_ids(child, placed);
            }
        }
        _ => {}
    }
}

/// Views to delete, scoped to workspaces whose layout is meaningful.
///
/// A workspace layout counts only when it is a JSON object that places at least
/// one view. This keeps every view of a workspace without a usable layout;
/// deleting those would be data loss. Views without a workspace are never
/// touched.
fn orphan_views_to_delete(
    views: &[(Uuid, Option<Uuid>)],
    workspace_layouts: &HashMap<Uuid, Value>,
    personal_layouts: &HashMap<Uuid, Vec<Value>>,
) -> Vec<Uuid> {
    let mut placed_by_workspace: HashMap<Uuid, HashSet<Uuid>> = HashMap::new();
    let mut meaningful_workspaces = HashSet::new();
    for (workspace_id, layout) in workspace_layouts {
        let placed = placed_by_workspace.entry(*workspace_id).or_default();
        collect_layout_view_ids(layout, placed);
        if layout.is_object() && !placed.is_empty() {
            meaningful_workspaces.insert(*workspace_id);
        }
    }
    for (workspace_id, layouts) in personal_layouts {
        let placed = placed_by_workspace.entry(*workspace_id).or_default();
        for layout in layouts {
            collect_layout_view_ids(layout, placed);
        }
    }
    views
        .iter()
        .filter_map(|(id, workspace_id)| {
            let workspace_id = (*workspace_id)?;
            if !meaningful_workspaces.contains(&workspace_id) {
                return None;
            }
            let placed = placed_by_workspace
                .get(&workspace_id)
                .is_some_and(|placed| placed.contains(id));
            (!placed).then_some(*id)
        })
        .collect()
}

/// Delete views that their own workspace's layout no longer references.
async fn remove_orphan_views(client: &mut Client) -> Result<(), Error> {
    let workspace_rows = client
        .query("SELECT id, layout FROM workspaces", &[])
        .await?;
    let mut workspace_layouts = HashMap::with_capacity(workspace_rows.len());
    for row in &workspace_rows {
        let id: Uuid = row.get("id");
        if let Some(layout) = row.get::<_, Option<Value>>("layout") {
            workspace_layouts.insert(id, layout);
        }
    }

    let personal_rows = client
        .query(
            "SELECT workspace_id, document -> 'layout' AS document
             FROM workspace_states
             WHERE jsonb_typeof(document) = 'object' AND document ? 'layout'",
            &[],
        )
        .await?;
    let mut personal_layouts: HashMap<Uuid, Vec<Value>> = HashMap::new();
    for row in &personal_rows {
        let workspace_id: Uuid = row.get("workspace_id");
        if let Some(document) = row.get::<_, Option<Value>>("document") {
            personal_layouts
                .entry(workspace_id)
                .or_default()
                .push(document);
        }
    }

    let views = client
        .query(
            "SELECT id, workspace_id FROM views WHERE workspace_id IS NOT NULL",
            &[],
        )
        .await?;
    let view_rows: Vec<(Uuid, Option<Uuid>)> = views
        .iter()
        .map(|view| (view.get("id"), view.get("workspace_id")))
        .collect();
    for id in orphan_views_to_delete(&view_rows, &workspace_layouts, &personal_layouts) {
        client
            .execute("DELETE FROM views WHERE id = $1", &[&id])
            .await?;
    }
    Ok(())
}

/// Startup repair over saved views.
pub(crate) async fn repair_link_and_catalog_views(client: &mut Client) -> Result<(), Error> {
    let row = client
        .query_one(
            "SELECT
                 (SELECT definitions FROM definition_revisions
                  WHERE catalog_id = braian_catalog() ORDER BY model_revision DESC LIMIT 1)
                 AS definitions",
            &[],
        )
        .await?;
    if let Some(document) = row.get::<_, Option<Value>>("definitions") {
        let defs: DefinitionSet = serde_json::from_value(document)
            .map_err(|error| Error::Definitions(error.to_string()))?;

        let catalog_rows = client.query("SELECT id, key FROM catalogs", &[]).await?;
        let mut catalog_id_by_key = HashMap::with_capacity(catalog_rows.len());
        for catalog in catalog_rows {
            let id: Uuid = catalog.get("id");
            let key: String = catalog.get("key");
            catalog_id_by_key.insert(key, CatalogId::from_uuid(id));
        }

        let views = client
            .query(
                "SELECT id, state FROM views WHERE type_key = 'object_table'",
                &[],
            )
            .await?;
        for view in views {
            let id: Uuid = view.get("id");
            let mut state: Value = view.get("state");
            if repair_view_state(&mut state, &defs, &catalog_id_by_key) {
                client
                    .execute("UPDATE views SET state = $2 WHERE id = $1", &[&id, &state])
                    .await?;
            }
        }
    }
    remove_orphan_views(client).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const PRODUCT: &str = "018f0000-0000-7000-8000-000000000200";
    const ARTICLE: &str = "018f0000-0000-7000-8000-000000000201";
    const LINK: &str = "018f0000-0000-7000-8000-000000000210";

    fn defs() -> DefinitionSet {
        serde_json::from_value(json!({
            "model_revision": 1,
            "languages": ["en"],
            "unit_families": [],
            "attributes": [],
            "types": [
                {
                    "id": PRODUCT,
                    "key": "product",
                    "labels": { "en": "Product" },
                    "key_attribute": "018f0000-0000-7000-8000-000000000100",
                    "attributes": [],
                    "structures": []
                },
                {
                    "id": ARTICLE,
                    "key": "article",
                    "labels": { "en": "Article" },
                    "key_attribute": "018f0000-0000-7000-8000-000000000100",
                    "attributes": [],
                    "structures": []
                },
                {
                    "id": LINK,
                    "key": "product_articles",
                    "labels": { "en": "Product" },
                    "key_attribute": "018f0000-0000-7000-8000-00000000a003",
                    "attributes": [],
                    "structures": [],
                    "kind": "link",
                    "link": {
                        "from_types": [PRODUCT],
                        "to_types": [ARTICLE],
                        "from_label": { "key": "product", "labels": { "en": "Product" } },
                        "to_label": { "key": "articles", "labels": { "en": "Articles" } },
                        "from_cardinality": "many",
                        "to_cardinality": "one"
                    }
                }
            ],
            "structures": []
        }))
        .expect("definitions")
    }

    fn catalogs() -> HashMap<String, CatalogId> {
        let mut map = HashMap::new();
        map.insert(
            "sap".to_owned(),
            CatalogId::from_uuid(Uuid::from_u128(0x018f_1000_0000_7000_8000_0000_0000_0002)),
        );
        map
    }

    #[test]
    fn moves_a_link_bound_view_to_the_source_entity() {
        let mut state = json!({ "object_type": LINK, "type_key": "product_articles" });
        assert!(repair_view_state(&mut state, &defs(), &catalogs()));
        assert_eq!(state["object_type"], json!(PRODUCT));
        assert_eq!(state["type_key"], json!("product"));
        // Idempotent.
        assert!(!repair_view_state(&mut state, &defs(), &catalogs()));
    }

    #[test]
    fn leaves_entity_bound_views_alone() {
        let mut state = json!({ "object_type": ARTICLE, "type_key": "article" });
        assert!(!repair_view_state(&mut state, &defs(), &catalogs()));
    }

    #[test]
    fn normalizes_legacy_catalog_alongside_the_link_remap() {
        let mut state =
            json!({ "object_type": LINK, "type_key": "product_articles", "catalog": "sap" });
        assert!(repair_view_state(&mut state, &defs(), &catalogs()));
        assert_eq!(
            state["catalogOverride"],
            json!({ "catalogId": "018f1000-0000-7000-8000-000000000002" })
        );
    }

    fn view(id: u128) -> Uuid {
        Uuid::from_u128(id)
    }

    fn workspace(id: u128) -> Uuid {
        Uuid::from_u128(id)
    }

    fn layout_with(views: &[Uuid]) -> Value {
        json!({
            "type": "tabs",
            "views": views.iter().map(ToString::to_string).collect::<Vec<_>>(),
            "active": 0
        })
    }

    #[test]
    fn keeps_views_when_workspace_layout_is_null() {
        let workspace_id = workspace(1);
        let kept = view(1);
        let personal_layouts = HashMap::from([(workspace_id, vec![layout_with(&[])])]);
        assert!(
            orphan_views_to_delete(
                &[(kept, Some(workspace_id))],
                &HashMap::new(),
                &personal_layouts,
            )
            .is_empty()
        );
    }

    #[test]
    fn keeps_views_when_workspace_layout_is_empty() {
        let workspace_id = workspace(1);
        let kept = view(1);
        let workspace_layouts = HashMap::from([(workspace_id, json!({}))]);
        assert!(
            orphan_views_to_delete(
                &[(kept, Some(workspace_id))],
                &workspace_layouts,
                &HashMap::new(),
            )
            .is_empty()
        );
    }

    #[test]
    fn deletes_views_outside_a_meaningful_workspace_layout() {
        let workspace_id = workspace(1);
        let placed = view(1);
        let orphan = view(2);
        let workspace_layouts = HashMap::from([(workspace_id, layout_with(&[placed]))]);
        assert_eq!(
            orphan_views_to_delete(
                &[(placed, Some(workspace_id)), (orphan, Some(workspace_id))],
                &workspace_layouts,
                &HashMap::new(),
            ),
            vec![orphan]
        );
        // Idempotent: once the orphan is gone there is nothing left to repair.
        assert!(
            orphan_views_to_delete(
                &[(placed, Some(workspace_id))],
                &workspace_layouts,
                &HashMap::new(),
            )
            .is_empty()
        );
    }

    #[test]
    fn keeps_a_view_that_only_a_personal_layout_places() {
        let workspace_id = workspace(1);
        let placed = view(1);
        let personal_only = view(2);
        let workspace_layouts = HashMap::from([(workspace_id, layout_with(&[placed]))]);
        let personal_layouts = HashMap::from([(workspace_id, vec![layout_with(&[personal_only])])]);
        assert!(
            orphan_views_to_delete(
                &[
                    (placed, Some(workspace_id)),
                    (personal_only, Some(workspace_id))
                ],
                &workspace_layouts,
                &personal_layouts,
            )
            .is_empty()
        );
    }

    #[test]
    fn never_deletes_views_without_a_workspace() {
        let placed = view(1);
        let workspace_layouts = HashMap::from([(workspace(1), layout_with(&[placed]))]);
        assert!(
            orphan_views_to_delete(
                &[(view(2), None), (view(3), None)],
                &workspace_layouts,
                &HashMap::new(),
            )
            .is_empty()
        );
    }
}
