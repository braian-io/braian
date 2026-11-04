-- A question is the line the agent shows when it stops for a decision.
-- The agents table is a view of those runs.

ALTER TABLE agent_messages DROP CONSTRAINT agent_messages_kind_check;
ALTER TABLE agent_messages ADD CONSTRAINT agent_messages_kind_check
    CHECK (kind IN ('user', 'assistant', 'tool', 'proposal', 'notice', 'error', 'step', 'question'));

INSERT INTO view_types (key, title, builtin) VALUES
    ('agents', 'Agents', true)
ON CONFLICT (key) DO NOTHING;
