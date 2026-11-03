//! Workspace templates as config data. Listing never creates or changes a
//! stored workspace.

use axum::Json;
use axum::extract::State;
use serde_json::Value;

use crate::auth::{Auth, Role};
use crate::platform::require;
use crate::problem::{Problem, store_status};
use crate::state::AppState;

pub async fn list_workspace_templates(
    State(state): State<AppState>,
    Auth(identity): Auth,
) -> Result<Json<Vec<Value>>, Problem> {
    require(&identity, Role::Viewer)?;
    let templates = state
        .store
        .workspace_templates()
        .await
        .map_err(store_status)?;
    Ok(Json(templates.iter().map(|item| item.to_json()).collect()))
}
