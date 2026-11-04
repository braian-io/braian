//! Agent sessions live in Postgres. A closed tab does not delete the run.

use chrono::{DateTime, Utc};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::error::Error;
use crate::session::Store;

#[derive(Debug, Clone)]
pub struct AgentRunRow {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub principal_id: Uuid,
    pub workspace_id: Option<Uuid>,
    pub view_id: Option<Uuid>,
    pub title: String,
    pub status: String,
    pub mode: String,
    pub session_kind: String,
    pub hidden: bool,
    pub tab_open: bool,
    pub context: Value,
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone)]
pub struct AgentMessageRow {
    pub id: Uuid,
    pub kind: String,
    pub body: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct AgentProposalLink {
    pub id: Uuid,
    pub title: String,
    pub status: String,
    pub stale: bool,
    pub stale_reason: Option<String>,
    pub object_id: Option<Uuid>,
    pub object_key: Option<String>,
    pub patch: Value,
    pub resolved_at: Option<DateTime<Utc>>,
    pub reverted_at: Option<DateTime<Utc>>,
}

/// What a person wrote, so a pending agent proposal can say which field changed.
pub struct StaleEdit {
    pub who: String,
    pub at: DateTime<Utc>,
    pub fields: Vec<(String, String)>,
}

#[derive(Debug, Clone)]
pub struct NewAgentRun {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub principal_id: Uuid,
    pub workspace_id: Option<Uuid>,
    pub title: String,
    pub context: Value,
}

/// Optional fields for a later UI (background mode, hidden sessions, own vs user).
pub struct AgentRunUpdate<'a> {
    pub tab_open: Option<bool>,
    pub view_id: Option<Uuid>,
    pub set_view: bool,
    pub mode: Option<&'a str>,
    pub hidden: Option<bool>,
    pub session_kind: Option<&'a str>,
}

impl Store {
    pub async fn insert_agent_run(&self, run: &NewAgentRun) -> Result<(), Error> {
        let client = self.checkout().await?;
        client
            .execute(
                "INSERT INTO agent_runs
                    (id, user_id, principal_id, workspace_id, title, status, context)
                 VALUES ($1, $2, $3, $4, $5, 'working', $6)",
                &[
                    &run.id,
                    &run.user_id,
                    &run.principal_id,
                    &run.workspace_id,
                    &run.title,
                    &run.context,
                ],
            )
            .await?;
        Ok(())
    }

    pub async fn agent_run_for(
        &self,
        id: Uuid,
        principal_id: Uuid,
        user_id: Option<Uuid>,
    ) -> Result<Option<AgentRunRow>, Error> {
        let client = self.checkout().await?;
        let row = client
            .query_opt(
                "SELECT id, user_id, principal_id, workspace_id, view_id, title, status, mode,
                        session_kind, hidden, tab_open, context, error, created_at, updated_at, finished_at
                 FROM agent_runs
                 WHERE id = $1
                   AND (principal_id = $2 OR ($3::uuid IS NOT NULL AND user_id = $3))",
                &[&id, &principal_id, &user_id],
            )
            .await?;
        Ok(row.as_ref().map(read_run))
    }

    pub async fn list_agent_runs(
        &self,
        principal_id: Uuid,
        user_id: Option<Uuid>,
    ) -> Result<Vec<AgentRunRow>, Error> {
        let client = self.checkout().await?;
        let rows = client
            .query(
                "SELECT id, user_id, principal_id, workspace_id, view_id, title, status, mode,
                        session_kind, hidden, tab_open, context, error, created_at, updated_at, finished_at
                 FROM agent_runs
                 WHERE principal_id = $1 OR ($2::uuid IS NOT NULL AND user_id = $2)
                 ORDER BY created_at DESC",
                &[&principal_id, &user_id],
            )
            .await?;
        Ok(rows.iter().map(read_run).collect())
    }

    pub async fn agent_messages(&self, run_id: Uuid) -> Result<Vec<AgentMessageRow>, Error> {
        let client = self.checkout().await?;
        let rows = client
            .query(
                "SELECT id, kind, body, created_at
                 FROM agent_messages WHERE run_id = $1 ORDER BY position",
                &[&run_id],
            )
            .await?;
        Ok(rows
            .iter()
            .map(|row| AgentMessageRow {
                id: row.get(0),
                kind: row.get(1),
                body: row.get(2),
                created_at: row.get(3),
            })
            .collect())
    }

    pub async fn agent_run_proposals(&self, run_id: Uuid) -> Result<Vec<AgentProposalLink>, Error> {
        let client = self.checkout().await?;
        let rows = client
            .query(
                "SELECT p.id, p.title, p.status, p.stale, p.stale_reason, p.resolved_at, p.reverted_at,
                        (SELECT r.object_id FROM proposal_rows r
                          WHERE r.proposal_id = p.id ORDER BY r.position LIMIT 1),
                        (SELECT COALESCE(r.object_key, o.key)
                           FROM proposal_rows r
                           LEFT JOIN objects o ON o.id = r.object_id
                          WHERE r.proposal_id = p.id ORDER BY r.position LIMIT 1),
                        (SELECT r.patch FROM proposal_rows r
                          WHERE r.proposal_id = p.id ORDER BY r.position LIMIT 1)
                 FROM proposals p
                 WHERE p.agent_run_id = $1
                 ORDER BY p.created_at",
                &[&run_id],
            )
            .await?;
        Ok(rows
            .iter()
            .map(|row| AgentProposalLink {
                id: row.get(0),
                title: row.get(1),
                status: row.get(2),
                stale: row.get(3),
                stale_reason: row.get(4),
                resolved_at: row.get(5),
                reverted_at: row.get(6),
                object_id: row.get(7),
                object_key: row.get(8),
                patch: row.get::<_, Option<Value>>(9).unwrap_or_else(|| json!({})),
            })
            .collect())
    }

    /// Append one transcript line. Position is taken under a lock on the run.
    pub async fn append_agent_message(
        &self,
        run_id: Uuid,
        kind: &str,
        body: &Value,
    ) -> Result<Uuid, Error> {
        let id = Uuid::now_v7();
        let mut client = self.checkout().await?;
        let tx = client.transaction().await?;
        tx.execute(
            "SELECT id FROM agent_runs WHERE id = $1 FOR UPDATE",
            &[&run_id],
        )
        .await?;
        let position: i32 = tx
            .query_one(
                "SELECT COALESCE(MAX(position), -1)::int + 1 FROM agent_messages WHERE run_id = $1",
                &[&run_id],
            )
            .await?
            .get(0);
        tx.execute(
            "INSERT INTO agent_messages (id, run_id, position, kind, body) VALUES ($1, $2, $3, $4, $5)",
            &[&id, &run_id, &position, &kind, body],
        )
        .await?;
        tx.execute(
            "UPDATE agent_runs SET updated_at = now() WHERE id = $1",
            &[&run_id],
        )
        .await?;
        tx.commit().await?;
        Ok(id)
    }

    pub async fn attach_proposal_to_run(
        &self,
        proposal_id: Uuid,
        run_id: Uuid,
    ) -> Result<(), Error> {
        let client = self.checkout().await?;
        client
            .execute(
                "UPDATE proposals SET agent_run_id = $2 WHERE id = $1",
                &[&proposal_id, &run_id],
            )
            .await?;
        Ok(())
    }

    pub async fn patch_agent_run(
        &self,
        id: Uuid,
        principal_id: Uuid,
        user_id: Option<Uuid>,
        update: &AgentRunUpdate<'_>,
    ) -> Result<bool, Error> {
        let client = self.checkout().await?;
        let changed = client
            .execute(
                "UPDATE agent_runs SET
                    tab_open = COALESCE($4, tab_open),
                    view_id = CASE WHEN $5 THEN $6 ELSE view_id END,
                    mode = COALESCE($7, mode),
                    hidden = COALESCE($8, hidden),
                    session_kind = COALESCE($9, session_kind),
                    updated_at = now()
                 WHERE id = $1
                   AND (principal_id = $2 OR ($3::uuid IS NOT NULL AND user_id = $3))",
                &[
                    &id,
                    &principal_id,
                    &user_id,
                    &update.tab_open,
                    &update.set_view,
                    &update.view_id,
                    &update.mode,
                    &update.hidden,
                    &update.session_kind,
                ],
            )
            .await?;
        Ok(changed > 0)
    }

    pub async fn set_agent_run_status(
        &self,
        id: Uuid,
        status: &str,
        error: Option<&str>,
    ) -> Result<(), Error> {
        let client = self.checkout().await?;
        let finished = matches!(status, "done" | "failed");
        client
            .execute(
                "UPDATE agent_runs SET
                    status = $2,
                    error = $3,
                    finished_at = CASE WHEN $4 THEN now() ELSE NULL END,
                    updated_at = now()
                 WHERE id = $1",
                &[&id, &status, &error, &finished],
            )
            .await?;
        Ok(())
    }

    /// Mark open agent proposals on this object stale and append a notice
    /// on each run. `except` is the proposal currently being accepted.
    /// Runs left `working` when the process stopped cannot still be running.
    pub async fn fail_abandoned_agent_runs(&self) -> Result<u64, Error> {
        let client = self.checkout().await?;
        let updated = client
            .execute(
                "UPDATE agent_runs
                 SET status = 'failed',
                     error = 'The agent stopped when the server restarted.',
                     finished_at = now(),
                     updated_at = now()
                 WHERE status = 'working'",
                &[],
            )
            .await?;
        Ok(updated)
    }

    pub async fn mark_agent_proposals_stale(
        &self,
        object_id: Uuid,
        except: Option<Uuid>,
        edit: &StaleEdit,
    ) -> Result<Vec<Uuid>, Error> {
        let mut client = self.checkout().await?;
        let tx = client.transaction().await?;
        let rows = tx
            .query(
                "SELECT DISTINCT p.id, p.agent_run_id
                 FROM proposals p
                 JOIN proposal_rows r ON r.proposal_id = p.id
                 WHERE p.status = 'open'
                   AND p.stale = false
                   AND p.source = 'agent'
                   AND r.status = 'pending'
                   AND r.object_id = $1
                   AND ($2::uuid IS NULL OR p.id <> $2)",
                &[&object_id, &except],
            )
            .await?;
        let mut proposal_ids = Vec::new();
        for row in &rows {
            let proposal_id: Uuid = row.get(0);
            let run_id: Option<Uuid> = row.get(1);
            let reason = stale_text(edit);
            tx.execute(
                "UPDATE proposals
                 SET stale = true, stale_at = now(), stale_reason = $2, conflict = true
                 WHERE id = $1 AND stale = false",
                &[&proposal_id, &reason],
            )
            .await?;
            tx.execute(
                "UPDATE proposal_rows SET conflict = true
                 WHERE proposal_id = $1 AND object_id = $2 AND status = 'pending'",
                &[&proposal_id, &object_id],
            )
            .await?;
            if let Some(run_id) = run_id {
                tx.execute(
                    "SELECT id FROM agent_runs WHERE id = $1 FOR UPDATE",
                    &[&run_id],
                )
                .await?;
                let position: i32 = tx
                    .query_one(
                        "SELECT COALESCE(MAX(position), -1)::int + 1 FROM agent_messages WHERE run_id = $1",
                        &[&run_id],
                    )
                    .await?
                    .get(0);
                let body = json!({
                    "kind": "notice",
                    "text": reason,
                    "proposal_id": proposal_id,
                    "object_id": object_id,
                });
                let message_id = Uuid::now_v7();
                tx.execute(
                    "INSERT INTO agent_messages (id, run_id, position, kind, body)
                     VALUES ($1, $2, $3, 'notice', $4)",
                    &[&message_id, &run_id, &position, &body],
                )
                .await?;
                tx.execute(
                    "UPDATE agent_runs SET updated_at = now() WHERE id = $1",
                    &[&run_id],
                )
                .await?;
            }
            proposal_ids.push(proposal_id);
        }
        tx.commit().await?;
        Ok(proposal_ids)
    }
}

fn stale_text(edit: &StaleEdit) -> String {
    let who = if edit.who.trim().is_empty() {
        "Someone"
    } else {
        edit.who.trim()
    };
    let changes = if edit.fields.is_empty() {
        "the object".to_owned()
    } else {
        edit.fields
            .iter()
            .map(|(field, value)| format!("{field} to {value}"))
            .collect::<Vec<_>>()
            .join(", ")
    };
    let when = edit.at.format("%Y-%m-%d %H:%M");
    format!("{who} changed {changes} at {when}. The proposal is stale and was not applied.")
}

fn read_run(row: &tokio_postgres::Row) -> AgentRunRow {
    AgentRunRow {
        id: row.get(0),
        user_id: row.get(1),
        principal_id: row.get(2),
        workspace_id: row.get(3),
        view_id: row.get(4),
        title: row.get(5),
        status: row.get(6),
        mode: row.get(7),
        session_kind: row.get(8),
        hidden: row.get(9),
        tab_open: row.get(10),
        context: row.get(11),
        error: row.get(12),
        created_at: row.get(13),
        updated_at: row.get(14),
        finished_at: row.get(15),
    }
}
