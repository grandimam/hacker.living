import type {Pool} from 'pg';
import {getPool,transaction} from '../db/connection.ts';
import type {Job} from '../db/jobs.ts';

/** Reserve an entire scoped batch in one transaction; competing workers skip its locks. */
export async function claimLabelBatch(runId:string,kind:'label_comment'|'label_font',version:string,worker:string,limit=15,coverage=false,pool:Pool=getPool()):Promise<Job[]>{
 if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Invalid label batch size');
 const scope=kind==='label_font'?'JOIN font_run_candidates rc ON rc.job_id=j.id':"JOIN pipeline_run_candidates rc ON rc.candidate_id=j.payload->>'candidateId'";
 return transaction(async c=>{
  await c.query(`UPDATE pipeline_jobs j SET state='failed',worker_id=NULL,lease_token=NULL,locked_until=NULL,last_error='Worker lease expired after final attempt',updated_at=now()
   WHERE j.kind=$2 AND j.state='running' AND j.locked_until<now() AND j.attempts>=j.max_attempts AND EXISTS(SELECT 1 FROM pipeline_jobs s ${scope.replaceAll('j.','s.')} WHERE s.id=j.id AND rc.run_id=$1)`,[runId,kind]);
  const result=await c.query<Job>(`WITH eligible AS MATERIALIZED (
   SELECT j.id,j.attempts FROM pipeline_jobs j ${scope} WHERE rc.run_id=$1 AND j.kind=$2 AND j.payload->>'promptVersion'=$3
   AND j.attempts<j.max_attempts AND ((j.state='queued' AND j.available_at<=now()) OR (j.state='running' AND j.locked_until<now()))
   ORDER BY ${coverage?'j.created_at,j.id':'j.priority DESC,j.created_at,j.id'} FOR UPDATE OF j SKIP LOCKED LIMIT $5
  ), chosen AS (
   SELECT id FROM eligible WHERE NOT EXISTS(SELECT 1 FROM eligible WHERE attempts>0)
    OR id=(SELECT id FROM eligible WHERE attempts>0 ORDER BY id LIMIT 1)
  ) UPDATE pipeline_jobs j SET state='running',attempts=j.attempts+1,worker_id=$4,lease_token=gen_random_uuid(),locked_until=now()+interval '20 minutes',updated_at=now()
   FROM chosen WHERE j.id=chosen.id RETURNING j.*`,[runId,kind,version,worker,limit]);
  return result.rows;
 },pool);
}
