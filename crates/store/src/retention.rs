//! Permanently removes soft-deleted rows after the retention window.
//!
//! User-facing deletes only set `deleted_at`. This is the later cleanup.
//! History that belongs to a catalog (changes, batches, definition revisions)
//! stays until that catalog itself is past retention, then the same
//! child-before-parent deletes the catalog removal used to run immediately.

use chrono::{DateTime, Duration, Utc};
use uuid::Uuid;

use crate::error::Error;
use crate::ids::MASTER_CATALOG_ID;
use crate::session::Store;

/// How long a soft-deleted row stays restorable.
pub const RETENTION_DAYS: i64 = 30;

/// Rows removed by one cleanup pass.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct PurgeCounts {
    pub objects: u64,
    pub views: u64,
    pub workspaces: u64,
    pub assortments: u64,
    pub import_mappings: u64,
    pub merge_links: u64,
    pub merge_profiles: u64,
    pub catalogs: u64,
}

impl Store {
    /// Deletes rows whose `deleted_at` is older than [`RETENTION_DAYS`].
    pub async fn purge_expired_soft_deletes(&self) -> Result<PurgeCounts, Error> {
        let cutoff = Utc::now() - Duration::days(RETENTION_DAYS);
        self.purge_soft_deleted_before(cutoff).await
    }

    /// Deletes soft-deleted rows with `deleted_at` strictly before `cutoff`.
    pub async fn purge_soft_deleted_before(
        &self,
        cutoff: DateTime<Utc>,
    ) -> Result<PurgeCounts, Error> {
        let mut client = self.checkout().await?;
        let tx = client.transaction().await?;
        let mut counts = PurgeCounts::default();

        tx.batch_execute("CREATE TEMP TABLE doomed_objects (id uuid PRIMARY KEY) ON COMMIT DROP")
            .await?;
        // An endpoint stays while a link object that is not yet due still points at it.
        tx.execute(
            "INSERT INTO doomed_objects (id)
             SELECT id FROM objects
             WHERE deleted_at IS NOT NULL AND deleted_at < $1
               AND id NOT IN (
                 SELECT l.from_id FROM links l
                 JOIN objects link_obj ON link_obj.id = l.object_id
                 WHERE (link_obj.deleted_at IS NULL OR link_obj.deleted_at >= $1)
                   AND l.from_id IN (
                     SELECT id FROM objects WHERE deleted_at IS NOT NULL AND deleted_at < $1
                   )
                 UNION
                 SELECT l.to_id FROM links l
                 JOIN objects link_obj ON link_obj.id = l.object_id
                 WHERE (link_obj.deleted_at IS NULL OR link_obj.deleted_at >= $1)
                   AND l.to_id IN (
                     SELECT id FROM objects WHERE deleted_at IS NOT NULL AND deleted_at < $1
                   )
               )",
            &[&cutoff],
        )
        .await?;
        counts.merge_links += tx
            .execute(
                "DELETE FROM merge_links
                 WHERE source_object_id IN (SELECT id FROM doomed_objects)
                    OR master_object_id IN (SELECT id FROM doomed_objects)",
                &[],
            )
            .await?;
        tx.execute(
            "DELETE FROM links
             WHERE object_id IN (SELECT id FROM doomed_objects)
                OR from_id IN (SELECT id FROM doomed_objects)
                OR to_id IN (SELECT id FROM doomed_objects)",
            &[],
        )
        .await?;
        tx.execute(
            "DELETE FROM object_values WHERE object_id IN (SELECT id FROM doomed_objects)",
            &[],
        )
        .await?;
        tx.execute(
            "DELETE FROM object_structures WHERE object_id IN (SELECT id FROM doomed_objects)",
            &[],
        )
        .await?;
        counts.objects = tx
            .execute(
                "DELETE FROM objects WHERE id IN (SELECT id FROM doomed_objects)",
                &[],
            )
            .await?;

        counts.merge_links += tx
            .execute(
                "DELETE FROM merge_links WHERE deleted_at IS NOT NULL AND deleted_at < $1",
                &[&cutoff],
            )
            .await?;
        counts.views = tx
            .execute(
                "DELETE FROM views WHERE deleted_at IS NOT NULL AND deleted_at < $1",
                &[&cutoff],
            )
            .await?;
        counts.workspaces = tx
            .execute(
                "DELETE FROM workspaces WHERE deleted_at IS NOT NULL AND deleted_at < $1",
                &[&cutoff],
            )
            .await?;

        let assortment_ids: Vec<Uuid> = tx
            .query(
                "SELECT id FROM assortments WHERE deleted_at IS NOT NULL AND deleted_at < $1",
                &[&cutoff],
            )
            .await?
            .iter()
            .map(|row| row.get(0))
            .collect();
        if !assortment_ids.is_empty() {
            tx.execute(
                "UPDATE job_types SET assortment_id = NULL WHERE assortment_id = ANY($1)",
                &[&assortment_ids],
            )
            .await?;
            tx.execute(
                "UPDATE webhooks SET assortment_id = NULL WHERE assortment_id = ANY($1)",
                &[&assortment_ids],
            )
            .await?;
            tx.execute(
                "UPDATE job_runs SET assortment_id = NULL WHERE assortment_id = ANY($1)",
                &[&assortment_ids],
            )
            .await?;
            counts.assortments = tx
                .execute(
                    "DELETE FROM assortments WHERE id = ANY($1)",
                    &[&assortment_ids],
                )
                .await?;
        }

        counts.import_mappings = tx
            .execute(
                "DELETE FROM import_mappings WHERE deleted_at IS NOT NULL AND deleted_at < $1",
                &[&cutoff],
            )
            .await?;

        let profile_ids: Vec<Uuid> = tx
            .query(
                "SELECT id FROM merge_profiles WHERE deleted_at IS NOT NULL AND deleted_at < $1",
                &[&cutoff],
            )
            .await?
            .iter()
            .map(|row| row.get(0))
            .collect();
        if !profile_ids.is_empty() {
            counts.merge_links += tx
                .execute(
                    "DELETE FROM merge_links WHERE profile_id = ANY($1)",
                    &[&profile_ids],
                )
                .await?;
            tx.execute(
                "DELETE FROM merge_run_rows WHERE profile_id = ANY($1)",
                &[&profile_ids],
            )
            .await?;
            tx.execute(
                "DELETE FROM merge_profile_revisions WHERE profile_id = ANY($1)",
                &[&profile_ids],
            )
            .await?;
            counts.merge_profiles = tx
                .execute(
                    "DELETE FROM merge_profiles WHERE id = ANY($1)",
                    &[&profile_ids],
                )
                .await?;
        }

        let catalog_ids: Vec<Uuid> = tx
            .query(
                "SELECT id FROM catalogs
                 WHERE deleted_at IS NOT NULL AND deleted_at < $1 AND id <> $2",
                &[&cutoff, &MASTER_CATALOG_ID.as_uuid()],
            )
            .await?
            .iter()
            .map(|row| row.get(0))
            .collect();
        for id in catalog_ids {
            let usage = crate::catalogs::usage_in(&tx, id, None).await?;
            if usage.has_dependents() {
                continue;
            }
            purge_catalog_contents(&tx, id).await?;
            counts.catalogs += 1;
        }

        tx.commit().await?;
        Ok(counts)
    }
}

/// The hard deletes a catalog removal used to run immediately.
pub(crate) async fn purge_catalog_contents(
    tx: &tokio_postgres::Transaction<'_>,
    id: Uuid,
) -> Result<(), Error> {
    tx.execute(
        "DELETE FROM merge_links WHERE profile_id IN (SELECT id FROM merge_profiles WHERE source_catalog_id = $1)",
        &[&id],
    )
    .await?;
    tx.execute(
        "DELETE FROM merge_run_rows WHERE profile_id IN (SELECT id FROM merge_profiles WHERE source_catalog_id = $1)",
        &[&id],
    )
    .await?;
    tx.execute(
        "DELETE FROM merge_profile_revisions WHERE profile_id IN (SELECT id FROM merge_profiles WHERE source_catalog_id = $1)",
        &[&id],
    )
    .await?;
    tx.execute(
        "DELETE FROM merge_profiles WHERE source_catalog_id = $1",
        &[&id],
    )
    .await?;
    tx.execute("DELETE FROM changes WHERE catalog_id = $1", &[&id])
        .await?;
    tx.execute(
        "DELETE FROM import_rows WHERE session_id IN (
            SELECT id FROM import_sessions
            WHERE catalog_id = $1 AND status IN ('saved', 'cancelled', 'failed')
        )",
        &[&id],
    )
    .await?;
    tx.execute(
        "DELETE FROM import_sessions
         WHERE catalog_id = $1 AND status IN ('saved', 'cancelled', 'failed')",
        &[&id],
    )
    .await?;
    tx.execute(
        "DELETE FROM proposals WHERE catalog_id = $1 AND status <> 'open'",
        &[&id],
    )
    .await?;
    tx.execute("DELETE FROM indexer_progress WHERE catalog_id = $1", &[&id])
        .await?;
    tx.execute(
        "DELETE FROM definition_revisions WHERE catalog_id = $1",
        &[&id],
    )
    .await?;
    tx.execute("DELETE FROM batches WHERE catalog_id = $1", &[&id])
        .await?;
    tx.execute("DELETE FROM attribute_parts WHERE catalog_id = $1", &[&id])
        .await?;
    tx.execute("DELETE FROM catalogs WHERE id = $1", &[&id])
        .await?;
    Ok(())
}
