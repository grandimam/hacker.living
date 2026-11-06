import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {getPool,transaction} from './connection.ts';
import {publishedVisibility} from './catalog.ts';
import {readProcessingMetrics} from '../metrics.ts';
import type {ProcessingMetricsData} from '../../shared/metrics.ts';

// Ordering follows foreign keys. This list is also the import allowlist.
export const catalogTables=['hn_items','candidates','labels','font_labels','font_families','places','place_proposals','proposal_research','font_recommendations','place_recommendations','place_aliases','verification_checks','review_decisions'] as const;
type Table=typeof catalogTables[number];
type Row=Record<string,unknown>;
export interface CatalogTransfer {format:'hacker.living/catalog';version:1;id:string;createdAt:string;metrics:ProcessingMetricsData;tables:Record<Table,Row[]>}
export function parseCatalogTransfer(value:unknown):CatalogTransfer{
 const d=value as CatalogTransfer;
 if(!d||d.format!=='hacker.living/catalog'||d.version!==1||!d.id||!Number.isFinite(Date.parse(d.createdAt)))throw Error('Unsupported catalog export');
 if(!d.tables||Object.keys(d.tables).length!==catalogTables.length||catalogTables.some(t=>!Array.isArray(d.tables[t])||d.tables[t].some(r=>!r||typeof r!=='object'||Array.isArray(r))))throw Error('Invalid catalog tables');
 if(!d.metrics||['collected','processed','processing','costUsd'].some(k=>!Number.isFinite((d.metrics as any)[k])||(d.metrics as any)[k]<0))throw Error('Invalid catalog metrics');
 return d;
}
export async function exportProcessedCatalog(pool:Pool=getPool()):Promise<CatalogTransfer>{
 return transaction(async c=>{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  const tables={} as Record<Table,Row[]>;
  const read=async(table:Table,where='true',params:unknown[]=[])=>{
   const rows=(await c.query(`SELECT to_jsonb(t) AS document FROM ${table} t WHERE ${where}`,params)).rows.map(r=>r.document as Row);
   tables[table]=rows;return rows;
  };
  const proposals=await read('place_proposals',`t.state<>'rejected' AND EXISTS(SELECT 1 FROM labels l JOIN candidates c ON c.id=l.candidate_id JOIN hn_items h ON h.id=c.comment_id WHERE l.id=t.label_id AND c.state<>'rejected' AND NOT h.dead AND NOT h.deleted)`);
  const places=await read('places');
  const eligible=new Set((await c.query(`SELECT p.id FROM places p WHERE ${publishedVisibility}`)).rows.map(r=>r.id));
  // A record whose evidence has since failed must remain hidden after transfer.
  for(const row of places)if(row.state==='published'&&!eligible.has(row.id))row.state='review';
  const recommendations=await read('place_recommendations');
  const aliases=await read('place_aliases');
  const fontRecommendations=await read('font_recommendations',`EXISTS(SELECT 1 FROM font_families f JOIN font_labels l ON l.id=t.label_id JOIN candidates c ON c.id=l.candidate_id JOIN hn_items h ON h.id=c.comment_id WHERE f.id=t.font_id AND f.state<>'rejected' AND NOT h.dead AND NOT h.deleted)`);
  const fontLabels=await read('font_labels','t.id=ANY($1::uuid[])',[fontRecommendations.map(r=>r.label_id)]);
  await read('font_families','t.id=ANY($1::uuid[])',[fontRecommendations.map(r=>r.font_id)]);
  const labels=await read('labels','t.id=ANY($1::uuid[])',[[...proposals.map(r=>r.label_id),...recommendations.map(r=>r.label_id).filter(Boolean)]]);
  const candidates=await read('candidates','t.id=ANY($1::text[])',[[...labels.map(r=>r.candidate_id),...fontLabels.map(r=>r.candidate_id)]]);
  const commentIds=[...candidates.map(r=>r.comment_id),...recommendations.map(r=>r.comment_id),...aliases.map(r=>r.source_comment_id).filter(Boolean)];
  const evidence=await read('hn_items','t.id=ANY($1::bigint[])',[commentIds]);
  // Keep the source evidence without bringing the raw archive manifest along.
  for(const row of evidence)row.archive_partition_id=null;
  await read('proposal_research','t.proposal_id=ANY($1::uuid[])',[proposals.map(r=>r.id)]);
  await read('verification_checks');
  await read('review_decisions','(t.place_id IS NOT NULL OR t.proposal_id=ANY($1::uuid[])) AND (t.proposal_id IS NULL OR t.proposal_id=ANY($1::uuid[]))',[proposals.map(r=>r.id)]);
  const metrics=await readProcessingMetrics(c);
  return {format:'hacker.living/catalog',version:1,id:randomUUID(),createdAt:new Date().toISOString(),metrics,tables};
 },pool);
}
export async function importProcessedCatalog(value:unknown,pool:Pool=getPool()){
 const data=parseCatalogTransfer(value);
 return transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtext('hacker.living:catalog-import'))");
  // Never overwrite a working pipeline or an existing catalog.
  await c.query(`LOCK TABLE ${[...catalogTables,'pipeline_jobs','pipeline_runs','font_runs','provider_pools'].join(',')} IN SHARE ROW EXCLUSIVE MODE`);
  const occupied=(await c.query(`SELECT ${[...catalogTables,'pipeline_jobs','pipeline_runs','font_runs','provider_pools'].map(t=>`EXISTS(SELECT 1 FROM ${t})`).join(' OR ')} AS occupied`)).rows[0].occupied;
  if(occupied)throw Error('Import requires an empty database. Existing catalog and processing data were left unchanged.');
  for(const table of catalogTables){
   const rows=data.tables[table];if(!rows.length)continue;
   const importing=table==='places'?rows.map(r=>({...r,state:'draft'})):rows;
   const override=['verification_checks','review_decisions'].includes(table)?'OVERRIDING SYSTEM VALUE':'';
   // PostgreSQL converts JSON values through the actual column types, including geography.
   await c.query(`INSERT INTO ${table} ${override} SELECT * FROM json_populate_recordset(NULL::${table},$1::json)`,[JSON.stringify(importing)]);
  }
  // Restore published state only after evidence and checks exist; normal gates still run.
  for(const place of data.tables.places)await c.query('UPDATE places SET state=$2 WHERE id=$1',[place.id,place.state]);
  for(const table of ['verification_checks','review_decisions'])if(data.tables[table as Table].length)await c.query(`SELECT setval(pg_get_serial_sequence('${table}','id'),(SELECT max(id) FROM ${table}),true)`);
  const metrics={...data.metrics,processing:0,paused:true,updatedAt:data.createdAt};
  await c.query("INSERT INTO pipeline_checkpoints(source,cursor) VALUES('catalog:metrics',$1)",[JSON.stringify({...metrics,exportId:data.id})]);
  return {exportId:data.id,exportedAt:data.createdAt,counts:Object.fromEntries(catalogTables.map(t=>[t,data.tables[t].length]))};
 },pool);
}
