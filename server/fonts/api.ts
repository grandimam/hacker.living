import type {IncomingMessage,ServerResponse} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdirSync,openSync,closeSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {fontContexts} from '../../shared/fonts.ts';
import {getPool} from '../db/connection.ts';
import {createFontRun,fontProgress,listFonts} from './store.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
export function launchFontRun(id:string){
 const directory=new URL('../../data/runs/',import.meta.url);mkdirSync(directory,{recursive:true});const fd=openSync(new URL(`fonts-${id}.log`,directory),'a',0o600);
 try{const child=spawn(process.execPath,['--import','tsx','scripts/fonts-pipeline.ts','run','--run',id],{cwd:root,env:process.env,stdio:['ignore',fd,fd],detached:true});child.on('error',error=>{void getPool().query("UPDATE font_runs SET state='failed',last_error=$2 WHERE id=$1",[id,String(error)]).catch(()=>{});});child.unref();}finally{closeSync(fd);}
}
export async function fontsApi(request:IncomingMessage,response:ServerResponse){
 const url=new URL(request.url??'/','http://localhost'),control=url.pathname.match(/^\/api\/fonts\/pipeline\/runs\/([0-9a-f-]{36})\/control$/);
 if(url.pathname!=='/api/fonts'&&url.pathname!=='/api/fonts/pipeline/runs'&&!control)return false;
 if(request.method==='GET'&&!control){
  if(url.pathname==='/api/fonts'){
   const limit=Number(url.searchParams.get('limit')??100),offset=Number(url.searchParams.get('offset')??0);
   if(!Number.isInteger(limit)||limit<1||limit>200||!Number.isInteger(offset)||offset<0||offset>1000000){response.writeHead(400).end(JSON.stringify({error:'Invalid font pagination'}));return true;}
   const context=url.searchParams.get('context')??undefined;
   if(context&&!fontContexts.includes(context as typeof fontContexts[number])){response.writeHead(400).end(JSON.stringify({error:'Invalid font context'}));return true;}
   const sort=url.searchParams.get('sort')??'name';
   if(!['name','recent'].includes(sort)){response.writeHead(400).end(JSON.stringify({error:'Invalid font sort'}));return true;}
   response.end(JSON.stringify(await listFonts(limit,offset,getPool(),context,sort as 'name'|'recent')));
  }else{const runs=(await getPool().query('SELECT id FROM font_runs ORDER BY created_at DESC LIMIT 20')).rows;response.end(JSON.stringify({runs:await Promise.all(runs.map(run=>fontProgress(run.id)))}));}
  return true;
 }
 if(request.method!=='POST'||url.pathname==='/api/fonts'){response.writeHead(405,{Allow:'GET'}).end(JSON.stringify({error:'Method not allowed'}));return true;}
 const host=request.headers.host??'';let local=false;try{const origin=new URL(request.headers.origin??'');local=/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)&&origin.host===host&&origin.protocol==='http:';}catch{}
 if(!local){response.writeHead(403).end(JSON.stringify({error:'Font pipeline controls require the local app'}));return true;}
 let raw='';for await(const chunk of request){raw+=chunk.toString();if(Buffer.byteLength(raw)>2048){response.writeHead(413).end();return true;}}
 let data:any;try{data=JSON.parse(raw);}catch{response.writeHead(400).end(JSON.stringify({error:'Invalid JSON'}));return true;}
 if(control){
  if(!['pause','resume','retry'].includes(data?.action)){response.writeHead(400).end(JSON.stringify({error:'Use pause, resume or retry'}));return true;}
  const id=control[1];if(!(await getPool().query('SELECT 1 FROM font_runs WHERE id=$1',[id])).rows.length){response.writeHead(404).end(JSON.stringify({error:'Font run not found'}));return true;}
  await getPool().query('UPDATE font_runs SET enabled=$2 WHERE id=$1',[id,data.action!=='pause']);
  if(data.action==='retry')await getPool().query("UPDATE pipeline_jobs j SET state='queued',attempts=0,available_at=now(),last_error=NULL WHERE j.kind='label_font' AND j.state='failed' AND EXISTS(SELECT 1 FROM font_run_candidates rc WHERE rc.run_id=$1 AND rc.job_id=j.id)",[id]);
  if(data.action!=='pause')launchFontRun(id);
  response.end(JSON.stringify({id,action:data.action}));
 }else{
  if(typeof data?.sourceRunId!=='string'||!/^[0-9a-f-]{36}$/.test(data.sourceRunId)){response.writeHead(400).end(JSON.stringify({error:'Supply sourceRunId from a saved Places run'}));return true;}
  if(!(await getPool().query('SELECT 1 FROM pipeline_runs WHERE id=$1',[data.sourceRunId])).rows.length){response.writeHead(404).end(JSON.stringify({error:'Source run not found'}));return true;}
  const run=await createFontRun(data.sourceRunId);await getPool().query('UPDATE font_runs SET enabled=true WHERE id=$1',[run.id]);launchFontRun(run.id);response.writeHead(202).end(JSON.stringify({id:run.id}));
 }
 return true;
}
