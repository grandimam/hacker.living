import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleCandidates, parseLabels, summarize } from '../scripts/labeling-core.ts';
import type { Candidate } from '../scripts/pipeline-data.ts';
function candidate(id: number, query = 'library recommend'): Candidate {
  return { id: `hn-${id}`, status: 'needs-review', discoveredAt: '2026-11-05', lastSeenAt: '2026-11-05', queries: [query], proposedNames: [], evidence: { provider: 'Algolia', commentId: id, storyId: 1, author: 'reader', date: '2026-01-01', url: `https://news.ycombinator.com/item?id=${id}`, text: 'Visit the Example Museum. It is wonderful.', rawHtml: null, storyTitle: 'Places' } };
}
const positive = (id: string) => ({ candidateId: id, decision: 'recommendation', explanation: 'Recommends a visit', places: [{ name: 'Example Museum', city: null, country: null, stance: 'positive', reason: 'Enjoyed visiting', quote: 'It is wonderful.', confidence: 'high' }] });
const software = (id: string) => ({ candidateId: id, decision: 'software', explanation: 'Code library', places: [] });
test('sampling is reproducible, excludes reviewed comments, and partitions query overlap', () => {
  const candidates = Array.from({ length: 100 }, (_, i) => candidate(i + 1));
  candidates[0].queries.push('rare');
  candidates[99].status = 'approved';
  const sample = sampleCandidates(candidates, 20, 'seed', 'hash');
  assert.deepEqual(sample, sampleCandidates([...candidates].reverse(), 20, 'seed', 'hash'));
  assert.equal(sample.population, 99);
  assert.equal(sample.entries.length, 20);
  assert.equal(new Set(sample.entries.map(e => e.candidate.id)).size, 20);
  assert.equal(sample.strata.find(s => s.query === 'rare')?.sampled, 1);
  assert.equal(sample.strata.reduce((sum, s) => sum + s.population, 0), 99);
  assert(!sample.entries.some(e => e.candidate.id === 'hn-100'));
});
test('labels must cover the entire batch exactly and preserve exact source quotations', () => {
  const candidates = [candidate(1), candidate(2)];
  assert.throws(() => parseLabels({ labels: [positive('hn-1')] }, candidates), /Missing candidate/);
  assert.throws(() => parseLabels({ labels: [positive('hn-1'), positive('hn-1')] }, candidates), /duplicate/);
  const changed = positive('hn-1');
  changed.places[0].quote = 'A fabricated quotation';
  assert.throws(() => parseLabels({ labels: [changed, software('hn-2')] }, candidates), /exact comment excerpt/);
  assert.equal(parseLabels({ labels: [positive('hn-1'), software('hn-2')] }, candidates).length, 2);
});
test('reports weight oversampled groups and require complete results', () => {
  const candidates = Array.from({ length: 100 }, (_, i) => candidate(i + 1, i < 2 ? 'rare' : 'common'));
  const sample = sampleCandidates(candidates, 20, 'seed', 'hash');
  const labels = sample.entries.map(e => parseLabels({ labels: [e.stratum === 'rare' ? positive(e.candidate.id) : software(e.candidate.id)] }, [e.candidate])[0]);
  const report = summarize(sample, labels);
  assert.equal(report.usefulComments, 2);
  assert.equal(report.weightedYield, 0.02);
  assert.equal(report.projectedUsefulComments, 2);
  assert.equal(report.preliminaryNamedEntities.length, 1);
  assert.throws(() => summarize(sample, labels.slice(1)), /complete sample/);
});
