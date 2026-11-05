import { readFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getPool,closeDatabase } from '../server/db/connection.ts';
async function main(){
 const c=await getPool().connect();
 try{
  await c.query("SELECT pg_advisory_lock(hashtext('hacker.living:migrations'))");
  await c.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  const directory=new URL('../server/db/migrations/',import.meta.url);
  for(const name of (await readdir(directory)).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
   const sql=await readFile(new URL(name,directory),'utf8'),hash=createHash('sha256').update(sql).digest('hex');
   const existing=await c.query('SELECT sha256 FROM schema_migrations WHERE name=$1',[name]);
   if(existing.rows.length){if(existing.rows[0].sha256!==hash)throw new Error(`Applied migration changed: ${name}`);continue;}
   await c.query('BEGIN');try{await c.query(sql);await c.query('INSERT INTO schema_migrations(name,sha256) VALUES($1,$2)',[name,hash]);await c.query('COMMIT');console.log(`Applied ${name}`);}catch(error){await c.query('ROLLBACK');throw error;}
  }
 }finally{await c.query("SELECT pg_advisory_unlock(hashtext('hacker.living:migrations'))");c.release();await closeDatabase();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Migration failed');process.exitCode=1;});
