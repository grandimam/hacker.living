import {createPiPool,executePiPool} from '../server/pipeline/pi-pool.ts';
import {closeDatabase} from '../server/db/connection.ts';
async function main(){
 const args=process.argv.slice(2);let places:string|undefined,fonts:string|undefined,id:string|undefined,workers=100;
 for(let i=0;i<args.length;i+=2){if(!args[i+1])throw Error('Missing Pi pool option value');if(args[i]==='--places-run')places=args[i+1];else if(args[i]==='--font-run')fonts=args[i+1];else if(args[i]==='--pool')id=args[i+1];else if(args[i]==='--workers')workers=Number(args[i+1]);else throw Error('Use --places-run <id> --font-run <id> --workers 100, or --pool <id>');}
 for(const value of [places,fonts,id])if(value&&!/^[0-9a-f-]{36}$/.test(value))throw Error('Invalid run or pool ID');
 if(!id){if(!places||!fonts)throw Error('Supply Places and Fonts run IDs');id=(await createPiPool(places,fonts,workers)).id;}
 if(!id)throw Error('Pi pool ID was not created');
 console.log(`Pi EasyCLIProxy pool ${id}`);await executePiPool(id);
}
main().catch(error=>{console.error(String(error));process.exitCode=1;}).finally(closeDatabase);
