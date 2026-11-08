import {claimLabelBatch} from '../pipeline/claim-labels.ts';
import {modelCoolingDown} from '../pipeline/model-backpressure.ts';
import {websiteVersion} from './core.ts';
import {fileURLToPath} from 'node:url';
import {getPool} from '../db/connection.ts';
import {failJob} from '../db/jobs.ts';
import {parseStoredCandidate} from '../db/catalog.ts';
import {CodexLabeler} from '../../scripts/codex-labeler.ts';
import {websitePrompt,websiteLabelSchema,parseWebsiteLabels} from './core.ts';
import {scanWebsiteBatch,saveWebsiteLabel,websiteProgress} from './store.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
const wait=()=>new Promise(resolve=>setTimeout(resolve,1000));
export async function executeWebsiteRun(runId:string,workers?:number){
 const pool=getPool(),lock=await pool.connect();let owns=false,stopping=false;let heartbeat:ReturnType<typeof setInterval>|undefined;
 const clients=new Set<CodexLabeler>();
 try{
  owns=(await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok',[`hacker.living:websites:${runId}`])).rows[0].ok;if(!owns)return false;
  const run=(await pool.query('SELECT worker_limit,version FROM website_runs WHERE id=$1',[runId])).rows[0];if(!run)throw Error('Website run not found');
  if(run.version!==websiteVersion)throw Error('This extraction version is archived. Start the current version from the saved source run.');
  workers=workers??Number(run.worker_limit);
  if(!Number.isInteger(workers)||workers<1||workers>16)throw Error('Website workers must be 1–16');
  console.log(`[websites] Starting ${workers} labeling workers`);
  await pool.query("UPDATE website_runs SET state='scanning',last_error=NULL,heartbeat_at=now() WHERE id=$1",[runId]);
  await pool.query("UPDATE pipeline_jobs SET state='queued',attempts=greatest(attempts-1,0),worker_id=NULL,lease_token=NULL,locked_until=NULL,available_at=now() WHERE kind='label_website' AND state='running' AND worker_id=$1",[`website-run-${runId}`]);
  heartbeat=setInterval(()=>{void pool.query('UPDATE website_runs SET heartbeat_at=now() WHERE id=$1',[runId]).catch(()=>{});},15000);
  const scanner=async()=>{while(!stopping&&await scanWebsiteBatch(runId)){console.log(`[websites] Scanning saved comments for website signals`);await new Promise(resolve=>setTimeout(resolve,50));}if(!stopping)await pool.query("UPDATE website_runs SET state=CASE WHEN enabled THEN 'labeling' ELSE 'paused' END WHERE id=$1",[runId]);};
  const lane=async()=>{
   let model:CodexLabeler|undefined;
   try{for(;;){
    const run=(await pool.query('SELECT enabled,scan_complete FROM website_runs WHERE id=$1',[runId])).rows[0];if(stopping||!run.enabled)return;
    if(await modelCoolingDown()){await wait();continue;}
    const jobs=await claimLabelBatch(runId,'label_website',websiteVersion,`website-run-${runId}`,15,false,pool);
    if(!jobs.length){
     const waiting=(await pool.query("SELECT 1 FROM website_run_candidates rc JOIN pipeline_jobs j ON j.id=rc.job_id WHERE rc.run_id=$1 AND j.state IN ('queued','running') LIMIT 1",[runId])).rows.length;
     if(run.scan_complete&&!waiting)return;await wait();continue;
    }
    try{
     if(!model){model=new CodexLabeler();clients.add(model);await model.initialize();}
     const found=(await pool.query('SELECT id,payload,input_hash FROM candidates WHERE id=ANY($1::text[])',[jobs.map(job=>job.payload.candidateId)])).rows;
     const rows=jobs.map(job=>found.find(row=>row.id===job.payload.candidateId)!);
     const candidates=rows.map(row=>parseStoredCandidate(row.payload)),inputs=candidates.map((c,i)=>({...c,id:`c${i+1}`}));
     console.log(`[websites] Codex reading ${jobs.length} comments containing website links`);
     const response=await model.classify(websitePrompt(inputs),websiteLabelSchema,root);
     const labels=parseWebsiteLabels(JSON.parse(response.text),inputs);
     for(let i=0;i<jobs.length;i++){
      const label={...labels.find(l=>l.candidateId===inputs[i].id)!,candidateId:candidates[i].id};
      const found=await saveWebsiteLabel(jobs[i],label,rows[i].input_hash,response);if(found)console.log(`[websites] Saved ${found} recommendations from HN ${candidates[i].evidence.commentId}`);
     }
    }catch(error){for(const job of jobs)await failJob(job,error,pool);console.error(`[websites] Retry queued: ${String(error)}`);if(model){model.close();clients.delete(model);model=undefined;}}
   }}finally{if(model){model.close();clients.delete(model);}}
  };
  // Wait for every in-flight save even if a lane or scanner fails.
  for(;;){
   const tasks=[scanner(),...Array.from({length:workers},()=>lane())].map(task=>task.catch(error=>{stopping=true;throw error;}));
   const results=await Promise.allSettled(tasks);const failed=results.find((r):r is PromiseRejectedResult=>r.status==='rejected');if(failed)throw failed.reason;
   const progress=await websiteProgress(runId);
   // A resume can arrive while paused calls are draining; restart admission instead of losing the wake-up.
   if(progress.enabled&&(!progress.scan_complete||progress.labeled+progress.failed<progress.candidates))continue;
   const state=!progress.enabled?'paused':progress.failed?'attention':'complete';
   await pool.query('UPDATE website_runs SET state=$2,heartbeat_at=now() WHERE id=$1',[runId,state]);break;
  }
  console.log(JSON.stringify(await websiteProgress(runId)));return true;
 }catch(error){if(owns)await pool.query("UPDATE website_runs SET state='failed',last_error=$2 WHERE id=$1",[runId,String(error)]);throw error;}
 finally{if(heartbeat)clearInterval(heartbeat);for(const client of clients)client.close();if(owns)await lock.query('SELECT pg_advisory_unlock(hashtext($1))',[`hacker.living:websites:${runId}`]);lock.release();}
}
