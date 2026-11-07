//! Project the existing draft tables into one [`ReviewDraft`].
//!
//! Proposals, import rows, and model drafts stay where they are. This module
//! only reads them. Save and discard still go through the proposal and model
//! draft writes.

use braian_model::{
    DraftOrigin, DraftStatus, ReviewDraft, ReviewKind, ReviewRow, ReviewRowId, ReviewTarget,
    draft_origin, draft_status, row_decision,
};
use serde_json::Value;
use uuid::Uuid;

use crate::error::Error;
use crate::imports::ImportRowOut;
use crate::session::Store;

impl Store {
    /// The proposal as a review draft. Import sessions contribute `import_rows`
    /// instead of `proposal_rows`.
    pub async fn review_draft(&self, id: Uuid) -> Result<Option<ReviewDraft>, Error> {
        let Some(body) = self.proposal(id).await? else {
            return Ok(None);
        };
        let mut draft = draft_from_proposal(&body)?;
        let Some(session_id) = draft.session_id else {
            return Ok(Some(draft));
        };
        let rows = self.list_import_rows(session_id, None, 0, i64::MAX).await?;
        draft.rows = rows
            .into_iter()
            .map(|row| import_review_row(session_id, row))
            .collect();
        if draft.base_revision.is_none()
            && let Some(session) = self.import_session(session_id).await?
        {
            draft.base_revision = u64::try_from(session.model_revision).ok();
        }
        Ok(Some(draft))
    }

    /// The person's unsaved model steps, compared with the stored model revision.
    pub async fn review_model_draft(&self, user_id: Uuid) -> Result<Option<ReviewDraft>, Error> {
        let client = self.checkout().await?;
        let Some(row) = client
            .query_opt(
                "SELECT u.principal_id, d.base_revision, d.steps
                 FROM model_drafts d
                 JOIN users u ON u.id = d.user_id
                 WHERE d.user_id = $1 AND d.catalog_id = braian_catalog()",
                &[&user_id],
            )
            .await?
        else {
            return Ok(None);
        };
        let actor: Uuid = row.get(0);
        let base_revision: i64 = row.get(1);
        let steps: Value = row.get(2);
        let current = client
            .query_opt(
                "SELECT model_revision FROM definition_revisions
                 WHERE catalog_id = braian_catalog()
                 ORDER BY model_revision DESC LIMIT 1",
                &[],
            )
            .await?
            .map(|row| row.get::<_, i64>(0))
            .unwrap_or(0);
        let steps = steps
            .as_array()
            .ok_or_else(|| Error::Data("model draft steps are not a list".into()))?;
        let rows = steps
            .iter()
            .enumerate()
            .map(|(index, step)| {
                let position = i32::try_from(index).unwrap_or(i32::MAX);
                ReviewRow {
                    id: ReviewRowId::ModelStep {
                        user_id,
                        index: position,
                    },
                    position,
                    target: ReviewTarget::Model,
                    base_version: Some(base_revision),
                    patch: step.clone(),
                    cells: None,
                    stored_status: "pending".into(),
                    decision: row_decision("pending"),
                    conflict: false,
                }
            })
            .collect();
        Ok(Some(ReviewDraft {
            id: user_id,
            kind: ReviewKind::ModelDraft,
            title: String::new(),
            origin: DraftOrigin::Person,
            source: "user".into(),
            actor,
            on_behalf_of: None,
            agent_run_id: None,
            session_id: None,
            status: DraftStatus::Open,
            conflict: base_revision != current,
            stale: false,
            stale_reason: None,
            base_revision: u64::try_from(base_revision).ok(),
            rows,
        }))
    }
}

fn draft_from_proposal(body: &Value) -> Result<ReviewDraft, Error> {
    let id = uuid_field(body, "id")?;
    let source = text_field(body, "source")?;
    let stored_status = text_field(body, "status")?;
    let status = draft_status(&stored_status).map_err(Error::Data)?;
    let session_id = optional_uuid(body, "session_id")?;
    let agent_run_id = optional_uuid(body, "agent_run_id")?;
    let on_behalf_of = optional_uuid(body, "on_behalf_of")?;
    let actor = uuid_field(body, "actor")?;
    let rows = body
        .get("rows")
        .and_then(Value::as_array)
        .ok_or_else(|| Error::Data("proposal rows are missing".into()))?;
    Ok(ReviewDraft {
        id,
        kind: ReviewKind::Proposal,
        title: text_field(body, "title")?,
        origin: draft_origin(&source, session_id, agent_run_id),
        source,
        actor,
        on_behalf_of,
        agent_run_id,
        session_id,
        status,
        conflict: body
            .get("conflict")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        stale: body.get("stale").and_then(Value::as_bool).unwrap_or(false),
        stale_reason: body
            .get("stale_reason")
            .and_then(Value::as_str)
            .map(str::to_owned),
        base_revision: None,
        rows: rows
            .iter()
            .map(proposal_review_row)
            .collect::<Result<_, _>>()?,
    })
}

fn proposal_review_row(row: &Value) -> Result<ReviewRow, Error> {
    let id = uuid_field(row, "id")?;
    let type_key = row
        .get("type_key")
        .and_then(Value::as_str)
        .map(str::to_owned);
    let object_id = optional_uuid(row, "object_id")?;
    let object_key = row
        .get("object_key")
        .and_then(Value::as_str)
        .map(str::to_owned);
    let stored_status = text_field(row, "status")?;
    let target = if type_key.as_deref() == Some("model") {
        ReviewTarget::Model
    } else {
        ReviewTarget::Object {
            id: object_id,
            key: object_key,
            type_key,
        }
    };
    Ok(ReviewRow {
        id: ReviewRowId::Proposal { id },
        position: i64_field(row, "position")?.try_into().unwrap_or(i32::MAX),
        target,
        base_version: optional_i64(row, "base_version")?,
        patch: row.get("patch").cloned().unwrap_or(Value::Null),
        cells: None,
        decision: row_decision(&stored_status),
        stored_status,
        conflict: row
            .get("conflict")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    })
}

fn import_review_row(session_id: Uuid, row: ImportRowOut) -> ReviewRow {
    let conflict = row.status == "stale";
    ReviewRow {
        id: ReviewRowId::Import {
            session_id,
            row_no: row.row_no,
        },
        position: row.row_no,
        target: ReviewTarget::Import {
            session_id,
            row_no: row.row_no,
            object_id: row.object_id,
            object_key: row.object_key,
        },
        base_version: row.base_version,
        patch: row.patch.unwrap_or(Value::Null),
        cells: Some(row.cells),
        decision: row_decision(&row.status),
        stored_status: row.status,
        conflict,
    }
}

fn text_field(value: &Value, key: &str) -> Result<String, Error> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| Error::Data(format!("proposal {key} is missing")))
}

fn uuid_field(value: &Value, key: &str) -> Result<Uuid, Error> {
    let text = text_field(value, key)?;
    Uuid::parse_str(&text).map_err(|_| Error::Data(format!("proposal {key} is not an id")))
}

fn optional_uuid(value: &Value, key: &str) -> Result<Option<Uuid>, Error> {
    match value.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(text)) => Uuid::parse_str(text)
            .map(Some)
            .map_err(|_| Error::Data(format!("proposal {key} is not an id"))),
        Some(_) => Err(Error::Data(format!("proposal {key} is not an id"))),
    }
}

fn optional_i64(value: &Value, key: &str) -> Result<Option<i64>, Error> {
    match value.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(other) => Ok(Some(number_i64(other, key)?)),
    }
}

fn i64_field(value: &Value, key: &str) -> Result<i64, Error> {
    number_i64(
        value
            .get(key)
            .ok_or_else(|| Error::Data(format!("proposal {key} is missing")))?,
        key,
    )
}

fn number_i64(value: &Value, key: &str) -> Result<i64, Error> {
    value
        .as_i64()
        .or_else(|| value.as_u64().and_then(|number| i64::try_from(number).ok()))
        .ok_or_else(|| Error::Data(format!("proposal {key} is not a number")))
}
