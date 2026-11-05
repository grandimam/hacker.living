import type {Pool} from 'pg';
import {getPool,transaction} from '../db/connection.ts';
import {enqueueJob,completeJob,type Job} from '../db/jobs.ts';
import {fontVersion,fontNameKey,type FontLabel} from './core.ts';

export async function createFontRun(sourceRunId:string,pool:Pool=getPool()){
 return (await pool.query('INSERT INTO font_runs(source_run_id,version) VALUES($1,$2) ON CONFLICT(source_run_id,version) DO UPDATE SET version=excluded.version RETURNING *',[sourceRunId,fontVersion])).rows[0];
}
export async function scanFontBatch(runId:string,pool:Pool=getPool()){
 return transaction(async c=>{
  const run=(await c.query('SELECT * FROM font_runs WHERE id=$1 FOR UPDATE',[runId])).rows[0];
  if(!run)throw Error('Font run not found');if(!run.enabled||run.scan_complete)return false;
  const rows=(await c.query(`SELECT c.id,font_candidate_priority(c.payload->'evidence'->>'text',c.payload->'evidence'->>'storyTitle') AS priority
   FROM candidates c JOIN pipeline_run_candidates rc ON rc.candidate_id=c.id
   WHERE rc.run_id=$1 AND c.id>$2 AND c.created_at<=$3 ORDER BY c.id LIMIT 5000`,[run.source_run_id,run.scan_cursor,run.created_at])).rows;
  let matched=0;
  for(const row of rows)if(row.priority>0){
   const job=await enqueueJob('label_font',`${fontVersion}:${row.id}`,{candidateId:row.id,promptVersion:fontVersion},c);
   await c.query('INSERT INTO font_run_candidates(run_id,candidate_id,job_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[runId,row.id,job]);matched++;
  }
  await c.query('UPDATE font_runs SET scan_cursor=$2,scanned=scanned+$3,matched=matched+$4,scan_complete=$5 WHERE id=$1',[runId,rows.at(-1)?.id??run.scan_cursor,rows.length,matched,rows.length<5000]);
  return rows.length===5000;
 },pool);
}
export async function saveFontLabel(job:Job,label:FontLabel,inputHash:string,response:{model:string;usage:unknown},pool:Pool=getPool()){
 return transaction(async c=>{
  const labelId=(await c.query('INSERT INTO font_labels(candidate_id,input_hash,prompt_version,model,output,usage) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(candidate_id,input_hash,prompt_version,model) DO UPDATE SET candidate_id=excluded.candidate_id RETURNING id',[label.candidateId,inputHash,fontVersion,response.model,JSON.stringify(label),JSON.stringify(response.usage)])).rows[0].id;
  let recommendations=0;
  if(label.decision==='recommendation')for(const [ordinal,font]of label.fonts.entries())if(font.stance==='positive'&&font.confidence!=='low'){
   const family=(await c.query('INSERT INTO font_families(name_key,name) VALUES($1,$2) ON CONFLICT(name_key) DO UPDATE SET name_key=excluded.name_key RETURNING id',[fontNameKey(font.name),font.name])).rows[0].id;
   await c.query('INSERT INTO font_recommendations(label_id,ordinal,font_id,source_name,reason,quote,contexts,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(label_id,ordinal) DO NOTHING',[labelId,ordinal,family,font.name,font.reason,font.quote,JSON.stringify(font.contexts),JSON.stringify({features:font.features,confidence:font.confidence})]);recommendations++;
  }
  // Fonts must not change the Places candidate state or publication status.
  await completeJob(c,job,{labelId,recommendations});return recommendations;
 },pool);
}
export async function fontProgress(runId:string,pool:Pool=getPool()){
 const run=(await pool.query('SELECT * FROM font_runs WHERE id=$1',[runId])).rows[0];if(!run)throw Error('Font run not found');
 const counts=(await pool.query(`SELECT count(*)::int AS candidates,count(*) FILTER(WHERE j.state='succeeded')::int AS labeled,count(*) FILTER(WHERE j.state='running')::int AS active,count(*) FILTER(WHERE j.state='failed')::int AS failed
  FROM font_run_candidates rc JOIN pipeline_jobs j ON j.id=rc.job_id WHERE rc.run_id=$1`,[runId])).rows[0];
 const recommendations=(await pool.query(`SELECT count(DISTINCT r.id)::int AS recommendations,count(DISTINCT r.font_id)::int AS fonts FROM font_recommendations r JOIN font_labels l ON l.id=r.label_id JOIN font_run_candidates rc ON rc.candidate_id=l.candidate_id WHERE rc.run_id=$1`,[runId])).rows[0];
 return {...run,...counts,...recommendations};
}
export async function listFonts(limit=100,offset=0,pool:Pool=getPool(),context?:string){
 const values:unknown[]=context?[context]:[];
 const visible=`FROM font_families f JOIN font_recommendations r ON r.font_id=f.id JOIN font_labels l ON l.id=r.label_id JOIN candidates c ON c.id=l.candidate_id JOIN hn_items h ON h.id=c.comment_id WHERE f.state<>'rejected' AND NOT h.deleted AND NOT h.dead${context?' AND r.contexts ? $1':''}`;
 const total=Number((await pool.query(`SELECT count(DISTINCT f.id) AS total ${visible}`,values)).rows[0].total);
 const rows=(await pool.query(`SELECT f.id,f.name,f.state,f.official_url,f.license_info,f.asset_path,jsonb_agg(jsonb_build_object('reason',r.reason,'quote',r.quote,'contexts',r.contexts,'features',r.details->'features','sourceName',r.source_name,'commentId',h.id,'author',h.author,'date',h.posted_at,'url',h.source_url,'discussionUrl',CASE WHEN h.story_id IS NOT NULL THEN 'https://news.ycombinator.com/item?id='||h.story_id::text ELSE h.source_url END) ORDER BY h.posted_at DESC,r.id) AS recommendations ${visible} GROUP BY f.id ORDER BY f.name,f.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,limit,offset])).rows;
 return {total,limit,offset,fonts:rows,notice:'Extracted community recommendations; draft identities. Font files, official links and licenses have not been verified.'};
}
