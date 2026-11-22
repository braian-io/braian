//! List and restore soft-deleted rows.
//!
//! Each kind is at most 100 rows, newest deletion first. Restoring a row that
//! would reuse a live unique key returns 409 and changes nothing.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use braian_model::ObjectId;
use braian_store::StoredObject;
use serde::Serialize;
use serde_json::Value;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::{Auth, require_commit};
use crate::objects::note_write;
use crate::platform::require;
use crate::problem::{Problem, store_status};
use crate::state::AppState;
use crate::wire;

#[derive(Serialize, ToSchema)]
pub struct TrashItem {
    pub kind: String,
    pub id: Uuid,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub number: String,
    pub label: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub type_key: String,
    pub deleted_at: String,
}

#[derive(Serialize, ToSchema)]
pub struct TrashList {
    pub items: Vec<TrashItem>,
}

#[utoipa::path(
    get,
    path = "/v1/trash",
    tag = "platform",
    responses(
        (status = 200, description = "Soft-deleted items the caller can restore", body = TrashList)
    ),
    security(("bearer" = []))
)]
pub async fn list_trash(
    State(state): State<AppState>,
    Auth(identity): Auth,
) -> Result<Json<TrashList>, Problem> {
    require(&identity, crate::auth::Role::Viewer)?;
    let rows = state
        .store
        .list_trash(identity.user_id)
        .await
        .map_err(store_status)?;
    let cached = state.models.get(&state.store).await?;
    let object_ids: Vec<ObjectId> = rows
        .iter()
        .filter(|row| row.kind == "object")
        .map(|row| ObjectId::from_uuid(row.id))
        .collect();
    let stored = if object_ids.is_empty() {
        Vec::new()
    } else {
        state
            .store
            .get_objects(&object_ids)
            .await
            .map_err(store_status)?
    };
    let by_id: HashMap<Uuid, StoredObject> = stored
        .into_iter()
        .map(|row| (row.object.id.as_uuid(), row))
        .collect();
    let items = rows
        .into_iter()
        .map(|row| {
            let mut number = row.number;
            let mut label = row.label;
            let mut type_key = row.type_key;
            if row.kind == "object"
                && let Some(stored) = by_id.get(&row.id)
            {
                type_key = wire::type_key(&cached.defs, stored.object.type_id);
                if number.is_empty() && !stored.key.is_empty() {
                    number = stored.key.clone();
                }
                if label.is_empty() {
                    label = object_trash_label(stored);
                }
                if label.is_empty() && !type_key.is_empty() {
                    label = type_key.clone();
                }
            }
            if label.is_empty() {
                label = number.clone();
            }
            if label.is_empty() {
                label = trash_kind_label(row.kind);
            }
            TrashItem {
                kind: row.kind.to_owned(),
                id: row.id,
                number,
                label,
                type_key,
                deleted_at: row.deleted_at.to_rfc3339(),
            }
        })
        .collect();
    Ok(Json(TrashList { items }))
}

fn trash_kind_label(kind: &str) -> String {
    match kind {
        "workspace" => "Workspace".into(),
        "view" => "View".into(),
        "assortment" => "Selection".into(),
        "import_mapping" => "Import mapping".into(),
        "catalog" => "Catalog".into(),
        "merge_profile" => "Merge profile".into(),
        "merge_link" => "Merge link".into(),
        other => other.into(),
    }
}

fn object_trash_label(stored: &StoredObject) -> String {
    for value in stored.object.values.values() {
        let text = display_name_text(value);
        if !text.is_empty() {
            return text;
        }
    }
    String::new()
}

/// English name when the value has one, otherwise another stored language.
fn display_name_text(value: &Value) -> String {
    if let Some(text) = value.as_str() {
        return text.trim().to_string();
    }
    let Some(map) = value.as_object() else {
        return String::new();
    };
    for tag in ["en", "sv", "de"] {
        if let Some(text) = map.get(tag).and_then(Value::as_str) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    for (_key, inner) in map {
        if let Some(text) = inner.as_str() {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    String::new()
}

#[utoipa::path(
    post,
    path = "/v1/trash/{kind}/{id}/undelete",
    tag = "platform",
    params(
        ("kind" = String, Path, description = "object, workspace, view, assortment, import_mapping, catalog, merge_profile, or merge_link"),
        ("id" = Uuid, Path, description = "Item id")
    ),
    responses(
        (status = 204, description = "Restored"),
        (status = 404, description = "Not in the trash", body = crate::problem::Problem),
        (status = 409, description = "A live row already uses this key", body = crate::problem::Problem)
    ),
    security(("bearer" = []))
)]
pub async fn undelete(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Path((kind, id)): Path<(String, Uuid)>,
) -> Result<StatusCode, Problem> {
    require(&identity, crate::auth::Role::Editor)?;
    require_commit(&identity)?;
    restore_trash(&state, &identity, &kind, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post,
    path = "/v1/trash/{kind}/{id}/purge",
    tag = "platform",
    params(
        ("kind" = String, Path, description = "object, workspace, view, assortment, import_mapping, catalog, merge_profile, or merge_link"),
        ("id" = Uuid, Path, description = "Item id")
    ),
    responses(
        (status = 204, description = "Permanently deleted"),
        (status = 404, description = "Not in the trash", body = crate::problem::Problem)
    ),
    security(("bearer" = []))
)]
pub async fn purge(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Path((kind, id)): Path<(String, Uuid)>,
) -> Result<StatusCode, Problem> {
    require(&identity, crate::auth::Role::Editor)?;
    require_commit(&identity)?;
    state
        .store
        .purge_trash(&kind, id)
        .await
        .map_err(store_status)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn restore_trash(
    state: &AppState,
    identity: &crate::auth::Identity,
    kind: &str,
    id: Uuid,
) -> Result<(), Problem> {
    match kind {
        "object" => {
            let object_id = ObjectId::from_uuid(id);
            let receipt = state
                .store
                .restore_object(&identity.actor, object_id)
                .await
                .map_err(store_status)?;
            let version = receipt
                .versions
                .iter()
                .find(|(stored, _)| *stored == object_id)
                .map(|(_, version)| *version)
                .unwrap_or(0);
            note_write(state, "update", id, version, receipt.last_seq, "");
        }
        "workspace" => {
            let user_id = identity.user_id.ok_or_else(|| {
                Problem::new(
                    StatusCode::BAD_REQUEST,
                    "no_user",
                    "sign in to restore a workspace",
                )
            })?;
            let member = state
                .store
                .workspace_is_member(id, user_id)
                .await
                .map_err(store_status)?;
            if !member {
                return Err(Problem::new(
                    StatusCode::NOT_FOUND,
                    "not_found",
                    "That workspace was not found.",
                ));
            }
            state
                .store
                .restore_workspace(id)
                .await
                .map_err(store_status)?;
        }
        "view" => {
            let user_id = identity.user_id.ok_or_else(|| {
                Problem::new(
                    StatusCode::BAD_REQUEST,
                    "no_user",
                    "sign in to restore a view",
                )
            })?;
            let parent = state
                .store
                .view_workspace_any(id)
                .await
                .map_err(store_status)?
                .ok_or_else(|| {
                    Problem::new(
                        StatusCode::NOT_FOUND,
                        "not_found",
                        "That view was not found.",
                    )
                })?;
            let member = state
                .store
                .workspace_is_member(parent, user_id)
                .await
                .map_err(store_status)?;
            if !member {
                return Err(Problem::new(
                    StatusCode::NOT_FOUND,
                    "not_found",
                    "That view was not found.",
                ));
            }
            state.store.restore_view(id).await.map_err(store_status)?;
        }
        "assortment" => {
            state
                .store
                .restore_assortment(id)
                .await
                .map_err(store_status)?;
        }
        "import_mapping" => {
            state
                .store
                .restore_import_mapping(id)
                .await
                .map_err(store_status)?;
        }
        "catalog" => {
            state
                .store
                .restore_catalog(id)
                .await
                .map_err(store_status)?;
        }
        "merge_profile" => {
            state
                .store
                .restore_merge_profile(id)
                .await
                .map_err(store_status)?;
        }
        "merge_link" => {
            state
                .store
                .restore_merge_link(id)
                .await
                .map_err(store_status)?;
        }
        _ => {
            return Err(Problem::new(
                StatusCode::BAD_REQUEST,
                "unknown_kind",
                "unknown trash kind",
            ));
        }
    }
    Ok(())
}
