import {spawn} from 'node:child_process';

// Build the URL here so passwords with URL punctuation work without manual escaping.
if(!process.env.DATABASE_URL){
 const url=new URL('postgresql://db:5432/hacker_living');
 url.username=process.env.POSTGRES_USER??'hacker_living';
 url.password=process.env.POSTGRES_PASSWORD??'';
 process.env.DATABASE_URL=url.href;
}
const migrations=spawn(process.execPath,['--import','tsx','scripts/db-migrate.ts'],{stdio:'inherit',env:process.env});
const code=await new Promise<number>((resolve,reject)=>{migrations.once('error',reject);migrations.once('exit',(code,signal)=>resolve(signal?1:code??1));});
if(code!==0)process.exit(code);
// Serving the app never starts or resumes model workers.
await import('./serve.ts');
