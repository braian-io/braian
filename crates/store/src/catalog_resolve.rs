//! ONE resolver for the active catalog of a view / workspace.
//!
//! `view.catalog_override ?? workspace.catalog ?? default`
//!
//! Legacy view.state.catalog (a string key) is intentionally ignored so old
//! documents follow the workspace instead of looking pinned.

use serde_json::Value;

use crate::ids::{CatalogId, MASTER_CATALOG_ID};

/// Structured catalog pointer. Labels are never stored here.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CatalogRef {
    pub catalog_id: CatalogId,
}

impl CatalogRef {
    pub fn new(catalog_id: CatalogId) -> Self {
        Self { catalog_id }
    }

    pub fn to_json(self) -> Value {
        serde_json::json!({ "catalogId": self.catalog_id.as_uuid() })
    }

    /// Parse `{ "catalogId": "<uuid>" }`. Rejects bare strings / labels.
    pub fn from_json(value: &Value) -> Option<Self> {
        let id = value.get("catalogId")?.as_str()?;
        let uuid = uuid::Uuid::parse_str(id).ok()?;
        Some(Self {
            catalog_id: CatalogId::from_uuid(uuid),
        })
    }
}

/// Effective catalog: view override ?? workspace ?? default (master).
pub fn effective_catalog_id(
    view_override: Option<CatalogRef>,
    workspace_catalog: Option<CatalogRef>,
    default: CatalogId,
) -> CatalogId {
    if let Some(over) = view_override {
        return over.catalog_id;
    }
    if let Some(workspace) = workspace_catalog {
        return workspace.catalog_id;
    }
    default
}

/// Read an explicit `catalogOverride` from view state JSON.
/// Legacy `catalog: "sap"` is NOT an override.
pub fn view_catalog_override(state: &Value) -> Option<CatalogRef> {
    state
        .get("catalogOverride")
        .and_then(CatalogRef::from_json)
}

pub fn workspace_catalog_ref(workspace: &Value) -> Option<CatalogRef> {
    workspace.get("catalog").and_then(CatalogRef::from_json)
}

pub fn default_catalog_id() -> CatalogId {
    MASTER_CATALOG_ID
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sap() -> CatalogId {
        CatalogId::from_uuid(uuid::Uuid::from_u128(
            0x018f_1000_0000_7000_8000_0000_0000_0002,
        ))
    }

    #[test]
    fn prefers_view_override() {
        let id = effective_catalog_id(
            Some(CatalogRef::new(sap())),
            Some(CatalogRef::new(MASTER_CATALOG_ID)),
            MASTER_CATALOG_ID,
        );
        assert_eq!(id, sap());
    }

    #[test]
    fn falls_back_to_workspace() {
        let id = effective_catalog_id(None, Some(CatalogRef::new(sap())), MASTER_CATALOG_ID);
        assert_eq!(id, sap());
    }

    #[test]
    fn falls_back_to_default_when_workspace_missing() {
        let id = effective_catalog_id(None, None, MASTER_CATALOG_ID);
        assert_eq!(id, MASTER_CATALOG_ID);
    }

    #[test]
    fn legacy_string_catalog_is_not_an_override() {
        let state = json!({ "catalog": "sap", "type_key": "product" });
        assert!(view_catalog_override(&state).is_none());
        let with_override = json!({
            "catalogOverride": { "catalogId": sap().as_uuid() },
            "catalog": "sap"
        });
        assert_eq!(
            view_catalog_override(&with_override).map(|r| r.catalog_id),
            Some(sap())
        );
    }

    #[test]
    fn rejects_label_shaped_refs() {
        assert!(CatalogRef::from_json(&json!("SAP ERP")).is_none());
        assert!(CatalogRef::from_json(&json!({ "name": "SAP" })).is_none());
    }
}
