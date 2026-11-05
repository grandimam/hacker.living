import {prioritizeRun} from '../server/pipeline/prioritize.ts';
import {closeDatabase} from '../server/db/connection.ts';
const id=process.argv[2];
if(!id||!/^[0-9a-f-]{36}$/.test(id))throw Error('Usage: node --import tsx scripts/prioritize-places.ts <run-id>');
prioritizeRun(id).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(String(error));process.exitCode=1;}).finally(closeDatabase);
