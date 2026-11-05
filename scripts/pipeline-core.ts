import { distanceKm } from '../shared/domain.ts';
import { placeCategories } from '../shared/types.ts';
import type { Category, Coordinates, Place, PlaceImage, PublishedData, ReviewMetadata, ReviewablePlace, Source } from '../shared/types.ts';

export const categories = placeCategories;
export const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
export function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${label}`);
  return value;
}
export function stringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item: unknown) => typeof item === 'string')) throw new Error(`Invalid ${label}`);
  return value;
}
export function normalizeText(value: unknown): string {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))).replace(/&#x([a-f0-9]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16))).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
export function normalizeName(value: unknown): string { return normalizeText(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
export function canonicalUrl(raw: string): string { const url = new URL(raw); url.hash = ''; for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key); url.hostname = url.hostname.replace(/^www\./, ''); return url.toString().replace(/\/$/, ''); }
export function publicHttpsUrl(raw: string): URL {
  let url: URL; try { url = new URL(raw); } catch { throw new Error('Expected a valid public HTTPS URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || /^(localhost|.*\.localhost|.*\.local|.*\.internal|\[.*\]|\d+(?:\.\d+){0,3})$/i.test(url.hostname) || !url.hostname.includes('.')) throw new Error('Expected a public HTTPS hostname without credentials or a custom port');
  return url;
}
export function guessPlaceNames(input: string, existing: Pick<Place, 'name'>[] = []): string[] {
  const plain = normalizeText(input);
  const names = new Set(existing.filter(p => plain.toLowerCase().includes(p.name.toLowerCase())).map(p => p.name));
  const pattern = /\b(?:[A-Z][\p{L}'’&-]+\s+){0,5}(?:Museum|Observatory|Library|Pumping Station|Planetarium|Exploratorium|Science Center|Science Centre|Computing Centre|Computing Center)(?:\s+(?:of|the|and|at)\s+(?:[A-Z][\p{L}'’&-]+\s*){1,4})?/gu;
  for (const match of plain.matchAll(pattern)) { const name = match[0].trim(); if (name.length > 7 && name.length < 120) names.add(name); }
  return [...names];
}
export function isCandidate(input: string): boolean {
  const plain = normalizeText(input);
  return /museum|observator|librar|planetarium|pumping station|heritage|landmark|exploratorium|computing|science cent(?:er|re)/i.test(plain) && /visit|recommend|worth|fascinat|incredible|amazing|check out|terrific|fantastic|favorite|favourite|enjoyed|go to|great collection/i.test(plain);
}
export function findDuplicate(draft: Pick<ReviewablePlace, 'id' | 'name' | 'city' | 'coordinates' | 'officialUrl'>, places: Place[]): Place | undefined {
  return places.find(p => {
    const nearby = distanceKm(p.coordinates, draft.coordinates) < 1;
    const sameName = normalizeName(p.name) === normalizeName(draft.name) && normalizeName(p.city) === normalizeName(draft.city);
    const sameOfficial = canonicalUrl(p.officialUrl) === canonicalUrl(draft.officialUrl);
    return nearby && (sameName || sameOfficial);
  });
}
function parseSource(value: unknown, id: string): Source {
  const s = object(value, `${id}: HN evidence`);
  if (typeof s.commentId !== 'number' || !Number.isSafeInteger(s.commentId) || s.commentId < 1 || typeof s.storyId !== 'number' || !Number.isSafeInteger(s.storyId) || s.storyId < 1 || typeof s.author !== 'string' || !s.author || typeof s.date !== 'string' || !Number.isFinite(Date.parse(s.date))) throw new Error(`${id}: incomplete HN evidence`);
  if (s.url !== `https://news.ycombinator.com/item?id=${s.commentId}` || s.discussionUrl !== `https://news.ycombinator.com/item?id=${s.storyId}`) throw new Error(`${id}: source links must match the original item IDs`);
  if (s.quote != null && typeof s.quote !== 'string') throw new Error(`${id}: invalid quotation`);
  const quote = typeof s.quote === 'string' ? s.quote : null;
  if (quote && quote.trim().split(/\s+/).length > 25) throw new Error(`${id}: keep source excerpts at most 25 words`);
  return { commentId: s.commentId, storyId: s.storyId, url: s.url, discussionUrl: s.discussionUrl, author: s.author, date: s.date, quote };
}
function parseImage(value: unknown): PlaceImage | null {
  if (value == null) return null;
  const image = object(value, 'place image');
  return { path: text(image.path, 'image path'), alt: text(image.alt, 'image alt text'), author: text(image.author, 'image author'), license: text(image.license, 'image license'), licenseUrl: text(image.licenseUrl, 'image license URL'), sourceUrl: text(image.sourceUrl, 'image source URL'), modifications: typeof image.modifications === 'string' ? image.modifications : '' };
}
function parseReview(value: unknown): ReviewMetadata {
  const r = value == null ? {} : object(value, 'place review');
  return { status: r.status === 'approved' ? 'approved' : 'draft', reviewedAt: typeof r.reviewedAt === 'string' ? r.reviewedAt : undefined, reviewer: typeof r.reviewer === 'string' ? r.reviewer : undefined, method: typeof r.method === 'string' ? r.method : undefined, evidenceText: typeof r.evidenceText === 'string' ? r.evidenceText : undefined, locationVerified: typeof r.locationVerified === 'boolean' ? r.locationVerified : undefined, recommendationVerified: typeof r.recommendationVerified === 'boolean' ? r.recommendationVerified : undefined };
}
export function validatePlace(value: unknown, options: { approved: false }): ReviewablePlace;
export function validatePlace(value: unknown, options?: { approved?: true }): Place;
export function validatePlace(value: unknown, { approved = true }: { approved?: boolean } = {}): Place | ReviewablePlace {
  const p = object(value, 'place');
  const id = text(p.id, 'place id');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('Place ID must be a lowercase URL slug');
  const category: Category | undefined = categories.find(c => c === p.category);
  if (!category) throw new Error(`${id}: invalid category`);
  if (!Array.isArray(p.coordinates) || p.coordinates.length !== 2 || !p.coordinates.every((n: unknown) => typeof n === 'number' && Number.isFinite(n)) || Math.abs(p.coordinates[0]) > 90 || Math.abs(p.coordinates[1]) > 180) throw new Error(`${id}: invalid latitude/longitude`);
  const coordinates: Coordinates = [p.coordinates[0], p.coordinates[1]];
  const officialUrl = text(p.officialUrl, `${id}: official URL`), coordinateSource = text(p.coordinateSource, `${id}: coordinate source`);
  publicHttpsUrl(officialUrl); publicHttpsUrl(coordinateSource);
  const source = parseSource(p.source, id), review = parseReview(p.review);
  const officialCheckedAt = typeof p.officialCheckedAt === 'string' ? p.officialCheckedAt : null;
  if (approved && (review.status !== 'approved' || !review.reviewedAt || !officialCheckedAt)) throw new Error(`${id}: approval and official-link check are required`);
  for (const date of [source.date, review.reviewedAt, officialCheckedAt]) if (date && (!Number.isFinite(Date.parse(date)) || Date.parse(date) > Date.now() + 86400000)) throw new Error(`${id}: invalid or future evidence date`);
  const sources = p.sources === undefined ? undefined : Array.isArray(p.sources) ? p.sources.map(s => parseSource(s, id)) : (() => { throw new Error(`${id}: invalid sources`); })();
  const common = { id, name: text(p.name, `${id}: name`), city: text(p.city, `${id}: city`), country: text(p.country, `${id}: country`), category, coordinates, coordinateSource, description: text(p.description, `${id}: description`), reason: text(p.reason, `${id}: reason`), visitNote: text(p.visitNote, `${id}: visit note`), tags: p.tags === undefined ? [] : stringList(p.tags, `${id}: tags`), neighborhood: typeof p.neighborhood === 'string' ? p.neighborhood : undefined, officialUrl, source, sources, image: parseImage(p.image) };
  if (!approved) return { ...common, candidateId: typeof p.candidateId === 'string' ? p.candidateId : undefined, proposalId: typeof p.proposalId === 'string' ? p.proposalId : undefined, officialCheckedAt, review };
  // These checks narrow the validated metadata into the published record type.
  if (!officialCheckedAt || !review.reviewedAt) throw new Error(`${id}: approval and official-link check are required`);
  return { ...common, officialCheckedAt, review: { ...review, status: 'approved', reviewedAt: review.reviewedAt } };
}
export function validatePublished(value: unknown): PublishedData {
  const data = object(value, 'published dataset');
  if (data.schemaVersion !== 1 || !Array.isArray(data.places)) throw new Error('Invalid published dataset');
  const ids = new Set<string>();
  const places = data.places.map(value => { const p = validatePlace(value); if (ids.has(p.id)) throw new Error(`Duplicate ID: ${p.id}`); ids.add(p.id); return p; });
  return { schemaVersion: 1, updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '', places };
}

export type Fetcher = (url: string | URL, init?: RequestInit) => Promise<Response>;
export interface FetchOptions { fetcher?: Fetcher; retries?: number }
export interface LinkCheck { ok: true; url: string; status: number; checkedAt: string }
export interface CanonicalEvidence extends Omit<Source, 'quote'> { text: string; rawHtml: string; storyTitle: string }
export interface HnItem { id: number; type?: string; text?: string; by?: string; time?: number; parent?: number; title?: string; deleted?: boolean; dead?: boolean }
class HttpError extends Error {
  readonly retryable: boolean;
  constructor(status: number, url: string | URL) { super(`HTTP ${status} for ${url}`); this.retryable = status === 429 || status >= 500; }
}
export async function requestJson(url: string | URL, { fetcher = fetch, retries = 2 }: FetchOptions = {}): Promise<unknown> {
  let error: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'hacker.living-research/1.0', Accept: 'application/json' } });
      if (!response.ok) throw new HttpError(response.status, url);
      const body: unknown = await response.json(); return body;
    } catch (e) { error = e; if ((e instanceof HttpError && !e.retryable) || i === retries) break; await new Promise(resolve => setTimeout(resolve, (i + 1) * 500)); }
  }
  throw error;
}
function parseHnItem(value: unknown): HnItem | null {
  if (value === null) return null;
  const item = object(value, 'HN item');
  return { id: typeof item.id === 'number' ? item.id : 0, type: typeof item.type === 'string' ? item.type : undefined, text: typeof item.text === 'string' ? item.text : undefined, by: typeof item.by === 'string' ? item.by : undefined, time: typeof item.time === 'number' ? item.time : undefined, parent: typeof item.parent === 'number' ? item.parent : undefined, title: typeof item.title === 'string' ? item.title : undefined, deleted: item.deleted === true, dead: item.dead === true };
}
export async function resolveHnComment(id: number, options: FetchOptions = {}): Promise<CanonicalEvidence> {
  const item = parseHnItem(await requestJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, options));
  if (!item || item.type !== 'comment' || item.deleted || item.dead || !item.text || !item.by || !item.time) throw new Error(`HN item ${id} is not a live comment`);
  let parentId = item.parent;
  const seen = new Set([id]);
  for (let depth = 0; depth < 40; depth++) {
    if (!parentId || seen.has(parentId)) throw new Error(`Broken HN parent chain for ${id}`);
    seen.add(parentId);
    const parent = parseHnItem(await requestJson(`https://hacker-news.firebaseio.com/v0/item/${parentId}.json`, options));
    if (!parent) throw new Error(`Missing HN parent ${parentId}`);
    if (parent.type === 'story') return { commentId: id, storyId: parent.id, url: `https://news.ycombinator.com/item?id=${id}`, discussionUrl: `https://news.ycombinator.com/item?id=${parent.id}`, author: item.by, date: new Date(item.time * 1000).toISOString(), text: normalizeText(item.text), rawHtml: item.text, storyTitle: parent.title || '' };
    parentId = parent.parent;
  }
  throw new Error(`HN parent chain too deep for ${id}`);
}
export async function checkOfficialUrl(raw: string, { fetcher = fetch }: Pick<FetchOptions, 'fetcher'> = {}): Promise<LinkCheck> {
  let url = publicHttpsUrl(raw);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetcher(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'hacker.living-link-checker/1.0', Accept: 'text/html,application/xhtml+xml' } });
    await response.body?.cancel();
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location'); if (!location) throw new Error('Official redirect is missing a location');
      url = publicHttpsUrl(new URL(location, url).href); continue;
    }
    if (!response.ok) throw new Error(`Official website returned HTTP ${response.status}`);
    if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type') || '')) throw new Error('Official URL did not return an HTML page');
    return { ok: true, url: url.href, status: response.status, checkedAt: new Date().toISOString() };
  }
  throw new Error('Too many official website redirects');
}
