import type {Pool} from 'pg';
import {getPool} from '../db/connection.ts';

/** Bounded, resumable pass over saved jobs. Nothing is rejected or relabeled. */
export async function prioritizeRun(runId:string,pool:Pool=getPool()){
 const key=`run:${runId}:recommendation-priority:v1`;
 const saved=(await pool.query('SELECT cursor FROM pipeline_checkpoints WHERE source=$1',[key])).rows[0]?.cursor;
 let lastId:string|null=saved?.lastId??null,scanned=Number(saved?.scanned??0),promoted=Number(saved?.promoted??0);
 if(saved?.complete)return {scanned,promoted};
 for(;;){
  const client=await pool.connect();
  let size=0;
  try{
   await client.query('BEGIN');
   const rows=(await client.query(`SELECT j.id,place_recommendation_priority(c.payload->'evidence'->>'text',c.payload->'evidence'->>'storyTitle') AS priority
    FROM pipeline_jobs j JOIN candidates c ON c.id=j.payload->>'candidateId'
    JOIN pipeline_run_candidates rc ON rc.candidate_id=c.id AND rc.run_id=$1
    WHERE j.kind='label_comment' AND j.id>coalesce($2::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY j.id LIMIT 5000`,[runId,lastId])).rows;
   size=rows.length;
   const ranked=rows.filter(row=>row.priority>0);
   if(ranked.length)await client.query(`UPDATE pipeline_jobs j SET priority=greatest(j.priority,s.priority),updated_at=now()
    FROM unnest($1::uuid[],$2::smallint[]) AS s(id,priority)
    WHERE j.id=s.id AND j.state='queued' AND j.priority<s.priority`,[ranked.map(row=>row.id),ranked.map(row=>row.priority)]);
   scanned+=size;promoted+=ranked.length;lastId=rows.at(-1)?.id??lastId;
   await client.query('INSERT INTO pipeline_checkpoints(source,cursor) VALUES($1,$2) ON CONFLICT(source) DO UPDATE SET cursor=excluded.cursor,updated_at=now()', [key,JSON.stringify({lastId,scanned,promoted,complete:!size})]);
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  if(!size)return {scanned,promoted};
  console.log(`[priority] ${scanned.toLocaleString()} saved comments scanned; ${promoted.toLocaleString()} with place/recommendation signals`);
 }
}
