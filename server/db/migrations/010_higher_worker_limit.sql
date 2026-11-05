ALTER TABLE font_runs DROP CONSTRAINT font_runs_worker_limit_check;
ALTER TABLE font_runs ADD CONSTRAINT font_runs_worker_limit_check CHECK(worker_limit BETWEEN 1 AND 128);
CREATE INDEX pipeline_jobs_font_priority_idx ON pipeline_jobs(priority DESC,created_at,id)
 WHERE kind='label_font' AND state IN ('queued','running');
