import type {IncomingMessage,ServerResponse} from 'node:http';
import {getPool} from '../db/connection.ts';
import {listWebsites,websiteProgress} from './store.ts';
import {launchWebsiteRun} from './launch.ts';
import {websiteVersion} from './core.ts';
export async function websitesApi(request:IncomingMessage,response:ServerResponse){
 const url=new URL(request.url??'/','http://localhost');
 const control=url.pathname.match(/^\/api\/websites\/pipeline\/runs\/([0-9a-f-]{36})\/control$/);
 if(control){
  if(request.method!=='POST'){response.writeHead(405,{Allow:'POST'}).end(JSON.stringify({error:'POST only'}));return true;}
  const host=request.headers.host??'';let local=false;try{const origin=new URL(request.headers.origin??'');local=/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)&&origin.host===host&&origin.protocol==='http:';}catch{}
  if(!local){response.writeHead(403).end(JSON.stringify({error:'Pipeline controls require the local app'}));return true;}
  let raw='';for await(const chunk of request){raw+=chunk.toString();if(Buffer.byteLength(raw)>2048){response.writeHead(413).end(JSON.stringify({error:'Request too large'}));return true;}}
  let action:unknown;try{action=JSON.parse(raw)?.action;}catch{}
  if(!['pause','resume','retry'].includes(String(action))){response.writeHead(400).end(JSON.stringify({error:'Use pause, resume or retry'}));return true;}
  const id=control[1],pool=getPool();
  const run=(await pool.query('SELECT version FROM website_runs WHERE id=$1',[id])).rows[0];
  if(!run){response.writeHead(404).end(JSON.stringify({error:'Run not found'}));return true;}
  if(action!=='pause'&&run.version!==websiteVersion){response.writeHead(409).end(JSON.stringify({error:'This extraction version is archived. Use the current run.'}));return true;}
  await pool.query('UPDATE website_runs SET enabled=$2 WHERE id=$1',[id,action!=='pause']);
  if(action==='retry')await pool.query(`UPDATE pipeline_jobs j SET state='queued',attempts=0,available_at=now(),last_error=NULL WHERE j.kind='label_website' AND j.state='failed' AND EXISTS(SELECT 1 FROM website_run_candidates rc WHERE rc.run_id=$1 AND rc.job_id=j.id)`,[id]);
  if(action!=='pause')await launchWebsiteRun(id);
  response.end(JSON.stringify({id,action,note:'In-flight batches finish saving before pausing.'}));return true;
 }
 const detail=url.pathname.match(/^\/api\/websites\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
 if(!detail&&!['/api/websites','/api/websites/pipeline/runs'].includes(url.pathname))return false;
 if(request.method!=='GET'){response.writeHead(405,{Allow:'GET'}).end(JSON.stringify({error:'GET only'}));return true;}
 if(detail){
  const website=(await listWebsites({id:detail[1],limit:1})).websites[0];
  if(!website)response.writeHead(404).end(JSON.stringify({error:'Website not found in this collection'}));
  else response.end(JSON.stringify(website));
  return true;
 }
 if(url.pathname==='/api/websites/pipeline/runs'){
  const rows=(await getPool().query('SELECT id FROM website_runs ORDER BY created_at DESC LIMIT 20')).rows;
  response.end(JSON.stringify({currentVersion:websiteVersion,runs:await Promise.all(rows.map(r=>websiteProgress(r.id)))}));return true;
 }
 const limit=Number(url.searchParams.get('limit')??60),offset=Number(url.searchParams.get('offset')??0),q=url.searchParams.get('q')?.trim()??'',sort=url.searchParams.get('sort')??'recent';
 if(!Number.isInteger(limit)||limit<1||limit>200||!Number.isInteger(offset)||offset<0||offset>1000000||q.length>300||!['recent','sources','name'].includes(sort)){
  response.writeHead(400).end(JSON.stringify({error:'Invalid website filters or pagination'}));return true;
 }
 response.end(JSON.stringify(await listWebsites({limit,offset,q,sort:sort as 'recent'|'sources'|'name'})));return true;
}
