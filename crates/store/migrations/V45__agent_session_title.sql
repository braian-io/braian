-- Short AI-generated session titles replace the initial truncated prompt in title.
-- session_title_ready stops repeat generation after the first success.

ALTER TABLE agent_runs
    ADD COLUMN session_title_ready boolean NOT NULL DEFAULT false;

UPDATE agent_runs SET session_title_ready = true;