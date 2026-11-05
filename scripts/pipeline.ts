import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DraftPlace, Place } from '../shared/types.ts';
import { parseCandidateQueue, parseSearchResponse } from './pipeline-data.ts';
import type { DiscoveryRun, LinkCheckReport } from './pipeline-data.ts';
import { requestJson, normalizeText, guessPlaceNames, isCandidate, resolveHnComment, checkOfficialUrl, validatePlace, validatePublished, findDuplicate, normalizeName, errorMessage } from './pipeline-core.ts';

// The working directory is fixed to this checkout, regardless of the caller's cwd.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [command = 'help', ...argv] = process.argv.slice(2);
const options: Record<string, string | true | undefined> = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) throw new Error(`Unexpected argument: ${argv[i]}`);
  const key = argv[i].slice(2);
  if (argv[i + 1] && !argv[i + 1].startsWith('--')) options[key] = argv[++i]; else options[key] = true;
}
async function json(path: string, fallback?: unknown): Promise<unknown> { try { return JSON.parse(await readFile(resolve(root, path), 'utf8')); } catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; } }
async function atomic(path: string, data: unknown): Promise<void> {
  const full = resolve(root, path); await mkdir(dirname(full), { recursive: true });
  const temp = `${full}.${process.pid}.tmp`; await writeFile(temp, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n'); await rename(temp, full);
}
function numberOption(name: string, fallback: number, min: number, max: number): number { const n = Number(options[name] ?? fallback); if (!Number.isInteger(n) || n < min || n > max) throw new Error(`--${name} must be an integer from ${min} to ${max}`); return n; }
const now = () => new Date().toISOString();
const day = () => now().slice(0, 10);
const timestamp = () => now().replace(/[:.]/g, '-');

async function discover() {
  const queries = options.query ? [String(options.query)] : ['museum worth visiting', 'unusual museum', 'observatory visit', 'library recommend', 'pumping station', 'computing museum'];
  const pages = numberOption('pages', 1, 1, 10), limit = numberOption('limit', 25, 1, 100);
  const published = validatePublished(await json('data/places.json'));
  const queue = parseCandidateQueue(await json('data/candidates.json', { schemaVersion: 1, candidates: [] }));
  const byId = new Map(queue.candidates.map(c => [c.id, c]));
  const run: DiscoveryRun = { startedAt: now(), queries, requestedPages: pages, limitPerPage: limit, fetched: 0, added: 0, updated: 0, errors: [], responses: [] };
  const alreadyPublished = new Set(published.places.flatMap(p => [p.source, ...(p.sources || [])]).map(s => s.commentId));
  for (const query of queries) {
    for (let page = 0; page < pages; page++) {
      const params = new URLSearchParams({ query, tags: 'comment', hitsPerPage: String(limit), page: String(page) });
      try {
        const response = parseSearchResponse(await requestJson(`https://hn.algolia.com/api/v1/search?${params}`));
        if (!Array.isArray(response.hits)) throw new Error('Invalid Algolia response');
        run.responses.push({ query, page, hits: response.hits }); run.fetched += response.hits.length;
        for (const hit of response.hits) {
          const text = normalizeText(hit.comment_text), commentId = Number(hit.objectID);
          if (!Number.isSafeInteger(commentId) || !isCandidate(text)) continue;
          const id = `hn-${commentId}`;
          const known = byId.get(id);
          if (known) { known.lastSeenAt = now(); known.queries = [...new Set([...known.queries, query])]; run.updated++; continue; }
          byId.set(id, { id, status: alreadyPublished.has(commentId) ? 'already-published' : 'needs-review', discoveredAt: now(), lastSeenAt: now(), queries: [query], proposedNames: guessPlaceNames(text, published.places), evidence: { provider: 'Algolia HN Search; canonical HN API rechecked at approval', commentId, storyId: hit.story_id ? Number(hit.story_id) : null, author: hit.author || null, date: hit.created_at || null, url: `https://news.ycombinator.com/item?id=${commentId}`, text, rawHtml: hit.comment_text, storyTitle: hit.story_title || '' } });
          run.added++;
        }
        if (page + 1 >= response.nbPages) break;
      } catch (error) { run.errors.push({ query, page, message: errorMessage(error) }); }
    }
  }
  run.finishedAt = now();
  await atomic('data/candidates.json', { ...queue, updatedAt: now(), candidates: [...byId.values()] });
  const archive = `data/runs/${timestamp()}.json`; await atomic(archive, run);
  console.log(JSON.stringify({ fetched: run.fetched, added: run.added, updated: run.updated, queue: 'data/candidates.json', evidenceArchive: archive, errors: run.errors }, null, 2));
  if (run.errors.length) process.exitCode = 1;
}

async function review() {
  const queue = parseCandidateQueue(await json('data/candidates.json', { schemaVersion: 1, candidates: [] }));
  const candidates = queue.candidates.filter(c => options.all || c.status === 'needs-review');
  console.log(`${candidates.length} ${options.all ? 'total' : 'unreviewed'} candidates\n`);
  for (const c of candidates) {
    console.log(`${c.id} · ${c.status}\nNames to inspect: ${c.proposedNames.join(' / ') || '(name needs manual extraction)'}\n${c.evidence.url}\n${c.evidence.author} · ${c.evidence.date}\n${c.evidence.text.slice(0, 650)}${c.evidence.text.length > 650 ? '…' : ''}\n`);
  }
}

async function draft() {
  if (!options.candidate) throw new Error('Use --candidate hn-<comment-id> [--out data/drafts/name.json]');
  const queue = parseCandidateQueue(await json('data/candidates.json', { schemaVersion: 1, candidates: [] }));
  const candidate = queue.candidates.find(c => c.id === options.candidate);
  if (!candidate) throw new Error('Candidate not found. Run discover or review first.');
  const evidence = await resolveHnComment(candidate.evidence.commentId);
  const name = candidate.proposedNames[0] || '';
  const out = typeof options.out === 'string' ? options.out : `data/drafts/${candidate.id}.json`;
  const draft: DraftPlace = { candidateId: candidate.id, id: normalizeName(name).replace(/\s+/g, '-'), name, city: '', country: '', category: 'Museums', coordinates: [null, null], coordinateSource: '', description: '', reason: '', visitNote: 'Check current access and tickets on the official website.', tags: [], officialUrl: '', officialCheckedAt: null, source: { commentId: evidence.commentId, storyId: evidence.storyId, url: evidence.url, discussionUrl: evidence.discussionUrl, author: evidence.author, date: evidence.date, quote: null }, review: { status: 'draft', evidenceText: evidence.text, locationVerified: false, recommendationVerified: false }, image: null };
  await atomic(out, draft);
  console.log(`Draft written to ${out}. Fill in the location, official URL, description, and recommendation context. Confirm review.locationVerified and review.recommendationVerified after reviewing the evidence. Nothing is published.`);
}

async function approve() {
  if (!options.file || typeof options.reviewer !== 'string' || !options.reviewer.trim()) throw new Error('Use --file data/drafts/place.json --reviewer "Your name"');
  const draft = validatePlace(await json(String(options.file)), { approved: false });
  if (draft.review?.locationVerified !== true || draft.review?.recommendationVerified !== true) throw new Error('Reviewer must verify the place location and the actual recommendation before approval. Set both review flags to true after checking.');
  const evidence = await resolveHnComment(draft.source.commentId);
  if (evidence.storyId !== draft.source.storyId || evidence.author !== draft.source.author || evidence.date !== draft.source.date) throw new Error('Canonical HN evidence differs from the draft. Refresh and review the source.');
  if (draft.source.quote && !normalizeText(evidence.text).includes(normalizeText(draft.source.quote))) throw new Error('The quotation is not an exact excerpt of the current HN comment.');
  const linkCheck = await checkOfficialUrl(draft.officialUrl);
  const data = validatePublished(await json('data/places.json'));
  const duplicate = findDuplicate(draft, data.places);
  const at = data.places.findIndex(p => p.id === draft.id);
  if (at >= 0 && duplicate?.id !== draft.id) throw new Error(`Slug ${draft.id} belongs to a different place. Choose a unique slug.`);
  const { candidateId, ...draftFields } = draft;
  const approved: Place = { ...draftFields, officialCheckedAt: day(), review: { status: 'approved', reviewedAt: now(), reviewer: options.reviewer, locationVerified: true, recommendationVerified: true, method: 'Manual review, canonical HN evidence check, and successful official HTML link check' } };
  let action;
  if (duplicate) {
    const sources = [duplicate.source, ...(duplicate.sources || [])];
    if (!sources.some(s => s.commentId === approved.source.commentId)) sources.push(approved.source);
    const merged = duplicate.id === draft.id ? { ...approved, sources } : { ...duplicate, sources };
    data.places[data.places.findIndex(p => p.id === duplicate.id)] = merged;
    action = `Merged evidence into ${duplicate.id}; no duplicate pin created.`;
  } else { data.places.push(approved); action = `Approved ${approved.id}.`; }
  data.updatedAt = now(); validatePublished(data);
  // Published source and queue are separate: build copies only approved source records.
  await atomic('data/places.json', data);
  const queue = parseCandidateQueue(await json('data/candidates.json', { schemaVersion: 1, candidates: [] }));
  const candidate = queue.candidates.find(c => c.id === candidateId);
  if (candidate) { candidate.status = 'approved'; candidate.placeId = duplicate?.id || approved.id; candidate.reviewedAt = now(); candidate.reviewer = options.reviewer; await atomic('data/candidates.json', queue); }
  await atomic(`data/reviews/${timestamp()}-${approved.id}.json`, { action, approved, linkCheck, canonicalEvidence: evidence });
  console.log(`${action} Run npm run build to update the website dataset. Nothing has been deployed automatically.`);
}

async function reject() {
  if (!options.candidate || typeof options.reason !== 'string') throw new Error('Use --candidate hn-<id> --reason "Reason for rejecting"');
  const queue = parseCandidateQueue(await json('data/candidates.json', { schemaVersion: 1, candidates: [] }));
  const candidate = queue.candidates.find(c => c.id === options.candidate); if (!candidate) throw new Error('Candidate not found');
  candidate.status = 'rejected'; candidate.rejectedAt = now(); candidate.rejectionReason = options.reason;
  await atomic('data/candidates.json', queue); console.log(`Rejected ${candidate.id}. Kept its source evidence for audit.`);
}

async function verify() {
  const data = validatePublished(await json('data/places.json'));
  const selected = options.place ? data.places.filter(p => p.id === options.place) : data.places;
  if (!selected.length) throw new Error('Place not found');
  const report: LinkCheckReport = { startedAt: now(), checks: [] };
  for (const p of selected) {
    try { const check = await checkOfficialUrl(p.officialUrl); p.officialCheckedAt = day(); report.checks.push({ id: p.id, ...check }); console.log(`${p.id}: OK (${check.status})`); }
    catch (error) { report.checks.push({ id: p.id, ok: false, attemptedAt: now(), error: errorMessage(error) }); console.log(`${p.id}: needs review — ${errorMessage(error)}`); }
  }
  report.finishedAt = now(); data.updatedAt = now();
  await atomic('data/places.json', data); await atomic('data/link-checks.json', report);
  const failures = report.checks.filter(c => !c.ok).length;
  console.log(`Checked ${selected.length} official links; ${failures} need review. Failed checks did not update last-successful dates. Run npm run build to refresh the site.`);
  if (failures) process.exitCode = 1;
}

try {
  if (command === 'discover') await discover();
  else if (command === 'review') await review();
  else if (command === 'draft') await draft();
  else if (command === 'approve') await approve();
  else if (command === 'reject') await reject();
  else if (command === 'verify') await verify();
  else if (command === 'help') console.log('hacker.living Places pipeline\n\n  discover [--query "museum worth visiting"] [--pages 1] [--limit 25]\n  review [--all]\n  draft --candidate hn-123 --out data/drafts/place.json\n  approve --file data/drafts/place.json --reviewer "Your name"\n  reject --candidate hn-123 --reason "Not a recommendation"\n  verify [--place crossness]\n\nCandidates never publish automatically. Approval rechecks canonical HN evidence and the official link.');
  else throw new Error(`Unknown command: ${command}`);
} catch (error) { console.error(`Pipeline: ${errorMessage(error)}`); process.exitCode = 1; }
