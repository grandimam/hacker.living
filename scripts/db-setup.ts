import { readFile,writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const path=new URL('../.env',import.meta.url);
try{await readFile(path);console.log('Existing .env retained.');}
catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;const password=randomBytes(24).toString('hex');await writeFile(path,`DATABASE_PORT=55432\nPOSTGRES_PASSWORD=${password}\nDATABASE_URL=postgresql://hacker_living:${password}@127.0.0.1:55432/hacker_living\n`,{mode:0o600,flag:'wx'});console.log('Created ignored .env with random local database credentials.');}
