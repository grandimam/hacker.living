import test from 'node:test';
import assert from 'node:assert/strict';
import {runStagePool} from '../server/pipeline/worker-pool.ts';
import {workerLimits} from '../server/pipeline/worker-limits.ts';
import {codexRateLimited} from '../server/pipeline/model-backpressure.ts';
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('worker limits validate bounded concurrency and per-run overrides',()=>{
 assert.equal(workerLimits({label:100},{}).label,100);assert.deepEqual(workerLimits({},{}),{collect:1,label:8,enrich:6});
 assert.deepEqual(workerLimits({enrich:10},{PIPELINE_LABEL_WORKERS:'5'}),{collect:1,label:5,enrich:10});
 for(const value of [0,-1,129,1.5,NaN])assert.throws(()=>workerLimits({label:value},{}),/integer from 1 to 128/);
});
test('capacity increases without waiting for slow calls',{timeout:2000},async()=>{
 let reads=0,remaining=3,started=0;let release!:()=>void;const first=new Promise<void>(resolve=>{release=resolve;});
 await runStagePool({capacities:{collect:1,label:1,enrich:1},read:async()=>({config:{collect:false,label:true,enrich:false},work:{collect:false,label:remaining>0,enrich:false},capacities:{collect:1,label:++reads===1?1:3,enrich:1}}),perform:async()=>{if(!remaining)return;remaining--;if(++started===1)await first;else if(started===3)release();},active:async()=>{},wait:tick});assert.equal(started,3);
});
test('a recommendation reaches research while labeling continues',{timeout:2000},async()=>{
 let labels=2,recommendations=0,started=0,slowFinished=false,researched=false;let release!:()=>void;const slow=new Promise<void>(resolve=>{release=resolve;});
 await runStagePool({capacities:{collect:1,label:2,enrich:1},read:async()=>({config:{collect:false,label:true,enrich:true},work:{collect:true,label:labels>0,enrich:recommendations>0}}),perform:async stage=>{
  if(stage==='label'){if(!labels)return;labels--;started++;if(started===1){await slow;slowFinished=true;}else recommendations++;}
  else if(stage==='enrich'){assert.equal(slowFinished,false);recommendations--;researched=true;release();}else assert.fail('closed intake admitted work');
 },active:async()=>{},wait:tick});assert.equal(researched,true);assert.equal(slowFinished,true);
});
test('closing a stage holds inputs while downstream finishes',{timeout:2000},async()=>{
 let open=true,remaining=3,researched=0,recommendations=0;
 await runStagePool({capacities:{collect:1,label:1,enrich:1},read:async()=>({config:{collect:false,label:open,enrich:true},work:{collect:false,label:remaining>0,enrich:recommendations>0}}),perform:async stage=>{if(stage==='label'){remaining--;recommendations++;open=false;}else{recommendations--;researched++;}},active:async()=>{},wait:tick});assert.equal(remaining,2);assert.equal(researched,1);
});
test('failure drains in-flight saves before releasing resources',{timeout:2000},async()=>{
 let saved=false;await assert.rejects(runStagePool({capacities:{collect:1,label:1,enrich:1},read:async()=>({config:{collect:false,label:true,enrich:true},work:{collect:false,label:true,enrich:true}}),perform:async stage=>{if(stage==='label')throw Error('connection failed');await tick();saved=true;},active:async()=>{},wait:tick}),/connection failed/);assert.equal(saved,true);
});
test('only explicit Codex limits trigger cooldown',()=>{assert.equal(codexRateLimited(new Error('Codex request: 429 rate limit')),true);assert.equal(codexRateLimited(new Error('Official page HTTP 429')),false);assert.equal(codexRateLimited(new Error('quote is not exact')),false);});
