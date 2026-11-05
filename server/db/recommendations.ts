import { getPool } from './connection.ts';
import { parseCandidateQueue } from '../../scripts/pipeline-data.ts';
import type { RecommendationPage } from '../../shared/recommendations.ts';

// This is a separate, explicitly unverified reading surface. It never publishes places.
export async function listRecommendations(q:string,limit:number,offset:number):Promise<RecommendationPage> {
  const pool=getPool();
  const where=`p.state<>'rejected' AND c.state<>'rejected' AND h.deleted=false AND h.dead=false
    AND ($1='' OR strpos(lower(concat_ws(' ',p.name,p.city,p.country,p.reason,c.payload->'evidence'->>'author')),$1)>0)`;
  const from=`FROM place_proposals p JOIN labels l ON l.id=p.label_id JOIN candidates c ON c.id=l.candidate_id JOIN hn_items h ON h.id=c.comment_id`;
  const count=await pool.query<{total:string}>(`SELECT count(*) AS total ${from} WHERE ${where}`,[q.toLocaleLowerCase()]);
  const rows=await pool.query<{id:string;name:string;city:string|null;country:string|null;reason:string;payload:unknown;quote:string|null}>(`SELECT p.id,p.name,p.city,p.country,p.reason,c.payload,l.output->'places'->p.ordinal->>'quote' AS quote ${from} WHERE ${where} ORDER BY p.name,p.id LIMIT $2 OFFSET $3`,[q.toLocaleLowerCase(),limit,offset]);
  return {total:Number(count.rows[0].total),limit,offset,recommendations:rows.rows.map(row=>{
    const source=parseCandidateQueue({schemaVersion:1,candidates:[row.payload]}).candidates[0].evidence;
    return {id:row.id,name:row.name,city:row.city,country:row.country,reason:row.reason,quote:row.quote,author:source.author,date:source.date,sourceUrl:source.url,status:'unverified'};
  })};
}
