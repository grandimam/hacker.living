import {readFile,writeFile} from 'node:fs/promises';
const path=new URL('../data/research/place-enrichment-results.json',import.meta.url);
const rows=JSON.parse(await readFile(path,'utf8'));
const queries:Record<string,string[]>={
 'Crandall Printing Museum':['65 West Main Street Court Alpine Utah','Crandall Museum Utah'],
 "Goya's museum":['Museo Camon Aznar Zaragoza'],
 'National Gallery of Art':['National Gallery of Art Washington'],
 'The Ho Chi Minh City History Museum':['Bảo tàng Lịch sử Thành phố Hồ Chí Minh']
};
for(const row of rows){for(const q of queries[row.name]??[]){
 const url=new URL('https://nominatim.openstreetmap.org/search');url.search=new URLSearchParams({format:'jsonv2',limit:'3',addressdetails:'1',extratags:'1',q}).toString();
 try{const response=await fetch(url,{headers:{'User-Agent':'hacker.living local research (https://github.com/grandimam/hacker.living)'},signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`HTTP ${response.status}`);const results=await response.json();row.additionalGeocoding??=[];row.additionalGeocoding.push({url:url.toString(),q,checkedAt:new Date().toISOString(),results});console.log(JSON.stringify({name:row.name,q,results}));}catch(error){console.log(JSON.stringify({name:row.name,q,error:String(error)}));}await writeFile(path,JSON.stringify(rows,null,2)+'\n');await new Promise(resolve=>setTimeout(resolve,1100));
}}
