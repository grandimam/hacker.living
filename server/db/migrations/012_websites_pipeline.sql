ALTER TABLE pipeline_jobs DROP CONSTRAINT pipeline_jobs_kind_check;
ALTER TABLE pipeline_jobs ADD CONSTRAINT pipeline_jobs_kind_check CHECK(kind IN ('extract_month','label_comment','resolve_place','verify_place','publish_place','label_font','label_website'));

CREATE TABLE website_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_run_id uuid NOT NULL REFERENCES pipeline_runs(id),
 version text NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','scanning','labeling','paused','complete','attention','failed')),
 enabled boolean NOT NULL DEFAULT false,
 scan_complete boolean NOT NULL DEFAULT false,
 scan_cursor text NOT NULL DEFAULT '',
 scanned bigint NOT NULL DEFAULT 0,
 matched bigint NOT NULL DEFAULT 0,
 worker_limit integer NOT NULL DEFAULT 2 CHECK(worker_limit BETWEEN 1 AND 16),
 heartbeat_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_run_id,version)
);
CREATE TABLE website_run_candidates (
 run_id uuid NOT NULL REFERENCES website_runs(id),
 candidate_id text NOT NULL REFERENCES candidates(id),
 job_id uuid NOT NULL REFERENCES pipeline_jobs(id),
 PRIMARY KEY(run_id,candidate_id)
);
CREATE INDEX website_run_candidates_job_idx ON website_run_candidates(job_id);
CREATE TABLE website_labels (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 candidate_id text NOT NULL REFERENCES candidates(id),
 input_hash text NOT NULL,
 prompt_version text NOT NULL,
 model text NOT NULL,
 output jsonb NOT NULL,
 usage jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(candidate_id,input_hash,prompt_version,model)
);
CREATE TABLE websites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 url text NOT NULL UNIQUE,
 hostname text NOT NULL,
 name text NOT NULL,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE website_recommendations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 label_id uuid NOT NULL REFERENCES website_labels(id),
 ordinal integer NOT NULL,
 website_id uuid NOT NULL REFERENCES websites(id),
 recommended_url text NOT NULL,
 reason text NOT NULL,
 quote text,
 confidence text NOT NULL CHECK(confidence IN ('high','medium')),
 UNIQUE(label_id,ordinal)
);
CREATE INDEX website_recommendations_website_idx ON website_recommendations(website_id);
CREATE TABLE website_link_checks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 website_id uuid NOT NULL REFERENCES websites(id),
 checked_at timestamptz NOT NULL DEFAULT now(),
 status integer,
 final_url text,
 error text
);
CREATE INDEX website_link_checks_latest_idx ON website_link_checks(website_id,checked_at DESC);
CREATE INDEX pipeline_jobs_website_priority_idx ON pipeline_jobs(priority DESC,created_at,id)
 WHERE kind='label_website' AND state IN ('queued','running');
