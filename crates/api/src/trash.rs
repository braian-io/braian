//! List and restore soft-deleted rows.
//!
//! Each kind is at most 100 rows, newest deletion first. Restoring a row that
//! would reuse a live unique key returns 409 and changes nothing.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use braian_model::ObjectId;
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::{Auth, require_commit};
use crate::objects::note_write;
use crate::platform::require;
use crate::problem::{Problem, store_status};
use crate::state::AppState;

#[derive(Serialize, ToSchema)]
pub struct TrashItem {
    pub kind: String,
    pub id: Uuid,
    pub label: String,
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
    Ok(Json(TrashList {
        items: rows
            .into_iter()
            .map(|row| TrashItem {
                kind: row.kind.to_owned(),
                id: row.id,
                label: row.label,
                deleted_at: row.deleted_at.to_rfc3339(),
            })
            .collect(),
    }))
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
    match kind.as_str() {
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
            note_write(&state, "update", id, version, receipt.last_seq, "");
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
    Ok(StatusCode::NO_CONTENT)
}
