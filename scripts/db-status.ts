import {databaseStatus} from '../server/db/status.ts';
import {getPool,closeDatabase} from '../server/db/connection.ts';
try{const versions=(await getPool().query('SELECT current_database() AS database,postgis_version() AS postgis')).rows[0];const status=await databaseStatus();console.log(JSON.stringify({...versions,...status,events:undefined},null,2));}finally{await closeDatabase();}
