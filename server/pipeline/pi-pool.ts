import {fileURLToPath} from 'node:url';
import {getPool} from '../db/connection.ts';
import {failJob,type Job} from '../db/jobs.ts';
import {PiLabeler} from '../../scripts/pi-labeler.ts';
import {parseStoredCandidate} from '../db/catalog.ts';
import {fontPrompt,fontLabelSchema,parseFontLabels,fontVersion} from '../fonts/core.ts';
import {saveFontLabel} from '../fonts/store.ts';
import {claimLabelBatch} from './claim-labels.ts';
import {labelRun} from './label.ts';
import {modelCoolingDown} from './model-backpressure.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
const wait=(ms=2000)=>new Promise(resolve=>setTimeout(resolve,ms));
export function safeProviderError(error:unknown){return String(error).replace(/Bearer\s+[^\s"']+/gi,'Bearer [REDACTED]').replace(/\b(sk-[a-z0-9_-]+)\b/gi,'[REDACTED]').replace(/((?:access_token|refresh_token|api_key|authorization)\s*["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,'$1[REDACTED]').slice(0,1000);}
export async function createPiPool(placesRun:string,fontRun:string,workers=100){
 if(!Number.isInteger(workers)||workers<1||workers>128)throw Error('Pi workers must be 1–128');
 return (await getPool().query(`INSERT INTO provider_pools(provider,model,workers,places_run_id,font_run_id) VALUES('pi-cliproxyapi',$1,$2,$3,$4) ON CONFLICT(provider,places_run_id,font_run_id) DO UPDATE SET workers=excluded.workers,enabled=true RETURNING *`,[`cliproxyapi/${process.env.PI_CLAUDE_MODEL??'claude-sonnet-4-6'}`,workers,placesRun,fontRun])).rows[0];
}
async function fontBatch(runId:string,model:PiLabeler,worker:string){
 const jobs=await claimLabelBatch(runId,'label_font',fontVersion,worker);if(!jobs.length)return 0;
 try{
  const found=(await getPool().query('SELECT id,payload,input_hash FROM candidates WHERE id=ANY($1::text[])',[jobs.map(j=>j.payload.candidateId)])).rows;
  const records=jobs.map(j=>found.find(row=>row.id===j.payload.candidateId)!),candidates=records.map(row=>parseStoredCandidate(row.payload)),inputs=candidates.map((c,i)=>({...c,id:`c${i+1}`}));
  const response=await model.classify(fontPrompt(inputs),fontLabelSchema,root),labels=parseFontLabels(JSON.parse(response.text),inputs);
  for(let i=0;i<jobs.length;i++)await saveFontLabel(jobs[i],{...labels.find(l=>l.candidateId===inputs[i].id)!,candidateId:candidates[i].id},records[i].input_hash,response);
 }catch(error){for(const job of jobs)await failJob(job,error);throw error;}
 return jobs.length;
}
export async function executePiPool(id:string){
 const db=getPool(),lock=await db.connect();let owns=false,heartbeat:ReturnType<typeof setInterval>|undefined;const models=new Set<PiLabeler>();
 try{
  owns=(await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok',[`hacker.living:pi-pool:${id}`])).rows[0].ok;if(!owns)return false;
  const pool=(await db.query('SELECT * FROM provider_pools WHERE id=$1',[id])).rows[0];if(!pool)throw Error('Pi pool not found');
  await db.query("UPDATE provider_pools SET active=0,state='checking',heartbeat_at=now() WHERE id=$1",[id]);
  heartbeat=setInterval(()=>{void db.query('UPDATE provider_pools SET heartbeat_at=now() WHERE id=$1',[id]).catch(()=>{});},15000);
  // Never claim real jobs until one RPC request has proved the provider can authenticate.
  for(;;){
   if(!(await db.query('SELECT enabled FROM provider_pools WHERE id=$1',[id])).rows[0].enabled)return true;
   const probe=new PiLabeler();try{
    const response=await probe.classify('Return only {"ok":true}.',{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false},root);
    if(JSON.parse(response.text).ok!==true)throw Error('Pi preflight response failed validation');break;
   }catch(error){const message=safeProviderError(error);await db.query("UPDATE provider_pools SET state='blocked',last_error=$2 WHERE id=$1",[id,message]);console.log(`[pi] EasyCLIProxy unavailable; retrying preflight in 60s: ${message}`);await wait(60000);}finally{probe.close();}
  }
  await db.query("UPDATE pipeline_jobs SET state='queued',attempts=greatest(attempts-1,0),worker_id=NULL,lease_token=NULL,locked_until=NULL,available_at=now() WHERE state='running' AND worker_id LIKE $1",[`pi-pool:${id}:%`]);
  await db.query("UPDATE provider_pools SET state='running',last_error=NULL WHERE id=$1",[id]);
  console.log(`[pi] ${pool.workers} Claude workers via EasyCLIProxy, alongside Codex`);
  let cache:any=null,until=0,pending:Promise<any>|undefined,stop=false;
  const state=async()=>{
   if(cache&&Date.now()<until)return cache;
   pending??=db.query(`SELECT pp.enabled,p.stage_config->>'label' AS places_enabled,f.enabled AS fonts_enabled,f.scan_complete,
    EXISTS(SELECT 1 FROM pipeline_jobs j JOIN pipeline_run_candidates rc ON rc.candidate_id=j.payload->>'candidateId' WHERE rc.run_id=pp.places_run_id AND j.kind='label_comment' AND j.state IN ('queued','running')) AS places_pending,
    EXISTS(SELECT 1 FROM font_run_candidates rc JOIN pipeline_jobs j ON j.id=rc.job_id WHERE rc.run_id=pp.font_run_id AND j.state IN ('queued','running')) AS fonts_pending
    FROM provider_pools pp JOIN pipeline_runs p ON p.id=pp.places_run_id JOIN font_runs f ON f.id=pp.font_run_id WHERE pp.id=$1`,[id]).then(result=>{cache=result.rows[0];until=Date.now()+2000;return cache;}).finally(()=>{pending=undefined;});return pending;
  };
  const lane=async(index:number)=>{
   let model=new PiLabeler();models.add(model);let turn=index;
   try{while(!stop){
    const flags=await state();if(!flags.enabled)return;
    if(!flags.places_pending&&!flags.fonts_pending&&flags.scan_complete)return;
    if(await modelCoolingDown('pi')){await wait(5000);continue;}
    const fontsFirst=++turn%2===0,kind=fontsFirst&&flags.fonts_enabled&&flags.fonts_pending?'fonts':flags.places_enabled==='true'&&flags.places_pending?'places':flags.fonts_enabled&&flags.fonts_pending?'fonts':null;
    if(!kind){await wait();continue;}
    let active=false;
    try{
     await db.query('UPDATE provider_pools SET active=active+1 WHERE id=$1',[id]);active=true;
     const worker=`pi-pool:${id}:${index}`;
     const result=kind==='fonts'?await fontBatch(pool.font_run_id,model,worker):await labelRun(pool.places_run_id,model,async()=>{const flags=await state();if(!flags.enabled||flags.places_enabled!=='true')throw Error('Pi place labeling paused');},1,turn%4===0,worker);
     if(result)await db.query('UPDATE provider_pools SET completed_batches=completed_batches+1 WHERE id=$1',[id]);else await wait();
    }catch(error){await db.query('UPDATE provider_pools SET last_error=$2 WHERE id=$1',[id,safeProviderError(error)]);model.close();models.delete(model);model=new PiLabeler();models.add(model);await wait();}
    finally{if(active)await db.query('UPDATE provider_pools SET active=greatest(active-1,0) WHERE id=$1',[id]);}
   }}finally{model.close();models.delete(model);}
  };
  const results=await Promise.allSettled(Array.from({length:pool.workers},(_,i)=>lane(i).catch(error=>{stop=true;throw error;})));
  const failed=results.find((r):r is PromiseRejectedResult=>r.status==='rejected');if(failed)throw failed.reason;
  await db.query("UPDATE provider_pools SET state=CASE WHEN enabled THEN 'complete' ELSE 'paused' END,active=0 WHERE id=$1",[id]);return true;
 }catch(error){if(owns)await db.query("UPDATE provider_pools SET state='failed',last_error=$2 WHERE id=$1",[id,safeProviderError(error)]);throw error;}
 finally{if(heartbeat)clearInterval(heartbeat);for(const model of models)model.close();if(owns)await lock.query('SELECT pg_advisory_unlock(hashtext($1))',[`hacker.living:pi-pool:${id}`]);lock.release();}
}
