// Validate an optional export without requiring local data for a clean checkout.
import {readFile} from 'node:fs/promises';
import {validatePublished} from './pipeline-core.ts';
export async function optionalExport(){
 let raw:string;
 try{raw=await readFile('data/places.json','utf8');}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
 return validatePublished(JSON.parse(raw));
}
