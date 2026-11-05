import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePublished, validatePlace, findDuplicate, normalizeText, publicHttpsUrl, isCandidate, guessPlaceNames, resolveHnComment, checkOfficialUrl, requestJson } from '../scripts/pipeline-core.ts';
import { parseCandidateQueue, parseSearchResponse } from '../scripts/pipeline-data.ts';
const data = validatePublished(JSON.parse(await readFile(new URL('../data/places.json', import.meta.url), 'utf8')));
const example = data.places.find(p => p.id === 'crossness');
assert.ok(example);
const response = (body: unknown): Response => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

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
  assert.equal(findDuplicate({...example,id:'another-id'},data.places)?.id,'crossness');
  assert.equal(findDuplicate({...example,id:'another-branch',coordinates:[40,-100]},data.places),undefined);
  assert.equal(findDuplicate({...example,name:'A new label',officialUrl:example.officialUrl+'?utm_source=hn'},data.places)?.id,'crossness');
});
test('discovery identifies recommendations and conservatively suggests names', () => {
  assert.equal(isCandidate('Crossness Pumping Station is incredible and worth a visit.'),true);
  assert.equal(isCandidate('I implemented a library in Rust.'),false);
  assert.ok(guessPlaceNames('I recommend Crossness Pumping Station.',data.places).includes('Crossness Pumping Station'));
  assert.equal(normalizeText('<p>Worth &amp; fascinating &#39;visit&#39;</p>'),"Worth & fascinating 'visit'");
});
test('approval evidence follows comment parent chain to its actual story', async () => {
  const calls: string[]=[];
  const items: Record<number, unknown>={1:{id:1,type:'comment',text:'<p>Worth a visit.</p>',by:'reader',time:1700000000,parent:2},2:{id:2,type:'comment',parent:3},3:{id:3,type:'story',title:'Museums'}};
  const result=await resolveHnComment(1,{fetcher:async url=>{const address=String(url);calls.push(address);const match=address.match(/item\/(\d+)/);assert.ok(match);return response(items[Number(match[1])]);}});
  assert.equal(result.storyId,3);assert.equal(result.author,'reader');assert.equal(result.text,'Worth a visit.');assert.equal(calls.length,3);
});
test('deleted comments and cyclic parent chains cannot become approved evidence', async () => {
  await assert.rejects(resolveHnComment(1,{fetcher:async()=>response({deleted:true}),retries:0}),/not a live/);
  await assert.rejects(resolveHnComment(1,{fetcher:async()=>response({id:1,type:'comment',text:'hi',by:'a',time:1,parent:1}),retries:0}),/Broken/);
});
test('official link checks reject errors, non-HTML responses, and unsafe redirects', async () => {
  await assert.rejects(checkOfficialUrl('https://example.com',{fetcher:async()=>new Response(null,{status:404})}),/404/);
  await assert.rejects(checkOfficialUrl('https://example.com',{fetcher:async()=>new Response(null,{status:200,headers:{'content-type':'image/png'}})}),/HTML/);
  await assert.rejects(checkOfficialUrl('https://example.com',{fetcher:async()=>new Response(null,{status:302,headers:{location:'http://localhost/internal'}})}),/public HTTPS/);
  const result=await checkOfficialUrl('https://example.com',{fetcher:async()=>new Response(null,{status:200,headers:{'content-type':'text/html'}})});
  assert.equal(result.ok,true);assert.ok(result.checkedAt);
  for(const url of ['http://example.com','https://127.0.0.1','https://[::1]','https://localhost','https://user:pass@example.com','https://foo.local']) assert.throws(()=>publicHttpsUrl(url));
});
test('transient search failures retry without swallowing permanent errors',async()=>{
  let attempts=0;
  const result=await requestJson('https://example.com',{fetcher:async()=>{attempts++;return attempts===1?new Response(null,{status:503}):response({hits:[]});}});
  assert.deepEqual(result,{hits:[]});assert.equal(attempts,2);
  attempts=0;
  await assert.rejects(requestJson('https://example.com',{fetcher:async()=>{attempts++;return new Response(null,{status:404});}}),/404/);
  assert.equal(attempts,1);
});

test('search decoding preserves raw evidence and rejects unexpected API payloads', () => {
  const hit = {objectID:'123',comment_text:'<p>A museum worth visiting.</p>',story_id:456,author:'reader',created_at:'2025-01-01T00:00:00Z',story_title:'Interesting places',extra_source_metadata:'retained'};
  const parsed = parseSearchResponse({hits:[hit],nbPages:1});
  assert.equal(parsed.hits[0].comment_text,hit.comment_text);
  assert.equal(parsed.hits[0].extra_source_metadata,'retained');
  assert.throws(() => parseSearchResponse({error:'Search is unavailable'}),/Invalid Algolia/);
  assert.throws(() => parseSearchResponse({hits:[null],nbPages:1}),/Invalid Algolia/);
});

test('review queue decoding retains existing decisions and rejects corrupt input', () => {
  const candidate = {id:'hn-123',status:'rejected',discoveredAt:'2025-01-01',lastSeenAt:'2025-01-02',queries:['museum'],proposedNames:['Example Museum'],rejectionReason:'Not an actual recommendation',evidence:{provider:'Algolia',commentId:123,storyId:456,author:'reader',date:'2025-01-01',url:'https://news.ycombinator.com/item?id=123',text:'Example source evidence',rawHtml:'<p>Example source evidence</p>',storyTitle:'Museums'}};
  const queue = parseCandidateQueue({schemaVersion:1,candidates:[candidate]});
  assert.equal(queue.candidates[0].status,'rejected');
  assert.equal(queue.candidates[0].rejectionReason,candidate.rejectionReason);
  assert.equal(queue.candidates[0].evidence.rawHtml,candidate.evidence.rawHtml);
  assert.throws(()=>parseCandidateQueue({schemaVersion:1,candidates:{}}),/Invalid candidate queue/);
});
