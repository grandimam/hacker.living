-- Retrieval priority only: a high score never creates a label or a place.
CREATE FUNCTION place_recommendation_priority(body text,title text) RETURNS smallint
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
 WITH signals AS (
  SELECT
   concat_ws(' ',body,title) ~* '\m(museums?|observator(y|ies)|planetariums?|librar(y|ies)|pumping stations?|waterworks|lighthouses?|science cent(er|re)s?|railway museums?|historic sites?|engineering landmarks?|botanical gardens?|archives?|telescopes?)\M' AS place,
   coalesce(body,'') ~* '(worth (a |the )?(visit|trip|detour|seeing)|highly recommend|recommend (visiting|going|checking)|must.see|must.visit|should visit|check (it|this|that|them) out)' AS endorsement,
   coalesce(body,'') ~* '\m(visited|visiting|visit|went to|been to|toured|tour|admission|exhibits?|exhibitions?)\M' AS visiting
 ) SELECT (CASE WHEN place AND endorsement THEN 100 WHEN place AND visiting THEN 60 WHEN place THEN 30 WHEN endorsement THEN 10 ELSE 0 END)::smallint FROM signals
$fn$;

ALTER TABLE pipeline_jobs ADD COLUMN priority smallint NOT NULL DEFAULT 0;
CREATE INDEX pipeline_jobs_label_priority_idx ON pipeline_jobs(priority DESC,created_at,id)
 WHERE kind='label_comment' AND state IN ('queued','running');

CREATE FUNCTION score_new_label_job() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF NEW.kind='label_comment' THEN
  SELECT greatest(NEW.priority,place_recommendation_priority(payload->'evidence'->>'text',payload->'evidence'->>'storyTitle'))
   INTO NEW.priority FROM candidates WHERE id=NEW.payload->>'candidateId';
  NEW.priority:=coalesce(NEW.priority,0);
 END IF;
 RETURN NEW;
END
$fn$;
CREATE TRIGGER pipeline_jobs_score BEFORE INSERT ON pipeline_jobs FOR EACH ROW EXECUTE FUNCTION score_new_label_job();
