import {readFile,writeFile} from 'node:fs/promises';
const input=JSON.parse(await readFile(new URL('../data/research/place-enrichment-input.json',import.meta.url),'utf8')) as {name:string;geocodeQuery:string;officialUrl:string}[];
const results=[];
for(const place of input){
 const url=new URL('https://nominatim.openstreetmap.org/search');url.search=new URLSearchParams({format:'jsonv2',limit:'3',addressdetails:'1',extratags:'1',q:place.geocodeQuery}).toString();
 let geocoding:unknown=[],geocodeError:string|null=null;
 try{const r=await fetch(url,{headers:{'User-Agent':'hacker.living local research (https://github.com/grandimam/hacker.living)'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(`HTTP ${r.status}`);geocoding=await r.json();}catch(error){geocodeError=String(error);}
 let officialCheck:unknown;
 try{const r=await fetch(place.officialUrl,{headers:{'User-Agent':'hacker.living source verification'},signal:AbortSignal.timeout(20000)});officialCheck={status:r.status,url:r.url,contentType:r.headers.get('content-type'),checkedAt:new Date().toISOString()};await r.body?.cancel();}catch(error){officialCheck={error:String(error),checkedAt:new Date().toISOString()};}
 results.push({...place,checkedAt:new Date().toISOString(),geocodingUrl:url.toString(),geocoding,geocodeError,officialCheck});
 await writeFile(new URL('../data/research/place-enrichment-results.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify({name:place.name,geocoding,geocodeError,officialCheck}));
 await new Promise(resolve=>setTimeout(resolve,1100));
}
