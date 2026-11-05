import {readFile,mkdir,rename,stat} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {DuckDBInstance} from '@duckdb/node-api';
import {getPool,transaction} from '../db/connection.ts';
import {saveCandidate} from '../db/catalog.ts';
import {enqueueJob} from '../db/jobs.ts';
import {hash,promptVersion} from '../../scripts/labeling-core.ts';
import {normalizeText,requestJson} from '../../scripts/pipeline-core.ts';
import type {Candidate} from '../../scripts/pipeline-data.ts';
import {monthSlices,type DateRange} from './range.ts';
import {StageYield} from './control.ts';
import {runEvent} from './runs.ts';
const archive=new URL('../../data/archive/open-index-hacker-news/',import.meta.url);
// Resolve from server/pipeline, not the process cwd.
const directory=archive;
interface ArchiveFile {path:string;bytes:number;sha256:string}
async function archiveFile(file:ArchiveFile,revision:string){
 const path=new URL(file.path,directory);let valid=false;try{valid=(await stat(path)).size===file.bytes;}catch{}
 if(!valid){await mkdir(dirname(path.pathname),{recursive:true});const part=new URL(path.href+'.part');const response=await fetch(`https://huggingface.co/datasets/open-index/hacker-news/resolve/${revision}/${file.path}`,{signal:AbortSignal.timeout(600000)});if(!response.ok||!response.body)throw Error(`Archive download HTTP ${response.status}`);await pipeline(Readable.fromWeb(response.body as any),createWriteStream(part));await rename(part,path);}
 const checksum=createHash('sha256');for await(const chunk of createReadStream(path))checksum.update(chunk);if(checksum.digest('hex')!==file.sha256)throw Error(`Archive checksum mismatch: ${file.path}`);return path.pathname;
}
async function saveBatch(runId:string,rows:Candidate[],partitionId:string|null,progress?:{key:string;cursor:unknown}){await transaction(async c=>{for(const candidate of rows){await saveCandidate(c,candidate,partitionId);await c.query('INSERT INTO pipeline_run_candidates(run_id,candidate_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[runId,candidate.id]);await enqueueJob('label_comment',`${candidate.id}:${promptVersion}`,{candidateId:candidate.id,promptVersion},c);}if(progress)await c.query('INSERT INTO pipeline_checkpoints(source,cursor) VALUES($1,$2) ON CONFLICT(source) DO UPDATE SET cursor=excluded.cursor,updated_at=now()',[progress.key,JSON.stringify(progress.cursor)]);});}
function candidate(id:number,text:string,rawHtml:string,author:string|null,date:string,storyId:number|null,title:string,provider:string):Candidate{
 const now=new Date().toISOString();return {id:`hn-${id}-${hash(text+'\n'+title).slice(0,16)}`,status:'needs-review',discoveredAt:now,lastSeenAt:now,queries:[provider],proposedNames:[],evidence:{provider,commentId:id,storyId,author,date,url:`https://news.ycombinator.com/item?id=${id}`,text,rawHtml,storyTitle:title}};
}
export interface SearchPage {hits:any[];nbHits:number;nbPages:number;hitsPerPage:number;exhaustiveNbHits?:boolean}
export async function collectSearchWindow(from:number,to:number,accept:(hits:any[],page?:{from:number;to:number;page:number})=>Promise<void>,request:(url:string)=>Promise<unknown>=requestJson,control?:{guard:()=>Promise<void>;pageCount:(from:number,to:number,page:number)=>Promise<number|null>}):Promise<void>{
 const url=(page:number)=>'https://hn.algolia.com/api/v1/search_by_date?'+new URLSearchParams({tags:'comment',numericFilters:`created_at_i>=${from},created_at_i<${to}`,hitsPerPage:'100',page:String(page)});
 await control?.guard();
 const first=await request(url(0)) as SearchPage;
 if(!Array.isArray(first.hits)||!Number.isInteger(first.nbHits)||!Number.isInteger(first.nbPages)||first.nbHits<0||first.nbPages<0)throw Error('Invalid HN search response');
 // Algolia can cap results even when nbHits is larger. Split before fetching any page.
 if(first.nbHits>900||first.exhaustiveNbHits===false){if(to-from<=1)throw Error('HN search result cap within one second; cannot prove complete coverage');const mid=Math.floor((from+to)/2);await collectSearchWindow(from,mid,accept,request,control);await collectSearchWindow(mid,to,accept,request,control);return;}
 let received=0;
 for(let page=0;page<first.nbPages;page++){const saved=await control?.pageCount(from,to,page);if(saved!==null&&saved!==undefined){received+=saved;continue;}await control?.guard();const response=page===0?first:await request(url(page)) as SearchPage;if(!Array.isArray(response.hits))throw Error('Invalid HN search page');await accept(response.hits,{from,to,page});received+=response.hits.length;}
 if(received!==first.nbHits)throw Error(`HN index changed during collection (${received}/${first.nbHits}); rerun to reconcile`);
}
export async function collectRange(runId:string,range:DateRange,control:()=>Promise<void>=async()=>{},maxBatches=Infinity){
 let batches=0;const guard=async()=>{await control();if(batches>=maxBatches)throw new StageYield('Collection quantum complete');};
 let manifest:{revision:string;files:ArchiveFile[]}|null=null;
 try{manifest=JSON.parse(await readFile(new URL('manifest.json',directory),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 for(const slice of monthSlices(range)){
  await guard();
  const key=`run:${runId}:collect:${slice.month}`;
  if((await getPool().query('SELECT 1 FROM pipeline_checkpoints WHERE source=$1',[key])).rowCount)continue;
  const start=Date.parse(slice.from),end=Date.parse(slice.to);const covered:{from:number;to:number}[]=[];
  const file=manifest?.files.find(f=>f.path===`data/${slice.month.slice(0,4)}/${slice.month}.parquet`);
  if(file&&manifest){
   await runEvent(runId,'collect',`Scanning ${file.path}; all live comments, no keyword filter`);
   const path=await archiveFile(file,manifest.revision);
   const db=await DuckDBInstance.create(':memory:',{threads:'4',memory_limit:'2GB'}),connection=await db.connect();
   try{
    await connection.run("SET TimeZone='UTC'");
    const overview=(await connection.runAndReadAll('SELECT count(*)::INTEGER AS items,min(time)::VARCHAR AS earliest,max(time)::VARCHAR AS latest FROM read_parquet($file)',{file:path})).getRowObjectsJson()[0];
    const lo=Math.max(start,Date.parse(String(overview.earliest)+'Z')),hi=Math.min(end,Date.parse(String(overview.latest)+'Z')+1000);
    if(Number.isFinite(lo)&&lo<hi){
     covered.push({from:lo,to:hi});
     const partition=(await getPool().query(`INSERT INTO archive_partitions(revision,path,sha256,bytes,items,state,scanned_at) VALUES($1,$2,$3,$4,$5,'scanned',now()) ON CONFLICT(revision,path) DO UPDATE SET state='scanned',scanned_at=now() RETURNING id`,[manifest.revision,file.path,file.sha256,file.bytes,overview.items])).rows[0].id;
     const parents=(await connection.runAndReadAll('SELECT id,parent,type,title FROM read_parquet($file)',{file:path})).getRowObjectsJson();const byId=new Map(parents.map(row=>[Number(row.id),row]));
     await connection.run(`CREATE TEMP TABLE selected AS SELECT id,parent,"by" AS author,time::VARCHAR AS date,text FROM read_parquet($file) WHERE type=2 AND coalesce(deleted,0)=0 AND coalesce(dead,0)=0 AND text IS NOT NULL AND time >= $start::TIMESTAMP AND time < $end::TIMESTAMP`,{file:path,start:new Date(lo).toISOString(),end:new Date(hi).toISOString()});
     const cursorKey=`run:${runId}:archive:${slice.month}`;
     const saved=(await getPool().query('SELECT cursor FROM pipeline_checkpoints WHERE source=$1',[cursorKey])).rows[0]?.cursor;
     // Recover the old collector's committed prefix once; new batches checkpoint their exact last ID atomically.
     let lastId=Number(saved?.lastId??(await getPool().query(`SELECT max(c.comment_id) AS last_id FROM pipeline_run_candidates rc JOIN candidates c ON c.id=rc.candidate_id JOIN hn_items h ON h.id=c.comment_id WHERE rc.run_id=$1 AND h.archive_partition_id=$2 AND h.posted_at>=$3 AND h.posted_at<$4`,[runId,partition,new Date(lo).toISOString(),new Date(hi).toISOString()])).rows[0].last_id??0);
     for(;;){
      await guard();
      const rows=(await connection.runAndReadAll('SELECT * FROM selected WHERE id>$lastId ORDER BY id LIMIT 500',{lastId})).getRowObjectsJson();if(!rows.length)break;
      const candidates=rows.map(row=>{let parentId=Number(row.parent),storyId:number|null=null,title='';const seen=new Set<number>();for(let depth=0;depth<40&&!seen.has(parentId);depth++){seen.add(parentId);const p=byId.get(parentId);if(!p)break;if(Number(p.type)===1){storyId=Number(p.id);title=normalizeText(p.title);break;}parentId=Number(p.parent);}return candidate(Number(row.id),normalizeText(row.text),String(row.text),typeof row.author==='string'?row.author:null,new Date(String(row.date)+'Z').toISOString(),storyId,title,`archive:${slice.month}@${manifest!.revision}`);});
      lastId=Number(rows.at(-1)!.id);await saveBatch(runId,candidates,partition,{key:cursorKey,cursor:{lastId}});batches++;await runEvent(runId,'collect',`Saved ${rows.length} comments from ${slice.month} through HN ${lastId}`);
     }
    }
   }finally{connection.closeSync();db.closeSync();}
  }
  const uncovered=covered.length?[{from:start,to:covered[0].from},{from:covered[0].to,to:end}].filter(s=>s.from<s.to):[{from:start,to:end}];
  for(const window of uncovered){
   await runEvent(runId,'collect',`Collecting uncovered interval from the HN search index: ${new Date(window.from).toISOString()} → ${new Date(window.to).toISOString()}`);
   await collectSearchWindow(Math.ceil(window.from/1000),Math.ceil(window.to/1000),async(hits,page)=>{const candidates:Candidate[]=[];for(const hit of hits){const id=Number(hit.objectID);if(!Number.isSafeInteger(id)||id<=0)throw Error('Invalid HN comment ID');if(typeof hit.comment_text!=='string'||!hit.comment_text.trim())continue;const date=Date.parse(hit.created_at);if(!Number.isFinite(date)||date<window.from||date>=window.to)throw Error('HN search returned an out-of-range comment');candidates.push(candidate(id,normalizeText(hit.comment_text),hit.comment_text,hit.author??null,new Date(date).toISOString(),hit.story_id??null,normalizeText(hit.story_title),'HN Search date-range collection'));}await saveBatch(runId,candidates,null,page?{key:`run:${runId}:search:${page.from}:${page.to}:${page.page}`,cursor:{count:hits.length}}:undefined);batches++;},requestJson,{guard,pageCount:async(from,to,page)=>{const row=(await getPool().query('SELECT cursor FROM pipeline_checkpoints WHERE source=$1',[`run:${runId}:search:${from}:${to}:${page}`])).rows[0];return row?Number(row.cursor.count):null;}});
  }
  await getPool().query('INSERT INTO pipeline_checkpoints(source,cursor) VALUES($1,$2) ON CONFLICT(source) DO UPDATE SET cursor=excluded.cursor,updated_at=now()',[key,JSON.stringify({slice,covered,uncovered,policy:'all-live-comments-v1'})]);
 }
 await getPool().query('UPDATE pipeline_runs SET collected=true,updated_at=now() WHERE id=$1',[runId]);
}
