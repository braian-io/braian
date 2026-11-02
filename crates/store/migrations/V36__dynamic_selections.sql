-- A selection is either dynamic (a stored filter in the same syntax as a view's
-- filter, re-evaluated on every read) or manual (hand-picked members, no query).
-- The kind is locked after create; an existing selection keeps the manual kind.
ALTER TABLE assortments ADD COLUMN kind text NOT NULL DEFAULT 'manual'
    CHECK (kind IN ('dynamic', 'manual'));
