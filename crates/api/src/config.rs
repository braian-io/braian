//! Export the stored model as config-as-code documents, and plan a change.

use std::io::{Cursor, Write};

use axum::Json;
use axum::body::{Body, Bytes};
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use braian_config::{ConfigDocument, PlanAffected, export_documents, plan_documents};
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

#[derive(Debug, Deserialize, ToSchema)]
pub struct PlanQuery {
    /// Apply destructive steps. Without it a destructive plan is returned with 422.
    #[serde(default, rename = "allowDestructive", alias = "allow_destructive")]
    pub allow_destructive: bool,
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
    let documents = export_documents(&defs).map_err(internal)?;

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
    params(
        ("allowDestructive" = Option<bool>, Query, description = "Return 200 even when the plan has destructive steps")
    ),
    request_body(content = crate::http_schema::JsonValue, description = "One or more config documents as YAML (multi-doc) or JSON (object or array)"),
    responses(
        (status = 200, description = "Plan without destructive steps, or one allowed with allowDestructive", body = crate::http_schema::JsonValue),
        (status = 400, description = "Malformed config documents", body = crate::problem::Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or unknown token", body = crate::problem::Problem, content_type = "application/problem+json"),
        (status = 422, description = "Plan has destructive steps and allowDestructive is not set", body = crate::http_schema::JsonValue)
    ),
    security(("bearer" = []))
)]
pub async fn plan_config(
    State(state): State<AppState>,
    Auth(_): Auth,
    Query(query): Query<PlanQuery>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, Problem> {
    let (documents, body_allows_destructive) = parse_documents(&headers, &body)?;
    if documents.is_empty() {
        return Err(Problem::new(
            StatusCode::BAD_REQUEST,
            "bad_body",
            "no config documents",
        ));
    }
    let defs = state.store.definition_set().await.map_err(store_status)?;
    let mut plan = plan_documents(&defs, &documents).map_err(|error| {
        Problem::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "invalid_config",
            error.to_string(),
        )
    })?;
    for step in &mut plan.steps {
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
        };
    }
    let blocked = plan.is_destructive() && !(query.allow_destructive || body_allows_destructive);
    let status = if blocked {
        StatusCode::UNPROCESSABLE_ENTITY
    } else {
        StatusCode::OK
    };
    Ok((status, Json(plan)).into_response())
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
