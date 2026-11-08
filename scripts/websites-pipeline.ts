import {createWebsiteRun,websiteProgress,listWebsites} from '../server/websites/store.ts';
import {executeWebsiteRun} from '../server/websites/worker.ts';
import {getPool,closeDatabase} from '../server/db/connection.ts';
import {launchWebsiteRun} from '../server/websites/launch.ts';
import {websiteVersion} from '../server/websites/core.ts';

async function main(){
 const args=process.argv.slice(2),command=args.shift();let source:string|undefined,id:string|undefined,workers:number|undefined;
 const background=args.includes('--background');if(background)args.splice(args.indexOf('--background'),1);
 const restart=args.includes('--restart');if(restart)args.splice(args.indexOf('--restart'),1);
 for(let i=0;i<args.length;i+=2){const value=args[i+1];if(!value)throw Error('Missing website pipeline option value');if(args[i]==='--source-run')source=value;else if(args[i]==='--run')id=value;else if(args[i]==='--workers')workers=Number(value);else throw Error(`Invalid option ${args[i]}`);}
 if(workers!==undefined&&(!Number.isInteger(workers)||workers<1||workers>16))throw Error('Website workers must be 1–16');
 if(!['run','status','pause','retry','catalog'].includes(command??''))throw Error('Use run --source-run <places-run-id> [--background], run/status/pause/retry --run <website-run-id>, or catalog');
 if(command==='catalog'){console.log(JSON.stringify(await listWebsites(),null,2));return;}
 if(source){if(!/^[0-9a-f-]{36}$/.test(source))throw Error('Invalid source run ID');id=(await createWebsiteRun(source)).id;}
 if(!id||!/^[0-9a-f-]{36}$/.test(id))throw Error('Supply --run or --source-run');
 if(command==='status'){console.log(JSON.stringify(await websiteProgress(id),null,2));return;}
 if(command==='pause'){await getPool().query('UPDATE website_runs SET enabled=false WHERE id=$1',[id]);return;}
 const run=(await getPool().query('SELECT version FROM website_runs WHERE id=$1',[id])).rows[0];
 if(!run)throw Error('Website run not found');
 if(run.version!==websiteVersion)throw Error('This extraction version is archived. Start the current version with --source-run.');
 if(command==='retry')await getPool().query("UPDATE pipeline_jobs j SET state='queued',attempts=0,available_at=now(),last_error=NULL WHERE j.kind='label_website' AND j.state='failed' AND EXISTS(SELECT 1 FROM website_run_candidates rc WHERE rc.run_id=$1 AND rc.job_id=j.id)",[id]);
 if(restart){
  await getPool().query('UPDATE website_runs SET enabled=false WHERE id=$1',[id]);
  const lock=await getPool().connect();
  try{const deadline=Date.now()+20*60*1000;for(;;){
   if((await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok',[`hacker.living:websites:${id}`])).rows[0].ok){await lock.query('SELECT pg_advisory_unlock(hashtext($1))',[`hacker.living:websites:${id}`]);break;}
   if(Date.now()>deadline)throw Error('Websites worker upgrade timed out; saved jobs remain paused');
   await new Promise(resolve=>setTimeout(resolve,1000));
  }}finally{lock.release();}
 }
 if(workers!==undefined)await getPool().query('UPDATE website_runs SET worker_limit=$2 WHERE id=$1',[id,workers]);
 await getPool().query('UPDATE website_runs SET enabled=true WHERE id=$1',[id]);
 console.log(`Website run ${id} — http://127.0.0.1:4317/pipeline/websites`);
 if(background){
  const pid=await launchWebsiteRun(id);console.log(`Background worker PID ${pid}; progress is saved in PostgreSQL.`);return;
 }
 for(let attempt=0;attempt<4;attempt++){if(await executeWebsiteRun(id,workers)!==false)break;await new Promise(resolve=>setTimeout(resolve,500));}
}
main().catch(error=>{console.error(String(error));process.exitCode=1;}).finally(closeDatabase);
