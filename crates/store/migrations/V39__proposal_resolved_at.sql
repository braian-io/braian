-- When a person accepts or discards a proposal. The card shows this time.
ALTER TABLE proposals ADD COLUMN resolved_at timestamptz;
