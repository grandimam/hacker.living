import { distanceKm } from '../shared/domain.mjs';

export const categories = ['Museums', 'Libraries', 'Engineering', 'Observatories', 'Computing', 'Science'];
export function normalizeText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([a-f0-9]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
export function normalizeName(value) { return normalizeText(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
export function canonicalUrl(raw) { const url = new URL(raw); url.hash = ''; for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key); url.hostname = url.hostname.replace(/^www\./, ''); return url.toString().replace(/\/$/, ''); }
export function publicHttpsUrl(raw) {
  let url; try { url = new URL(raw); } catch { throw new Error('Expected a valid public HTTPS URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || /^(localhost|.*\.localhost|.*\.local|.*\.internal|\[.*\]|\d+(?:\.\d+){0,3})$/i.test(url.hostname) || !url.hostname.includes('.')) throw new Error('Expected a public HTTPS hostname without credentials or a custom port');
  return url;
}
export function guessPlaceNames(text, existing = []) {
  const plain = normalizeText(text);
  const names = new Set(existing.filter(p => plain.toLowerCase().includes(p.name.toLowerCase())).map(p => p.name));
  const pattern = /\b(?:[A-Z][\p{L}'’&-]+\s+){0,5}(?:Museum|Observatory|Library|Pumping Station|Planetarium|Exploratorium|Science Center|Science Centre|Computing Centre|Computing Center)(?:\s+(?:of|the|and|at)\s+(?:[A-Z][\p{L}'’&-]+\s*){1,4})?/gu;
  for (const match of plain.matchAll(pattern)) { const name = match[0].trim(); if (name.length > 7 && name.length < 120) names.add(name); }
  return [...names];
}
export function isCandidate(text) {
  const plain = normalizeText(text);
  return /museum|observator|librar|planetarium|pumping station|heritage|landmark|exploratorium|computing|science cent(?:er|re)/i.test(plain) && /visit|recommend|worth|fascinat|incredible|amazing|check out|terrific|fantastic|favorite|favourite|enjoyed|go to|great collection/i.test(plain);
}
export function findDuplicate(draft, places) {
  return places.find(p => {
    const nearby = distanceKm(p.coordinates, draft.coordinates) < 1;
    const sameName = normalizeName(p.name) === normalizeName(draft.name) && normalizeName(p.city) === normalizeName(draft.city);
    const sameOfficial = canonicalUrl(p.officialUrl) === canonicalUrl(draft.officialUrl);
    return nearby && (sameName || sameOfficial);
  });
}
export function validatePlace(p, { approved = true } = {}) {
  for (const field of ['id', 'name', 'city', 'country', 'description', 'reason', 'visitNote', 'coordinateSource']) if (typeof p[field] !== 'string' || !p[field].trim()) throw new Error(`${p.id || 'Draft'}: missing ${field}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id)) throw new Error('Place ID must be a lowercase URL slug');
  if (!categories.includes(p.category)) throw new Error(`${p.id}: invalid category`);
  if (!Array.isArray(p.coordinates) || p.coordinates.length !== 2 || !p.coordinates.every(Number.isFinite) || Math.abs(p.coordinates[0]) > 90 || Math.abs(p.coordinates[1]) > 180) throw new Error(`${p.id}: invalid latitude/longitude`);
  publicHttpsUrl(p.officialUrl); publicHttpsUrl(p.coordinateSource);
  if (!Number.isSafeInteger(p.source?.commentId) || p.source.commentId < 1 || !Number.isSafeInteger(p.source?.storyId) || p.source.storyId < 1 || !p.source.author || !Number.isFinite(Date.parse(p.source.date))) throw new Error(`${p.id}: incomplete HN evidence`);
  if (p.source.url !== `https://news.ycombinator.com/item?id=${p.source.commentId}` || p.source.discussionUrl !== `https://news.ycombinator.com/item?id=${p.source.storyId}`) throw new Error(`${p.id}: source links must match the original item IDs`);
  if (p.source.quote && p.source.quote.trim().split(/\s+/).length > 25) throw new Error(`${p.id}: keep source excerpts at most 25 words`);
  if (approved && (p.review?.status !== 'approved' || !p.review.reviewedAt || !p.officialCheckedAt)) throw new Error(`${p.id}: approval and official-link check are required`);
  for (const value of [p.source.date, p.review?.reviewedAt, p.officialCheckedAt]) if (value && (!Number.isFinite(Date.parse(value)) || Date.parse(value) > Date.now() + 86400000)) throw new Error(`${p.id}: invalid or future evidence date`);
  return p;
}
export function validatePublished(data) {
  if (data.schemaVersion !== 1 || !Array.isArray(data.places)) throw new Error('Invalid published dataset');
  const ids = new Set();
  for (const p of data.places) { validatePlace(p); if (ids.has(p.id)) throw new Error(`Duplicate ID: ${p.id}`); ids.add(p.id); }
  return data;
}
export async function requestJson(url, { fetcher = fetch, retries = 2 } = {}) {
  let error;
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'hacker.living-research/1.0', Accept: 'application/json' } });
      if (!response.ok) { const e = new Error(`HTTP ${response.status} for ${url}`); e.retryable = response.status === 429 || response.status >= 500; throw e; }
      return await response.json();
    } catch (e) { error = e; if (e.retryable === false || i === retries) break; await new Promise(resolve => setTimeout(resolve, (i + 1) * 500)); }
  }
  throw error;
}
export async function resolveHnComment(id, options = {}) {
  const item = await requestJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, options);
  if (!item || item.type !== 'comment' || item.deleted || item.dead || !item.text || !item.by || !item.time) throw new Error(`HN item ${id} is not a live comment`);
  let parentId = item.parent;
  const seen = new Set([id]);
  for (let depth = 0; depth < 40; depth++) {
    if (!parentId || seen.has(parentId)) throw new Error(`Broken HN parent chain for ${id}`);
    seen.add(parentId);
    const parent = await requestJson(`https://hacker-news.firebaseio.com/v0/item/${parentId}.json`, options);
    if (!parent) throw new Error(`Missing HN parent ${parentId}`);
    if (parent.type === 'story') return { commentId: Number(id), storyId: parent.id, url: `https://news.ycombinator.com/item?id=${id}`, discussionUrl: `https://news.ycombinator.com/item?id=${parent.id}`, author: item.by, date: new Date(item.time * 1000).toISOString(), text: normalizeText(item.text), rawHtml: item.text, storyTitle: parent.title || '' };
    parentId = parent.parent;
  }
  throw new Error(`HN parent chain too deep for ${id}`);
}
export async function checkOfficialUrl(raw, { fetcher = fetch } = {}) {
  let url = publicHttpsUrl(raw);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetcher(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'hacker.living-link-checker/1.0', Accept: 'text/html,application/xhtml+xml' } });
    await response.body?.cancel();
    if ([301,302,303,307,308].includes(response.status)) { url = publicHttpsUrl(new URL(response.headers.get('location'), url).href); continue; }
    if (!response.ok) throw new Error(`Official website returned HTTP ${response.status}`);
    if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type') || '')) throw new Error('Official URL did not return an HTML page');
    return { ok: true, url: url.href, status: response.status, checkedAt: new Date().toISOString() };
  }
  throw new Error('Too many official website redirects');
}
