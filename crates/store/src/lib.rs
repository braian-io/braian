//! Postgres storage for objects, definitions and the change log.
//!
//! Object values are JSONB documents in `object_values`. [`STORAGE_FORM`] decides
//! how those documents are split. Spike 1 measured every form; see
//! `docs/measurements/2026-10-24-spike-1-storage.md`.

mod catalog_resolve;
mod catalogs;
mod conflict;
mod error;
mod gauge;
mod ids;
mod imports;
mod links;
mod log;
mod merge;
mod ops;
mod pressure;
mod product;
mod purge;
mod scan;
mod session;
mod split;
pub mod testing;
mod types;
mod view_repair;

pub use catalog_resolve::{
    CatalogRef, default_catalog_id, effective_catalog_id, view_catalog_override,
    workspace_catalog_ref,
};
pub use catalogs::{CatalogKind, CatalogRecord};
pub use error::{Conflict, Error};
pub use ids::{
    Actor, BatchId, BatchKind, CatalogId, ChangeOp, MASTER_CATALOG_ID, PrincipalId, PrincipalKind,
    SYSTEM_PRINCIPAL,
};
pub use imports::{ImportRowIn, ImportRowOut, ImportSession, SavedMapping};
pub use log::{ChangeListener, LogClaim, LogEvent};
pub use merge::MergeProfile;
pub use ops::{ProposalLock, ProposalWrite};
pub use pressure::InteractiveGuard;
pub use product::{AttributeUsageCount, HistoryEntry, ProposalRow, UserRecord};
pub use scan::{EXPORT_CHUNK, ExportObject, ExportOrder, ExportScan};
pub use session::{DbLane, HeldConnection, PoolConfig, Store, scope_origin};
pub use split::StorageForm;

/// Connections used to create the databases the spike and the tests measure.
pub mod admin {
    pub use crate::session::{PgConn, create_database, drop_database, parse_config};
}
pub use types::{
    BulkReport, BulkRowError, ChangeRow, LinkView, ObjectAudit, ObjectOp, ObjectProjection,
    PrincipalRecord, StoredObject, WriteReceipt,
};

/// Form used by [`Store::connect`].
///
/// Spike 1 picks this from measured WAL and write rate. Until that measurement
/// is in `docs/measurements/`, the value is only a placeholder.
/// Chosen by spike 1: edits rewrite one small part, and import was fastest too.
pub const STORAGE_FORM: StorageForm = StorageForm::PerLanguageGroup;
