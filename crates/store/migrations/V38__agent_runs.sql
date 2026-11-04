-- An agent run is its own session. The browser tab is only a view of it:
-- closing the tab sets tab_open = false and the run keeps going.
-- mode, session_kind, hidden and status are stored now so later work
-- (background indicator, hidden session, waiting for a person) can use
-- the same rows without another shape.
--
-- status: working | waiting | done | failed
-- mode: foreground | background
-- session_kind: own | user

INSERT INTO view_types (key, title, builtin) VALUES
    ('agent', 'Agent', true)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE agent_runs (
    id uuid PRIMARY KEY,
    user_id uuid REFERENCES users (id) ON DELETE CASCADE,
    principal_id uuid NOT NULL REFERENCES principals (id),
    workspace_id uuid REFERENCES workspaces (id) ON DELETE SET NULL,
    view_id uuid REFERENCES views (id) ON DELETE SET NULL,
    title text NOT NULL,
    status text NOT NULL CHECK (status IN ('working', 'waiting', 'done', 'failed')),
    mode text NOT NULL DEFAULT 'foreground' CHECK (mode IN ('foreground', 'background')),
    session_kind text NOT NULL DEFAULT 'own' CHECK (session_kind IN ('own', 'user')),
    hidden boolean NOT NULL DEFAULT false,
    tab_open boolean NOT NULL DEFAULT true,
    context jsonb NOT NULL DEFAULT '{}',
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
);

CREATE INDEX agent_runs_principal_updated ON agent_runs (principal_id, updated_at DESC);
CREATE INDEX agent_runs_user_updated ON agent_runs (user_id, updated_at DESC) WHERE user_id IS NOT NULL;

CREATE TABLE agent_messages (
    id uuid PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES agent_runs (id) ON DELETE CASCADE,
    position integer NOT NULL,
    kind text NOT NULL CHECK (kind IN ('user', 'assistant', 'tool', 'proposal', 'notice', 'error', 'step')),
    body jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, position)
);

-- A proposal filed by a run. stale is set when a person edits the same
-- object while the proposal is still pending. Accept must not overwrite it.
ALTER TABLE proposals
    ADD COLUMN agent_run_id uuid REFERENCES agent_runs (id) ON DELETE SET NULL,
    ADD COLUMN stale boolean NOT NULL DEFAULT false,
    ADD COLUMN stale_at timestamptz,
    ADD COLUMN stale_reason text;

CREATE INDEX proposals_agent_run ON proposals (agent_run_id) WHERE agent_run_id IS NOT NULL;
CREATE INDEX proposals_open_stale_object ON proposal_rows (object_id) WHERE status = 'pending' AND object_id IS NOT NULL;
