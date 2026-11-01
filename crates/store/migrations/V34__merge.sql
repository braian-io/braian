-- Merge profiles, ownership and the provenance a master value came from.
-- A profile is append-only: a new revision never rewrites an old one.

ALTER TABLE changes ADD COLUMN IF NOT EXISTS origin jsonb;

CREATE OR REPLACE FUNCTION braian_stamp_origin() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    raw text;
BEGIN
    IF NEW.origin IS NULL THEN
        raw := current_setting('braian.origin', true);
        IF raw IS NOT NULL AND raw <> '' THEN
            NEW.origin := raw::jsonb;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS braian_stamp_origin ON changes;
CREATE TRIGGER braian_stamp_origin
    BEFORE INSERT ON changes
    FOR EACH ROW EXECUTE FUNCTION braian_stamp_origin();

CREATE TABLE merge_profiles (
    id uuid PRIMARY KEY,
    key text NOT NULL UNIQUE,
    name text NOT NULL,
    source_catalog_id uuid NOT NULL REFERENCES catalogs (id),
    spec jsonb NOT NULL,
    mode text NOT NULL CHECK (mode IN ('continuous', 'manual')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE merge_profile_revisions (
    profile_id uuid NOT NULL REFERENCES merge_profiles (id),
    revision bigint NOT NULL,
    spec jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, revision)
);

CREATE TABLE ownership_revisions (
    revision bigint PRIMARY KEY,
    rules jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE merge_links (
    id uuid PRIMARY KEY,
    profile_id uuid NOT NULL REFERENCES merge_profiles (id),
    source_object_id uuid NOT NULL REFERENCES objects (id),
    master_object_id uuid NOT NULL REFERENCES objects (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (profile_id, source_object_id)
);

CREATE TABLE merge_run_rows (
    id bigserial PRIMARY KEY,
    profile_id uuid NOT NULL REFERENCES merge_profiles (id),
    source_key text NOT NULL,
    master_key text,
    action text NOT NULL,
    detail jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consumer_cursor (
    name text PRIMARY KEY,
    seq bigint NOT NULL
);

ALTER TABLE import_sessions ADD COLUMN IF NOT EXISTS snapshot boolean NOT NULL DEFAULT false;
