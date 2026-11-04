import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePublished, validatePlace, findDuplicate, normalizeText, publicHttpsUrl, isCandidate, guessPlaceNames, resolveHnComment, checkOfficialUrl, requestJson } from '../scripts/pipeline-core.mjs';
const data = JSON.parse(await readFile(new URL('../data/places.json', import.meta.url)));
const example = data.places.find(p => p.id === 'crossness');
const response = body => ({ok:true,json:async()=>body});

test('only reviewed, dated, traceable records pass publication validation', () => {
  assert.doesNotThrow(() => validatePublished(data));
  assert.throws(() => validatePlace({...example, review:{status:'draft'}}),/approval/);
  assert.throws(() => validatePlace({...example,officialCheckedAt:null}),/approval/);
  assert.throws(() => validatePlace({...example,coordinates:[null,null]}),/latitude/);
  assert.throws(() => validatePlace({...example,source:{...example.source,url:'https://example.com'}}),/source links/);
  assert.throws(() => validatePublished({...data,places:[example,example]}),/Duplicate/);
  assert.throws(() => validatePlace({...example,source:{...example.source,quote:'word '.repeat(26)}}),/25 words/);
});
test('duplicates merge when names or official URLs match at the same physical site', () => {
  assert.equal(findDuplicate({...example,id:'another-id'},data.places).id,'crossness');
  assert.equal(findDuplicate({...example,id:'another-branch',coordinates:[40,-100]},data.places),undefined);
  assert.equal(findDuplicate({...example,name:'A new label',officialUrl:example.officialUrl+'?utm_source=hn'},data.places).id,'crossness');
});
test('discovery identifies recommendations and conservatively suggests names', () => {
  assert.equal(isCandidate('Crossness Pumping Station is incredible and worth a visit.'),true);
  assert.equal(isCandidate('I implemented a library in Rust.'),false);
  assert.ok(guessPlaceNames('I recommend Crossness Pumping Station.',data.places).includes('Crossness Pumping Station'));
  assert.equal(normalizeText('<p>Worth &amp; fascinating &#39;visit&#39;</p>'),"Worth & fascinating 'visit'");
});
test('approval evidence follows comment parent chain to its actual story', async () => {
  const calls=[];
  const items={1:{id:1,type:'comment',text:'<p>Worth a visit.</p>',by:'reader',time:1700000000,parent:2},2:{id:2,type:'comment',parent:3},3:{id:3,type:'story',title:'Museums'}};
  const result=await resolveHnComment(1,{fetcher:async url=>{calls.push(url);return response(items[Number(url.match(/item\/(\d+)/)[1])]);}});
  assert.equal(result.storyId,3);assert.equal(result.author,'reader');assert.equal(result.text,'Worth a visit.');assert.equal(calls.length,3);
});
test('deleted comments and cyclic parent chains cannot become approved evidence', async () => {
  await assert.rejects(resolveHnComment(1,{fetcher:async()=>response({deleted:true}),retries:0}),/not a live/);
  await assert.rejects(resolveHnComment(1,{fetcher:async()=>response({id:1,type:'comment',text:'hi',by:'a',time:1,parent:1}),retries:0}),/Broken/);
});
test('official link checks reject errors, non-HTML responses, and unsafe redirects', async () => {
  await assert.rejects(checkOfficialUrl('https://example.com',{fetcher:async()=>({ok:false,status:404,headers:new Headers()})}),/404/);
  await assert.rejects(checkOfficialUrl('https://example.com',{fetcher:async()=>({ok:true,status:200,headers:new Headers({'content-type':'image/png'})})}),/HTML/);
  await assert.rejects(checkOfficialUrl('https://example.com',{fetcher:async()=>({ok:false,status:302,headers:new Headers({location:'http://localhost/internal'})})}),/public HTTPS/);
  const result=await checkOfficialUrl('https://example.com',{fetcher:async()=>({ok:true,status:200,headers:new Headers({'content-type':'text/html'})})});
  assert.equal(result.ok,true);assert.ok(result.checkedAt);
  for(const url of ['http://example.com','https://127.0.0.1','https://[::1]','https://localhost','https://user:pass@example.com','https://foo.local']) assert.throws(()=>publicHttpsUrl(url));
});
test('transient search failures retry without swallowing permanent errors',async()=>{
  let attempts=0;
  const result=await requestJson('https://example.com',{fetcher:async()=>{attempts++;return attempts===1?{ok:false,status:503}:response({hits:[]});}});
  assert.deepEqual(result,{hits:[]});assert.equal(attempts,2);
  attempts=0;
  await assert.rejects(requestJson('https://example.com',{fetcher:async()=>{attempts++;return {ok:false,status:404};}}),/404/);
  assert.equal(attempts,1);
});
