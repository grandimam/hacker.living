import {getPool,transaction} from '../db/connection.ts';
import {publicHttpsUrl} from '../../scripts/pipeline-core.ts';
import {lookup} from 'node:dns/promises';
export async function publicUrl(raw:string){const url=publicHttpsUrl(raw);const addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(({address})=>/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::|fc|fd|fe80|::ffff:)/i.test(address)))throw Error('Non-public network address');return url;}
const userAgent='hacker.living pipeline/1.0 (https://github.com/grandimam/hacker.living)';
export async function cachedJson(raw:string,ttlSeconds=86400){
 const url=publicHttpsUrl(raw);
 // All JSON APIs used by the pipeline are fixed public services.
 if(!['nominatim.openstreetmap.org','commons.wikimedia.org','en.wikipedia.org','es.wikipedia.org','fr.wikipedia.org','de.wikipedia.org','ja.wikipedia.org','fi.wikipedia.org','sv.wikipedia.org','nl.wikipedia.org','vi.wikipedia.org'].includes(url.hostname))throw Error('Unsupported research API hostname');
 const cached=await getPool().query('SELECT response FROM pipeline_http_cache WHERE url=$1 AND fetched_at>now()-($2*interval \'1 second\')',[url.href,ttlSeconds]);if(cached.rows.length)return cached.rows[0].response;
 return transaction(async c=>{
  // Serialize Nominatim requests across processes; response cache avoids repeat calls.
  if(url.hostname==='nominatim.openstreetmap.org'){await c.query("SELECT pg_advisory_xact_lock(hashtext('hacker.living:nominatim'))");const again=await c.query('SELECT response FROM pipeline_http_cache WHERE url=$1 AND fetched_at>now()-interval \'1 day\'',[url.href]);if(again.rows.length)return again.rows[0].response;await new Promise(resolve=>setTimeout(resolve,1100));}
  let last:unknown;
  for(let attempt=0;attempt<3;attempt++)try{const response=await fetch(url,{headers:{'User-Agent':userAgent,Accept:'application/json'},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error(`Research API HTTP ${response.status}: ${url.hostname}`);const result=await response.json();await c.query('INSERT INTO pipeline_http_cache(url,response) VALUES($1,$2) ON CONFLICT(url) DO UPDATE SET response=excluded.response,fetched_at=now()',[url.href,JSON.stringify(result)]);return result;}catch(error){last=error;await new Promise(resolve=>setTimeout(resolve,1500*(attempt+1)));}throw last;
 });
}
export async function checkOfficial(raw:string){
 let url=await publicUrl(raw);
 for(let redirects=0;redirects<6;redirects++){
  const r=await fetch(url,{redirect:'manual',headers:{'User-Agent':userAgent,Accept:'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(15000)});
  if([301,302,303,307,308].includes(r.status)){await r.body?.cancel();const location=r.headers.get('location');if(!location)throw Error('Missing redirect location');url=await publicUrl(new URL(location,url).href);continue;}
  const contentType=r.headers.get('content-type')??'';
  // Bound content retained as evidence; do not store third-party scripts or full pages.
  const reader=r.body?.getReader();let html='';let bytes=0;const decoder=new TextDecoder();
  try{if(reader)for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;html+=decoder.decode(value,{stream:true});if(bytes>250000)break;}}finally{await reader?.cancel();}
  return {status:r.status,url:url.href,contentType,checkedAt:new Date().toISOString(),html};
 }
 throw Error('Too many official redirects');
}
