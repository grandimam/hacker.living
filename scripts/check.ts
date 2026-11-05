import {access} from 'node:fs/promises';
import {optionalExport} from './prepare-data.ts';
const data=await optionalExport();
for(const p of data?.places??[])if(p.image){
 await access(`public${p.image.path}`);
 if(!p.image.author||!p.image.license||!p.image.sourceUrl||!p.image.licenseUrl)throw Error(`Missing photo attribution for ${p.id}`);
}
console.log(data?`Checks passed: ${data.places.length} exported places and photo credits.`:'Checks passed: no optional catalog export; the app reads PostgreSQL.');
