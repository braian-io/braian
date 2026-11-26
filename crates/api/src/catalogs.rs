//! Catalog administration. Data routes under `/v1/catalogs/{key}/...` are
//! rewritten onto the existing handlers and scoped to that catalog.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use braian_model::{AttributeBounds, ModelChange};
use braian_store::{CatalogKind, ProposalRow};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::auth::{Auth, Identity, Role};
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
    Ok(Json(
        catalogs.iter().map(|catalog| catalog.to_json()).collect(),
    ))
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
) -> Result<(StatusCode, Json<Value>), Problem> {
    require(&identity, Role::Editor)?;
    let requested = CatalogKind::parse(&body.kind).map_err(store_status)?;
    if !valid_key(&body.key) {
        return Err(Problem::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "bad_key",
            "catalog key must be lowercase letters, digits and hyphens",
        ));
    }
    let existing = state
        .store
        .catalog_by_key(&body.key)
        .await
        .map_err(store_status)?;
    if requested == CatalogKind::Master
        && existing.as_ref().map(|row| row.kind) != Some(CatalogKind::Master)
    {
        return Err(Problem::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "master_exists",
            "the installation already has its master catalog",
        ));
    }
    let kind = existing.as_ref().map(|row| row.kind).unwrap_or(requested);
    let editable = if kind == CatalogKind::Master {
        existing.as_ref().map(|row| row.editable).unwrap_or(false)
    } else {
        body.editable
    };
    let step = ModelChange::UpsertCatalog {
        catalog: Box::new(braian_model::Catalog {
            key: body.key.clone(),
            renamed_from: None,
            name: body.name.clone(),
            kind: match kind {
                CatalogKind::Master => braian_model::CatalogKind::Master,
                CatalogKind::Source => braian_model::CatalogKind::Source,
            },
            editable,
        }),
    };
    // The same path as the catalogs table: a person's draft, or a proposal
    // when the caller is not a person. The catalog row is not written here.
    if identity.kind == braian_store::PrincipalKind::Human {
        let draft = crate::model_draft::stage_changes(&state, &identity, vec![step]).await?;
        return Ok((
            StatusCode::ACCEPTED,
            Json(json!({
                "applied": false,
                "staged": true,
                "draft": draft,
            })),
        ));
    }
    let defs = state.store.definition_set().await.map_err(store_status)?;
    let proposed = crate::model_proposal::file_model_proposal(
        &state,
        &identity,
        vec![step],
        &defs,
        Some(&format!("Save catalog {}", body.key)),
        &json!({}),
    )
    .await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(json!({
            "applied": false,
            "staged": false,
            "proposal_id": proposed["proposal_id"],
            "needs_approval": true,
        })),
    ))
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
    if identity.kind != braian_store::PrincipalKind::Human {
        return Err(Problem::new(
            StatusCode::FORBIDDEN,
            "human_required",
            "a person reviews inferred attributes",
        ));
    }
    let known: std::collections::BTreeSet<String> = state
        .store
        .definition_set()
        .await
        .map(|defs| {
            defs.attributes
                .iter()
                .map(|attribute| attribute.key.clone())
                .collect()
        })
        .unwrap_or_default();
    let revision = state
        .store
        .model_revision()
        .await
        .map_err(store_status)?
        .unwrap_or(0);
    let heads = state
        .store
        .list_object_heads(200)
        .await
        .map_err(store_status)?;
    let ids: Vec<braian_model::ObjectId> = heads
        .iter()
        .map(|(id, _, _, _)| braian_model::ObjectId::from_uuid(*id))
        .collect();
    let stored = state.store.get_objects(&ids).await.map_err(store_status)?;
    let mut samples: std::collections::BTreeMap<String, Vec<serde_json::Value>> =
        std::collections::BTreeMap::new();
    if let Ok(defs) = state.store.definition_set().await {
        let model = braian_rules::CompiledModel::compile(&defs)
            .map_err(crate::problem::Problem::definitions)?;
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
        steps.push(ModelChange::CreateAttribute {
            key: key.clone(),
            label: key.clone(),
            description: None,
            kind: infer_kind(values).to_owned(),
            unit: None,
            multiple: false,
            languages: false,
            required: false,
            show_by_default: true,
            searchable: false,
            filterable: true,
            sortable: false,
            bounds: AttributeBounds::default(),
        });
    }
    if steps.is_empty() {
        return Ok(Json(json!({
            "applied": false,
            "steps": [],
            "proposal_id": Value::Null,
            "base_revision": revision,
        })));
    }
    let defs = state.store.definition_set().await.map_err(store_status)?;
    let proposed = crate::model_proposal::file_model_proposal(
        &state,
        &identity,
        steps,
        &defs,
        Some("Infer model"),
        &json!({}),
    )
    .await?;
    Ok(Json(json!({
        "applied": false,
        "needs_approval": true,
        "proposal_id": proposed["proposal_id"],
        "steps": proposed["rows"],
        "base_revision": revision,
    })))
}

pub async fn cleanup_catalog(
    State(state): State<AppState>,
    Auth(identity): Auth,
) -> Result<Json<Value>, Problem> {
    require(&identity, Role::Editor)?;
    if identity.kind != braian_store::PrincipalKind::Human {
        return Err(Problem::new(
            StatusCode::FORBIDDEN,
            "human_required",
            "a person runs merge and catalog cleanup",
        ));
    }
    propose_cleanup(&state, &identity).await.map(Json)
}

/// Files a proposal that soft-deletes every object in the scoped source catalog.
/// The objects stay until the proposal is approved.
pub async fn propose_cleanup(state: &AppState, identity: &Identity) -> Result<Value, Problem> {
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
    let heads = state
        .store
        .list_object_heads(500)
        .await
        .map_err(store_status)?;
    if heads.is_empty() {
        return Ok(json!({
            "applied": false,
            "removed": 0,
            "objects": 0,
            "proposal_id": Value::Null,
        }));
    }
    let proposal_id = Uuid::now_v7();
    let rows: Vec<ProposalRow> = heads
        .iter()
        .enumerate()
        .map(|(index, (id, key, _, version))| ProposalRow {
            id: Uuid::now_v7(),
            object_id: Some(*id),
            object_key: Some(key.clone()),
            type_key: None,
            base_version: Some(*version),
            patch: json!({ "op": "delete" }),
            status: "pending".into(),
            conflict: false,
            position: i32::try_from(index).unwrap_or(0),
        })
        .collect();
    let title = format!("Clean up {}", catalog.key);
    state
        .store
        .create_proposal(
            proposal_id,
            &title,
            "user",
            identity.actor.actor,
            identity.actor.on_behalf_of,
            false,
            &rows,
        )
        .await
        .map_err(store_status)?;
    Ok(json!({
        "applied": false,
        "removed": 0,
        "objects": rows.len(),
        "needs_approval": true,
        "proposal_id": proposal_id,
        "title": title,
    }))
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
    if samples
        .iter()
        .all(|value| value.is_number() || value.get("value").is_some())
    {
        return "number";
    }
    if samples.iter().all(|value| {
        value.as_str().is_some_and(|text| {
            text.len() == 10
                && text.as_bytes().get(4) == Some(&b'-')
                && text.as_bytes().get(7) == Some(&b'-')
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
