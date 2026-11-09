-- Durable audit of the supported recovery for historical proposals that were
-- closed while rows were still pending. The proposal id is intentionally not a
-- foreign key: the audit must survive the normal retention cleanup of old
-- proposals. One row is written per discard call that actually rejects rows on
-- an already closed proposal; repeating the call is a no-op.
CREATE TABLE proposal_recoveries (
    id uuid PRIMARY KEY,
    proposal_id uuid NOT NULL,
    previous_status text NOT NULL CHECK (previous_status IN ('accepted', 'discarded')),
    rejected_rows integer NOT NULL CHECK (rejected_rows > 0),
    actor uuid REFERENCES principals (id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX proposal_recoveries_proposal
    ON proposal_recoveries (proposal_id, created_at DESC);
