import type {IncomingMessage,ServerResponse} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdirSync,openSync,closeSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {changeStage,stages,type Stage} from './control.ts';
import {getPool} from '../db/connection.ts';
import {createRun,listRuns,resetIncompleteRun} from './runs.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
function launch(runId:string){
 const directory=new URL('../../data/runs/',import.meta.url);mkdirSync(directory,{recursive:true});const fd=openSync(new URL(`${runId}.log`,directory),'a',0o600);
 try{const child=spawn(process.execPath,['--import','tsx','scripts/date-pipeline.ts','--run',runId],{cwd:root,env:process.env,stdio:['ignore',fd,fd],detached:true});child.on('error',error=>{void getPool().query("UPDATE pipeline_runs SET state='failed',last_error=$2,updated_at=now() WHERE id=$1",[runId,`Could not start pipeline: ${error.message}`]).catch(()=>{});});child.on('exit',code=>{if(code!==null&&code!==0)void getPool().query("UPDATE pipeline_runs SET state='failed',last_error=coalesce(last_error,$2),updated_at=now() WHERE id=$1 AND state NOT IN ('complete','attention','failed')",[runId,`Worker exited with status ${code}; see local run log`]).catch(()=>{});});child.unref();}finally{closeSync(fd);}
}
export async function pipelineApi(request:IncomingMessage,response:ServerResponse):Promise<boolean>{
 const pathname=new URL(request.url??'/','http://localhost').pathname;
 if(pathname==='/api/pipeline/preview'){if(request.method!=='GET'){response.writeHead(405,{Allow:'GET'}).end(JSON.stringify({error:'GET only'}));return true;}const {readPipelinePreview}=await import('../../scripts/pilot-preview.ts');response.end(JSON.stringify(await readPipelinePreview()));return true;}
 const control=pathname.match(/^\/api\/pipeline\/runs\/([0-9a-f-]{36})\/control$/);
 if(pathname!=='/api/pipeline/runs'&&!control)return false;
 if(control&&request.method!=='POST'){response.writeHead(405,{Allow:'POST'}).end(JSON.stringify({error:'POST only'}));return true;}
 if(request.method==='GET'){response.end(JSON.stringify({runs:await listRuns()}));return true;}
 if(request.method!=='POST'){response.writeHead(405,{Allow:'GET, POST'}).end(JSON.stringify({error:'GET or POST only'}));return true;}
 const host=request.headers.host??'',origin=request.headers.origin;
 let sameOrigin=false;try{sameOrigin=!!origin&&new URL(origin).host===host&&new URL(origin).protocol==='http:';}catch{}
 if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)||!sameOrigin){response.writeHead(403).end(JSON.stringify({error:'Pipeline runs can only be started from the local app'}));return true;}
 let body='';for await(const chunk of request){body+=chunk.toString();if(Buffer.byteLength(body)>2048){response.writeHead(413).end(JSON.stringify({error:'Request too large'}));return true;}}
 let data:any;try{data=JSON.parse(body);}catch{response.writeHead(400).end(JSON.stringify({error:'Invalid JSON'}));return true;}
 if(control){
  if(!data||!stages.includes(data.stage)||!['pause','resume','advance'].includes(data.action)){response.writeHead(400).end(JSON.stringify({error:'Use a valid stage and pause, resume or advance action'}));return true;}
  try{const result=await changeStage(control[1],data.stage as Stage,data.action);launch(control[1]);response.end(JSON.stringify({...result,note:'Changes apply after the current atomic batch or place finishes.'}));}catch(error){if(error instanceof Error&&/Run not found|last stage|Invalid stage/.test(error.message))response.writeHead(error.message==='Run not found'?404:400).end(JSON.stringify({error:error.message}));else throw error;}return true;
 }
 if(!data||typeof data!=='object'||Array.isArray(data)||typeof data.from!=='string'||typeof data.to!=='string'){response.writeHead(400).end(JSON.stringify({error:'from and to dates are required'}));return true;}
 let run;try{run=await createRun(data.from,data.to);}catch(error){if(error instanceof Error&&/date|range|start|end|UTC|history|future/i.test(error.message)){response.writeHead(400).end(JSON.stringify({error:error.message}));return true;}throw error;}
 const active=['collecting','labeling','enriching'].includes(run.state)&&run.heartbeat_at&&Date.now()-new Date(run.heartbeat_at).getTime()<90000;
 if(run.state==='complete'||active){response.end(JSON.stringify({id:run.id,state:run.state,started:false}));return true;}
 if(data.retry===true||['failed','attention'].includes(run.state))await resetIncompleteRun(run.id);
 await getPool().query("UPDATE pipeline_runs SET state='queued',last_error=NULL,updated_at=now() WHERE id=$1",[run.id]);launch(run.id);
 response.writeHead(202).end(JSON.stringify({id:run.id,state:'queued',started:true}));return true;
}
