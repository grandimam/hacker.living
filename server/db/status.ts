import {getPool} from './connection.ts';
export async function databaseStatus(){
 const pool=getPool();
 const [counts,jobs,partitions,events,research]=await Promise.all([
  pool.query(`SELECT (SELECT count(*)::INTEGER FROM candidates) AS candidates,(SELECT count(*)::INTEGER FROM candidates WHERE state='pending') AS pending,(SELECT count(DISTINCT candidate_id)::INTEGER FROM labels) AS labeled,(SELECT count(*)::INTEGER FROM place_proposals WHERE state='unresolved') AS proposals,(SELECT count(*)::INTEGER FROM places WHERE state='published') AS published,(SELECT max(updated_at) FROM candidates) AS updated_at`),
  pool.query<{kind:string;state:string;count:number}>(`SELECT kind,CASE WHEN state='running' AND locked_until<now() THEN CASE WHEN attempts<max_attempts THEN 'queued' ELSE 'failed' END ELSE state END AS state,count(*)::INTEGER AS count FROM pipeline_jobs GROUP BY kind,2 ORDER BY kind,2`),
  pool.query<{path:string;state:string;items:string}>("SELECT path,state,items FROM archive_partitions ORDER BY path DESC"),
  pool.query<{id:string;at:Date;stage:string;message:string}>('SELECT id::text,created_at AS at,stage,message FROM pipeline_events ORDER BY created_at DESC,id DESC LIMIT 8'),
  pool.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE location IS NOT NULL)::int AS located,count(*) FILTER(WHERE findings->'image' IS NOT NULL AND findings->'image'<>'null'::jsonb)::int AS images FROM(SELECT DISTINCT ON(proposal_id) location,findings FROM proposal_research ORDER BY proposal_id,checked_at DESC,id DESC)latest`),
 ]);
 const c=counts.rows[0];
 return {candidates:Number(c.candidates),pending:Number(c.pending),labeled:Number(c.labeled),proposals:Number(c.proposals),published:Number(c.published),updatedAt:c.updated_at?new Date(c.updated_at).toISOString():null,research:research.rows[0],jobs:jobs.rows,partitions:partitions.rows,events:events.rows.map(e=>({id:`db:${e.id}`,at:e.at.toISOString(),stage:e.stage,message:e.message}))};
}
