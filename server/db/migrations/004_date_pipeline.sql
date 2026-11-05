CREATE TABLE pipeline_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 from_at timestamptz NOT NULL,
 to_at timestamptz NOT NULL,
 version text NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','collecting','labeling','enriching','complete','attention','failed')),
 collected boolean NOT NULL DEFAULT false,
 heartbeat_at timestamptz,
 last_error text,
 summary jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(to_at>from_at),
 UNIQUE(from_at,to_at,version)
);
CREATE TABLE pipeline_run_candidates (
 run_id uuid NOT NULL REFERENCES pipeline_runs(id),
 candidate_id text NOT NULL REFERENCES candidates(id),
 PRIMARY KEY(run_id,candidate_id)
);
CREATE TABLE pipeline_http_cache (
 url text PRIMARY KEY,
 response jsonb NOT NULL,
 fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pipeline_events ADD COLUMN run_id uuid REFERENCES pipeline_runs(id);
CREATE INDEX pipeline_events_run_idx ON pipeline_events(run_id,created_at DESC);
