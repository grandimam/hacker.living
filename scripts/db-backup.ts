import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir,stat,rename} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const directory=new URL('../data/backups/',import.meta.url);
await mkdir(directory,{recursive:true});
const path=fileURLToPath(new URL(`postgres-${new Date().toISOString().replace(/[:.]/g,'-')}.dump`,directory));
const child=spawn('docker',['compose','exec','-T','db','pg_dump','-U','hacker_living','-d','hacker_living','-Fc'],{cwd:root,stdio:['ignore','pipe','pipe']});
let error='';child.stderr.on('data',chunk=>{error+=String(chunk);});
try{
 await Promise.all([pipeline(child.stdout,createWriteStream(path+'.part',{mode:0o600,flags:'wx'})),new Promise<void>((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`pg_dump exited ${code}: ${error}`)));})]);
 await rename(path+'.part',path);console.log(JSON.stringify({backup:path,bytes:(await stat(path)).size}));
}catch(error){console.error(error instanceof Error?error.message:'Backup failed');process.exitCode=1;}
