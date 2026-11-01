//! Merge profiles, ownership rules and the rows a dry-run leaves behind.
//!
//! The plan itself is computed in `braian-merge`. This module only stores it.

use serde_json::Value;
use uuid::Uuid;

use crate::error::Error;
use crate::ids::CatalogId;
use crate::session::Store;

#[derive(Debug, Clone)]
pub struct MergeProfile {
    pub id: Uuid,
    pub key: String,
    pub name: String,
    pub source_catalog_id: CatalogId,
    pub spec: Value,
    pub mode: String,
    pub revision: i64,
}

impl Store {
    pub async fn merge_profiles(&self) -> Result<Vec<MergeProfile>, Error> {
        let client = self.checkout().await?;
        let rows = client
            .query(
                "SELECT p.id, p.key, p.name, p.source_catalog_id, p.spec, p.mode,
                        COALESCE((SELECT MAX(revision) FROM merge_profile_revisions r WHERE r.profile_id = p.id), 1)
                 FROM merge_profiles p
                 ORDER BY p.key",
                &[],
            )
            .await?;
        Ok(rows
            .into_iter()
            .map(|row| MergeProfile {
                id: row.get(0),
                key: row.get(1),
                name: row.get(2),
                source_catalog_id: CatalogId::from_uuid(row.get(3)),
                spec: row.get(4),
                mode: row.get(5),
                revision: row.get(6),
            })
            .collect())
    }

    pub async fn merge_profile_by_key(&self, key: &str) -> Result<Option<MergeProfile>, Error> {
        Ok(self
            .merge_profiles()
            .await?
            .into_iter()
            .find(|profile| profile.key == key))
    }

    /// Inserts the profile, or appends a revision when the key already exists.
    pub async fn put_merge_profile(
        &self,
        id: Uuid,
        key: &str,
        name: &str,
        source_catalog_id: CatalogId,
        spec: &Value,
        mode: &str,
    ) -> Result<MergeProfile, Error> {
        let client = self.checkout().await?;
        let source = source_catalog_id.as_uuid();
        client
            .execute(
                "INSERT INTO merge_profiles (id, key, name, source_catalog_id, spec, mode)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (key) DO UPDATE
                   SET name = EXCLUDED.name, spec = EXCLUDED.spec, mode = EXCLUDED.mode",
                &[&id, &key, &name, &source, spec, &mode],
            )
            .await?;
        let stored_id: Uuid = client
            .query_one("SELECT id FROM merge_profiles WHERE key = $1", &[&key])
            .await?
            .get(0);
        let revision: i64 = client
            .query_one(
                "SELECT COALESCE(MAX(revision), 0) + 1 FROM merge_profile_revisions WHERE profile_id = $1",
                &[&stored_id],
            )
            .await?
            .get(0);
        client
            .execute(
                "INSERT INTO merge_profile_revisions (profile_id, revision, spec) VALUES ($1, $2, $3)",
                &[&stored_id, &revision, spec],
            )
            .await?;
        Ok(MergeProfile {
            id: stored_id,
            key: key.to_owned(),
            name: name.to_owned(),
            source_catalog_id,
            spec: spec.clone(),
            mode: mode.to_owned(),
            revision,
        })
    }

    pub async fn ownership_rules(&self) -> Result<Value, Error> {
        let client = self.checkout().await?;
        let row = client
            .query_opt(
                "SELECT rules FROM ownership_revisions ORDER BY revision DESC LIMIT 1",
                &[],
            )
            .await?;
        Ok(row
            .map(|row| row.get(0))
            .unwrap_or(Value::Array(Vec::new())))
    }

    pub async fn put_ownership_rules(&self, rules: &Value) -> Result<i64, Error> {
        let client = self.checkout().await?;
        let revision: i64 = client
            .query_one(
                "SELECT COALESCE(MAX(revision), 0) + 1 FROM ownership_revisions",
                &[],
            )
            .await?
            .get(0);
        client
            .execute(
                "INSERT INTO ownership_revisions (revision, rules) VALUES ($1, $2)",
                &[&revision, rules],
            )
            .await?;
        Ok(revision)
    }

    pub async fn record_merge_row(
        &self,
        profile_id: Uuid,
        source_key: &str,
        master_key: Option<&str>,
        action: &str,
        detail: &Value,
    ) -> Result<(), Error> {
        let client = self.checkout().await?;
        client
            .execute(
                "INSERT INTO merge_run_rows (profile_id, source_key, master_key, action, detail)
                 VALUES ($1, $2, $3, $4, $5)",
                &[&profile_id, &source_key, &master_key, &action, detail],
            )
            .await?;
        Ok(())
    }

    pub async fn set_profile_schedule(
        &self,
        key: &str,
        schedule: Option<&str>,
    ) -> Result<(), Error> {
        let client = self.checkout().await?;
        client
            .execute(
                "UPDATE merge_profiles SET schedule = $2, next_run_at = CASE WHEN $2 IS NULL THEN NULL ELSE now() END WHERE key = $1",
                &[&key, &schedule],
            )
            .await?;
        Ok(())
    }

    pub async fn due_profiles(&self) -> Result<Vec<String>, Error> {
        let client = self.checkout().await?;
        let rows = client
            .query(
                "SELECT key FROM merge_profiles
                 WHERE schedule IS NOT NULL AND schedule <> ''
                   AND (next_run_at IS NULL OR next_run_at <= now())
                 ORDER BY key",
                &[],
            )
            .await?;
        Ok(rows.into_iter().map(|row| row.get(0)).collect())
    }

    pub async fn mark_profile_ran(&self, key: &str) -> Result<(), Error> {
        let client = self.checkout().await?;
        client
            .execute(
                "UPDATE merge_profiles SET next_run_at = now() + interval '1 minute' WHERE key = $1",
                &[&key],
            )
            .await?;
        Ok(())
    }

    pub async fn put_merge_link(
        &self,
        profile_id: Uuid,
        source_object_id: Uuid,
        master_object_id: Uuid,
    ) -> Result<(), Error> {
        let client = self.checkout().await?;
        let id = Uuid::now_v7();
        client
            .execute(
                "INSERT INTO merge_links (id, profile_id, source_object_id, master_object_id)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (profile_id, source_object_id)
                 DO UPDATE SET master_object_id = EXCLUDED.master_object_id",
                &[&id, &profile_id, &source_object_id, &master_object_id],
            )
            .await?;
        Ok(())
    }

    pub async fn put_manual_link(
        &self,
        profile_id: Uuid,
        source_object_id: Uuid,
        master_object_id: Uuid,
    ) -> Result<(), Error> {
        let client = self.checkout().await?;
        let id = Uuid::now_v7();
        client
            .execute(
                "INSERT INTO merge_links (id, profile_id, source_object_id, master_object_id, manual)
                 VALUES ($1, $2, $3, $4, true)
                 ON CONFLICT (profile_id, source_object_id)
                 DO UPDATE SET master_object_id = EXCLUDED.master_object_id, manual = true",
                &[&id, &profile_id, &source_object_id, &master_object_id],
            )
            .await?;
        Ok(())
    }

    pub async fn delete_merge_link(
        &self,
        profile_id: Uuid,
        source_object_id: Uuid,
    ) -> Result<u64, Error> {
        let client = self.checkout().await?;
        let removed = client
            .execute(
                "DELETE FROM merge_links WHERE profile_id = $1 AND source_object_id = $2",
                &[&profile_id, &source_object_id],
            )
            .await?;
        Ok(removed)
    }

    pub async fn latest_origin(&self, object_id: Uuid) -> Result<Option<Value>, Error> {
        let client = self.checkout().await?;
        let row = client
            .query_opt(
                "SELECT origin FROM changes WHERE object_id = $1 AND origin IS NOT NULL ORDER BY seq DESC LIMIT 1",
                &[&object_id],
            )
            .await?;
        Ok(row.and_then(|row| row.get(0)))
    }

    pub async fn live_keys(&self, type_id: Uuid) -> Result<Vec<(Uuid, String, i64)>, Error> {
        let client = self.checkout().await?;
        let rows = client
            .query(
                "SELECT id, key, version FROM objects
                 WHERE catalog_id = braian_catalog() AND type_id = $1
                   AND deleted_at IS NULL AND key IS NOT NULL
                 ORDER BY key",
                &[&type_id],
            )
            .await?;
        Ok(rows
            .into_iter()
            .map(|row| (row.get(0), row.get(1), row.get(2)))
            .collect())
    }

    pub async fn linked_profile_keys(&self, master_object_id: Uuid) -> Result<Vec<String>, Error> {
        let client = self.checkout().await?;
        let rows = client
            .query(
                "SELECT p.key FROM merge_links l
                 JOIN merge_profiles p ON p.id = l.profile_id
                 WHERE l.master_object_id = $1",
                &[&master_object_id],
            )
            .await?;
        Ok(rows.into_iter().map(|row| row.get(0)).collect())
    }

    pub async fn consumer_seq(&self, name: &str) -> Result<i64, Error> {
        let client = self.checkout().await?;
        let row = client
            .query_opt("SELECT seq FROM consumer_cursor WHERE name = $1", &[&name])
            .await?;
        Ok(row.map(|row| row.get(0)).unwrap_or(0))
    }

    pub async fn set_consumer_seq(&self, name: &str, seq: i64) -> Result<(), Error> {
        let client = self.checkout().await?;
        client
            .execute(
                "INSERT INTO consumer_cursor (name, seq) VALUES ($1, $2)
                 ON CONFLICT (name) DO UPDATE SET seq = EXCLUDED.seq",
                &[&name, &seq],
            )
            .await?;
        Ok(())
    }

    pub async fn merge_run_rows(&self, profile_id: Uuid, limit: i64) -> Result<Vec<Value>, Error> {
        let client = self.checkout().await?;
        let rows = client
            .query(
                "SELECT source_key, master_key, action, detail
                 FROM merge_run_rows WHERE profile_id = $1
                 ORDER BY id DESC LIMIT $2",
                &[&profile_id, &limit],
            )
            .await?;
        Ok(rows
            .into_iter()
            .map(|row| {
                serde_json::json!({
                    "source_key": row.get::<_, String>(0),
                    "master_key": row.get::<_, Option<String>>(1),
                    "action": row.get::<_, String>(2),
                    "detail": row.get::<_, Value>(3),
                })
            })
            .collect())
    }
}
