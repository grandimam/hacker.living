ALTER TABLE website_runs ADD COLUMN snapshot_count bigint NOT NULL DEFAULT 0;
UPDATE website_runs w SET snapshot_count=(SELECT count(*) FROM pipeline_run_candidates rc JOIN candidates c ON c.id=rc.candidate_id WHERE rc.run_id=w.source_run_id AND c.created_at<=w.created_at);
