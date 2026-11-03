//! Export the stored model as config-as-code documents, and plan a change.

use std::io::{Cursor, Write};

use axum::Json;
use axum::body::{Body, Bytes};
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use braian_config::{
    ApiVersion, CatalogDocument, CatalogKind as CatalogDocumentKind, CatalogSourceKind,
    ConfigDocument, ConfigExtras, ConfigPlan, MergeModeConfig, MergeProfileDocument,
    MergeProfileKind, OwnershipDocument, OwnershipKind, OwnershipRuleConfig, PlanAction,
    PlanAffected, PlanKind, apply_documents_with, export_documents_with, plan_documents_with,
};
use braian_store::CatalogKind as StoreCatalogKind;
use serde::Deserialize;
use utoipa::ToSchema;

use crate::auth::Auth;
use crate::problem::{Problem, store_status};
use crate::state::AppState;

#[derive(Debug, Deserialize, ToSchema)]
pub struct ExportQuery {
    /// `zip`, `json` or `yaml`. Accept: application/json also selects JSON.
    #[serde(default)]
    pub format: Option<String>,
}

#[utoipa::path(
    get,
    path = "/v1/config/export",
    tag = "config",
    params(("format" = Option<String>, Query, description = "zip, json or yaml")),
    responses(
        (status = 200, description = "Config documents. YAML by default; JSON with Accept: application/json; ZIP with format=zip", body = crate::http_schema::JsonValue, content_type = "application/yaml"),
        (status = 400, description = "Unknown format", body = crate::problem::Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or unknown token", body = crate::problem::Problem, content_type = "application/problem+json")
    ),
    security(("bearer" = []))
)]
pub async fn export_config(
    State(state): State<AppState>,
    Auth(_): Auth,
    Query(query): Query<ExportQuery>,
    headers: HeaderMap,
) -> Result<Response, Problem> {
    let defs = state.store.definition_set().await.map_err(store_status)?;
    let extras = config_extras(&state).await?;
    let documents = export_documents_with(&defs, &extras).map_err(internal)?;

    match query.format.as_deref() {
        Some("zip") => zip_documents(&documents),
        Some("json") => json_documents(&documents),
        Some("yaml" | "yml") => yaml_documents(&documents),
        Some(other) => Err(Problem::new(
            StatusCode::BAD_REQUEST,
            "bad_request",
            format!("unknown config export format {other}"),
        )),
        None if wants_json(&headers) => json_documents(&documents),
        None => yaml_documents(&documents),
    }
}

#[utoipa::path(
    get,
    path = "/v1/config/schema",
    tag = "config",
    responses(
        (status = 200, description = "JSON Schema for config documents", body = crate::http_schema::JsonValue, content_type = "application/schema+json"),
        (status = 401, description = "Missing or unknown token", body = crate::problem::Problem, content_type = "application/problem+json")
    ),
    security(("bearer" = []))
)]
pub async fn get_config_schema(Auth(_): Auth) -> Result<Response, Problem> {
    let schema = serde_json::to_string(&braian_config::schema()).map_err(internal)?;
    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/schema+json")],
        schema,
    )
        .into_response())
}

#[utoipa::path(
    post,
    path = "/v1/config/plan",
    tag = "config",
    request_body(content = crate::http_schema::JsonValue, description = "One or more config documents as YAML (multi-doc) or JSON (object or array), optionally wrapped as { documents, allowDestructive }"),
    responses(
        (status = 200, description = "Every step. A destructive step is flagged blocked with affected counts.", body = crate::http_schema::JsonValue),
        (status = 400, description = "Malformed config documents", body = crate::problem::Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or unknown token", body = crate::problem::Problem, content_type = "application/problem+json")
    ),
    security(("bearer" = []))
)]
pub async fn plan_config(
    State(state): State<AppState>,
    Auth(_): Auth,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, Problem> {
    let (documents, _) = parse_documents(&headers, &body)?;
    if documents.is_empty() {
        return Err(Problem::new(
            StatusCode::BAD_REQUEST,
            "bad_body",
            "no config documents",
        ));
    }
    let defs = current_definitions(&state).await?;
    let extras = config_extras(&state).await?;
    let mut plan = plan_documents_with(&defs, &extras, &documents).map_err(invalid_config)?;
    fill_affected(&state, &mut plan).await?;
    for step in &mut plan.steps {
        step.blocked = step.destructive;
    }
    Ok((StatusCode::OK, Json(plan)).into_response())
}

#[utoipa::path(
    post,
    path = "/v1/config/apply",
    tag = "config",
    request_body(content = crate::http_schema::JsonValue, description = "One or more config documents as YAML (multi-doc) or JSON (object or array), optionally wrapped as { documents, allowDestructive }"),
    responses(
        (status = 202, description = "One proposal with the changes grouped by document kind", body = crate::http_schema::JsonValue),
        (status = 400, description = "Malformed config documents", body = crate::problem::Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or unknown token", body = crate::problem::Problem, content_type = "application/problem+json"),
        (status = 422, description = "The plan has destructive steps and allowDestructive is not set, or the documents do not compile", body = crate::http_schema::JsonValue)
    ),
    security(("bearer" = []))
)]
pub async fn apply_config(
    State(state): State<AppState>,
    Auth(identity): Auth,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, Problem> {
    let (documents, allow_destructive) = parse_documents(&headers, &body)?;
    if documents.is_empty() {
        return Err(Problem::new(
            StatusCode::BAD_REQUEST,
            "bad_body",
            "no config documents",
        ));
    }
    let defs = current_definitions(&state).await?;
    let extras = config_extras(&state).await?;
    let mut application =
        apply_documents_with(&defs, &extras, &documents).map_err(invalid_config)?;
    fill_affected(&state, &mut application.plan).await?;
    if application.plan.is_destructive() && !allow_destructive {
        for step in &mut application.plan.steps {
            step.blocked = step.destructive;
        }
        return Ok((StatusCode::UNPROCESSABLE_ENTITY, Json(application.plan)).into_response());
    }
    if application.changes.is_empty() {
        return Err(Problem::new(
            StatusCode::CONFLICT,
            "no_changes",
            "the documents match the stored model",
        ));
    }
    let mut response = crate::model_proposal::propose_with_defs(
        &state,
        &identity,
        "model.draft",
        &serde_json::json!({
            "title": "Config apply",
            "steps": application.changes,
        }),
        &defs,
    )
    .await?;
    response["groups"] = groups_for(&application.plan);
    Ok((StatusCode::ACCEPTED, Json(response)).into_response())
}

/// A store with no definitions yet is an empty model for config documents.
///
/// This is what makes the first apply able to create the model from scratch.
async fn current_definitions(state: &AppState) -> Result<braian_model::DefinitionSet, Problem> {
    match state.store.definition_set().await {
        Ok(defs) => Ok(defs),
        Err(braian_store::Error::NoDefinitions) => Ok(braian_model::DefinitionSet {
            model_revision: 0,
            languages: Vec::new(),
            unit_families: Vec::new(),
            value_lists: Vec::new(),
            attributes: Vec::new(),
            types: Vec::new(),
            structures: Vec::new(),
        }),
        Err(error) => Err(store_status(error)),
    }
}

/// Catalogs, merge profiles and ownership rules that live beside the
/// definition set. References use catalog keys, never ids.
async fn config_extras(state: &AppState) -> Result<ConfigExtras, Problem> {
    let catalogs = state.store.catalogs().await.map_err(store_status)?;
    let mut catalog_keys = std::collections::HashMap::new();
    let mut catalog_documents = Vec::with_capacity(catalogs.len());
    for catalog in &catalogs {
        catalog_keys.insert(catalog.id, catalog.key.clone());
        catalog_documents.push(CatalogDocument {
            api_version: ApiVersion::BraianIoV1,
            kind: CatalogDocumentKind::Catalog,
            key: catalog.key.clone(),
            renamed_from: None,
            mode: None,
            name: catalog.name.clone(),
            catalog_kind: match catalog.kind {
                StoreCatalogKind::Master => CatalogSourceKind::Master,
                StoreCatalogKind::Source => CatalogSourceKind::Source,
            },
            editable: catalog.editable,
        });
    }

    let profiles = state.store.merge_profiles().await.map_err(store_status)?;
    let mut merge_profiles = Vec::with_capacity(profiles.len());
    for profile in profiles {
        let Some(source_catalog) = catalog_keys.get(&profile.source_catalog_id).cloned() else {
            return Err(Problem::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "missing_catalog",
                format!(
                    "merge profile {} references missing catalog {}",
                    profile.key, profile.source_catalog_id
                ),
            ));
        };
        merge_profiles.push(MergeProfileDocument {
            api_version: ApiVersion::BraianIoV1,
            kind: MergeProfileKind::MergeProfile,
            key: profile.key,
            renamed_from: None,
            mode: None,
            name: profile.name,
            source_catalog,
            spec: profile.spec,
            run_mode: match profile.mode.as_str() {
                "continuous" => MergeModeConfig::Continuous,
                _ => MergeModeConfig::Manual,
            },
        });
    }

    let rules = state.store.ownership_rules().await.map_err(store_status)?;
    let rules: Vec<OwnershipRuleConfig> = serde_json::from_value(rules).map_err(|error| {
        Problem::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal",
            format!("stored ownership rules are invalid: {error}"),
        )
    })?;
    let ownership = Some(OwnershipDocument {
        api_version: ApiVersion::BraianIoV1,
        kind: OwnershipKind::Ownership,
        mode: None,
        rules,
    });

    Ok(ConfigExtras {
        catalogs: catalog_documents,
        merge_profiles,
        ownership,
    })
}

async fn fill_affected(state: &AppState, plan: &mut ConfigPlan) -> Result<(), Problem> {
    for step in &mut plan.steps {
        if step.kind == PlanKind::Catalog && step.action == PlanAction::Delete {
            let Some(catalog) = state
                .store
                .catalog_by_key(&step.key)
                .await
                .map_err(store_status)?
            else {
                continue;
            };
            let usage = state
                .store
                .catalog_usage(catalog.id)
                .await
                .map_err(store_status)?;
            step.affected = PlanAffected {
                objects: usage.objects,
                values: usage.values,
                links: usage.links,
                selections: 0,
                import_sessions: usage.import_sessions,
                proposals: usage.proposals,
                workspaces: usage.workspaces,
                model_drafts: usage.model_drafts,
                closed_proposals: usage.closed_proposals,
                finished_import_sessions: usage.finished_import_sessions,
            };
            continue;
        }
        let Some(purge) = &step.purge else {
            continue;
        };
        let counts = state
            .store
            .measure_purge(purge)
            .await
            .map_err(store_status)?;
        step.affected = PlanAffected {
            objects: counts.objects,
            values: counts.values,
            links: counts.links,
            selections: counts.selections,
            ..PlanAffected::default()
        };
    }
    Ok(())
}

fn groups_for(plan: &ConfigPlan) -> serde_json::Value {
    let mut groups = serde_json::json!({
        "Model": { "keys": Vec::<String>::new(), "steps": 0 },
        "ValueList": { "keys": Vec::<String>::new(), "steps": 0 },
        "UnitFamily": { "keys": Vec::<String>::new(), "steps": 0 },
        "Catalog": { "keys": Vec::<String>::new(), "steps": 0 },
        "MergeProfile": { "keys": Vec::<String>::new(), "steps": 0 },
        "Ownership": { "keys": Vec::<String>::new(), "steps": 0 },
    });
    for step in &plan.steps {
        let group = match step.kind {
            PlanKind::ValueList => "ValueList",
            PlanKind::UnitFamily => "UnitFamily",
            PlanKind::Catalog => "Catalog",
            PlanKind::MergeProfile => "MergeProfile",
            PlanKind::Ownership => "Ownership",
            _ => "Model",
        };
        let entry = &mut groups[group];
        entry["steps"] = serde_json::json!(entry["steps"].as_u64().unwrap_or(0) + 1);
        if let Some(keys) = entry["keys"].as_array_mut() {
            keys.push(serde_json::json!(step.key));
        }
    }
    groups
}

fn invalid_config(error: braian_config::ConfigError) -> Problem {
    Problem::new(
        StatusCode::UNPROCESSABLE_ENTITY,
        "invalid_config",
        error.to_string(),
    )
}

fn parse_documents(
    headers: &HeaderMap,
    body: &[u8],
) -> Result<(Vec<ConfigDocument>, bool), Problem> {
    if body_is_json(headers, body) {
        let value: serde_json::Value = serde_json::from_slice(body).map_err(bad_body)?;
        if let Some(object) = value.as_object()
            && let Some(documents) = object.get("documents")
        {
            let allow = object
                .get("allowDestructive")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false);
            return Ok((parse_json_documents(documents.clone())?, allow));
        }
        Ok((parse_json_documents(value)?, false))
    } else {
        let documents = serde_norway::Deserializer::from_slice(body)
            .map(ConfigDocument::deserialize)
            .collect::<Result<Vec<_>, _>>()
            .map_err(bad_body)?;
        Ok((documents, false))
    }
}

fn parse_json_documents(value: serde_json::Value) -> Result<Vec<ConfigDocument>, Problem> {
    if value.is_array() {
        serde_json::from_value(value).map_err(bad_body)
    } else {
        serde_json::from_value(value)
            .map(|document| vec![document])
            .map_err(bad_body)
    }
}

fn json_documents(documents: &[ConfigDocument]) -> Result<Response, Problem> {
    let body = serde_json::to_string(documents).map_err(internal)?;
    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/json")],
        body,
    )
        .into_response())
}

fn yaml_documents(documents: &[ConfigDocument]) -> Result<Response, Problem> {
    let body = documents_to_yaml(documents)?;
    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/yaml")],
        body,
    )
        .into_response())
}

fn zip_documents(documents: &[ConfigDocument]) -> Result<Response, Problem> {
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for document in documents {
        let path = match document {
            ConfigDocument::Model(_) => "model/model.yaml".to_owned(),
            ConfigDocument::ValueList(list) => {
                format!("value-lists/{}.yaml", file_stem(&list.key))
            }
            ConfigDocument::UnitFamily(family) => {
                format!("units/{}.yaml", file_stem(&family.key))
            }
            ConfigDocument::Catalog(catalog) => {
                format!("catalogs/{}.yaml", file_stem(&catalog.key))
            }
            ConfigDocument::MergeProfile(profile) => {
                format!("merge-profiles/{}.yaml", file_stem(&profile.key))
            }
            ConfigDocument::Ownership(_) => "ownership/ownership.yaml".to_owned(),
        };
        writer.start_file(path, options).map_err(internal)?;
        let yaml = serde_norway::to_string(document).map_err(internal)?;
        writer.write_all(yaml.as_bytes()).map_err(internal)?;
    }
    let bytes = writer.finish().map_err(internal)?.into_inner();
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/zip"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"config.zip\"",
            ),
        ],
        Body::from(bytes),
    )
        .into_response())
}

fn documents_to_yaml(documents: &[ConfigDocument]) -> Result<String, Problem> {
    let mut body = String::new();
    for (index, document) in documents.iter().enumerate() {
        if index > 0 {
            body.push_str("---\n");
        }
        body.push_str(&serde_norway::to_string(document).map_err(internal)?);
        if !body.ends_with('\n') {
            body.push('\n');
        }
    }
    Ok(body)
}

fn file_stem(key: &str) -> String {
    let stem: String = key
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect();
    if stem.is_empty() || stem == "." || stem == ".." {
        "document".to_owned()
    } else {
        stem
    }
}

fn body_is_json(headers: &HeaderMap, body: &[u8]) -> bool {
    if let Some(content_type) = headers.get(header::CONTENT_TYPE) {
        return content_type
            .to_str()
            .is_ok_and(|value| value.contains("json"));
    }
    matches!(
        body.iter().find(|byte| !byte.is_ascii_whitespace()),
        Some(b'{' | b'[')
    )
}

fn bad_body(error: impl std::fmt::Display) -> Problem {
    Problem::new(StatusCode::BAD_REQUEST, "bad_body", error.to_string())
}

fn wants_json(headers: &HeaderMap) -> bool {
    headers
        .get(header::ACCEPT)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| {
            value
                .split(',')
                .any(|part| part.trim().starts_with("application/json"))
        })
}

fn internal(error: impl std::fmt::Display) -> Problem {
    Problem::new(
        StatusCode::INTERNAL_SERVER_ERROR,
        "internal",
        error.to_string(),
    )
}
