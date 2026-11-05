import type {Pool} from 'pg';
import {getPool} from './connection.ts';
import {parseStoredCandidate} from './catalog.ts';
import type {CatalogQuery} from './catalog.ts';
import type {DiscoveryPage} from '../../shared/catalog.ts';
import type {DisplayPlace} from '../../shared/types.ts';
import type {Recommendation} from '../../shared/recommendations.ts';

export async function listDiscovery(query:CatalogQuery,pool:Pool=getPool()):Promise<DiscoveryPage>{
 const values:unknown[]=[];const param=(value:unknown)=>{values.push(value);return `$${values.length}`;};
 let distanceOrder:string|undefined;
 const where=["p.state<>'rejected'","c.state<>'rejected'","NOT h.deleted","NOT h.dead"];
 if(query.q)for(const term of query.q.toLocaleLowerCase().split(/\s+/).filter(Boolean))where.push(`strpos(lower(concat_ws(' ',r.canonical_name,r.city,r.country,p.reason,r.findings->>'category')),${param(term)})>0`);
 if(query.city&&query.city!=='all')where.push(`r.city=${param(query.city)}`);
 if(query.category&&query.category!=='all')where.push(`r.findings->>'category'=${param(query.category)}`);
 if(query.id)where.push(`${param(query.id)}=ANY(g.member_ids)`);
 if(query.ids)where.push(`g.member_ids && ${param(query.ids)}::text[]`);
 if(query.near){const [lat,lon,km]=query.near;const point=`ST_SetSRID(ST_MakePoint(${param(lon)},${param(lat)}),4326)::geography`;where.push(`ST_DWithin(r.location,${point},${param(km*1000)})`);distanceOrder=`ST_Distance(r.location,${point}),p.id`;}
 if(query.bounds){const [w,s,e,n]=query.bounds;const south=param(s),north=param(n),west=param(w),east=param(e);where.push(`ST_Y(r.location::geometry) BETWEEN ${south} AND ${north} AND ${w<=e?`ST_X(r.location::geometry) BETWEEN ${west} AND ${east}`:`(ST_X(r.location::geometry)>=${west} OR ST_X(r.location::geometry)<=${east})`}`);}
 // Group before pagination; source counts count distinct comments, not model retries.
 // Matching names in different cities or at distant branches remain separate.
 const base=`FROM place_proposals p JOIN LATERAL(SELECT * FROM proposal_research WHERE proposal_id=p.id ORDER BY checked_at DESC,id DESC LIMIT 1)r ON true JOIN labels l ON l.id=p.label_id JOIN candidates c ON c.id=l.candidate_id JOIN hn_items h ON h.id=c.comment_id`;
 const groups=`WITH identities AS (
  SELECT p.id,h.id AS comment_id,
   lower(regexp_replace(trim(r.canonical_name),'\\s+',' ','g')) AS name_key,
   lower(trim(r.city)) AS city_key,lower(trim(r.country)) AS country_key,
   CASE WHEN r.location IS NULL THEN coalesce(nullif(lower(trim(r.address)),''),p.id::text) ELSE '' END AS address_key,
   r.location ${base} WHERE p.state<>'rejected' AND c.state<>'rejected' AND NOT h.deleted AND NOT h.dead
 ), clustered AS (
  SELECT *,ST_ClusterDBSCAN(ST_Transform(location::geometry,3857),eps:=100,minpoints:=1)
   OVER(PARTITION BY name_key,city_key,country_key,address_key ORDER BY id) AS cluster_id FROM identities
 ), grouped AS (
  SELECT min(id::text)::uuid AS id,count(DISTINCT comment_id)::int AS source_count,
   array_agg('proposal-'||id::text) AS member_ids FROM clustered
   GROUP BY name_key,city_key,country_key,address_key,cluster_id
 ) `;
 const from=`${base} JOIN grouped g ON g.id=p.id`;
 const columns=`g.source_count,p.id,p.name,p.reason,p.ordinal,c.payload,l.output,r.canonical_name,r.city,r.country,r.address,r.official_url,r.coordinate_source,r.checked_at,r.findings,ST_Y(r.location::geometry) AS lat,ST_X(r.location::geometry) AS lon`;
 const order=distanceOrder??(query.sort==='recent'?"c.payload->'evidence'->>'date' DESC,p.id":query.sort==='name'?'lower(r.canonical_name),p.id':'g.source_count DESC,lower(r.canonical_name),p.id');
 const count=await pool.query(`${groups} SELECT count(*) AS total ${from} WHERE ${where.join(' AND ')} AND r.location IS NOT NULL`,values);
 const unlocatedRows=await pool.query(`${groups} SELECT ${columns} ${from} WHERE ${where.join(' AND ')} AND r.location IS NULL ORDER BY ${order} LIMIT 100`,values);
 const limit=query.limit??100,offset=query.offset??0;
 const paged=[...values,limit,offset];
 const rows=await pool.query(`${groups} SELECT ${columns} ${from} WHERE ${where.join(' AND ')} AND r.location IS NOT NULL ORDER BY ${order} LIMIT $${values.length+1} OFFSET $${values.length+2}`,paged);
 const facets=await pool.query(`${groups} SELECT DISTINCT r.city,r.findings->>'category' AS category ${from} WHERE p.state<>'rejected' AND c.state<>'rejected' AND NOT h.deleted AND NOT h.dead`);
 function source(row:any){const e=parseStoredCandidate(row.payload).evidence;return {commentId:e.commentId,storyId:e.storyId,url:e.url,discussionUrl:e.storyId?`https://news.ycombinator.com/item?id=${e.storyId}`:e.url,author:e.author??'HN community member',date:e.date??'',quote:row.output.places[row.ordinal]?.quote??null};}
 const places:DisplayPlace[]=rows.rows.map(row=>({id:query.id??`proposal-${row.id}`,sourceCount:row.source_count,name:row.canonical_name,city:row.city,country:row.country,category:row.findings.category,coordinates:[row.lat,row.lon],coordinateSource:row.coordinate_source,description:row.reason,reason:row.reason,visitNote:row.findings.notes,tags:[],officialUrl:row.official_url,officialCheckedAt:row.findings.officialCheck.status===200?new Date(row.findings.officialCheck.checkedAt).toISOString().slice(0,10):'',source:source(row),review:{status:'draft'},image:row.findings.image??null,research:{notes:row.findings.notes,address:row.address,coordinatePrecision:row.findings.coordinatePrecision,officialStatus:row.findings.officialCheck.status??null}}));
 const unlocated:Recommendation[]=unlocatedRows.rows.map(row=>{const e=source(row);return {id:query.id??`proposal-${row.id}`,sourceCount:row.source_count,name:row.canonical_name,city:row.city,country:row.country,reason:row.reason,quote:e.quote,author:e.author,date:e.date,sourceUrl:e.url,officialUrl:row.official_url,status:'unverified'};});
 return {schemaVersion:1,updatedAt:new Date().toISOString(),places,unlocated,total:Number(count.rows[0].total),limit,offset,facets:{cities:[...new Set(facets.rows.map(r=>r.city as string))].sort(),categories:[...new Set(facets.rows.map(r=>r.category as string))].sort()}};
}
