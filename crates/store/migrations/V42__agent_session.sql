-- The agent's own session is a list of view ids. hidden means the person
-- is looking at their own layout. paused is Take over: the agent stops
-- and the person can act again.
-- status: working | waiting | done | failed | paused

ALTER TABLE agent_runs DROP CONSTRAINT agent_runs_status_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_status_check
    CHECK (status IN ('working', 'waiting', 'done', 'failed', 'paused'));

ALTER TABLE agent_runs
    ADD COLUMN session jsonb NOT NULL DEFAULT '{}'::jsonb;
