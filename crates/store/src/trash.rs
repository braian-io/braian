//! Trash: soft-deleted rows the caller can list and restore.
//!
//! Restoring clears `deleted_at`. A live row that already holds the same
//! unique key blocks the restore; nothing is overwritten.

use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::error::Error;
use crate::session::Store;

const PAGE: i64 = 100;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrashRow {
    pub kind: &'static str,
    pub id: Uuid,
    pub label: String,
    pub number: String,
    pub type_key: String,
    pub deleted_at: DateTime<Utc>,
}

impl Store {
    /// Soft-deleted rows in the current catalog, plus the caller's workspaces.
    pub async fn list_trash(&self, user_id: Option<Uuid>) -> Result<Vec<TrashRow>, Error> {
        let client = self.checkout().await?;
        let mut items = Vec::new();

        let objects = client
            .query(
                "SELECT o.id, o.deleted_at,
                        COALESCE(NULLIF(btrim(o.key), ''), '') AS object_key,
                        COALESCE(
                          NULLIF(v.values #>> '{number}', ''),
                          NULLIF(v.values #>> '{number,en}', ''),
                          ''
                        ) AS value_number,
                        COALESCE(
                          NULLIF(v.values #>> '{name,en}', ''),
                          NULLIF(v.values #>> '{name,sv}', ''),
                          NULLIF(v.values #>> '{name,de}', ''),
                          NULLIF(v.values #>> '{name}', ''),
                          ''
                        ) AS value_name,
                        COALESCE(NULLIF(btrim(src.key), ''), '') AS from_key,
                        COALESCE(NULLIF(btrim(tgt.key), ''), '') AS to_key
                 FROM objects o
                 LEFT JOIN object_values v ON v.object_id = o.id AND v.is_latest
                 LEFT JOIN links l ON l.object_id = o.id
                 LEFT JOIN objects src ON src.id = l.from_id
                 LEFT JOIN objects tgt ON tgt.id = l.to_id
                 WHERE o.catalog_id = braian_catalog() AND o.deleted_at IS NOT NULL
                 ORDER BY o.deleted_at DESC
                 LIMIT $1",
                &[&PAGE],
            )
            .await?;
        for row in objects {
            let object_key: String = row.get("object_key");
            let value_number: String = row.get("value_number");
            let value_name: String = row.get("value_name");
            let number = if !object_key.is_empty() {
                object_key.clone()
            } else {
                value_number
            };
            let mut label = value_name;
            if label.is_empty() {
                let from_key: String = row.get("from_key");
                let to_key: String = row.get("to_key");
                if !from_key.is_empty() && !to_key.is_empty() {
                    label = format!("{from_key} → {to_key}");
                } else if !from_key.is_empty() || !to_key.is_empty() {
                    label = format!("{from_key}{to_key}");
                }
            }
            if label.is_empty() && !number.is_empty() {
                label = number.clone();
            }
            items.push(TrashRow {
                kind: "object",
                id: row.get("id"),
                label,
                number,
                type_key: String::new(),
                deleted_at: row.get("deleted_at"),
            });
        }

        if let Some(user_id) = user_id {
            let workspaces = client
                .query(
                    "SELECT w.id, w.name AS label, w.deleted_at
                     FROM workspaces w
                     JOIN workspace_members m ON m.workspace_id = w.id
                     WHERE m.user_id = $1 AND w.deleted_at IS NOT NULL
                     ORDER BY w.deleted_at DESC
                     LIMIT $2",
                    &[&user_id, &PAGE],
                )
                .await?;
            for row in workspaces {
                items.push(TrashRow {
                    kind: "workspace",
                    id: row.get("id"),
                    label: row.get("label"),
                    number: String::new(),
                    type_key: String::new(),
                    deleted_at: row.get("deleted_at"),
                });
            }
            let views = client
                .query(
                    "SELECT v.id, v.title AS label, v.deleted_at
                     FROM views v
                     JOIN workspaces w ON w.id = v.workspace_id AND w.deleted_at IS NULL
                     JOIN workspace_members m ON m.workspace_id = w.id
                     WHERE m.user_id = $1 AND v.deleted_at IS NOT NULL
                     ORDER BY v.deleted_at DESC
                     LIMIT $2",
                    &[&user_id, &PAGE],
                )
                .await?;
            for row in views {
                items.push(TrashRow {
                    kind: "view",
                    id: row.get("id"),
                    label: row.get("label"),
                    number: String::new(),
                    type_key: String::new(),
                    deleted_at: row.get("deleted_at"),
                });
            }
        }

        push_simple(
            &mut items,
            "assortment",
            &client
                .query(
                    "SELECT id, name AS label, deleted_at FROM assortments
                     WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT $1",
                    &[&PAGE],
                )
                .await?,
        );
        push_simple(
            &mut items,
            "import_mapping",
            &client
                .query(
                    "SELECT id, name AS label, deleted_at FROM import_mappings
                     WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT $1",
                    &[&PAGE],
                )
                .await?,
        );
        push_simple(
            &mut items,
            "catalog",
            &client
                .query(
                    "SELECT id, key AS label, deleted_at FROM catalogs
                     WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT $1",
                    &[&PAGE],
                )
                .await?,
        );
        push_simple(
            &mut items,
            "merge_profile",
            &client
                .query(
                    "SELECT id, key AS label, deleted_at FROM merge_profiles
                     WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT $1",
                    &[&PAGE],
                )
                .await?,
        );
        let links = client
            .query(
                "SELECT l.id,
                        p.key || ' ' || COALESCE(src.key, l.source_object_id::text) AS label,
                        l.deleted_at
                 FROM merge_links l
                 JOIN merge_profiles p ON p.id = l.profile_id
                 LEFT JOIN objects src ON src.id = l.source_object_id
                 WHERE l.deleted_at IS NOT NULL
                 ORDER BY l.deleted_at DESC
                 LIMIT $1",
                &[&PAGE],
            )
            .await?;
        for row in links {
            items.push(TrashRow {
                kind: "merge_link",
                id: row.get("id"),
                label: row.get("label"),
                number: String::new(),
                type_key: String::new(),
                deleted_at: row.get("deleted_at"),
            });
        }

        items.sort_by(|left, right| right.deleted_at.cmp(&left.deleted_at));
        Ok(items)
    }

    pub async fn restore_workspace(&self, id: Uuid) -> Result<(), Error> {
        let mut client = self.checkout().await?;
        let tx = client.transaction().await?;
        let row = tx
            .query_opt(
                "SELECT deleted_at, share_token FROM workspaces WHERE id = $1 FOR UPDATE",
                &[&id],
            )
            .await?;
        let Some(row) = row else {
            return Err(Error::UnknownEntity("That workspace was not found.".into()));
        };
        let deleted_at: Option<DateTime<Utc>> = row.get("deleted_at");
        let Some(deleted_at) = deleted_at else {
            return Err(Error::RestoreBlocked(
                "This workspace is not deleted.".into(),
            ));
        };
        if let Some(token) = row.get::<_, Option<String>>("share_token") {
            let taken = tx
                .query_opt(
                    "SELECT 1 FROM workspaces
                     WHERE share_token = $1 AND id <> $2 AND deleted_at IS NULL",
                    &[&token, &id],
                )
                .await?;
            if taken.is_some() {
                return Err(Error::RestoreBlocked(
                    "A live workspace already uses this share link.".into(),
                ));
            }
        }
        tx.execute(
            "UPDATE views SET deleted_at = NULL
             WHERE workspace_id = $1 AND deleted_at = $2",
            &[&id, &deleted_at],
        )
        .await?;
        tx.execute(
            "UPDATE workspaces SET deleted_at = NULL WHERE id = $1",
            &[&id],
        )
        .await
        .map_err(workspace_share_conflict)?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn restore_view(&self, id: Uuid) -> Result<(), Error> {
        let client = self.checkout().await?;
        let row = client
            .query_opt(
                "SELECT v.deleted_at, w.deleted_at
                 FROM views v
                 JOIN workspaces w ON w.id = v.workspace_id
                 WHERE v.id = $1",
                &[&id],
            )
            .await?;
        let Some(row) = row else {
            return Err(Error::UnknownEntity("That view was not found.".into()));
        };
        let view_deleted: Option<DateTime<Utc>> = row.get(0);
        if view_deleted.is_none() {
            return Err(Error::RestoreBlocked("This view is not deleted.".into()));
        }
        let workspace_deleted: Option<DateTime<Utc>> = row.get(1);
        if workspace_deleted.is_some() {
            return Err(Error::RestoreBlocked(
                "Restore the workspace to bring this view back.".into(),
            ));
        }
        client
            .execute(
                "UPDATE views SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL",
                &[&id],
            )
            .await?;
        Ok(())
    }

    pub async fn restore_assortment(&self, id: Uuid) -> Result<(), Error> {
        restore_simple(
            self,
            "assortments",
            id,
            "That selection was not found.",
            "This selection is not deleted.",
        )
        .await
    }

    pub async fn restore_import_mapping(&self, id: Uuid) -> Result<(), Error> {
        restore_simple(
            self,
            "import_mappings",
            id,
            "That import mapping was not found.",
            "This import mapping is not deleted.",
        )
        .await
    }

    pub async fn restore_catalog(&self, id: Uuid) -> Result<(), Error> {
        let mut client = self.checkout().await?;
        let tx = client.transaction().await?;
        let row = tx
            .query_opt(
                "SELECT key, deleted_at FROM catalogs WHERE id = $1 FOR UPDATE",
                &[&id],
            )
            .await?;
        let Some(row) = row else {
            return Err(Error::UnknownEntity("That catalog was not found.".into()));
        };
        let deleted_at: Option<DateTime<Utc>> = row.get("deleted_at");
        let Some(deleted_at) = deleted_at else {
            return Err(Error::RestoreBlocked("This catalog is not deleted.".into()));
        };
        let key: String = row.get("key");
        let taken = tx
            .query_opt(
                "SELECT 1 FROM catalogs WHERE key = $1 AND id <> $2 AND deleted_at IS NULL",
                &[&key, &id],
            )
            .await?;
        if taken.is_some() {
            return Err(Error::RestoreBlocked(format!(
                "A live catalog already uses the key {key}."
            )));
        }
        let blocked = tx
            .query(
                "SELECT p.key FROM merge_profiles p
                 WHERE p.source_catalog_id = $1 AND p.deleted_at = $2
                   AND EXISTS (
                     SELECT 1 FROM merge_profiles live
                     WHERE live.key = p.key AND live.deleted_at IS NULL
                   )",
                &[&id, &deleted_at],
            )
            .await?;
        if let Some(row) = blocked.first() {
            let profile_key: String = row.get(0);
            return Err(Error::RestoreBlocked(format!(
                "A live merge profile already uses the key {profile_key}."
            )));
        }
        tx.execute(
            "UPDATE merge_profiles SET deleted_at = NULL
             WHERE source_catalog_id = $1 AND deleted_at = $2",
            &[&id, &deleted_at],
        )
        .await?;
        tx.execute(
            "UPDATE catalogs SET deleted_at = NULL WHERE id = $1",
            &[&id],
        )
        .await
        .map_err(|error| catalog_key_conflict(error, &key))?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn restore_merge_profile(&self, id: Uuid) -> Result<(), Error> {
        let mut client = self.checkout().await?;
        let tx = client.transaction().await?;
        let row = tx
            .query_opt(
                "SELECT p.key, p.deleted_at, c.deleted_at
                 FROM merge_profiles p
                 JOIN catalogs c ON c.id = p.source_catalog_id
                 WHERE p.id = $1
                 FOR UPDATE OF p",
                &[&id],
            )
            .await?;
        let Some(row) = row else {
            return Err(Error::UnknownEntity(
                "That merge profile was not found.".into(),
            ));
        };
        let deleted_at: Option<DateTime<Utc>> = row.get(1);
        if deleted_at.is_none() {
            return Err(Error::RestoreBlocked(
                "This merge profile is not deleted.".into(),
            ));
        }
        let catalog_deleted: Option<DateTime<Utc>> = row.get(2);
        if catalog_deleted.is_some() {
            return Err(Error::RestoreBlocked(
                "Restore the source catalog before this merge profile.".into(),
            ));
        }
        let key: String = row.get(0);
        let taken = tx
            .query_opt(
                "SELECT 1 FROM merge_profiles WHERE key = $1 AND id <> $2 AND deleted_at IS NULL",
                &[&key, &id],
            )
            .await?;
        if taken.is_some() {
            return Err(Error::RestoreBlocked(format!(
                "A live merge profile already uses the key {key}."
            )));
        }
        tx.execute(
            "UPDATE merge_profiles SET deleted_at = NULL WHERE id = $1",
            &[&id],
        )
        .await
        .map_err(|error| profile_key_conflict(error, &key))?;
        tx.commit().await?;
        Ok(())
    }

    /// Permanently removes one soft-deleted row. Fails when the row is missing or not deleted.
    pub async fn purge_trash(&self, kind: &str, id: Uuid) -> Result<(), Error> {
        match kind {
            "object" => self.purge_deleted_object(id).await,
            "workspace" => {
                purge_row(&self, "workspaces", id, "That workspace was not found.").await
            }
            "view" => purge_row(&self, "views", id, "That view was not found.").await,
            "assortment" => {
                purge_row(&self, "assortments", id, "That selection was not found.").await
            }
            "import_mapping" => {
                purge_row(
                    &self,
                    "import_mappings",
                    id,
                    "That import mapping was not found.",
                )
                .await
            }
            "catalog" => self.purge_deleted_catalog(id).await,
            "merge_profile" => {
                purge_row(
                    &self,
                    "merge_profiles",
                    id,
                    "That merge profile was not found.",
                )
                .await
            }
            "merge_link" => {
                purge_row(&self, "merge_links", id, "That merge link was not found.").await
            }
            _ => Err(Error::UnknownEntity(format!("unknown trash kind {kind}"))),
        }
    }

    async fn purge_deleted_object(&self, id: Uuid) -> Result<(), Error> {
        let mut client = self.checkout().await?;
        let tx = client.transaction().await?;
        let row = tx
            .query_opt(
                "SELECT deleted_at FROM objects WHERE id = $1 AND catalog_id = braian_catalog() FOR UPDATE",
                &[&id],
            )
            .await?;
        let Some(row) = row else {
            return Err(Error::UnknownEntity("That object was not found.".into()));
        };
        let deleted_at: Option<DateTime<Utc>> = row.get(0);
        if deleted_at.is_none() {
            return Err(Error::RestoreBlocked(
                "This object is not in the trash.".into(),
            ));
        }
        tx.execute(
            "DELETE FROM merge_links WHERE source_object_id = $1 OR master_object_id = $1",
            &[&id],
        )
        .await?;
        tx.execute(
            "DELETE FROM links WHERE object_id = $1 OR from_id = $1 OR to_id = $1",
            &[&id],
        )
        .await?;
        tx.execute("DELETE FROM object_values WHERE object_id = $1", &[&id])
            .await?;
        tx.execute("DELETE FROM object_structures WHERE object_id = $1", &[&id])
            .await?;
        let removed = tx
            .execute("DELETE FROM objects WHERE id = $1", &[&id])
            .await?;
        if removed == 0 {
            return Err(Error::UnknownEntity("That object was not found.".into()));
        }
        tx.commit().await?;
        Ok(())
    }

    async fn purge_deleted_catalog(&self, id: Uuid) -> Result<(), Error> {
        let mut client = self.checkout().await?;
        let tx = client.transaction().await?;
        let row = tx
            .query_opt(
                "SELECT deleted_at FROM catalogs WHERE id = $1 FOR UPDATE",
                &[&id],
            )
            .await?;
        let Some(row) = row else {
            return Err(Error::UnknownEntity("That catalog was not found.".into()));
        };
        if row.get::<_, Option<DateTime<Utc>>>(0).is_none() {
            return Err(Error::RestoreBlocked(
                "This catalog is not in the trash.".into(),
            ));
        }
        crate::retention::purge_catalog_contents(&tx, id).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn restore_merge_link(&self, id: Uuid) -> Result<(), Error> {
        let mut client = self.checkout().await?;
        let tx = client.transaction().await?;
        let row = tx
            .query_opt(
                "SELECT profile_id, source_object_id, deleted_at
                 FROM merge_links WHERE id = $1 FOR UPDATE",
                &[&id],
            )
            .await?;
        let Some(row) = row else {
            return Err(Error::UnknownEntity(
                "That merge link was not found.".into(),
            ));
        };
        let deleted_at: Option<DateTime<Utc>> = row.get(2);
        if deleted_at.is_none() {
            return Err(Error::RestoreBlocked(
                "This merge link is not deleted.".into(),
            ));
        }
        let profile_id: Uuid = row.get(0);
        let source_object_id: Uuid = row.get(1);
        let profile_live = tx
            .query_opt(
                "SELECT 1 FROM merge_profiles WHERE id = $1 AND deleted_at IS NULL",
                &[&profile_id],
            )
            .await?;
        if profile_live.is_none() {
            return Err(Error::RestoreBlocked(
                "Restore the merge profile before this link.".into(),
            ));
        }
        let taken = tx
            .query_opt(
                "SELECT 1 FROM merge_links
                 WHERE profile_id = $1 AND source_object_id = $2 AND id <> $3 AND deleted_at IS NULL",
                &[&profile_id, &source_object_id, &id],
            )
            .await?;
        if taken.is_some() {
            return Err(Error::RestoreBlocked(
                "A live merge link already matches this source object.".into(),
            ));
        }
        tx.execute(
            "UPDATE merge_links SET deleted_at = NULL WHERE id = $1",
            &[&id],
        )
        .await
        .map_err(merge_link_conflict)?;
        tx.commit().await?;
        Ok(())
    }
}

fn push_simple(items: &mut Vec<TrashRow>, kind: &'static str, rows: &[tokio_postgres::Row]) {
    for row in rows {
        items.push(TrashRow {
            kind,
            id: row.get("id"),
            label: row.get("label"),
            number: String::new(),
            type_key: String::new(),
            deleted_at: row.get("deleted_at"),
        });
    }
}

async fn purge_row(store: &Store, table: &str, id: Uuid, missing: &str) -> Result<(), Error> {
    let client = store.checkout().await?;
    let row = client
        .query_opt(
            &format!("SELECT deleted_at FROM {table} WHERE id = $1"),
            &[&id],
        )
        .await?;
    let Some(row) = row else {
        return Err(Error::UnknownEntity(missing.into()));
    };
    if row.get::<_, Option<DateTime<Utc>>>(0).is_none() {
        return Err(Error::RestoreBlocked(format!(
            "This row is not in the trash."
        )));
    }
    let removed = client
        .execute(&format!("DELETE FROM {table} WHERE id = $1"), &[&id])
        .await?;
    if removed == 0 {
        return Err(Error::UnknownEntity(missing.into()));
    }
    Ok(())
}

async fn restore_simple(
    store: &Store,
    table: &str,
    id: Uuid,
    missing: &str,
    not_deleted: &str,
) -> Result<(), Error> {
    let client = store.checkout().await?;
    let row = client
        .query_opt(
            &format!("SELECT deleted_at FROM {table} WHERE id = $1"),
            &[&id],
        )
        .await?;
    let Some(row) = row else {
        return Err(Error::UnknownEntity(missing.into()));
    };
    let deleted_at: Option<DateTime<Utc>> = row.get(0);
    if deleted_at.is_none() {
        return Err(Error::RestoreBlocked(not_deleted.into()));
    }
    client
        .execute(
            &format!("UPDATE {table} SET deleted_at = NULL WHERE id = $1"),
            &[&id],
        )
        .await?;
    Ok(())
}

fn unique_violation(error: &tokio_postgres::Error) -> bool {
    error
        .as_db_error()
        .is_some_and(|db| db.code() == &tokio_postgres::error::SqlState::UNIQUE_VIOLATION)
}

fn workspace_share_conflict(error: tokio_postgres::Error) -> Error {
    if unique_violation(&error) {
        Error::RestoreBlocked("A live workspace already uses this share link.".into())
    } else {
        Error::Db(error)
    }
}

fn catalog_key_conflict(error: tokio_postgres::Error, key: &str) -> Error {
    if unique_violation(&error) {
        Error::RestoreBlocked(format!("A live catalog already uses the key {key}."))
    } else {
        Error::Db(error)
    }
}

fn profile_key_conflict(error: tokio_postgres::Error, key: &str) -> Error {
    if unique_violation(&error) {
        Error::RestoreBlocked(format!("A live merge profile already uses the key {key}."))
    } else {
        Error::Db(error)
    }
}

fn merge_link_conflict(error: tokio_postgres::Error) -> Error {
    if unique_violation(&error) {
        Error::RestoreBlocked("A live merge link already matches this source object.".into())
    } else {
        Error::Db(error)
    }
}
