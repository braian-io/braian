//! Catalogs. The master holds the merged model. A source catalog mirrors one
//! upstream system and has its own definitions and objects.

use serde_json::Value;

use crate::error::Error;
use crate::ids::{CatalogId, MASTER_CATALOG_ID};
use crate::session::Store;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CatalogKind {
    Master,
    Source,
}

impl CatalogKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Master => "master",
            Self::Source => "source",
        }
    }

    pub fn parse(value: &str) -> Result<Self, Error> {
        match value {
            "master" => Ok(Self::Master),
            "source" => Ok(Self::Source),
            other => Err(Error::Data(format!("unknown catalog kind {other}"))),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogRecord {
    pub id: CatalogId,
    pub key: String,
    pub name: String,
    pub kind: CatalogKind,
    pub editable: bool,
}

impl CatalogRecord {
    pub fn to_json(&self) -> Value {
        serde_json::json!({
            "id": self.id.as_uuid(),
            "key": &self.key,
            "name": &self.name,
            "kind": self.kind.as_str(),
            "editable": self.editable,
        })
    }
}

fn record_from_row(row: &tokio_postgres::Row) -> Result<CatalogRecord, Error> {
    Ok(CatalogRecord {
        id: CatalogId::from_uuid(row.get("id")),
        key: row.get("key"),
        name: row.get("name"),
        kind: CatalogKind::parse(row.get("kind"))?,
        editable: row.get("editable"),
    })
}

impl Store {
    /// Catalog stamped on this store, ignoring a request override.
    pub fn bound_catalog(&self) -> CatalogId {
        self.catalog
    }

    /// Request catalog when a handler has scoped one, otherwise this store's catalog.
    pub fn catalog_id(&self) -> CatalogId {
        crate::session::request_catalog().unwrap_or(self.catalog)
    }

    /// Runs `future` so every checkout on this task uses `catalog`.
    pub async fn scope_catalog<F>(catalog: CatalogId, future: F) -> F::Output
    where
        F: std::future::Future,
    {
        crate::session::scope_catalog(catalog, future).await
    }

    /// A clone whose catalog field matches the active request, for spawned tasks.
    pub fn scoped(&self) -> Self {
        self.with_catalog(self.catalog_id())
    }

    /// Same pool and definition cache, scoped to another catalog.
    ///
    /// Reads and writes use this catalog until the caller switches again.
    pub fn with_catalog(&self, catalog: CatalogId) -> Self {
        let mut store = self.clone();
        store.catalog = catalog;
        store
    }

    pub async fn catalogs(&self) -> Result<Vec<CatalogRecord>, Error> {
        let client = self.checkout().await?;
        let rows = client
            .query(
                "SELECT id, key, name, kind, editable FROM catalogs ORDER BY kind DESC, key",
                &[],
            )
            .await?;
        rows.iter().map(record_from_row).collect()
    }

    pub async fn catalog_by_key(&self, key: &str) -> Result<Option<CatalogRecord>, Error> {
        let client = self.checkout().await?;
        let row = client
            .query_opt(
                "SELECT id, key, name, kind, editable FROM catalogs WHERE key = $1",
                &[&key],
            )
            .await?;
        row.as_ref().map(record_from_row).transpose()
    }

    pub async fn catalog_by_id(&self, id: CatalogId) -> Result<Option<CatalogRecord>, Error> {
        let client = self.checkout().await?;
        let uuid = id.as_uuid();
        let row = client
            .query_opt(
                "SELECT id, key, name, kind, editable FROM catalogs WHERE id = $1",
                &[&uuid],
            )
            .await?;
        row.as_ref().map(record_from_row).transpose()
    }

    /// Catalog key for each object id. Missing ids are omitted.
    pub async fn object_catalog_keys(
        &self,
        ids: &[uuid::Uuid],
    ) -> Result<std::collections::HashMap<uuid::Uuid, (CatalogId, String)>, Error> {
        if ids.is_empty() {
            return Ok(std::collections::HashMap::new());
        }
        let client = self.checkout().await?;
        let rows = client
            .query(
                "SELECT o.id, c.id AS catalog_id, c.key
                 FROM objects o
                 JOIN catalogs c ON c.id = o.catalog_id
                 WHERE o.id = ANY($1)",
                &[&ids],
            )
            .await?;
        let mut found = std::collections::HashMap::with_capacity(rows.len());
        for row in rows {
            let id: uuid::Uuid = row.get("id");
            let catalog = CatalogId::from_uuid(row.get("catalog_id"));
            let key: String = row.get("key");
            found.insert(id, (catalog, key));
        }
        Ok(found)
    }

    pub async fn batch_catalog_keys(
        &self,
        ids: &[uuid::Uuid],
    ) -> Result<std::collections::HashMap<uuid::Uuid, (CatalogId, String)>, Error> {
        if ids.is_empty() {
            return Ok(std::collections::HashMap::new());
        }
        let client = self.checkout().await?;
        let rows = client
            .query(
                "SELECT b.id, c.id AS catalog_id, c.key
                 FROM batches b
                 JOIN catalogs c ON c.id = b.catalog_id
                 WHERE b.id = ANY($1)",
                &[&ids],
            )
            .await?;
        let mut found = std::collections::HashMap::with_capacity(rows.len());
        for row in rows {
            let id: uuid::Uuid = row.get("id");
            found.insert(
                id,
                (CatalogId::from_uuid(row.get("catalog_id")), row.get("key")),
            );
        }
        Ok(found)
    }

    pub async fn object_catalog(&self, id: uuid::Uuid) -> Result<Option<CatalogId>, Error> {
        let client = self.checkout().await?;
        let row = client
            .query_opt("SELECT catalog_id FROM objects WHERE id = $1", &[&id])
            .await?;
        Ok(row.map(|row| CatalogId::from_uuid(row.get(0))))
    }

    pub async fn require_catalog(&self, key: &str) -> Result<CatalogRecord, Error> {
        self.catalog_by_key(key)
            .await?
            .ok_or_else(|| Error::CatalogNotFound(key.to_owned()))
    }

    /// Creates a source catalog, or the master when none exists yet.
    ///
    /// A second master fails with [`Error::CatalogExists`]. The new catalog
    /// gets its own indexer cursor at sequence 0.
    pub async fn create_catalog(
        &self,
        id: CatalogId,
        key: &str,
        name: &str,
        kind: CatalogKind,
        editable: bool,
    ) -> Result<CatalogRecord, Error> {
        if kind == CatalogKind::Master && id != MASTER_CATALOG_ID {
            return Err(Error::Data(
                "the master catalog uses the reserved id".into(),
            ));
        }
        let client = self.checkout().await?;
        let uuid = id.as_uuid();
        let inserted = client
            .execute(
                "INSERT INTO catalogs (id, key, name, kind, editable) VALUES ($1, $2, $3, $4, $5)",
                &[&uuid, &key, &name, &kind.as_str(), &editable],
            )
            .await
            .map_err(|error| map_catalog_unique(error, key))?;
        if inserted == 0 {
            return Err(Error::CatalogExists(key.to_owned()));
        }
        let progress_id: i32 = client
            .query_one("SELECT COALESCE(MAX(id), 0) + 1 FROM indexer_progress", &[])
            .await?
            .get(0);
        client
            .execute(
                "INSERT INTO indexer_progress (id, seq, catalog_id) VALUES ($1, 0, $2)",
                &[&progress_id, &uuid],
            )
            .await?;
        Ok(CatalogRecord {
            id,
            key: key.to_owned(),
            name: name.to_owned(),
            kind,
            editable,
        })
    }
}

fn map_catalog_unique(error: tokio_postgres::Error, key: &str) -> Error {
    if let Some(db) = error.as_db_error()
        && db.code().code() == "23505"
    {
        return Error::CatalogExists(key.to_owned());
    }
    Error::Db(error)
}
