import type {IncomingMessage,ServerResponse} from 'node:http';
import {pipelineApi} from './pipeline/http-api.ts';
import {processingMetrics} from './metrics.ts';
import {fontsApi} from './fonts/api.ts';
import {websitesApi} from './websites/api.ts';
import type {Plugin} from 'vite';
import {getPool,closeDatabase} from './db/connection.ts';
import {listPlaces,type CatalogQuery} from './db/catalog.ts';
import {listDiscovery} from './db/discovery.ts';
import {listRecommendations} from './db/recommendations.ts';
import {placeCategories} from '../shared/types.ts';
class BadRequest extends Error{}
function numeric(params:URLSearchParams,key:string,fallback:number,min:number,max:number,integer=false){
 const value=params.get(key);if(value===null)return fallback;
 const n=Number(value);if(!value.trim()||!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw new BadRequest(`Invalid ${key}`);return n;
}
export function parseCatalogQuery(params:URLSearchParams):CatalogQuery {
 const q=params.get('q')?.trim();if(q&&q.length>300)throw new BadRequest('Search is too long');
 const category=params.get('category')??undefined;if(category&&category!=='all'&&!placeCategories.includes(category as typeof placeCategories[number]))throw new BadRequest('Invalid category');
 const sort=params.get('sort')??'curated';if(!['curated','name','recent'].includes(sort))throw new BadRequest('Invalid sort');
 const result:CatalogQuery={q,category,sort,city:params.get('city')??undefined,limit:numeric(params,'limit',100,1,200,true),offset:numeric(params,'offset',0,0,1000000,true)};
 if(params.has('bounds')){const raw=params.get('bounds')!.split(',');const n=raw.map(Number);if(raw.length!==4||raw.some(s=>!s.trim())||n.some(v=>!Number.isFinite(v))||Math.abs(n[0])>180||Math.abs(n[2])>180||Math.abs(n[1])>90||Math.abs(n[3])>90||n[1]>n[3])throw new BadRequest('Invalid bounds: use west,south,east,north');result.bounds=n as [number,number,number,number];}
 if(params.has('lat')||params.has('lon')){if(!params.has('lat')||!params.has('lon'))throw new BadRequest('lat and lon are both required');result.near=[numeric(params,'lat',0,-90,90),numeric(params,'lon',0,-180,180),numeric(params,'radiusKm',100,0.1,1000)];}
 if(params.has('ids')){const ids=params.get('ids')!.split(',').filter(Boolean);if(ids.length>200||ids.some(id=>!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)))throw new BadRequest('Invalid place IDs');result.ids=ids;}
 return result;
}
export async function handleApi(request:IncomingMessage,response:ServerResponse):Promise<boolean>{
 const url=new URL(request.url??'/','http://localhost');if(!url.pathname.startsWith('/api/'))return false;
 response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');
 try{
  const adminPath=url.pathname==='/api/pipeline'||url.pathname.startsWith('/api/pipeline/')||url.pathname==='/api/fonts/pipeline'||url.pathname.startsWith('/api/fonts/pipeline/')||url.pathname.startsWith('/api/websites/pipeline/');
  const adminEnabled=process.env.PIPELINE_ADMIN_ENABLED==='true'||(process.env.PIPELINE_ADMIN_ENABLED!=='false'&&process.env.NODE_ENV!=='production');
  if(adminPath&&!adminEnabled){response.writeHead(404).end(JSON.stringify({error:'API endpoint not found'}));return true;}
  if(await fontsApi(request,response))return true;
  if(await websitesApi(request,response))return true;
  if(await pipelineApi(request,response))return true;
  if(request.method!=='GET'){response.writeHead(405,{Allow:'GET'}).end(JSON.stringify({error:'GET only'}));return true;}
  if(url.pathname==='/api/health'){await getPool().query('SELECT 1');response.end(JSON.stringify({ok:true,database:'postgresql',catalog:'database'}));}
  else if(url.pathname==='/api/metrics')response.end(JSON.stringify(await processingMetrics()));
  else if(url.pathname==='/api/pipeline/provider-pools')response.end(JSON.stringify({pools:(await getPool().query('SELECT id,provider,model,workers,enabled,state,active,completed_batches,last_error,heartbeat_at FROM provider_pools ORDER BY created_at DESC LIMIT 10')).rows}));
  else if(url.pathname==='/api/discoveries')response.end(JSON.stringify(await listDiscovery(parseCatalogQuery(url.searchParams))));
  else if(/^\/api\/discoveries\/proposal-[a-f0-9-]+$/.test(url.pathname)){const data=await listDiscovery({id:url.pathname.split('/').at(-1),limit:1,offset:0});if(!data.places.length)response.writeHead(404).end(JSON.stringify({error:'Place not found'}));else response.end(JSON.stringify(data.places[0]));}
  else if(url.pathname==='/api/recommendations'){const q=url.searchParams.get('q')?.trim()??'';if(q.length>300)throw new BadRequest('Search is too long');response.end(JSON.stringify(await listRecommendations(q,numeric(url.searchParams,'limit',100,1,200,true),numeric(url.searchParams,'offset',0,0,1000000,true))));}
  else if(url.pathname==='/api/places')response.end(JSON.stringify(await listPlaces(parseCatalogQuery(url.searchParams))));
  else if(/^\/api\/places\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname)){
   const id=url.pathname.split('/').at(-1)!;const data=await listPlaces({id,limit:1,offset:0});if(!data.places.length)response.writeHead(404).end(JSON.stringify({error:'Place not found'}));else response.end(JSON.stringify(data.places[0]));
  }else response.writeHead(404).end(JSON.stringify({error:'API endpoint not found'}));
 }catch(error){if(error instanceof BadRequest)response.writeHead(400).end(JSON.stringify({error:error.message}));else{console.error('Catalog API:',error instanceof Error?error.message:'Database request failed');response.writeHead(503).end(JSON.stringify({error:'The catalog database is unavailable. Check the local database service.'}));}}
 return true;
}
export function catalogApiPlugin():Plugin{return{name:'catalog-api',configureServer(server){server.middlewares.use((req,res,next)=>{void handleApi(req,res).then(handled=>{if(!handled)next();}).catch(next);});server.httpServer?.once('close',()=>{void closeDatabase();});}};}
