import {readFile,mkdir,writeFile,rename,stat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {randomUUID} from 'node:crypto';
import {exportProcessedCatalog,importProcessedCatalog,parseCatalogTransfer} from '../server/db/catalog-transfer.ts';
import {closeDatabase} from '../server/db/connection.ts';
async function main(){
 const [action,...args]=process.argv.slice(2);let file=action==='export'?'data/exports/catalog.json.gz':undefined;
 if(!['export','import'].includes(action)||args.length%2)throw Error('Use catalog:export [--file path] or catalog:import --file path|-');
 for(let i=0;i<args.length;i+=2){if(args[i]!=='--file')throw Error('Unknown option');file=args[i+1];}
 if(!file)throw Error('Import requires --file path or --file - for stdin');
 if(action==='export'){
  if(file==='-')throw Error('Export requires a file path');
  const data=await exportProcessedCatalog(),path=resolve(file),temporary=path+'.'+randomUUID()+'.part';
  await mkdir(dirname(path),{recursive:true});
  await writeFile(temporary,gzipSync(JSON.stringify(data)),{flag:'wx',mode:0o600});await rename(temporary,path);
  console.log(JSON.stringify({file:path,bytes:(await stat(path)).size,exportedAt:data.createdAt,counts:Object.fromEntries(Object.entries(data.tables).map(([t,rows])=>[t,rows.length]))},null,2));
 }else{
  let bytes:Buffer;
  if(file==='-'){const parts:Buffer[]=[];let size=0;for await(const part of process.stdin){size+=part.length;if(size>256*1024*1024)throw Error('Catalog export exceeds the 256 MB transfer limit');parts.push(Buffer.from(part));}bytes=Buffer.concat(parts);}
  else{if((await stat(file)).size>256*1024*1024)throw Error('Catalog export exceeds the transfer limit');bytes=await readFile(file);}
  const data=parseCatalogTransfer(JSON.parse(gunzipSync(bytes,{maxOutputLength:1024*1024*1024}).toString('utf8')));
  console.log(JSON.stringify(await importProcessedCatalog(data),null,2));
 }
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}).finally(closeDatabase);
