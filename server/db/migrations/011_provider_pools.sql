CREATE TABLE provider_pools (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider text NOT NULL CHECK(provider='pi-cliproxyapi'),
 model text NOT NULL,
 workers integer NOT NULL CHECK(workers BETWEEN 1 AND 128),
 places_run_id uuid NOT NULL REFERENCES pipeline_runs(id),
 font_run_id uuid NOT NULL REFERENCES font_runs(id),
 enabled boolean NOT NULL DEFAULT true,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','checking','running','blocked','paused','complete','failed')),
 active integer NOT NULL DEFAULT 0,
 completed_batches bigint NOT NULL DEFAULT 0,
 last_error text,
 heartbeat_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,places_run_id,font_run_id)
);
