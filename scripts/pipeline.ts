import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {getPool,transaction,closeDatabase} from '../server/db/connection.ts';
import {saveCandidate,parseStoredCandidate,publishReviewedDraft,exportCatalog} from '../server/db/catalog.ts';
import {enqueueJob} from '../server/db/jobs.ts';
import {hash,promptVersion} from './labeling-core.ts';
import {requestJson,normalizeText,guessPlaceNames,isCandidate,resolveHnComment,checkOfficialUrl,normalizeName,errorMessage,object} from './pipeline-core.ts';
import {parseSearchResponse} from './pipeline-data.ts';
import type {Candidate,DiscoveryRun} from './pipeline-data.ts';
import type {DraftPlace} from '../shared/types.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
const [command='help',...argv]=process.argv.slice(2);
const options:Record<string,string|true|undefined>={};
for(let i=0;i<argv.length;i++){if(!argv[i].startsWith('--'))throw new Error(`Unexpected argument ${argv[i]}`);options[argv[i].slice(2)]=argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true;}
const now=()=>new Date().toISOString();
async function atomic(path:string,value:unknown){const full=resolve(root,path);await mkdir(dirname(full),{recursive:true});await writeFile(full+'.tmp',JSON.stringify(value,null,2)+'\n');await rename(full+'.tmp',full);}
function number(name:string,fallback:number,min:number,max:number){const n=Number(options[name]??fallback);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`Invalid --${name}`);return n;}
async function discover(){
 const queries=options.query?[String(options.query)]:['museum worth visiting','unusual museum','observatory visit','library recommend','pumping station','computing museum'];
 const pages=number('pages',1,1,10),limit=number('limit',25,1,100);
 const run:DiscoveryRun={startedAt:now(),queries,requestedPages:pages,limitPerPage:limit,fetched:0,added:0,updated:0,errors:[],responses:[]};
 for(const query of queries)for(let page=0;page<pages;page++)try{
  const params=new URLSearchParams({query,tags:'comment',hitsPerPage:String(limit),page:String(page)});
  const response=parseSearchResponse(await requestJson(`https://hn.algolia.com/api/v1/search?${params}`));
  run.responses.push({query,page,hits:response.hits});run.fetched+=response.hits.length;
  await transaction(async c=>{for(const hit of response.hits){
   const text=normalizeText(hit.comment_text),commentId=Number(hit.objectID);if(!Number.isSafeInteger(commentId)||!isCandidate(text))continue;
   const title=normalizeText(hit.story_title),id=`hn-${commentId}-${hash(text+'\n'+title).slice(0,16)}`;
   const exists=(await c.query('SELECT id FROM candidates WHERE id=$1',[id])).rowCount;
   const candidate:Candidate={id,status:'needs-review',discoveredAt:now(),lastSeenAt:now(),queries:[query],proposedNames:guessPlaceNames(text),evidence:{provider:'Algolia HN Search',commentId,storyId:hit.story_id,author:hit.author,date:hit.created_at,url:`https://news.ycombinator.com/item?id=${commentId}`,text,rawHtml:hit.comment_text,storyTitle:title}};
   await saveCandidate(c,candidate);await enqueueJob('label_comment',`${id}:${promptVersion}`,{candidateId:id,promptVersion},c);if(exists)run.updated++;else run.added++;
  }});
  if(page+1>=response.nbPages)break;
 }catch(error){run.errors.push({query,page,message:errorMessage(error)});}
 run.finishedAt=now();await atomic(`data/runs/${now().replace(/[:.]/g,'-')}.json`,run);console.log(JSON.stringify({fetched:run.fetched,added:run.added,updated:run.updated,errors:run.errors}));if(run.errors.length)process.exitCode=1;
}
async function review(){
 const rows=await getPool().query(`SELECT p.id,p.name,p.city,p.country,p.reason,c.payload FROM place_proposals p JOIN labels l ON l.id=p.label_id JOIN candidates c ON c.id=l.candidate_id ${options.all?'':"WHERE p.state='unresolved'"} ORDER BY p.created_at,p.id`);
 for(const row of rows.rows){const candidate=parseStoredCandidate(row.payload);console.log(`${row.id} · ${row.name} · ${[row.city,row.country].filter(Boolean).join(', ')||'Location unresolved'}\n${row.reason}\n${candidate.evidence.author} · ${candidate.evidence.url}\n`);}
 console.log(`${rows.rows.length} place proposals in PostgreSQL`);
}
async function draft(){
 let candidate:Candidate|undefined,name='',reason='',quote:string|null=null,proposalId:string|undefined;
 if(typeof options.proposal==='string'){
  const row=(await getPool().query('SELECT p.*,c.payload,l.output FROM place_proposals p JOIN labels l ON l.id=p.label_id JOIN candidates c ON c.id=l.candidate_id WHERE p.id=$1',[options.proposal])).rows[0];
  if(!row)throw new Error('Proposal not found');candidate=parseStoredCandidate(row.payload);name=row.name;reason=row.reason;proposalId=row.id;
  const label=object(row.output,'label');if(Array.isArray(label.places)){const place=object(label.places[row.ordinal],'place');quote=typeof place.quote==='string'?place.quote:null;}
 }else if(typeof options.candidate==='string'){
  const row=(await getPool().query('SELECT payload FROM candidates WHERE id=$1',[options.candidate])).rows[0];if(row)candidate=parseStoredCandidate(row.payload);
 }else throw new Error('Use --proposal <uuid> or --candidate <candidate-id>');
 if(!candidate)throw new Error('Candidate not found in PostgreSQL');
 const evidence=await resolveHnComment(candidate.evidence.commentId);
 name=name||candidate.proposedNames[0]||'';
 const result:DraftPlace={candidateId:candidate.id,proposalId,id:normalizeName(name).replace(/\s+/g,'-'),name,city:'',country:'',category:'Museums',coordinates:[null,null],coordinateSource:'',description:'',reason,visitNote:'Check current access and tickets on the official website.',tags:[],officialUrl:'',officialCheckedAt:null,source:{commentId:evidence.commentId,storyId:evidence.storyId,url:evidence.url,discussionUrl:evidence.discussionUrl,author:evidence.author,date:evidence.date,quote:quote&&evidence.text.includes(quote)?quote:null},review:{status:'draft',evidenceText:evidence.text,locationVerified:false,recommendationVerified:false},image:null};
 const out=typeof options.out==='string'?options.out:`data/drafts/${candidate.id}.json`;await atomic(out,result);console.log(`Draft written to ${out}. Resolve the place and verify recommendation, official website and coordinates before approval.`);
}
async function approve(){
 if(typeof options.file!=='string'||typeof options.reviewer!=='string')throw new Error('Use --file <draft.json> --reviewer "Name"');
 const place=await publishReviewedDraft(JSON.parse(await readFile(resolve(root,options.file),'utf8')),options.reviewer);await atomic('data/places.json',await exportCatalog());console.log(`Published ${place.id} in PostgreSQL. No deployment performed.`);
}
async function reject(){
 if(typeof options.proposal!=='string'||typeof options.reason!=='string'||typeof options.reviewer!=='string')throw new Error('Use --proposal <uuid> --reason "Reason" --reviewer "Name"');
 await transaction(async c=>{const changed=await c.query("UPDATE place_proposals SET state='rejected' WHERE id=$1 RETURNING id",[options.proposal]);if(!changed.rowCount)throw new Error('Proposal not found');await c.query("INSERT INTO review_decisions(proposal_id,reviewer,decision,details) VALUES($1,$2,'reject',$3)",[options.proposal,options.reviewer,JSON.stringify({reason:options.reason})]);await c.query("UPDATE pipeline_jobs SET state='succeeded',result=$2,updated_at=now() WHERE kind='resolve_place' AND dedupe_key=$1 AND state='queued'",[`proposal:${options.proposal}`,JSON.stringify({reviewer:options.reviewer,decision:'rejected'})]);});
 console.log('Proposal rejected. Source evidence retained.');
}
async function verify(){
 const rows=await getPool().query(`SELECT id,official_url FROM places WHERE state='published' ${options.place?'AND id=$1':''}`,options.place?[String(options.place)]:[]);let failed=0;
 for(const row of rows.rows){let passed=false,details:unknown;try{details=await checkOfficialUrl(row.official_url);passed=true;}catch(error){details={error:errorMessage(error)};failed++;}
  await transaction(async c=>{await c.query("INSERT INTO verification_checks(place_id,kind,passed,reviewer,details) VALUES($1,'official_url',$2,'link-checker',$3)",[row.id,passed,JSON.stringify(details)]);if(passed)await c.query("UPDATE places SET document=jsonb_set(document,'{officialCheckedAt}',to_jsonb(current_date::text)),updated_at=now() WHERE id=$1",[row.id]);});console.log(`${row.id}: ${passed?'OK':'Needs review'}`);
 }
 await atomic('data/places.json',await exportCatalog());if(failed)process.exitCode=1;
}
try{if(command==='discover')await discover();else if(command==='review')await review();else if(command==='draft')await draft();else if(command==='approve')await approve();else if(command==='reject')await reject();else if(command==='verify')await verify();else if(command==='help')console.log('PostgreSQL pipeline commands: discover, review, draft --proposal <uuid>, approve --file <draft> --reviewer <name>, reject --proposal <uuid> --reason <reason> --reviewer <name>, verify [--place <slug>]');else throw new Error(`Unknown command ${command}`);}
catch(error){console.error(`Pipeline: ${errorMessage(error)}`);process.exitCode=1;}finally{await closeDatabase();}
