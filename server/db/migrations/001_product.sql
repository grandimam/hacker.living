CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE archive_partitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision text NOT NULL,
  path text NOT NULL,
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  bytes bigint NOT NULL CHECK(bytes>=0),
  items bigint,
  state text NOT NULL DEFAULT 'downloaded' CHECK(state IN ('downloaded','scanning','scanned','failed')),
  scanned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(revision,path)
);
CREATE TABLE hn_items (
  id bigint PRIMARY KEY CHECK(id>0),
  kind text NOT NULL CHECK(kind IN ('story','comment','job','poll','pollopt')),
  author text,
  posted_at timestamptz,
  parent_id bigint,
  story_id bigint,
  title text NOT NULL DEFAULT '',
  raw_html text NOT NULL DEFAULT '',
  plain_text text NOT NULL DEFAULT '',
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  deleted boolean NOT NULL DEFAULT false,
  dead boolean NOT NULL DEFAULT false,
  archive_partition_id uuid REFERENCES archive_partitions(id),
  source_url text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hn_items_parent_idx ON hn_items(parent_id);
CREATE TABLE candidates (
  id text PRIMARY KEY,
  comment_id bigint NOT NULL REFERENCES hn_items(id),
  input_hash text NOT NULL,
  extraction_version text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','labeled','rejected','review')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(comment_id,input_hash,extraction_version)
);
CREATE TABLE labels (
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
CREATE TABLE places (
  id text PRIMARY KEY CHECK(id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL,
  city text,
  country text,
  category text CHECK(category IN ('Museums','Libraries','Engineering','Observatories','Computing','Science')),
  location geography(Point,4326),
  official_url text,
  coordinate_source text,
  state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','review','published','withdrawn')),
  document jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CHECK(state<>'published' OR (city IS NOT NULL AND country IS NOT NULL AND category IS NOT NULL AND location IS NOT NULL AND official_url IS NOT NULL AND coordinate_source IS NOT NULL AND document IS NOT NULL AND published_at IS NOT NULL))
);
CREATE INDEX places_geo_idx ON places USING gist(location);
CREATE INDEX places_city_idx ON places(city) WHERE state='published';
CREATE INDEX places_text_idx ON places USING gin(to_tsvector('simple',coalesce(name,'')||' '||coalesce(city,'')||' '||coalesce(country,'')));
CREATE TABLE place_aliases (
  place_id text NOT NULL REFERENCES places(id),
  alias text NOT NULL,
  source_comment_id bigint REFERENCES hn_items(id),
  PRIMARY KEY(place_id,alias)
);
CREATE TABLE place_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id uuid NOT NULL REFERENCES labels(id),
  ordinal integer NOT NULL CHECK(ordinal>=0),
  name text NOT NULL,
  city text,
  country text,
  reason text NOT NULL,
  confidence text NOT NULL CHECK(confidence IN ('high','medium','low')),
  place_id text REFERENCES places(id),
  state text NOT NULL DEFAULT 'unresolved' CHECK(state IN ('unresolved','resolved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(label_id,ordinal)
);
CREATE TABLE place_recommendations (
  place_id text NOT NULL REFERENCES places(id),
  comment_id bigint NOT NULL REFERENCES hn_items(id),
  label_id uuid REFERENCES labels(id),
  reason text NOT NULL,
  quote text,
  evidence_hash text NOT NULL,
  verified_at timestamptz NOT NULL,
  PRIMARY KEY(place_id,comment_id)
);
CREATE TABLE verification_checks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  place_id text NOT NULL REFERENCES places(id),
  kind text NOT NULL CHECK(kind IN ('recommendation','hn_evidence','coordinates','official_url')),
  passed boolean NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  reviewer text NOT NULL,
  details jsonb NOT NULL
);
CREATE INDEX verification_checks_latest_idx ON verification_checks(place_id,kind,checked_at DESC,id DESC);
CREATE TABLE review_decisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  place_id text REFERENCES places(id),
  proposal_id uuid REFERENCES place_proposals(id),
  reviewer text NOT NULL,
  decision text NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pipeline_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK(kind IN ('extract_month','label_comment','resolve_place','verify_place','publish_place')),
  dedupe_key text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','succeeded','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK(max_attempts>0),
  available_at timestamptz NOT NULL DEFAULT now(),
  worker_id text,
  lease_token uuid,
  locked_until timestamptz,
  result jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kind,dedupe_key),
  CHECK((state='running')=(lease_token IS NOT NULL AND locked_until IS NOT NULL AND worker_id IS NOT NULL))
);
CREATE INDEX pipeline_jobs_ready_idx ON pipeline_jobs(kind,available_at,created_at) WHERE state='queued';
CREATE TABLE pipeline_checkpoints (
  source text PRIMARY KEY,
  cursor jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pipeline_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid REFERENCES pipeline_jobs(id),
  stage text NOT NULL,
  level text NOT NULL DEFAULT 'info' CHECK(level IN ('info','error')),
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION enforce_publication() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE checks integer;
BEGIN
  IF NEW.state='published' THEN
    SELECT count(*) INTO checks FROM (
      SELECT DISTINCT ON(kind) kind,passed FROM verification_checks WHERE place_id=NEW.id ORDER BY kind,checked_at DESC,id DESC
    ) latest WHERE passed;
    IF checks<>4 THEN RAISE EXCEPTION 'Publication requires four current passing verification checks'; END IF;
    IF NOT EXISTS(SELECT 1 FROM place_recommendations r JOIN hn_items h ON h.id=r.comment_id WHERE r.place_id=NEW.id AND NOT h.dead AND NOT h.deleted AND r.evidence_hash=h.content_hash) THEN
      RAISE EXCEPTION 'Publication requires verified live HN recommendation evidence';
    END IF;
    IF NEW.document->'review'->>'status' IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Publication requires an approved document'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER places_publication_gate BEFORE INSERT OR UPDATE ON places FOR EACH ROW EXECUTE FUNCTION enforce_publication();
