-- One master catalog and any number of source catalogs. Each catalog has its
-- own definition chain, object key space and search collection. Existing rows
-- belong to the master catalog. A BEFORE INSERT trigger stamps catalog_id from
-- the session setting braian.catalog, so a store scoped to a catalog does not
-- have to repeat the id on every insert.

CREATE TABLE catalogs (
    id uuid PRIMARY KEY,
    key text NOT NULL UNIQUE,
    name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('master', 'source')),
    editable boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX catalogs_one_master ON catalogs (kind) WHERE kind = 'master';

INSERT INTO catalogs (id, key, name, kind, editable) VALUES (
    '018f1000-0000-7000-8000-000000000001',
    'master',
    'Master catalog',
    'master',
    true
);

CREATE OR REPLACE FUNCTION braian_catalog() RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        NULLIF(current_setting('braian.catalog', true), '')::uuid,
        '018f1000-0000-7000-8000-000000000001'::uuid
    );
$$;

CREATE OR REPLACE FUNCTION braian_stamp_catalog() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.catalog_id IS NULL THEN
        NEW.catalog_id := braian_catalog();
    END IF;
    RETURN NEW;
END;
$$;

-- Adds catalog_id, backfills the master, then requires the column.
CREATE OR REPLACE FUNCTION braian_add_catalog(target regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format('ALTER TABLE %s ADD COLUMN catalog_id uuid', target);
    EXECUTE format(
        'UPDATE %s SET catalog_id = %L WHERE catalog_id IS NULL',
        target,
        '018f1000-0000-7000-8000-000000000001'
    );
    EXECUTE format('ALTER TABLE %s ALTER COLUMN catalog_id SET NOT NULL', target);
    EXECUTE format(
        'CREATE TRIGGER braian_stamp_catalog BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION braian_stamp_catalog()',
        target
    );
END;
$$;

SELECT braian_add_catalog('definition_revisions');
ALTER TABLE definition_revisions DROP CONSTRAINT definition_revisions_pkey;
ALTER TABLE definition_revisions ADD PRIMARY KEY (catalog_id, model_revision);

SELECT braian_add_catalog('attribute_parts');
ALTER TABLE attribute_parts DROP CONSTRAINT attribute_parts_pkey;
ALTER TABLE attribute_parts ADD PRIMARY KEY (catalog_id, attribute_id);

SELECT braian_add_catalog('objects');
DROP INDEX objects_type_id_key_active;
CREATE UNIQUE INDEX objects_catalog_type_key_active
    ON objects (catalog_id, type_id, key) WHERE deleted_at IS NULL;
CREATE INDEX objects_catalog_live ON objects (catalog_id) WHERE deleted_at IS NULL;

SELECT braian_add_catalog('batches');
SELECT braian_add_catalog('changes');
CREATE INDEX changes_catalog_seq ON changes (catalog_id, seq);

SELECT braian_add_catalog('import_sessions');
SELECT braian_add_catalog('proposals');
SELECT braian_add_catalog('model_drafts');
ALTER TABLE model_drafts DROP CONSTRAINT model_drafts_pkey;
ALTER TABLE model_drafts ADD PRIMARY KEY (user_id, catalog_id);

SELECT braian_add_catalog('job_runs');
SELECT braian_add_catalog('workspaces');

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'import_mappings'
    ) THEN
        PERFORM braian_add_catalog('import_mappings');
    END IF;
END;
$$;

-- One indexer cursor per catalog. The master row keeps id = 1.
ALTER TABLE indexer_progress DROP CONSTRAINT indexer_progress_pkey;
ALTER TABLE indexer_progress DROP CONSTRAINT indexer_progress_id_check;
ALTER TABLE indexer_progress ADD COLUMN catalog_id uuid;
UPDATE indexer_progress
SET catalog_id = '018f1000-0000-7000-8000-000000000001'
WHERE catalog_id IS NULL;
ALTER TABLE indexer_progress ALTER COLUMN catalog_id SET NOT NULL;
ALTER TABLE indexer_progress ADD PRIMARY KEY (catalog_id);
CREATE TRIGGER braian_stamp_catalog
    BEFORE INSERT ON indexer_progress
    FOR EACH ROW EXECUTE FUNCTION braian_stamp_catalog();

DROP FUNCTION braian_add_catalog(regclass);
