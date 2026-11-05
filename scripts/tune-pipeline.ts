import {getPool,closeDatabase} from '../server/db/connection.ts';
import {changeStage} from '../server/pipeline/control.ts';
import {executeRun} from '../server/pipeline/worker.ts';
import {workerLimits} from '../server/pipeline/worker-limits.ts';
import {runEvent} from '../server/pipeline/runs.ts';

async function main(){
 const args=process.argv.slice(2),id=args[0];
 if(!id||!/^[0-9a-f-]{36}$/.test(id))throw Error('Usage: pipeline:tune -- <run-id> [--label-workers N] [--research-workers N] [--restart]');
 const values:Record<string,number>={};let restart=false;
 for(let i=1;i<args.length;i++){
  if(args[i]==='--restart'){restart=true;continue;}
  const stage=args[i]==='--label-workers'?'label':args[i]==='--research-workers'?'enrich':null;
  if(!stage||!args[i+1])throw Error(`Invalid option ${args[i]}`);
  values[stage]=Number(args[++i]);
 }
 const pool=getPool(),row=(await pool.query('SELECT summary FROM pipeline_runs WHERE id=$1',[id])).rows[0];
 if(!row)throw Error('Pipeline run not found');
 const limits=workerLimits({...row.summary?.workerLimits,...values});
 if(!restart){
  await pool.query("UPDATE pipeline_runs SET summary=summary||$2::jsonb WHERE id=$1",[id,JSON.stringify({workerLimits:limits})]);
  await runEvent(id,'workers',`Worker limits set: ${limits.label} labeling, ${limits.enrich} research`);return;
 }
 // For upgrading a running older worker: drain its atomic units, then take over.
 await changeStage(id,'label','pause');await changeStage(id,'enrich','pause');
 await runEvent(id,'workers','Upgrading backend worker; waiting for in-flight results to save');
 const lock=await pool.connect();
 try{
  const deadline=Date.now()+20*60*1000;
  for(;;){
   if((await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok',[`hacker.living:run:${id}`])).rows[0].ok){
    await lock.query('SELECT pg_advisory_unlock(hashtext($1))',[`hacker.living:run:${id}`]);break;
   }
   if(Date.now()>deadline)throw Error('Worker upgrade timed out; saved jobs remain paused for inspection');
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
 }finally{lock.release();}
 // The old worker writes a final summary when draining; restore the requested limits.
 await pool.query("UPDATE pipeline_runs SET summary=summary||$2::jsonb WHERE id=$1",[id,JSON.stringify({workerLimits:limits})]);
 await changeStage(id,'label','resume');await changeStage(id,'enrich','resume');
 if(!await executeRun(id))throw Error('Another worker took over; tune limits were saved');
}
main().catch(error=>{console.error(String(error));process.exitCode=1;}).finally(closeDatabase);
