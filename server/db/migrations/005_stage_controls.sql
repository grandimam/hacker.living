ALTER TABLE pipeline_runs DROP CONSTRAINT pipeline_runs_state_check;
ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_runs_state_check CHECK(state IN ('queued','collecting','labeling','enriching','paused','complete','attention','failed'));
ALTER TABLE pipeline_runs ADD COLUMN stage_config jsonb NOT NULL DEFAULT '{"collect":true,"label":true,"enrich":true}';
ALTER TABLE pipeline_runs ADD COLUMN requested_stage text CHECK(requested_stage IN ('collect','label','enrich'));
ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_stage_config_check CHECK(
 jsonb_typeof(stage_config->'collect')='boolean' AND jsonb_typeof(stage_config->'label')='boolean' AND jsonb_typeof(stage_config->'enrich')='boolean');
CREATE INDEX pipeline_jobs_pending_order_idx ON pipeline_jobs(kind,created_at,id) WHERE state IN ('queued','running');
CREATE INDEX pipeline_jobs_candidate_idx ON pipeline_jobs((payload->>'candidateId')) WHERE kind='label_comment';
