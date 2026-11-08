import {spawn} from 'node:child_process';
import {mkdirSync,openSync,closeSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export async function launchWebsiteRun(id:string){
 if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Invalid website run ID');
 mkdirSync(new URL('../../data/runs/',import.meta.url),{recursive:true});
 const fd=openSync(new URL(`../../data/runs/websites-${id}.log`,import.meta.url),'a',0o600);
 try{
  const child=spawn(process.execPath,['--import','tsx','scripts/websites-pipeline.ts','run','--run',id],{cwd:fileURLToPath(new URL('../../',import.meta.url)),env:process.env,stdio:['ignore',fd,fd],detached:true});
  await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();return child.pid;
 }finally{closeSync(fd);}
}
