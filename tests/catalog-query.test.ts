import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCatalogQuery} from '../server/api.ts';
test('catalog API validates pagination and geographic filters',()=>{
 const q=parseCatalogQuery(new URLSearchParams('q=museum&limit=25&offset=50&lat=51&lon=-0.1&radiusKm=10&bounds=170,-10,-170,10'));
 assert.equal(q.limit,25);assert.equal(q.offset,50);assert.deepEqual(q.near,[51,-0.1,10]);assert.deepEqual(q.bounds,[170,-10,-170,10]);
 for(const input of ['limit=0','limit=201','offset=-1','lat=91&lon=0','lat=5','bounds=0,10,5,-10','bounds=,,,','category=Unknown','ids=bad/slug'])assert.throws(()=>parseCatalogQuery(new URLSearchParams(input)));
});

test('production and explicitly disabled admin routes return 404 before database access',async()=>{
 const {handleApi}=await import('../server/api.ts');
 const {createServer}=await import('node:http');
 const before={node:process.env.NODE_ENV,admin:process.env.PIPELINE_ADMIN_ENABLED};
 const server=createServer((req,res)=>{void handleApi(req,res).then(handled=>{if(!handled)res.writeHead(404).end();});});
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');
  for(const explicit of [undefined,'false']){
   process.env.NODE_ENV='production';
   if(explicit===undefined)delete process.env.PIPELINE_ADMIN_ENABLED;else process.env.PIPELINE_ADMIN_ENABLED=explicit;
   for(const path of ['/api/pipeline/runs','/api/pipeline/provider-pools','/api/pipeline/preview','/api/fonts/pipeline/runs']){
    for(const method of ['GET','POST']){
     const response:Response=await fetch(`http://127.0.0.1:${address.port}${path}`,{method,headers:{Host:'localhost',Origin:'http://localhost'}});
     assert.equal(response.status,404,`${method} ${path}`);
    }
   }
  }
 }finally{
  if(before.node===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=before.node;
  if(before.admin===undefined)delete process.env.PIPELINE_ADMIN_ENABLED;else process.env.PIPELINE_ADMIN_ENABLED=before.admin;
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});
