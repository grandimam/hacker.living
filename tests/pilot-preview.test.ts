import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilotPreview } from '../scripts/pilot-preview.ts';
import type { Candidate } from '../scripts/pipeline-data.ts';
import type { Label } from '../scripts/labeling-core.ts';
function candidate(id: number): Candidate {
  return { id:`hn-${id}`, status:'needs-review', discoveredAt:'2026-01-01', lastSeenAt:'2026-01-01', queries:['computing museum'], proposedNames:[], evidence:{ provider:'Algolia', commentId:id, storyId:5, author:`author${id}`, date:'2026-01-01', url:`https://news.ycombinator.com/item?id=${id}`, text:'Recommended museum', rawHtml:null, storyTitle:'Museums' } };
}
const place = (name: string): Label['places'][number] => ({name,city:null,country:null,stance:'positive',reason:'Enjoyed the working computers',quote:null,confidence:'high'});
test('pilot preview retains attribution and unresolved aliases while grouping exact names', () => {
  const labels: Label[] = [
    {candidateId:'hn-1',decision:'recommendation',explanation:'Recommended',places:[place('National Museum of Computing'),place('The National Museum of Computing'),{...place('Unclear place'),confidence:'low'}]},
    {candidateId:'hn-2',decision:'recommendation',explanation:'Recommended',places:[place('national museum of computing')]},
    {candidateId:'hn-3',decision:'software',explanation:'Software library',places:[]},
  ];
  const result=createPilotPreview([candidate(1),candidate(2),candidate(3)],labels);
  assert.equal(result.sampled,3);
  assert.equal(result.usefulComments,2);
  assert.equal(result.groups.length,2);
  assert.equal(result.groups[0].city,null);
  assert.deepEqual(result.groups[0].sources.map(s=>s.author),['author1','author2']);
  assert.equal(result.groups[0].sources[1].url,'https://news.ycombinator.com/item?id=2');
  assert.equal(result.decisions.software,1);
});
