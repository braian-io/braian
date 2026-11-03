-- Workspace templates are config-as-code. A template is named by key and its
-- layout is stored as one JSON object. Templates never change stored
-- workspaces; a workspace is created from a template by the client.

CREATE TABLE workspace_templates (
    key text PRIMARY KEY,
    name text NOT NULL,
    definition jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
