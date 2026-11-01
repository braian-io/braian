//! Catalog administration. Data routes under `/v1/catalogs/{key}/...` are
//! rewritten onto the existing handlers and scoped to that catalog.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use braian_store::{CatalogId, CatalogKind};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::{Auth, Role};
use crate::platform::require;
use crate::problem::{Problem, store_status};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct CreateCatalog {
    pub key: String,
    pub name: String,
    #[serde(default = "source_kind")]
    pub kind: String,
    #[serde(default = "default_editable")]
    pub editable: bool,
}

fn source_kind() -> String {
    "source".into()
}

fn default_editable() -> bool {
    true
}

pub async fn list_catalogs(
    State(state): State<AppState>,
    Auth(identity): Auth,
) -> Result<Json<Vec<serde_json::Value>>, Problem> {
    require(&identity, Role::Viewer)?;
    let catalogs = state.store.catalogs().await.map_err(store_status)?;
    Ok(Json(catalogs.iter().map(|catalog| catalog.to_json()).collect()))
}

pub async fn get_catalog(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Path(key): Path<String>,
) -> Result<Json<serde_json::Value>, Problem> {
    require(&identity, Role::Viewer)?;
    let catalog = state
        .store
        .require_catalog(&key)
        .await
        .map_err(store_status)?;
    Ok(Json(catalog.to_json()))
}

pub async fn post_catalog(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Json(body): Json<CreateCatalog>,
) -> Result<(StatusCode, Json<serde_json::Value>), Problem> {
    require(&identity, Role::Editor)?;
    let kind = CatalogKind::parse(&body.kind).map_err(store_status)?;
    if kind == CatalogKind::Master {
        return Err(Problem::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "master_exists",
            "the installation already has its master catalog",
        ));
    }
    if !valid_key(&body.key) {
        return Err(Problem::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "bad_key",
            "catalog key must be lowercase letters, digits and hyphens",
        ));
    }
    let catalog = state
        .store
        .create_catalog(
            CatalogId::from_uuid(Uuid::now_v7()),
            &body.key,
            &body.name,
            kind,
            body.editable,
        )
        .await
        .map_err(store_status)?;
    Ok((StatusCode::CREATED, Json(catalog.to_json())))
}

#[derive(serde::Deserialize, Default)]
pub struct InferBody {
    #[serde(default)]
    pub headers: Vec<String>,
    #[serde(default)]
    pub samples: std::collections::BTreeMap<String, Vec<serde_json::Value>>,
}

pub async fn infer_model(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Json(body): Json<InferBody>,
) -> Result<Json<serde_json::Value>, Problem> {
    require(&identity, Role::Editor)?;
    let Some(user_id) = identity.user_id else {
        return Err(Problem::new(
            StatusCode::FORBIDDEN,
            "human_required",
            "a person saves the model draft",
        ));
    };
    let known: std::collections::BTreeSet<String> = state
        .store
        .definition_set()
        .await
        .map(|defs| defs.attributes.iter().map(|attribute| attribute.key.clone()).collect())
        .unwrap_or_default();
    let revision = state
        .store
        .model_revision()
        .await
        .map_err(store_status)?
        .unwrap_or(0);
    let heads = state.store.list_object_heads(200).await.map_err(store_status)?;
    let ids: Vec<braian_model::ObjectId> = heads
        .iter()
        .map(|(id, _, _, _)| braian_model::ObjectId::from_uuid(*id))
        .collect();
    let stored = state.store.get_objects(&ids).await.map_err(store_status)?;
    let mut samples: std::collections::BTreeMap<String, Vec<serde_json::Value>> = std::collections::BTreeMap::new();
    if let Ok(defs) = state.store.definition_set().await {
        let model = braian_rules::CompiledModel::compile(&defs).map_err(crate::problem::Problem::definitions)?;
        for object in &stored {
            let wire = crate::wire::values_to_wire(&model, &[], &object.object.values, true);
            for (key, value) in wire {
                samples.entry(key).or_default().push(value);
            }
        }
    }
    for (header, values) in &body.samples {
        if let Some(key) = attribute_key(header) {
            samples.entry(key).or_default().extend(values.clone());
        }
    }
    for header in &body.headers {
        if let Some(key) = attribute_key(header) {
            samples.entry(key).or_default();
        }
    }
    let mut steps = Vec::new();
    for (key, values) in &samples {
        if known.contains(key) {
            continue;
        }
        steps.push(serde_json::json!({
            "op": "create_attribute",
            "key": key,
            "label": key,
            "kind": infer_kind(values),
        }));
    }
    state
        .store
        .put_model_draft(user_id, i64::try_from(revision).unwrap_or(0), &serde_json::Value::Array(steps.clone()))
        .await
        .map_err(store_status)?;
    Ok(Json(serde_json::json!({ "steps": steps, "base_revision": revision })))
}

pub async fn cleanup_catalog(
    State(state): State<AppState>,
    Auth(identity): Auth,
) -> Result<Json<serde_json::Value>, Problem> {
    require(&identity, Role::Editor)?;
    let catalog = state
        .store
        .catalog_by_id(state.store.catalog_id())
        .await
        .map_err(store_status)?
        .ok_or_else(|| Problem::new(StatusCode::NOT_FOUND, "catalog_not_found", "catalog"))?;
    if catalog.kind != CatalogKind::Source {
        return Err(Problem::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "not_a_source",
            "cleanup removes objects from a source catalog",
        ));
    }
    let mut actor = identity.actor.clone();
    actor.source = "cleanup".into();
    let removed = cleanup_objects(&state.store, &actor, &catalog.key).await?;
    Ok(Json(serde_json::json!({ "removed": removed })))
}

pub async fn cleanup_objects(
    store: &braian_store::Store,
    actor: &braian_store::Actor,
    catalog_key: &str,
) -> Result<u64, Problem> {
    let heads = store.list_object_heads(500).await.map_err(store_status)?;
    let origin = serde_json::json!({ "cleanup": true, "catalog": catalog_key }).to_string();
    let mut removed = 0u64;
    for (id, _, _, version) in heads {
        let op = braian_store::ObjectOp::Delete {
            id: braian_model::ObjectId::from_uuid(id),
            base_version: u64::try_from(version).ok(),
        };
        braian_store::scope_origin(origin.clone(), store.write_batch(actor, vec![op]))
            .await
            .map_err(store_status)?;
        removed += 1;
    }
    Ok(removed)
}

fn attribute_key(raw: &str) -> Option<String> {
    let key: String = raw
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '_')
        .flat_map(|ch| ch.to_lowercase())
        .collect();
    if key.is_empty() { None } else { Some(key) }
}

pub(crate) fn infer_kind(samples: &[serde_json::Value]) -> &'static str {
    if samples.is_empty() {
        return "text";
    }
    if samples.iter().all(serde_json::Value::is_boolean) {
        return "boolean";
    }
    if samples.iter().all(|value| value.is_number() || value.get("value").is_some()) {
        return "number";
    }
    if samples.iter().all(|value| {
        value.as_str().is_some_and(|text| {
            text.len() == 10 && text.as_bytes().get(4) == Some(&b'-') && text.as_bytes().get(7) == Some(&b'-')
        })
    }) {
        return "date";
    }
    let texts: Vec<&str> = samples.iter().filter_map(|value| value.as_str()).collect();
    if texts.len() == samples.len() && texts.len() >= 4 {
        let distinct: std::collections::BTreeSet<&str> = texts.iter().copied().collect();
        if distinct.len() <= 12 {
            return "text";
        }
    }
    "text"
}

fn valid_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 64
        && key
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
}
