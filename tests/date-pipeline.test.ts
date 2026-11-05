import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRange,monthSlices} from '../server/pipeline/range.ts';
import {collectSearchWindow} from '../server/pipeline/collect.ts';
import {parseResearch,selectGeocode,acceptableLicense} from '../server/pipeline/research-core.ts';
import {flowValve} from '../shared/pipeline-flow.ts';
import type {PipelineRun} from '../shared/pilot-preview.ts';

test('funnel valves keep downstream gates independent and show held inputs',()=>{
 const run:PipelineRun={id:'test',from_at:'2026-01-01',to_at:'2026-02-01',state:'enriching',collected:false,heartbeat_at:null,last_error:null,stale:false,failures:[],issues:[],requested_stage:null,stage_config:{collect:false,label:false,enrich:true},counts:{comments:100,labeled:30,proposals:8,researched:3,ready:2}};
 assert.equal(flowValve(run,'collect').status,'Closed');
 assert.deepEqual(flowValve(run,'label'),{open:false,active:false,waiting:70,status:'Closed'});
 assert.deepEqual(flowValve(run,'enrich'),{open:true,active:true,waiting:5,status:'Flowing'});
 const closing={...run,stage_config:{...run.stage_config,enrich:false}};
 assert.equal(flowValve(closing,'enrich').status,'Closing');
 assert.equal(flowValve({...closing,stale:true},'enrich').status,'Closed');
 const drained={...run,state:'paused',counts:{...run.counts,researched:8}};
 assert.equal(flowValve(drained,'enrich').status,'Waiting for input');
 assert.equal(flowValve({...drained,counts:{...drained.counts,researched:9}},'enrich').waiting,0);
});
test('date ranges include selected calendar days and split at UTC month boundaries',()=>{
 const range=parseRange('2026-07-31','2026-08-02',Date.parse('2026-11-05'));
 assert.deepEqual(range,{from:'2026-07-31T00:00:00.000Z',to:'2026-08-03T00:00:00.000Z'});
 assert.equal(monthSlices(range).length,2);
 assert.equal(parseRange('2026-08-14T09:10:00Z','2026-08-14T09:11:00Z',Date.parse('2026-11-05')).to,'2026-08-14T09:11:00.000Z');
 for(const [from,to]of [['2026-02-30','2026-03-01'],['2026-08-03','2026-08-01'],['2000-01-01','2000-01-02'],['2027-01-01','2027-01-02']])assert.throws(()=>parseRange(from,to,Date.parse('2026-11-05')));
 const now=Date.parse('2026-11-05T12:00:00Z');assert.deepEqual(parseRange('2026-11-05','2026-11-05',now),parseRange('2026-11-05','2026-11-05',now+1000),'same selected dates must have a stable run identity');
});
test('HN index collection subdivides capped windows without silently losing pages',async()=>{
 const accepted:number[]=[];const calls:string[]=[];
 await collectSearchWindow(0,4,async hits=>{accepted.push(...hits.map(h=>h.id));},async raw=>{calls.push(raw);const filters=new URL(raw).searchParams.get('numericFilters')!;const [,lo,hi]=filters.match(/>=(\d+),created_at_i<(\d+)/)!;if(Number(hi)-Number(lo)>1)return {hits:[],nbHits:1001,nbPages:10,hitsPerPage:100};return {hits:[{id:Number(lo)}],nbHits:1,nbPages:1,hitsPerPage:100};});
 assert.deepEqual(accepted,[0,1,2,3]);assert.equal(calls.length,7);
 await assert.rejects(collectSearchWindow(0,1,async()=>{},async()=>({hits:[],nbHits:1001,nbPages:10,hitsPerPage:100})),/cannot prove complete/);
});
test('research cannot turn streets, wrong-country points or unlicensed images into complete cards',()=>{
 const identity=parseResearch({canonicalName:'Oodi',city:'Helsinki',country:'Finland',countryCode:'FI',address:'Töölönlahdenkatu 4',category:'Libraries',officialUrl:'https://oodihelsinki.fi/',officialEvidenceExcerpt:'Helsinki Central Library Oodi',identityConfidence:'high',wikipediaTitle:'Helsinki Central Library Oodi',wikipediaLanguage:'en',geocodeQueries:['Oodi Helsinki'],notes:'Institution reference point',sources:[{url:'https://oodihelsinki.fi/',title:'Oodi'}]});assert.equal(identity.countryCode,'fi');
 const point={lat:'60.17',lon:'24.93',osm_type:'way',osm_id:123,category:'amenity',address:{country_code:'fi'}};
 assert.ok(selectGeocode({index:0,confidence:'high',explanation:'Exact library'},[point],'fi'));
 assert.equal(selectGeocode({index:0,confidence:'high'},[{...point,category:'highway'}],'fi'),null);
 assert.equal(selectGeocode({index:0,confidence:'high'},[point],'se'),null);
 assert.equal(selectGeocode({index:0,confidence:'medium'},[point],'fi'),null);
 assert.throws(()=>selectGeocode({index:99,confidence:'high'},[point],'fi'));
 assert.throws(()=>selectGeocode({index:0,confidence:'high'},[{...point,lat:999}],'fi'));
 assert.equal(acceptableLicense('CC BY-SA 4.0'),true);assert.equal(acceptableLicense('CC BY-NC 4.0'),false);assert.equal(acceptableLicense('All rights reserved'),false);
});

test('stage scheduling honors pauses and allows downstream work on partial inputs',async()=>{
 const {chooseStage}=await import('../server/pipeline/worker.ts');
 const {stageEnabled,StageYield}=await import('../server/pipeline/control.ts');
 const all={collect:true,label:true,enrich:true},work={collect:true,label:true,enrich:true};
 assert.equal(chooseStage({...all,collect:false},work,null,null),'label');
 assert.equal(chooseStage({...all,collect:false},work,'label',null),'enrich');
 assert.equal(chooseStage({...all,collect:false,label:false},work,'enrich',null),'enrich');
 assert.equal(chooseStage({collect:false,label:false,enrich:false},work,null,null),null);
 assert.equal(chooseStage(all,work,'label','collect'),'collect');
 assert.equal(stageEnabled(all,'collect','label'),false);
 assert.equal(stageEnabled({...all,collect:false},'collect',null),false);
 const commits:number[]=[];let checks=0;const saved=new Map<string,number>();
 const request=async()=>({hits:[{id:1}],nbHits:1,nbPages:1,hitsPerPage:100});
 await assert.rejects(collectSearchWindow(0,1,async hits=>{commits.push(...hits.map(h=>h.id));},request,{guard:async()=>{if(++checks===2)throw new StageYield('paused');},pageCount:async()=>null}),StageYield);
 assert.equal(commits.length,0,'pause before a batch prevents new writes');
 await collectSearchWindow(0,1,async hits=>{commits.push(...hits.map(h=>h.id));saved.set('0:1:0',hits.length);},request,{guard:async()=>{},pageCount:async(from,to,page)=>saved.get(`${from}:${to}:${page}`)??null});
 await collectSearchWindow(0,1,async()=>{throw Error('Completed page was replayed');},request,{guard:async()=>{},pageCount:async(from,to,page)=>saved.get(`${from}:${to}:${page}`)??null});
 assert.deepEqual(commits,[1]);
});
