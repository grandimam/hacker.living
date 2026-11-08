import type {Pool,PoolClient} from 'pg';
import {getPool,transaction} from './connection.ts';
import {limitedProvider} from '../pipeline/model-backpressure.ts';
export type JobKind='extract_month'|'label_comment'|'resolve_place'|'verify_place'|'publish_place'|'label_font'|'label_website';
export interface Job {id:string;kind:JobKind;payload:Record<string,unknown>;lease_token:string;attempts:number;max_attempts:number}
export async function enqueueJob(kind:JobKind,key:string,payload:unknown,client:Pick<PoolClient,'query'>=getPool()){
 const result=await client.query<{id:string}>('INSERT INTO pipeline_jobs(kind,dedupe_key,payload) VALUES($1,$2,$3) ON CONFLICT(kind,dedupe_key) DO UPDATE SET dedupe_key=excluded.dedupe_key RETURNING id',[kind,key,JSON.stringify(payload)]);return result.rows[0].id;
}
export async function claimJob(kind:JobKind,worker:string,pool:Pool=getPool(),leaseSeconds=1200,jobId?:string):Promise<Job|null>{
 if(!Number.isInteger(leaseSeconds)||leaseSeconds<1||leaseSeconds>3600)throw new Error('Invalid lease duration');
 return transaction(async c=>{
  await c.query("UPDATE pipeline_jobs SET state='failed',worker_id=NULL,lease_token=NULL,locked_until=NULL,last_error='Worker lease expired after final attempt',updated_at=now() WHERE state='running' AND locked_until<now() AND attempts>=max_attempts");
  const result=await c.query<Job>(`WITH next AS (
   SELECT id FROM pipeline_jobs WHERE kind=$1 AND ($4::uuid IS NULL OR id=$4) AND attempts<max_attempts AND ((state='queued' AND available_at<=now()) OR (state='running' AND locked_until<now())) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE pipeline_jobs j SET state='running',attempts=j.attempts+1,worker_id=$2,lease_token=gen_random_uuid(),locked_until=now()+($3*interval '1 second'),updated_at=now() FROM next WHERE j.id=next.id RETURNING j.*`,[kind,worker,leaseSeconds,jobId??null]);
  return result.rows[0]??null;
 },pool);
}
export async function completeJob(c:PoolClient,job:Job,result:unknown){
 const changed=await c.query("UPDATE pipeline_jobs SET state='succeeded',result=$3,worker_id=NULL,lease_token=NULL,locked_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 AND state='running' AND locked_until>now()",[job.id,job.lease_token,JSON.stringify(result)]);
 if(changed.rowCount!==1)throw new Error('Job lease lost; refusing stale worker output');
}
export async function failJob(job:Job,error:unknown,pool=getPool()){
 const message=error instanceof Error?error.message:String(error);
 const provider=limitedProvider(error);
 if(provider){
  await transaction(async c=>{
   await c.query(`UPDATE pipeline_jobs SET state='queued',attempts=greatest(attempts-1,0),available_at=now()+interval '5 minutes',worker_id=NULL,lease_token=NULL,locked_until=NULL,last_error=$3,updated_at=now() WHERE id=$1 AND lease_token=$2 AND state='running'`,[job.id,job.lease_token,message]);
   await c.query(`INSERT INTO pipeline_checkpoints(source,cursor) VALUES($2,jsonb_build_object('until',now()+interval '5 minutes','reason',$1::text)) ON CONFLICT(source) DO UPDATE SET cursor=excluded.cursor,updated_at=now()`,[message,`${provider}:cooldown`]);
  },pool);return;
 }
 const changed=await pool.query(`UPDATE pipeline_jobs SET state=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'queued' END,available_at=now()+(least(300,power(2,attempts)*5)*interval '1 second'),worker_id=NULL,lease_token=NULL,locked_until=NULL,last_error=$3,updated_at=now() WHERE id=$1 AND lease_token=$2 AND state='running'`,[job.id,job.lease_token,message]);
 if(changed.rowCount)await pool.query("INSERT INTO pipeline_events(job_id,stage,level,message) VALUES($1,$2,'error',$3)",[job.id,job.kind,message]);
}
