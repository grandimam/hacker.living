ALTER TABLE hn_items ADD COLUMN canonical_checked_at timestamptz;
CREATE INDEX places_bounds_idx ON places USING gist((location::geometry));
