import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCatalogQuery} from '../server/api.ts';
test('catalog API validates pagination and geographic filters',()=>{
 const q=parseCatalogQuery(new URLSearchParams('q=museum&limit=25&offset=50&lat=51&lon=-0.1&radiusKm=10&bounds=170,-10,-170,10'));
 assert.equal(q.limit,25);assert.equal(q.offset,50);assert.deepEqual(q.near,[51,-0.1,10]);assert.deepEqual(q.bounds,[170,-10,-170,10]);
 for(const input of ['limit=0','limit=201','offset=-1','lat=91&lon=0','lat=5','bounds=0,10,5,-10','bounds=,,,','category=Unknown','ids=bad/slug'])assert.throws(()=>parseCatalogQuery(new URLSearchParams(input)));
});
