import {writeFile,rename} from 'node:fs/promises';
import {exportCatalog} from '../server/db/catalog.ts';
import {closeDatabase} from '../server/db/connection.ts';
try{const data=await exportCatalog();await writeFile('data/places.json.tmp',JSON.stringify(data,null,2)+'\n');await rename('data/places.json.tmp','data/places.json');console.log(`Exported ${data.places.length} database-published places. Export is not the app's data source.`);}finally{await closeDatabase();}
