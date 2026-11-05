-- Research is evidence for review, never publication approval.
CREATE TABLE proposal_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES place_proposals(id),
  research_version text NOT NULL,
  canonical_name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  country text NOT NULL,
  location geography(Point,4326),
  official_url text NOT NULL,
  coordinate_source text,
  state text NOT NULL CHECK(state IN ('needs_review','unresolved')),
  findings jsonb NOT NULL,
  checked_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(proposal_id,research_version),
  CHECK((location IS NULL)=(coordinate_source IS NULL))
);
CREATE INDEX proposal_research_proposal_idx ON proposal_research(proposal_id,checked_at DESC);
