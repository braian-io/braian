-- Schedule, manual links and the views that administer catalogs and merge.

ALTER TABLE merge_profiles ADD COLUMN IF NOT EXISTS schedule text;
ALTER TABLE merge_profiles ADD COLUMN IF NOT EXISTS next_run_at timestamptz;
ALTER TABLE merge_links ADD COLUMN IF NOT EXISTS manual boolean NOT NULL DEFAULT false;

INSERT INTO view_types (key, title, builtin) VALUES
    ('catalogs', 'Catalogs', true),
    ('merge_profiles', 'Merge profiles', true),
    ('ownership_rules', 'Ownership', true),
    ('merge_runs', 'Merge runs', true)
ON CONFLICT (key) DO NOTHING;
