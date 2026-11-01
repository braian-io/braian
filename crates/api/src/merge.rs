//! Merge profiles. A run writes the attributes the profile owns.
//! It does not file a proposal.

use std::collections::BTreeMap;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use braian_merge::{MatchOutcome, MergePlan, ProfileSpec, plan};
use braian_model::{DefinitionSet, Object, ObjectId, TypeId};
use braian_rules::CompiledModel;
use braian_store::{Actor, MASTER_CATALOG_ID, MergeProfile, ObjectOp, Store, scope_origin};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use uuid::Uuid;

use crate::auth::{Auth, Role};
use crate::platform::require;
use crate::problem::{Problem, store_status};
use crate::state::AppState;
use crate::wire::{
    create_values, patch_from_wire, resolve_group, resolve_structure, type_key, values_to_wire,
};

const PAGE: i64 = 500;

#[derive(Deserialize)]
pub struct PutProfile {
    pub key: String,
    pub name: String,
    pub source_catalog: String,
    pub spec: Value,
    #[serde(default = "manual_mode")]
    pub mode: String,
    #[serde(default)]
    pub schedule: Option<String>,
}

fn manual_mode() -> String {
    "manual".into()
}

#[derive(Deserialize)]
pub struct LinkBody {
    pub profile: String,
    pub source_object_id: Uuid,
    pub master_object_id: Uuid,
}

#[derive(Deserialize)]
pub struct UnlinkBody {
    pub profile: String,
    pub source_object_id: Uuid,
}

#[derive(Deserialize)]
pub struct RunBody {
    #[serde(default = "dry_by_default")]
    pub dry_run: bool,
}

fn dry_by_default() -> bool {
    true
}

pub async fn list_profiles(
    State(state): State<AppState>,
    Auth(identity): Auth,
) -> Result<Json<Vec<Value>>, Problem> {
    require(&identity, Role::Viewer)?;
    let profiles = state.store.merge_profiles().await.map_err(store_status)?;
    Ok(Json(profiles.iter().map(profile_json).collect()))
}

pub async fn post_profile(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Json(body): Json<PutProfile>,
) -> Result<(StatusCode, Json<Value>), Problem> {
    require(&identity, Role::Editor)?;
    let spec: ProfileSpec = serde_json::from_value(body.spec.clone()).map_err(|error| {
        Problem::new(
            StatusCode::BAD_REQUEST,
            "invalid_profile",
            error.to_string(),
        )
    })?;
    spec.check().map_err(|error| {
        Problem::new(
            StatusCode::BAD_REQUEST,
            "invalid_profile",
            error.to_string(),
        )
    })?;
    if body.mode != "manual" && body.mode != "continuous" {
        return Err(Problem::new(
            StatusCode::BAD_REQUEST,
            "invalid_profile",
            "mode is manual or continuous",
        ));
    }
    let source = state
        .store
        .require_catalog(&body.source_catalog)
        .await
        .map_err(store_status)?;
    if source.kind != braian_store::CatalogKind::Source {
        return Err(Problem::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "not_a_source",
            "a profile reads a source catalog",
        ));
    }
    let saved = state
        .store
        .put_merge_profile(
            Uuid::now_v7(),
            &body.key,
            &body.name,
            source.id,
            &body.spec,
            &body.mode,
        )
        .await
        .map_err(store_status)?;
    if let Some(schedule) = body
        .schedule
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        state
            .store
            .set_profile_schedule(&saved.key, Some(schedule))
            .await
            .map_err(store_status)?;
    }
    Ok((StatusCode::CREATED, Json(profile_json(&saved))))
}

pub async fn post_link(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Json(body): Json<LinkBody>,
) -> Result<Json<Value>, Problem> {
    require(&identity, Role::Editor)?;
    let profile = require_profile(&state.store, &body.profile).await?;
    state
        .store
        .put_manual_link(profile.id, body.source_object_id, body.master_object_id)
        .await
        .map_err(store_status)?;
    Ok(Json(json!({ "linked": true })))
}

pub async fn remove_link(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Json(body): Json<UnlinkBody>,
) -> Result<Json<Value>, Problem> {
    require(&identity, Role::Editor)?;
    let profile = require_profile(&state.store, &body.profile).await?;
    let removed = state
        .store
        .delete_merge_link(profile.id, body.source_object_id)
        .await
        .map_err(store_status)?;
    Ok(Json(json!({ "removed": removed })))
}

pub async fn get_ownership(
    State(state): State<AppState>,
    Auth(identity): Auth,
) -> Result<Json<Value>, Problem> {
    require(&identity, Role::Viewer)?;
    Ok(Json(
        state.store.ownership_rules().await.map_err(store_status)?,
    ))
}

pub async fn post_ownership(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Json(rules): Json<Value>,
) -> Result<Json<Value>, Problem> {
    require(&identity, Role::Editor)?;
    if !rules.is_array() {
        return Err(Problem::new(
            StatusCode::BAD_REQUEST,
            "invalid_ownership",
            "ownership rules are a list",
        ));
    }
    let revision = state
        .store
        .put_ownership_rules(&rules)
        .await
        .map_err(store_status)?;
    Ok(Json(json!({ "revision": revision, "rules": rules })))
}

pub async fn run_profile(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Path(key): Path<String>,
    Json(body): Json<RunBody>,
) -> Result<Json<Value>, Problem> {
    require(&identity, Role::Editor)?;
    let mut actor = identity.actor.clone();
    actor.source = "merge".into();
    Ok(Json(
        apply_profile(&state.store, &actor, &key, body.dry_run).await?,
    ))
}

pub async fn profile_rows(
    State(state): State<AppState>,
    Auth(identity): Auth,
    Path(key): Path<String>,
) -> Result<Json<Vec<Value>>, Problem> {
    require(&identity, Role::Viewer)?;
    let profile = require_profile(&state.store, &key).await?;
    Ok(Json(
        state
            .store
            .merge_run_rows(profile.id, 200)
            .await
            .map_err(store_status)?,
    ))
}

/// Plans every source object against the master and, unless `dry_run`, writes
/// the owned attributes. At most [`PAGE`] objects on each side.
pub async fn apply_profile(
    store: &Store,
    actor: &Actor,
    key: &str,
    dry_run: bool,
) -> Result<Value, Problem> {
    let profile = require_profile(store, key).await?;
    let spec: ProfileSpec = serde_json::from_value(profile.spec.clone()).map_err(|error| {
        Problem::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "invalid_profile",
            error.to_string(),
        )
    })?;
    let source_store = store.with_catalog(profile.source_catalog_id);
    let master_store = store.with_catalog(MASTER_CATALOG_ID);
    let (source_model, source_defs) = load_model(&source_store).await?;
    let (master_model, master_defs) = load_model(&master_store).await?;
    let sources = load_wire(&source_store, &source_model, &source_defs).await?;
    let masters = load_wire(&master_store, &master_model, &master_defs).await?;
    let index = master_index(&masters, &spec.master_key);
    let mut rows = Vec::new();
    for source in &sources {
        let source_group = spec
            .structure
            .as_deref()
            .and_then(|structure| source.groups.get(structure))
            .map(String::as_str);
        let planned = plan(&spec, &source.values, source_group, source.deleted, &index);
        let may_create = spec
            .owns_existence_for
            .iter()
            .any(|item| item == &source.type_key);
        let action = if planned.create && !may_create {
            "skip"
        } else {
            action_of(&planned)
        };
        let mut master_key = match &planned.outcome {
            MatchOutcome::One { master_key } => Some(master_key.clone()),
            _ => None,
        };
        let mut write_error = None;
        let write = MergeWrite {
            master: &master_store,
            model: &master_model,
            defs: &master_defs,
            actor,
            profile: &profile,
            spec: &spec,
            source,
            planned: &planned,
        };
        if !dry_run && planned.errors.is_empty() {
            if planned.create && may_create {
                if let Err(message) = create_master(&write).await {
                    write_error = Some(message);
                } else if let Some(text) =
                    source.values.get(&spec.master_key).and_then(Value::as_str)
                {
                    master_key = Some(text.to_owned());
                }
            } else if !planned.create {
                apply_one(&write, master_key.as_deref()).await?;
            }
        }
        let mut errors: Vec<Value> = planned
            .errors
            .iter()
            .map(|error| json!({ "attribute": error.attribute, "message": error.message }))
            .collect();
        if let Some(message) = &write_error {
            errors.push(json!({ "attribute": spec.master_key, "message": message }));
        }
        let detail = json!({
            "values": planned.values,
            "group": planned.group,
            "errors": errors,
            "dry_run": dry_run,
        });
        store
            .record_merge_row(
                profile.id,
                &source.key,
                master_key.as_deref(),
                action,
                &detail,
            )
            .await
            .map_err(store_status)?;
        rows.push(json!({
            "source_key": source.key,
            "master_key": master_key,
            "action": action,
            "detail": detail,
        }));
    }
    Ok(json!({
        "profile": profile.key,
        "dry_run": dry_run,
        "rows": rows,
    }))
}

struct WireObject {
    id: ObjectId,
    key: String,
    type_key: String,
    values: Map<String, Value>,
    /// Structure key to the source object's group key.
    groups: BTreeMap<String, String>,
    deleted: bool,
}

async fn require_profile(store: &Store, key: &str) -> Result<MergeProfile, Problem> {
    store
        .merge_profile_by_key(key)
        .await
        .map_err(store_status)?
        .ok_or_else(|| {
            Problem::new(
                StatusCode::NOT_FOUND,
                "profile_not_found",
                format!("no profile {key}"),
            )
        })
}

async fn load_model(store: &Store) -> Result<(CompiledModel, DefinitionSet), Problem> {
    let defs = store.definition_set().await.map_err(store_status)?;
    let model = CompiledModel::compile(&defs).map_err(Problem::definitions)?;
    Ok((model, defs))
}

async fn load_wire(
    store: &Store,
    model: &CompiledModel,
    defs: &DefinitionSet,
) -> Result<Vec<WireObject>, Problem> {
    let heads = store.list_object_heads(PAGE).await.map_err(store_status)?;
    let ids: Vec<ObjectId> = heads
        .iter()
        .map(|(id, _, _, _)| ObjectId::from_uuid(*id))
        .collect();
    let stored = store.get_objects(&ids).await.map_err(store_status)?;
    let mut out = Vec::with_capacity(stored.len());
    for object in stored {
        let values = values_to_wire(model, &[], &object.object.values, true);
        out.push(WireObject {
            id: object.object.id,
            key: object.key,
            type_key: type_key(defs, object.object.type_id),
            values: values.into_iter().collect(),
            groups: placement(defs, &object.object.groups),
            deleted: object.deleted_at.is_some(),
        });
    }
    Ok(out)
}

fn placement(
    defs: &DefinitionSet,
    groups: &BTreeMap<braian_model::StructureId, braian_model::GroupId>,
) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for (structure_id, group_id) in groups {
        let Some(structure) = defs.structures.iter().find(|item| item.id == *structure_id) else {
            continue;
        };
        let Some(group) = structure.groups.iter().find(|item| item.id == *group_id) else {
            continue;
        };
        out.insert(structure.key.clone(), group.key.clone());
    }
    out
}

fn master_index(masters: &[WireObject], attribute: &str) -> BTreeMap<String, Vec<String>> {
    let mut index: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for object in masters {
        let Some(text) = object.values.get(attribute).and_then(scalar) else {
            continue;
        };
        if text.is_empty() {
            continue;
        }
        index.entry(text).or_default().push(object.key.clone());
    }
    index
}

fn scalar(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        Value::Object(object) => object.values().find_map(scalar),
        _ => None,
    }
}

fn action_of(planned: &MergePlan) -> &'static str {
    if planned.delete {
        "delete"
    } else if planned.clear_owned {
        "clear"
    } else if planned.create {
        "create"
    } else if matches!(planned.outcome, MatchOutcome::Ambiguous { .. }) {
        "ambiguous"
    } else if matches!(planned.outcome, MatchOutcome::None) {
        "skip"
    } else {
        "update"
    }
}

struct MergeWrite<'a> {
    master: &'a Store,
    model: &'a CompiledModel,
    defs: &'a DefinitionSet,
    actor: &'a Actor,
    profile: &'a MergeProfile,
    spec: &'a ProfileSpec,
    source: &'a WireObject,
    planned: &'a MergePlan,
}

async fn create_master(write: &MergeWrite<'_>) -> Result<(), String> {
    let MergeWrite {
        master,
        model,
        defs,
        actor,
        profile,
        spec,
        source,
        planned,
    } = write;
    let mut values = Map::new();
    for (key, value) in &source.values {
        if value.is_null() || model.attribute_by_key(key).is_none() {
            continue;
        }
        values.insert(key.clone(), value.clone());
    }
    for (key, value) in &planned.values {
        if !value.is_null() {
            values.insert(key.clone(), value.clone());
        }
    }
    let wire: BTreeMap<String, Value> = values.into_iter().collect();
    let stored_values = create_values(model, &wire).map_err(|error| error.detail.clone())?;
    let mut groups = BTreeMap::new();
    if let (Some(structure), Some(group)) = (&spec.structure, &planned.group) {
        let structure_id =
            resolve_structure(model, defs, structure).map_err(|error| error.detail.clone())?;
        let group_id =
            resolve_group(defs, structure_id, group).map_err(|error| error.detail.clone())?;
        groups.insert(structure_id, group_id);
    }
    let type_id = model
        .type_id(&source.type_key)
        .ok_or_else(|| format!("master has no type {}", source.type_key))?;
    let object = Object {
        id: ObjectId::from_uuid(Uuid::now_v7()),
        type_id,
        model_revision: defs.model_revision,
        groups,
        values: stored_values,
    };
    let errors = model.validate(&object);
    if !errors.is_empty() {
        return Err(errors[0].message.clone());
    }
    let origin = origin_json(profile, source);
    scope_origin(
        origin,
        master.write_batch(actor, vec![ObjectOp::Create(object.clone())]),
    )
    .await
    .map_err(|error| error.to_string())?;
    master
        .put_merge_link(profile.id, source.id.as_uuid(), object.id.as_uuid())
        .await
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn mapped_groups(spec: &ProfileSpec, planned: &MergePlan) -> BTreeMap<String, Option<String>> {
    match (&spec.structure, &planned.group) {
        (Some(structure), Some(group)) => {
            BTreeMap::from([(structure.clone(), Some(group.clone()))])
        }
        _ => BTreeMap::new(),
    }
}

async fn apply_one(write: &MergeWrite<'_>, master_key: Option<&str>) -> Result<(), Problem> {
    let MergeWrite {
        master,
        model,
        defs,
        actor,
        profile,
        spec,
        source,
        planned,
    } = write;
    let Some(master_key) = master_key else {
        return Ok(());
    };
    let Some(found) = masters_of_type(master, planned, master_key).await? else {
        return Ok(());
    };
    let Some(stored) = master
        .get_by_key(found, master_key)
        .await
        .map_err(store_status)?
    else {
        return Ok(());
    };
    if planned.values.is_empty() || planned.delete {
        if planned.delete {
            let origin = origin_json(profile, source);
            scope_origin(
                origin,
                master.write_batch(
                    actor,
                    vec![ObjectOp::Delete {
                        id: stored.object.id,
                        base_version: Some(stored.version),
                    }],
                ),
            )
            .await
            .map_err(store_status)?;
        }
        return Ok(());
    }
    let values: BTreeMap<String, Value> = planned.values.clone().into_iter().collect();
    let patch = patch_from_wire(model, defs, &values, &mapped_groups(spec, planned))?;
    let origin = origin_json(profile, source);
    scope_origin(
        origin,
        master.write_batch(
            actor,
            vec![ObjectOp::Update {
                id: stored.object.id,
                patch,
                base_version: stored.version,
                read_version: stored.version,
            }],
        ),
    )
    .await
    .map_err(store_status)?;
    master
        .put_merge_link(profile.id, source.id.as_uuid(), stored.object.id.as_uuid())
        .await
        .map_err(store_status)?;
    Ok(())
}

/// The master object key is unique per type. The first type that has the key wins.
async fn masters_of_type(
    master: &Store,
    planned: &MergePlan,
    key: &str,
) -> Result<Option<TypeId>, Problem> {
    let _ = planned;
    let heads = master.list_object_heads(PAGE).await.map_err(store_status)?;
    Ok(heads
        .into_iter()
        .find(|(_, object_key, _, _)| object_key == key)
        .map(|(_, _, type_id, _)| TypeId::from_uuid(type_id)))
}

fn origin_json(profile: &MergeProfile, source: &WireObject) -> String {
    json!({
        "profile": profile.key,
        "profile_revision": profile.revision,
        "source_catalog": profile.source_catalog_id.as_uuid(),
        "source_object": source.id.as_uuid(),
        "source_key": source.key,
    })
    .to_string()
}

fn profile_json(profile: &MergeProfile) -> Value {
    json!({
        "id": profile.id,
        "key": profile.key,
        "name": profile.name,
        "source_catalog_id": profile.source_catalog_id.as_uuid(),
        "spec": profile.spec,
        "mode": profile.mode,
        "revision": profile.revision,
    })
}
