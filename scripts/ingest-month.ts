import {readFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {DuckDBInstance} from '@duckdb/node-api';
import {getPool,transaction,closeDatabase} from '../server/db/connection.ts';
import {enqueueJob,claimJob,completeJob,failJob} from '../server/db/jobs.ts';
import {saveCandidate} from '../server/db/catalog.ts';
import {normalizeText,object} from './pipeline-core.ts';
import {hash,promptVersion} from './labeling-core.ts';
import type {Candidate} from './pipeline-data.ts';
const archive=new URL('../data/archive/open-index-hacker-news/',import.meta.url);
const month=process.argv[process.argv.indexOf('--month')+1];
async function main(){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month??''))throw new Error('Use --month YYYY-MM');
 const m=object(JSON.parse(await readFile(new URL('manifest.json',archive),'utf8')),'manifest');
 if(!Array.isArray(m.files)||typeof m.revision!=='string')throw new Error('Invalid archive manifest');
 const path=`data/${month.slice(0,4)}/${month}.parquet`,file=m.files.map(v=>object(v,'archive file')).find(f=>f.path===path);
 if(!file||typeof file.sha256!=='string')throw new Error('Month not in pinned archive');
 const absolute=fileURLToPath(new URL(path,archive));const digest=createHash('sha256');for await(const chunk of createReadStream(absolute))digest.update(chunk);if(digest.digest('hex')!==file.sha256)throw new Error('Archive checksum mismatch');
 const key=`${m.revision}:${path}:${file.sha256}:archive-places-v1`;
 const id=await enqueueJob('extract_month',key,{month,revision:m.revision,path,sha256:file.sha256});
 const prior=await getPool().query('SELECT state FROM pipeline_jobs WHERE id=$1',[id]);if(prior.rows[0].state==='succeeded'){console.log('Month already extracted; no duplicate candidates or jobs created.');return;}
 const job=await claimJob('extract_month',`month-${process.pid}`,getPool(),1200,id);if(!job){console.log('Extraction is already leased or exhausted its retry attempts.');return;}
 const instance=await DuckDBInstance.create(':memory:',{threads:'4',memory_limit:'4GB'}),connection=await instance.connect();
 try{
  await connection.run("SET TimeZone='UTC'");
  const overview=(await connection.runAndReadAll('SELECT count(*)::INTEGER AS items,count(*) FILTER(WHERE type=2 AND coalesce(deleted,0)=0 AND coalesce(dead,0)=0)::INTEGER AS live_comments,min(time)::VARCHAR AS earliest,max(time)::VARCHAR AS latest FROM read_parquet($file)',{file:absolute})).getRowObjectsJson()[0];
  const raw=(await connection.runAndReadAll(`SELECT id,parent,"by" AS author,time::VARCHAR AS date,text FROM read_parquet($file)
   WHERE type=2 AND coalesce(deleted,0)=0 AND coalesce(dead,0)=0 AND text IS NOT NULL
    AND (regexp_matches(lower(text),'museum|observator|planetarium|pumping station|science cent(er|re)|heritage|landmark|exploratorium|botanical|aquarium|historic site')
     OR (regexp_matches(lower(text),'librar') AND regexp_matches(lower(text),'visit|tour|building|architecture|reading room')))
    AND regexp_matches(lower(text),'visit|recommend|worth|fascinat|incredible|amazing|check out|terrific|fantastic|favorite|favourite|enjoyed|go to|great collection|tour') ORDER BY id`,{file:absolute})).getRowObjectsJson();
  const parents=(await connection.runAndReadAll('SELECT id,parent,type,title FROM read_parquet($file)',{file:absolute})).getRowObjectsJson();
  const byId=new Map(parents.map(row=>[Number(row.id),row]));
  const now=new Date().toISOString();
  const candidates:Candidate[]=raw.map(row=>{
   let parentId=Number(row.parent),storyId:number|null=null,title='';const seen=new Set<number>();
   for(let depth=0;depth<40&&!seen.has(parentId);depth++){seen.add(parentId);const parent=byId.get(parentId);if(!parent)break;if(Number(parent.type)===1){storyId=Number(parent.id);title=normalizeText(parent.title);break;}parentId=Number(parent.parent);}
   const text=normalizeText(row.text),commentId=Number(row.id),inputHash=hash(text+'\n'+title);
   return {id:`hn-${commentId}-${inputHash.slice(0,16)}`,status:'needs-review',discoveredAt:now,lastSeenAt:now,queries:[`archive:${month}`],proposedNames:[],evidence:{provider:`open-index/hacker-news@${m.revision}; ${path}`,commentId,storyId,author:typeof row.author==='string'?row.author:null,date:typeof row.date==='string'?new Date(row.date).toISOString():null,url:`https://news.ycombinator.com/item?id=${commentId}`,text,rawHtml:typeof row.text==='string'?row.text:null,storyTitle:title}};
  });
  await transaction(async c=>{
   const partition=(await c.query<{id:string}>(`INSERT INTO archive_partitions(revision,path,sha256,bytes,items,state,scanned_at) VALUES($1,$2,$3,$4,$5,'scanned',now()) ON CONFLICT(revision,path) DO UPDATE SET items=excluded.items,state='scanned',scanned_at=now() RETURNING id`,[m.revision,path,file.sha256,file.bytes,overview.items])).rows[0].id;
   for(const candidate of candidates){await saveCandidate(c,candidate,partition);await enqueueJob('label_comment',`${candidate.id}:${promptVersion}`,{candidateId:candidate.id,month,promptVersion},c);}
   const result={month,...overview,candidates:candidates.length,missingLocalThreadContext:candidates.filter(v=>!v.evidence.storyId).length,filterVersion:'archive-places-v1'};
   await c.query("INSERT INTO pipeline_checkpoints(source,cursor) VALUES($1,$2) ON CONFLICT(source) DO UPDATE SET cursor=excluded.cursor,updated_at=now()",[`archive:${m.revision}:${month}`,JSON.stringify(result)]);
   await c.query("INSERT INTO pipeline_events(job_id,stage,message,details) VALUES($1,'extract',$2,$3)",[job.id,`Extracted ${candidates.length} candidate comments from ${month}`,JSON.stringify(result)]);
   await completeJob(c,job,result);console.log(JSON.stringify(result));
  });
 }catch(error){await failJob(job,error);throw error;}finally{connection.closeSync();instance.closeSync();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Month ingestion failed');process.exitCode=1;}).finally(closeDatabase);
