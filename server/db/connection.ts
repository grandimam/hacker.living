import { Pool, type PoolClient } from 'pg';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
config({path:fileURLToPath(new URL('../../.env',import.meta.url)),quiet:true});
let database: Pool | undefined;
export function getPool(): Pool {
  if(!process.env.DATABASE_URL&&process.env.DATABASE_HOST&&process.env.POSTGRES_PASSWORD){
    const url=new URL('postgresql://localhost:5432/hacker_living');
    url.hostname=process.env.DATABASE_HOST;url.username='hacker_living';url.password=process.env.POSTGRES_PASSWORD;
    process.env.DATABASE_URL=url.href;
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing. Run npm run db:setup and npm run db:up.');
  database ??= new Pool({connectionString:process.env.DATABASE_URL,max:16,connectionTimeoutMillis:30000,idleTimeoutMillis:30000,statement_timeout:30000,application_name:'hacker.living'});
  return database;
}
export async function transaction<T>(operation:(client:PoolClient)=>Promise<T>,pool=getPool()):Promise<T> {
  const client=await pool.connect();
  try {await client.query('BEGIN');const result=await operation(client);await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function closeDatabase(){await database?.end();database=undefined;}
