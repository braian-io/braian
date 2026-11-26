//! Saved column mappings: shared by everyone who can import, reused when the headers match.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use braian_store::PrincipalId;
use chrono::Utc;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use super::mapping::ManualLine;
use super::{load, require};
use crate::auth::{Auth, Identity, Role};
use crate::problem::{Problem, store_status};
use crate::state::AppState;

/// Header names of a file, normalised and sorted. Two files with the same set of
/// headers get the same signature, whatever the column order.
pub fn signature(headers: &Value) -> String {
    let mut names: Vec<String> = headers
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|header| header.get("name").and_then(Value::as_str))
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .collect();
    names.sort();
    names.join("\n")
}

/// What to reuse for a new file: the type, the key column and a manual line per column.
pub struct Reuse {
    pub id: Uuid,
    pub type_key: String,
    pub id_column: Option<Option<usize>>,
    pub lines: Vec<ManualLine>,
    pub name: String,
}

/// Column lines for one saved mapping against this file's headers.
pub fn reuse_of(saved: &braian_store::SavedMapping, headers: &Value) -> Reuse {
    let index_of = |name: &str| -> Option<usize> {
        headers.as_array()?.iter().find_map(|header| {
            (header.get("name").and_then(Value::as_str) == Some(name))
                .then(|| header.get("index").and_then(Value::as_u64))
                .flatten()
                .map(|index| index as usize)
        })
    };
    let lines = saved
        .mapping
        .get("columns")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|column| {
            let name = column.get("header")?.as_str()?;
            Some(ManualLine {
                col: index_of(name)?,
                target: column.get("target")?.as_str()?.to_owned(),
            })
        })
        .collect();
    let id_column = match saved.mapping.get("id_header").and_then(Value::as_str) {
        Some(name) => Some(index_of(name)),
        None => Some(None),
    };
    Reuse {
        id: saved.id,
        type_key: saved.type_key.clone(),
        id_column,
        lines,
        name: saved.name.clone(),
    }
}

/// The mapping that fits these headers exactly, if one was saved.
pub async fn find_for(state: &AppState, headers: &Value) -> Option<Reuse> {
    let signature = signature(headers);
    if signature.is_empty() {
        return None;
    }
    let saved = state
        .store
        .mappings_for_signature(&signature)
        .await
        .ok()?
        .into_iter()
        .next()?;
    Some(reuse_of(&saved, headers))
}

fn may_change(identity: &Identity, created_by: Uuid) -> bool {
    identity.role == Role::Admin || identity.actor.actor.as_uuid() == created_by
}

fn actor_label(identity: &Identity) -> String {
    identity
        .display_name
        .clone()
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| identity.handle.clone())
}

fn view(saved: &braian_store::SavedMapping, created_by: &str, can_edit: bool) -> Value {
    json!({
        "id": saved.id,
        "name": saved.name,
        "type": saved.type_key,
        "headers": saved.headers,
        "columns": saved.mapping.get("columns").cloned().unwrap_or(Value::Null),
        "empty_clears": saved.mapping.get("empty_clears").and_then(Value::as_bool).unwrap_or(false),
        "id_header": saved.mapping.get("id_header").and_then(Value::as_str),
        "header_signature": saved.header_signature,
        "created_by": created_by,
        "created_by_id": saved.created_by,
        "created_at": saved.created_at.to_rfc3339(),
        "updated_at": saved.updated_at.to_rfc3339(),
        "can_edit": can_edit,
    })
}

async fn names_of(
    state: &AppState,
    items: &[braian_store::SavedMapping],
) -> Result<HashMap<Uuid, String>, Problem> {
    if items.is_empty() {
        return Ok(HashMap::new());
    }
    let ids: Vec<PrincipalId> = items
        .iter()
        .map(|item| PrincipalId::from_uuid(item.created_by))
        .collect();
    let records = state.store.principals(&ids).await.map_err(store_status)?;
    let mut names = HashMap::new();
    for record in records {
        let label = if record.name.is_empty() {
            record
                .handle
                .filter(|handle| !handle.is_empty())
                .unwrap_or_else(|| record.id.as_uuid().to_string())
        } else {
            record.name
        };
        names.insert(record.id.as_uuid(), label);
    }
    Ok(names)
}

/// Records which saved mapping the open import is using, without remapping columns.
pub async fn stamp_proposal(
    state: &AppState,
    id: Uuid,
    saved: Option<(Uuid, &str)>,
) -> Result<(), Problem> {
    let Some(session) = state.store.import_session(id).await.map_err(store_status)? else {
        return Err(Problem::new(
            StatusCode::NOT_FOUND,
            "not_found",
            "That import does not exist.",
        ));
    };
    let mut proposal = session.proposal.clone().unwrap_or_else(|| json!({}));
    let Some(object) = proposal.as_object_mut() else {
        return Ok(());
    };
    match saved {
        Some((mapping_id, name)) => {
            object.insert("saved_mapping".into(), json!(mapping_id));
            object.insert("ai".into(), json!(format!("saved: {name}")));
        }
        None => {
            object.remove("saved_mapping");
            if object
                .get("ai")
                .and_then(Value::as_str)
                .is_some_and(|text| text.starts_with("saved:"))
            {
                object.insert("ai".into(), json!("deterministic"));
            }
        }
    }
    state
        .store
        .update_import_proposal(id, &proposal, &session.decisions_usage, &session.status)
        .await
        .map_err(store_status)?;
    Ok(())
}

async fn load_saved(state: &AppState, id: Uuid) -> Result<braian_store::SavedMapping, Problem> {
    state
        .store
        .import_mapping(id)
        .await
        .map_err(store_status)?
        .ok_or_else(|| {
            Problem::new(
                StatusCode::NOT_FOUND,
                "not_found",
                "That mapping does not exist.",
            )
        })
}

pub async fn list(
    State(state): State<AppState>,
    Auth(identity): Auth,
) -> Result<Json<Value>, Problem> {
    require(&identity, Role::Viewer)?;
    let items = state
        .store
        .list_import_mappings()
        .await
        .map_err(store_status)?;
    let names = names_of(&state, &items).await?;
    Ok(Json(json!({
        "mappings": items.iter().map(|item| {
            let label = names.get(&item.created_by).map(String::as_str).unwrap_or("");
            view(item, label, may_change(&identity, item.created_by))
        }).collect::<Vec<_>>()
    })))
}

#[derive(Deserialize)]
pub struct SaveBody {
    pub session_id: Uuid,
    pub name: String,
}

pub async fn create(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Json(body): Json<SaveBody>,
) -> Result<(StatusCode, Json<Value>), Problem> {
    require(&identity, Role::Editor)?;
    let name = body.name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(Problem::new(
            StatusCode::BAD_REQUEST,
            "invalid_name",
            "Give the mapping a name of 1 to 120 characters.",
        ));
    }
    let session = load(&state, &identity, body.session_id).await?;
    let Some(mapping) = session.mapping.clone() else {
        return Err(Problem::new(
            StatusCode::CONFLICT,
            "not_ready",
            "Save needs a mapping.",
        ));
    };
    let headers = session.headers.as_array().cloned().unwrap_or_default();
    let name_of = |col: u64| -> Option<String> {
        headers.iter().find_map(|header| {
            (header.get("index").and_then(Value::as_u64) == Some(col))
                .then(|| {
                    header
                        .get("name")
                        .and_then(Value::as_str)
                        .map(str::to_owned)
                })
                .flatten()
        })
    };
    let columns: Vec<Value> = mapping
        .get("columns")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|column| {
            let target = column.get("target")?.as_str()?;
            if target == "unmapped" {
                return None;
            }
            let header = name_of(column.get("col")?.as_u64()?)?;
            Some(json!({ "header": header, "target": target }))
        })
        .collect();
    let id_header = mapping
        .get("id_column")
        .and_then(Value::as_u64)
        .and_then(name_of);
    let type_key = mapping
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let stored = json!({
        "columns": columns,
        "id_header": id_header,
        "empty_clears": mapping.get("empty_clears").and_then(Value::as_bool).unwrap_or(false),
    });
    let now = Utc::now();
    let saved = braian_store::SavedMapping {
        id: Uuid::now_v7(),
        name: name.to_owned(),
        type_key,
        header_signature: signature(&session.headers),
        headers: json!(
            headers
                .iter()
                .filter_map(|header| header.get("raw").cloned())
                .collect::<Vec<_>>()
        ),
        mapping: stored,
        created_by: identity.actor.actor.as_uuid(),
        created_at: now,
        updated_at: now,
    };
    state
        .store
        .save_import_mapping(&saved)
        .await
        .map_err(store_status)?;
    stamp_proposal(
        &state,
        body.session_id,
        Some((saved.id, saved.name.as_str())),
    )
    .await?;
    Ok((
        StatusCode::CREATED,
        Json(view(&saved, &actor_label(&identity), true)),
    ))
}

#[derive(Deserialize)]
pub struct RenameBody {
    pub name: String,
}

pub async fn rename(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Path(id): Path<Uuid>,
    Json(body): Json<RenameBody>,
) -> Result<StatusCode, Problem> {
    require(&identity, Role::Editor)?;
    let saved = load_saved(&state, id).await?;
    if !may_change(&identity, saved.created_by) {
        return Err(Problem::new(
            StatusCode::FORBIDDEN,
            "forbidden",
            "Only the person who saved this mapping, or an admin, can change it.",
        ));
    }
    let name = body.name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(Problem::new(
            StatusCode::BAD_REQUEST,
            "invalid_name",
            "Give the mapping a name of 1 to 120 characters.",
        ));
    }
    let found = state
        .store
        .rename_import_mapping(id, name)
        .await
        .map_err(store_status)?;
    if found {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(Problem::new(
            StatusCode::NOT_FOUND,
            "not_found",
            "That mapping does not exist.",
        ))
    }
}

pub async fn remove(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, Problem> {
    require(&identity, Role::Editor)?;
    let saved = load_saved(&state, id).await?;
    if !may_change(&identity, saved.created_by) {
        return Err(Problem::new(
            StatusCode::FORBIDDEN,
            "forbidden",
            "Only the person who saved this mapping, or an admin, can change it.",
        ));
    }
    let found = state
        .store
        .delete_import_mapping(id)
        .await
        .map_err(store_status)?;
    if found {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(Problem::new(
            StatusCode::NOT_FOUND,
            "not_found",
            "That mapping does not exist.",
        ))
    }
}
