-- Soft delete for user-facing rows that were hard-deleted.
-- A deleted key can be used again: uniqueness is among live rows only.
-- Rows whose natural key is a primary key referenced by a foreign key
-- (view_types, job_types, workspace_templates) are unchanged. A partial
-- unique index cannot be the target of a foreign key.

ALTER TABLE workspaces ADD COLUMN deleted_at timestamptz;
ALTER TABLE views ADD COLUMN deleted_at timestamptz;
ALTER TABLE assortments ADD COLUMN deleted_at timestamptz;
ALTER TABLE import_mappings ADD COLUMN deleted_at timestamptz;
ALTER TABLE catalogs ADD COLUMN deleted_at timestamptz;
ALTER TABLE merge_profiles ADD COLUMN deleted_at timestamptz;
ALTER TABLE merge_links ADD COLUMN deleted_at timestamptz;
ALTER TABLE links ADD COLUMN deleted_at timestamptz;

ALTER TABLE workspaces DROP CONSTRAINT workspaces_share_token_key;
CREATE UNIQUE INDEX workspaces_share_token_active
    ON workspaces (share_token)
    WHERE share_token IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE catalogs DROP CONSTRAINT catalogs_key_key;
CREATE UNIQUE INDEX catalogs_key_active ON catalogs (key) WHERE deleted_at IS NULL;

DROP INDEX catalogs_one_master;
CREATE UNIQUE INDEX catalogs_one_master
    ON catalogs (kind) WHERE kind = 'master' AND deleted_at IS NULL;

ALTER TABLE merge_profiles DROP CONSTRAINT merge_profiles_key_key;
CREATE UNIQUE INDEX merge_profiles_key_active
    ON merge_profiles (key) WHERE deleted_at IS NULL;

ALTER TABLE merge_links DROP CONSTRAINT merge_links_profile_id_source_object_id_key;
CREATE UNIQUE INDEX merge_links_source_active
    ON merge_links (profile_id, source_object_id) WHERE deleted_at IS NULL;

DROP INDEX links_one_from;
DROP INDEX links_one_to;
CREATE UNIQUE INDEX links_one_from
    ON links (link_type_id, from_id) WHERE from_one AND deleted_at IS NULL;
CREATE UNIQUE INDEX links_one_to
    ON links (link_type_id, to_id) WHERE to_one AND deleted_at IS NULL;

CREATE INDEX objects_deleted ON objects (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX workspaces_deleted ON workspaces (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX catalogs_deleted ON catalogs (deleted_at) WHERE deleted_at IS NOT NULL;
