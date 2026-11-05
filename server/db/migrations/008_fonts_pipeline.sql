ALTER TABLE pipeline_jobs DROP CONSTRAINT pipeline_jobs_kind_check;
ALTER TABLE pipeline_jobs ADD CONSTRAINT pipeline_jobs_kind_check CHECK(kind IN ('extract_month','label_comment','resolve_place','verify_place','publish_place','label_font'));

CREATE TABLE font_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_run_id uuid NOT NULL REFERENCES pipeline_runs(id),
 version text NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','scanning','labeling','paused','complete','attention','failed')),
 enabled boolean NOT NULL DEFAULT true,
 scan_complete boolean NOT NULL DEFAULT false,
 scan_cursor text NOT NULL DEFAULT '',
 scanned bigint NOT NULL DEFAULT 0,
 matched bigint NOT NULL DEFAULT 0,
 heartbeat_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_run_id,version)
);
CREATE TABLE font_run_candidates (
 run_id uuid NOT NULL REFERENCES font_runs(id),
 candidate_id text NOT NULL REFERENCES candidates(id),
 job_id uuid NOT NULL REFERENCES pipeline_jobs(id),
 PRIMARY KEY(run_id,candidate_id)
);
CREATE INDEX font_run_candidates_job_idx ON font_run_candidates(job_id);
CREATE TABLE font_labels (
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
CREATE TABLE font_families (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name_key text NOT NULL UNIQUE,
 name text NOT NULL,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','approved','rejected')),
 official_url text,
 license_info jsonb,
 asset_path text
);
CREATE TABLE font_recommendations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 label_id uuid NOT NULL REFERENCES font_labels(id),
 ordinal integer NOT NULL,
 font_id uuid NOT NULL REFERENCES font_families(id),
 source_name text NOT NULL,
 reason text NOT NULL,
 quote text,
 contexts jsonb NOT NULL,
 details jsonb NOT NULL,
 UNIQUE(label_id,ordinal)
);
CREATE INDEX font_recommendations_font_idx ON font_recommendations(font_id);

-- Broad retrieval signals, not a claim of complete font-recommendation recall.
CREATE FUNCTION font_candidate_priority(body text,title text) RETURNS smallint
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
 SELECT (CASE WHEN concat_ws(' ',body,title) ~* '\m(fonts?|typefaces?|typograph(y|ic|ical)|monospac(e|ed)|ligatures?|Iosevka|Consolas|Inconsolata|Menlo|Monaco|Hack|Cascadia|Comic Sans|Fira[ -]?(Code|Mono)|JetBrains[ -]?Mono|Berkeley[ -]?Mono|Source[ -]?(Code|Serif|Sans)|IBM[ -]?Plex|DejaVu|Liberation|Input Mono|PragmataPro|Monaspace|Victor Mono|Recursive|Atkinson Hyperlegible)\M'
 THEN CASE WHEN coalesce(body,'') ~* '(recommend|prefer|love|favorite|favourite|switched|daily|use it|been using)' THEN 100 ELSE 30 END ELSE 0 END)::smallint
$fn$;
