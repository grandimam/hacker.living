import type {Pool} from 'pg';
import {getPool,transaction} from '../db/connection.ts';
import {completeJob,type Job} from '../db/jobs.ts';
import {parseStoredCandidate} from '../db/catalog.ts';
import {websiteVersion,websitePriority,websiteLinks,type WebsiteLabel} from './core.ts';
import type {WebsitesPage} from '../../shared/websites.ts';

export async function createWebsiteRun(sourceRunId:string,pool:Pool=getPool()){
 return (await pool.query(`INSERT INTO website_runs(source_run_id,version,snapshot_count) VALUES($1,$2,(SELECT count(*) FROM pipeline_run_candidates rc JOIN candidates c ON c.id=rc.candidate_id WHERE rc.run_id=$1 AND c.created_at<=now())) ON CONFLICT(source_run_id,version) DO UPDATE SET version=excluded.version RETURNING *`,[sourceRunId,websiteVersion])).rows[0];
}
export async function scanWebsiteBatch(runId:string,pool:Pool=getPool()){
 return transaction(async c=>{
  const run=(await c.query('SELECT * FROM website_runs WHERE id=$1 FOR UPDATE',[runId])).rows[0];
  if(!run)throw Error('Website run not found');if(!run.enabled||run.scan_complete)return false;
  const rows=(await c.query(`SELECT c.id,CASE WHEN (c.payload->'evidence'->>'rawHtml') ~* 'https?://' OR (c.payload->'evidence'->>'text') ~* 'https?://' THEN c.payload ELSE NULL END AS payload
   FROM candidates c JOIN pipeline_run_candidates rc ON rc.candidate_id=c.id
   WHERE rc.run_id=$1 AND c.id>$2 AND c.created_at<=$3 ORDER BY c.id LIMIT 5000`,[run.source_run_id,run.scan_cursor,run.created_at])).rows;
  const matches=rows.flatMap(row=>{if(!row.payload)return [];const candidate=parseStoredCandidate(row.payload),priority=websitePriority(candidate);return priority?[{candidate_id:row.id,priority}]:[];});
  // Reserve jobs and membership in the same checkpoint transaction, in one bulk write.
  if(matches.length)await c.query(`WITH inputs AS (SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(candidate_id text,priority smallint)), jobs AS (
   INSERT INTO pipeline_jobs(kind,dedupe_key,payload,priority) SELECT 'label_website',$3||':'||candidate_id,jsonb_build_object('candidateId',candidate_id,'promptVersion',$3::text),priority FROM inputs
   ON CONFLICT(kind,dedupe_key) DO UPDATE SET dedupe_key=excluded.dedupe_key RETURNING id,payload
  ) INSERT INTO website_run_candidates(run_id,candidate_id,job_id) SELECT $1,payload->>'candidateId',id FROM jobs ON CONFLICT DO NOTHING`,[runId,JSON.stringify(matches),websiteVersion]);
  await c.query('UPDATE website_runs SET scan_cursor=$2,scanned=scanned+$3,matched=matched+$4,scan_complete=$5 WHERE id=$1',[runId,rows.at(-1)?.id??run.scan_cursor,rows.length,matches.length,rows.length<5000]);
  return rows.length===5000;
 },pool);
}
export async function saveWebsiteLabel(job:Job,label:WebsiteLabel,inputHash:string,response:{model:string;usage:unknown},pool:Pool=getPool()){
 return transaction(async c=>{
  const candidate=parseStoredCandidate((await c.query('SELECT payload FROM candidates WHERE id=$1',[label.candidateId])).rows[0].payload);
  const links=new Map(websiteLinks(candidate).map(l=>[l.url,l.sourceUrl]));
  const labelId=(await c.query('INSERT INTO website_labels(candidate_id,input_hash,prompt_version,model,output,usage) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(candidate_id,input_hash,prompt_version,model) DO UPDATE SET candidate_id=excluded.candidate_id RETURNING id',[label.candidateId,inputHash,websiteVersion,response.model,JSON.stringify(label),JSON.stringify(response.usage)])).rows[0].id;
  let recommendations=0;
  if(label.decision==='recommendation')for(const [ordinal,website]of label.websites.entries())if(website.collectionFit==='include'&&website.visualDesignPraise&&website.appeal.includes('visual-design')&&website.quote&&website.stance==='positive'&&website.confidence!=='low'){
   const sourceUrl=links.get(website.url);if(!sourceUrl)throw Error('Website URL is not present in source');
   const id=(await c.query('INSERT INTO websites(url,hostname,name) VALUES($1,$2,$3) ON CONFLICT(url) DO UPDATE SET url=excluded.url RETURNING id',[website.url,new URL(website.url).hostname,website.name])).rows[0].id;
   await c.query('INSERT INTO website_recommendations(label_id,ordinal,website_id,recommended_url,reason,quote,confidence,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(label_id,ordinal) DO NOTHING',[labelId,ordinal,id,sourceUrl,website.reason,website.quote,website.confidence,JSON.stringify({kind:website.kind,appeal:website.appeal,collectionFit:website.collectionFit,visualDesignPraise:website.visualDesignPraise})]);recommendations++;
  }
  await completeJob(c,job,{labelId,recommendations});return recommendations;
 },pool);
}
export async function websiteProgress(runId:string,pool:Pool=getPool()){
 const run=(await pool.query('SELECT * FROM website_runs WHERE id=$1',[runId])).rows[0];if(!run)throw Error('Website run not found');
 const counts=(await pool.query(`SELECT count(*)::int AS candidates,count(*) FILTER(WHERE j.state='succeeded')::int AS labeled,count(*) FILTER(WHERE j.state='queued')::int AS queued,count(*) FILTER(WHERE j.state='running')::int AS active,count(*) FILTER(WHERE j.state='failed')::int AS failed
  FROM website_run_candidates rc JOIN pipeline_jobs j ON j.id=rc.job_id WHERE rc.run_id=$1`,[runId])).rows[0];
 const recommendations=(await pool.query(`SELECT count(DISTINCT (r.website_id,c.comment_id))::int AS recommendations,count(DISTINCT r.website_id)::int AS websites FROM website_recommendations r JOIN website_labels l ON l.id=r.label_id JOIN candidates c ON c.id=l.candidate_id JOIN website_run_candidates rc ON rc.candidate_id=l.candidate_id WHERE rc.run_id=$1 AND l.prompt_version=$2`,[runId,run.version])).rows[0];
 const failures=(await pool.query(`SELECT j.id,j.state,j.attempts,j.last_error,c.payload->'evidence'->>'url' AS url FROM website_run_candidates rc JOIN pipeline_jobs j ON j.id=rc.job_id JOIN candidates c ON c.id=rc.candidate_id WHERE rc.run_id=$1 AND j.last_error IS NOT NULL ORDER BY j.updated_at DESC LIMIT 20`,[runId])).rows;
 const recent=(await pool.query(`SELECT l.id,l.created_at,l.model,l.output,l.output->>'decision' AS decision,c.payload->'evidence'->>'author' AS author,c.payload->'evidence'->>'url' AS url FROM website_labels l JOIN website_run_candidates rc ON rc.candidate_id=l.candidate_id JOIN candidates c ON c.id=l.candidate_id WHERE rc.run_id=$1 AND l.prompt_version=$2 ORDER BY l.created_at DESC LIMIT 8`,[runId,run.version])).rows;
 return {...run,...counts,...recommendations,failures,recent};
}
export async function listWebsites({limit=60,offset=0,q='',sort='recent',id}:{limit?:number;offset?:number;q?:string;sort?:'recent'|'sources'|'name';id?:string}={},pool:Pool=getPool()):Promise<WebsitesPage>{
 const cte=`WITH sources AS (
  SELECT DISTINCT ON (w.id,c.comment_id) w.id,w.name,w.url,w.hostname,w.state,c.comment_id,
   c.payload->'evidence' AS evidence,r.reason,r.quote,r.recommended_url,r.details
  FROM websites w JOIN website_recommendations r ON r.website_id=w.id JOIN website_labels l ON l.id=r.label_id
  JOIN candidates c ON c.id=l.candidate_id JOIN hn_items h ON h.id=c.comment_id
  WHERE w.state<>'rejected' AND l.prompt_version=$2 AND NOT h.deleted AND NOT h.dead AND ($3::uuid IS NULL OR w.id=$3) AND ($1='' OR w.name ILIKE '%'||$1||'%' OR w.hostname ILIKE '%'||$1||'%')
  ORDER BY w.id,c.comment_id,l.created_at DESC,r.id
 ), grouped AS (
  SELECT id,name,url,hostname,state,count(*)::int AS "sourceCount",max(evidence->>'date') AS latest,
   jsonb_agg(jsonb_build_object('commentId',comment_id,'author',evidence->>'author','date',evidence->>'date','url',evidence->>'url',
    'discussionUrl',CASE WHEN evidence->>'storyId' IS NOT NULL THEN 'https://news.ycombinator.com/item?id='||(evidence->>'storyId') ELSE evidence->>'url' END,
    'recommendedUrl',recommended_url,'reason',reason,'quote',quote,'kind',details->>'kind','appeal',details->'appeal') ORDER BY evidence->>'date' DESC,comment_id) AS recommendations
  FROM sources GROUP BY id,name,url,hostname,state
 )`;
 const total=Number((await pool.query(`${cte} SELECT count(*) AS total FROM grouped`,[q,websiteVersion,id??null])).rows[0].total);
 const order=sort==='name'?'g.name,g.id':sort==='sources'?'g."sourceCount" DESC,g.id':'g.latest DESC,g.id';
 const websites=(await pool.query(`${cte} SELECT g.id,g.name,g.url,g.hostname,g.state,g."sourceCount",g.recommendations,
  (SELECT jsonb_build_object('checkedAt',checked_at,'status',status,'finalUrl',final_url,'error',error) FROM website_link_checks WHERE website_id=g.id ORDER BY checked_at DESC,id DESC LIMIT 1) AS "linkCheck"
  FROM grouped g ORDER BY ${order} LIMIT $4 OFFSET $5`,[q,websiteVersion,id??null,limit,offset])).rows;
 return {total,limit,offset,websites,notice:'Websites explicitly praised for their visual design by individual HN members. Draft LLM extractions; summaries are paraphrases. Destination websites have not been fetched or independently verified.'};
}
