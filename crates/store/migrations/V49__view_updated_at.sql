-- Clock for optimistic view-state writes. A save merges top-level keys and
-- bumps this. Clients send the value back as expected_updated_at.

ALTER TABLE views
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
