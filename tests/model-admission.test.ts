import test from 'node:test';
import assert from 'node:assert/strict';
import {ModelAdmission} from '../scripts/model-admission.ts';
test('model admission bounds active requests while workers queue',async()=>{
 const gate=new ModelAdmission(2,10);let active=0,peak=0;
 await Promise.all(Array.from({length:100},()=>gate.run(async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;})));
 assert.ok(peak<=5);assert.ok(peak>=2);
});
test('overload defers queued work without issuing more model requests',async()=>{
 let now=0,calls=0;const gate=new ModelAdmission(1,100,()=>now);
 const results=await Promise.allSettled([gate.run(async()=>{throw Error('Codex server overloaded');}),gate.run(async()=>{calls++;})]);
 assert.equal(results[0].status,'rejected');assert.equal(results[1].status,'rejected');assert.equal(calls,0);
 now=300001;await gate.run(async()=>{calls++;});assert.equal(calls,1);
});
