//! Workspace templates. A template is named by key and holds one layout
//! definition. It is config data; applying a template never touches a stored
//! workspace.

use chrono::{DateTime, Utc};
use serde_json::Value;

use crate::error::Error;
use crate::session::Store;

#[derive(Debug, Clone, PartialEq)]
pub struct WorkspaceTemplateRecord {
    pub key: String,
    pub name: String,
    pub definition: Value,
    pub updated_at: DateTime<Utc>,
}

impl WorkspaceTemplateRecord {
    pub fn to_json(&self) -> Value {
        serde_json::json!({
            "key": &self.key,
            "name": &self.name,
            "definition": &self.definition,
            "updated_at": self.updated_at,
        })
    }
}

fn record_from_row(row: &tokio_postgres::Row) -> WorkspaceTemplateRecord {
    WorkspaceTemplateRecord {
        key: row.get("key"),
        name: row.get("name"),
        definition: row.get("definition"),
        updated_at: row.get("updated_at"),
    }
}

impl Store {
    pub async fn workspace_templates(&self) -> Result<Vec<WorkspaceTemplateRecord>, Error> {
        let client = self.checkout().await?;
        let rows = client
            .query(
                "SELECT key, name, definition, updated_at
                 FROM workspace_templates
                 ORDER BY key",
                &[],
            )
            .await?;
        Ok(rows.iter().map(record_from_row).collect())
    }

    pub async fn workspace_template_by_key(
        &self,
        key: &str,
    ) -> Result<Option<WorkspaceTemplateRecord>, Error> {
        let client = self.checkout().await?;
        let row = client
            .query_opt(
                "SELECT key, name, definition, updated_at
                 FROM workspace_templates
                 WHERE key = $1",
                &[&key],
            )
            .await?;
        Ok(row.as_ref().map(record_from_row))
    }
}
