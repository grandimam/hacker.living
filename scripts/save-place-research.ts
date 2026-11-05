import {readFile,writeFile} from 'node:fs/promises';
import {getPool,transaction,closeDatabase} from '../server/db/connection.ts';
const root=new URL('../',import.meta.url);
async function main(){
 const rows=JSON.parse(await readFile(new URL('data/research/place-enrichment-results.json',root),'utf8'));
 const images=JSON.parse(await readFile(new URL('data/research/place-images.json',root),'utf8'));
 const report=['# August place research','',`Researched ${new Date().toISOString()}. Proposed matches, not publication approvals. Coordinates are institution or building reference points, not surveyed entrances.`, '', '| Extracted place | Proposed location | Coordinates (latitude, longitude) | Official visitor page | Coordinate evidence | Review notes |','|---|---|---|---|---|---|'];
 await transaction(async c=>{
 for(const row of rows){
  const matches=[...row.geocoding,...(row.additionalGeocoding??[]).flatMap((a:any)=>a.results)];
  const match=matches.find((g:any)=>g.category==='tourism'&&g.type==='museum')??(row.name==='Oodi library'?matches.find((g:any)=>g.category==='amenity'&&g.type==='library'):null);
  const coords=match?[Number(match.lat),Number(match.lon)]:null;
  if(coords&&(!Number.isFinite(coords[0])||Math.abs(coords[0])>90||!Number.isFinite(coords[1])||Math.abs(coords[1])>180))throw Error('Invalid coordinates');
  const coordinateSource=match?`https://www.openstreetmap.org/${match.osm_type}/${match.osm_id}`:null;
  const category=row.name==='Oodi library'?'Libraries':row.name==='The National Museum of Computing'?'Computing':'Museums';
  const notes=[row.notes, ...(row.officialCheck.status===403?['Automated official-page fetch returned HTTP 403; identity is supported by official indexed content, but live availability is not verified.']:[]),...(!match?['Current official address confirmed, but a museum-level coordinate match was not found. No pin assigned.']:[])].join(' ');
  const image=images.find((i:any)=>i.name===row.name)?.image??null;
  const findings={...row,coordinates:coords,coordinateSource,category,notes,image,method:'Codex-assisted web research with direct official-site checks and OpenStreetMap Nominatim geocoding',coordinatePrecision:match?'institution':'unresolved',coordinateLicense:'OpenStreetMap contributors — ODbL 1.0 https://www.openstreetmap.org/copyright'};
  const p=await c.query('SELECT id FROM place_proposals WHERE name=$1 AND state<>\'rejected\'',[row.name]);if(p.rows.length!==1)throw Error(`Expected one proposal: ${row.name}`);
  await c.query(`INSERT INTO proposal_research(proposal_id,research_version,canonical_name,address,city,country,location,official_url,coordinate_source,state,findings,checked_at)
   VALUES($1,'august-research-v1',$2,$3,$4,$5,CASE WHEN $6::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($7,$6),4326)::geography END,$8,$9,$10,$11,$12)
   ON CONFLICT(proposal_id,research_version) DO UPDATE SET canonical_name=excluded.canonical_name,address=excluded.address,city=excluded.city,country=excluded.country,location=excluded.location,official_url=excluded.official_url,coordinate_source=excluded.coordinate_source,state=excluded.state,findings=excluded.findings,checked_at=excluded.checked_at`,[p.rows[0].id,row.canonicalName,row.address,row.city,row.country,coords?.[0]??null,coords?.[1]??null,row.officialUrl,coordinateSource,match?'needs_review':'unresolved',JSON.stringify(findings),row.checkedAt]);
  report.push(`| ${row.name} | ${row.city}, ${row.country} | ${coords?coords.map((n:number)=>n.toFixed(6)).join(', '):'Unresolved'} | [Official page](${row.officialUrl}) | ${coordinateSource?`[OpenStreetMap](${coordinateSource})`:'—'} | ${notes} |`);
 }
 await c.query("INSERT INTO pipeline_events(stage,message,details) VALUES('research','Researched 11 proposals; 10 institution coordinate matches and 1 unresolved location',$1)",[JSON.stringify({records:rows.length,version:'august-research-v1'})]);
 });
 report.push('','Photo attribution is retained in each database research record and shown on the photo credits page. Raw geocoder responses, alternate matches and dated HTTP results are in `data/research/place-enrichment-results.json`. No proposal has been approved for the verified catalog.');
 await writeFile(new URL('docs/august-place-research.md',root),report.join('\n')+'\n');
 console.log('Saved research to PostgreSQL and docs/august-place-research.md');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(closeDatabase);
