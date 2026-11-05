import type {Pool,PoolClient} from 'pg';
import {getPool,transaction} from './connection.ts';
import {hash} from '../../scripts/labeling-core.ts';
import {parseCandidateQueue,type Candidate} from '../../scripts/pipeline-data.ts';
import {validatePlace,normalizeName,resolveHnComment,checkOfficialUrl,canonicalUrl,object} from '../../scripts/pipeline-core.ts';
import type {Place,PublishedData,ReviewablePlace} from '../../shared/types.ts';
export async function saveCandidate(c:PoolClient,candidate:Candidate,partitionId:string|null=null){
 const e=candidate.evidence;
 await c.query(`INSERT INTO hn_items(id,kind,author,posted_at,story_id,raw_html,plain_text,content_hash,archive_partition_id,source_url) VALUES($1,'comment',$2,$3,$4,$5,$6,$7,$8,$9)
 ON CONFLICT(id) DO UPDATE SET author=excluded.author,posted_at=excluded.posted_at,story_id=excluded.story_id,raw_html=excluded.raw_html,plain_text=excluded.plain_text,content_hash=excluded.content_hash,archive_partition_id=coalesce(excluded.archive_partition_id,hn_items.archive_partition_id),fetched_at=now() WHERE hn_items.canonical_checked_at IS NULL`,[e.commentId,e.author,e.date,e.storyId,e.rawHtml??'',e.text,hash(e.text),partitionId,e.url]);
 const inputHash=hash(e.text+'\n'+e.storyTitle);
 await c.query(`INSERT INTO candidates(id,comment_id,input_hash,extraction_version,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET updated_at=now()`,[candidate.id,e.commentId,inputHash,candidate.queries.some(q=>q.startsWith('archive:'))?'archive-places-v1':'hn-search-v1',JSON.stringify(candidate)]);
}
export function parseStoredCandidate(value:unknown):Candidate{return parseCandidateQueue({schemaVersion:1,candidates:[value]}).candidates[0];}
const visible=`p.state='published' AND (
 SELECT count(*) FROM (SELECT DISTINCT ON(kind) kind,passed FROM verification_checks v WHERE v.place_id=p.id ORDER BY kind,checked_at DESC,id DESC) latest WHERE passed
)=4 AND EXISTS(SELECT 1 FROM place_recommendations r JOIN hn_items h ON h.id=r.comment_id WHERE r.place_id=p.id AND h.id=(p.document->'source'->>'commentId')::bigint AND NOT h.dead AND NOT h.deleted AND r.evidence_hash=h.content_hash)`;
export interface CatalogQuery {q?:string;city?:string;category?:string;limit:number;offset:number;bounds?:[number,number,number,number];near?:[number,number,number];ids?:string[];id?:string;sort?:string}
export async function listPlaces(query:CatalogQuery,pool:Pool=getPool()){
 const values:unknown[]=[],conditions=[visible];
 const bind=(value:unknown)=>{values.push(value);return `$${values.length}`;};
 if(query.q){const terms=query.q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);for(const term of terms)conditions.push(`strpos(lower(concat_ws(' ',p.name,p.city,p.country,p.category,p.document->>'description',p.document->>'neighborhood',p.document->>'tags')),${bind(term)})>0`);}
 if(query.city&&query.city!=='all')conditions.push(`p.city=${bind(query.city)}`);
 if(query.category&&query.category!=='all')conditions.push(`p.category=${bind(query.category)}`);
 if(query.ids)conditions.push(`p.id=ANY(${bind(query.ids)}::text[])`);
 if(query.id)conditions.push(`p.id=${bind(query.id)}`);
 if(query.bounds){const [west,south,east,north]=query.bounds;const w=bind(west),s=bind(south),e=bind(east),n=bind(north);conditions.push(west<=east?`p.location::geometry && ST_MakeEnvelope(${w},${s},${e},${n},4326)`:`(p.location::geometry && ST_MakeEnvelope(${w},${s},180,${n},4326) OR p.location::geometry && ST_MakeEnvelope(-180,${s},${e},${n},4326))`);}
 let order=query.sort==='recent'?"(p.document->'source'->>'date')::timestamptz DESC,p.id":'p.name,p.id';
 if(query.near){const [lat,lon,radius]=query.near;const point=`ST_SetSRID(ST_MakePoint(${bind(lon)},${bind(lat)}),4326)::geography`;conditions.push(`ST_DWithin(p.location,${point},${bind(radius*1000)})`);order=`ST_Distance(p.location,${point}),p.id`;}
 const where=conditions.join(' AND ');
 return transaction(async c=>{
  // One snapshot keeps result metadata and rows consistent during publication.
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  const total=Number((await c.query(`SELECT count(*) FROM places p WHERE ${where}`,values)).rows[0].count);
  const rows=await c.query<{document:unknown;live_ids:string[]}>(`SELECT p.document,ARRAY(SELECT r.comment_id::text FROM place_recommendations r JOIN hn_items h ON h.id=r.comment_id WHERE r.place_id=p.id AND NOT h.deleted AND NOT h.dead AND r.evidence_hash=h.content_hash) AS live_ids FROM places p WHERE ${where} ORDER BY ${order} LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,query.limit,query.offset]);
  const places=rows.rows.map(row=>{const p=validatePlace(row.document);p.sources=p.sources?.filter(s=>row.live_ids.includes(String(s.commentId)));return p;});
  const facets=await c.query<{city:string;category:string}>(`SELECT DISTINCT p.city,p.category FROM places p WHERE ${visible}`);
  return {schemaVersion:1 as const,updatedAt:new Date().toISOString(),places,total,limit:query.limit,offset:query.offset,facets:{cities:[...new Set(facets.rows.map(r=>r.city))].sort(),categories:[...new Set(facets.rows.map(r=>r.category))].sort()}};
 },pool);
}
export async function exportCatalog():Promise<PublishedData>{
 const result:Place[]=[];let offset=0;
 while(true){const page=await listPlaces({limit:200,offset});result.push(...page.places);if(offset+page.places.length>=page.total)break;offset+=page.places.length;}
 return {schemaVersion:1,updatedAt:new Date().toISOString(),places:result};
}
export async function publishReviewedDraft(value:unknown,reviewer:string){
 const draft=validatePlace(value,{approved:false});
 if(!reviewer.trim()||!draft.review.locationVerified||!draft.review.recommendationVerified)throw new Error('Reviewer must verify location and recommendation before approval');
 const evidence=await resolveHnComment(draft.source.commentId);
 if(evidence.storyId!==draft.source.storyId||evidence.author!==draft.source.author||evidence.date!==draft.source.date)throw new Error('Canonical HN source differs from draft');
 if(draft.source.quote&&!evidence.text.includes(draft.source.quote))throw new Error('Quote is not an exact canonical source excerpt');
 const official=await checkOfficialUrl(draft.officialUrl);
 return persistVerifiedDraft(draft,reviewer,{evidence,official});
}
/** Kept separate so integration tests can supply deterministic already-checked evidence. CLI calls publishReviewedDraft. */
export async function persistVerifiedDraft(draft:ReviewablePlace,reviewer:string,checks:{evidence:Awaited<ReturnType<typeof resolveHnComment>>;official:Awaited<ReturnType<typeof checkOfficialUrl>>},pool:Pool=getPool()){
 return transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtext('hacker.living:publish'))");
  const nearby=await c.query<{id:string;document:unknown;name:string;city:string|null;official_url:string|null}>(`SELECT id,document,name,city,official_url FROM places WHERE location IS NOT NULL AND ST_DWithin(location,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,1000) ORDER BY id FOR UPDATE`,[draft.coordinates[1],draft.coordinates[0]]);
  const match=nearby.rows.find(row=>(normalizeName(row.name)===normalizeName(draft.name)&&normalizeName(row.city)===normalizeName(draft.city))||(row.official_url&&canonicalUrl(row.official_url)===canonicalUrl(draft.officialUrl)));
  const duplicate={rows:match?[match]:[]};
  const id=duplicate.rows[0]?.id??draft.id;
  const occupied=await c.query('SELECT id FROM places WHERE id=$1',[draft.id]);
  if(occupied.rows.length&&(!duplicate.rows.length||id!==draft.id))throw new Error('Slug belongs to a different place');
  const existing=duplicate.rows[0]?.document?validatePlace(duplicate.rows[0].document):null;
  const {candidateId,proposalId,...fields}=draft;
  const place:Place={...fields,id,officialCheckedAt:checks.official.checkedAt.slice(0,10),review:{status:'approved',reviewedAt:new Date().toISOString(),reviewer,locationVerified:true,recommendationVerified:true,method:'Reviewer approval, canonical HN evidence, and official HTML check'}};
  const document:Place=existing?{...(existing.id!==draft.id?existing:place),sources:[existing.source,...(existing.sources??[]),draft.source].filter((s,i,all)=>all.findIndex(v=>v.commentId===s.commentId)===i)}:place;
  const e=checks.evidence;
  await c.query(`INSERT INTO hn_items(id,kind,author,posted_at,story_id,raw_html,plain_text,content_hash,source_url,canonical_checked_at) VALUES($1,'comment',$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT(id) DO UPDATE SET author=excluded.author,posted_at=excluded.posted_at,story_id=excluded.story_id,raw_html=excluded.raw_html,plain_text=excluded.plain_text,content_hash=excluded.content_hash,dead=false,deleted=false,fetched_at=now(),canonical_checked_at=now()`,[e.commentId,e.author,e.date,e.storyId,e.rawHtml,e.text,hash(e.text),e.url]);
  await c.query(`INSERT INTO places(id,name,city,country,category,location,official_url,coordinate_source) VALUES($1,$2,$3,$4,$5,ST_SetSRID(ST_MakePoint($6,$7),4326)::geography,$8,$9) ON CONFLICT(id) DO NOTHING`,[id,document.name,document.city,document.country,document.category,document.coordinates[1],document.coordinates[0],document.officialUrl,document.coordinateSource]);
  await c.query(`INSERT INTO place_recommendations(place_id,comment_id,reason,quote,evidence_hash,verified_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(place_id,comment_id) DO UPDATE SET reason=excluded.reason,quote=excluded.quote,evidence_hash=excluded.evidence_hash,verified_at=excluded.verified_at`,[id,e.commentId,draft.reason,draft.source.quote,hash(e.text)]);
  for(const kind of ['recommendation','hn_evidence','coordinates','official_url'])await c.query('INSERT INTO verification_checks(place_id,kind,passed,reviewer,details) VALUES($1,$2,true,$3,$4)',[id,kind,reviewer,JSON.stringify(kind==='official_url'?checks.official:kind==='hn_evidence'?{commentId:e.commentId,contentHash:hash(e.text)}:{confirmedByReviewer:true,coordinateSource:document.coordinateSource})]);
  await c.query(`UPDATE places SET name=$2,city=$3,country=$4,category=$5,location=ST_SetSRID(ST_MakePoint($6,$7),4326)::geography,official_url=$8,coordinate_source=$9,document=$10,state='published',published_at=coalesce(published_at,now()),updated_at=now() WHERE id=$1`,[id,document.name,document.city,document.country,document.category,document.coordinates[1],document.coordinates[0],document.officialUrl,document.coordinateSource,JSON.stringify(document)]);
  if(proposalId){
   const updated=await c.query("UPDATE place_proposals SET state='resolved',place_id=$2 WHERE id=$1 AND label_id IN(SELECT id FROM labels WHERE candidate_id=$3) RETURNING id",[proposalId,id,candidateId]);
   if(!updated.rowCount)throw new Error('Proposal does not belong to the reviewed candidate');
   await c.query("UPDATE pipeline_jobs SET state='succeeded',result=$2,updated_at=now() WHERE kind='resolve_place' AND dedupe_key=$1 AND state='queued'",[`proposal:${proposalId}`,JSON.stringify({placeId:id,reviewer,method:'reviewer resolution and verified publication'})]);
  }
  await c.query('INSERT INTO review_decisions(place_id,reviewer,decision,details) VALUES($1,$2,$3,$4)',[id,reviewer,'publish',JSON.stringify({candidateId,sourceCommentId:e.commentId})]);
  await c.query("INSERT INTO pipeline_events(stage,message,details) VALUES('publish',$1,$2)",[`Published ${document.name}`,JSON.stringify({placeId:id})]);
  return document;
 },pool);
}
