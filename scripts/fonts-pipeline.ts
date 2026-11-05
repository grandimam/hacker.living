import {createFontRun,fontProgress,listFonts} from '../server/fonts/store.ts';
import {executeFontRun} from '../server/fonts/worker.ts';
import {getPool,closeDatabase} from '../server/db/connection.ts';

async function main(){
 const args=process.argv.slice(2),command=args.shift();let source:string|undefined,id:string|undefined,workers:number|undefined;const restart=args.includes('--restart');if(restart)args.splice(args.indexOf('--restart'),1);
 for(let i=0;i<args.length;i+=2){const value=args[i+1];if(!value)throw Error('Missing font pipeline option value');if(args[i]==='--source-run')source=value;else if(args[i]==='--run')id=value;else if(args[i]==='--workers')workers=Number(value);else throw Error(`Invalid option ${args[i]}`);}
 if(workers!==undefined&&(!Number.isInteger(workers)||workers<1||workers>128))throw Error('Font workers must be 1–128');
 if(!['run','status','pause','retry','catalog'].includes(command??''))throw Error('Use run --source-run <places-run-id>, run/status/pause/retry --run <font-run-id>, or catalog');
 if(command==='catalog'){console.log(JSON.stringify(await listFonts(),null,2));return;}
 if(source){if(!/^[0-9a-f-]{36}$/.test(source))throw Error('Invalid source run ID');id=(await createFontRun(source)).id;}
 if(!id||!/^[0-9a-f-]{36}$/.test(id))throw Error('Supply --run or --source-run');
 if(command==='status'){console.log(JSON.stringify(await fontProgress(id),null,2));return;}
 if(command==='pause'){await getPool().query('UPDATE font_runs SET enabled=false WHERE id=$1',[id]);return;}
 if(command==='retry')await getPool().query("UPDATE pipeline_jobs j SET state='queued',attempts=0,available_at=now(),last_error=NULL WHERE j.kind='label_font' AND j.state='failed' AND EXISTS(SELECT 1 FROM font_run_candidates rc WHERE rc.run_id=$1 AND rc.job_id=j.id)",[id]);
 if(restart){
  await getPool().query('UPDATE font_runs SET enabled=false WHERE id=$1',[id]);
  const lock=await getPool().connect();
  try{const deadline=Date.now()+20*60*1000;for(;;){
   if((await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok',[`hacker.living:fonts:${id}`])).rows[0].ok){await lock.query('SELECT pg_advisory_unlock(hashtext($1))',[`hacker.living:fonts:${id}`]);break;}
   if(Date.now()>deadline)throw Error('Fonts worker upgrade timed out; saved jobs remain paused');
   await new Promise(resolve=>setTimeout(resolve,1000));
  }}finally{lock.release();}
 }
 if(workers!==undefined)await getPool().query('UPDATE font_runs SET worker_limit=$2 WHERE id=$1',[id,workers]);
 await getPool().query('UPDATE font_runs SET enabled=true WHERE id=$1',[id]);
 console.log(`Font run ${id} — http://localhost:4317/pipeline/fonts`);
 for(let attempt=0;attempt<4;attempt++){if(await executeFontRun(id,workers)!==false)break;await new Promise(resolve=>setTimeout(resolve,500));}
}
main().catch(error=>{console.error(String(error));process.exitCode=1;}).finally(closeDatabase);
