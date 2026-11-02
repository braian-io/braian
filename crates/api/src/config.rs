//! Export the stored model as config-as-code documents.

use std::io::{Cursor, Write};

use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use braian_config::{ConfigDocument, export_documents};
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
