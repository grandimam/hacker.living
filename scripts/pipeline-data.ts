import { object, stringList, text } from './pipeline-core.ts';
import type { LinkCheck } from './pipeline-core.ts';

export type CandidateStatus = 'needs-review' | 'already-published' | 'approved' | 'rejected';
export interface CandidateEvidence {
  provider: string;
  commentId: number;
  storyId: number | null;
  author: string | null;
  date: string | null;
  url: string;
  text: string;
  rawHtml: string | null;
  storyTitle: string;
}
export interface Candidate {
  id: string;
  status: CandidateStatus;
  discoveredAt: string;
  lastSeenAt: string;
  queries: string[];
  proposedNames: string[];
  evidence: CandidateEvidence;
  placeId?: string;
  reviewedAt?: string;
  reviewer?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}
export interface CandidateQueue { schemaVersion: 1; updatedAt?: string; candidates: Candidate[] }
export interface AlgoliaHit extends Record<string, unknown> {
  objectID: string;
  comment_text: string | null;
  story_id: number | null;
  author: string | null;
  created_at: string | null;
  story_title: string | null;
}
export interface SearchResponse { hits: AlgoliaHit[]; nbPages: number }
export interface DiscoveryRun {
  startedAt: string;
  finishedAt?: string;
  queries: string[];
  requestedPages: number;
  limitPerPage: number;
  fetched: number;
  added: number;
  updated: number;
  errors: { query: string; page: number; message: string }[];
  responses: { query: string; page: number; hits: AlgoliaHit[] }[];
}
export type LinkCheckEntry = ({ id: string } & LinkCheck) | { id: string; ok: false; attemptedAt: string; error: string };
export interface LinkCheckReport { startedAt: string; finishedAt?: string; checks: LinkCheckEntry[] }
const optionalString = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
const nullableString = (value: unknown): string | null => typeof value === 'string' ? value : null;

export function parseCandidateQueue(value: unknown): CandidateQueue {
  const queue = object(value, 'candidate queue');
  if (queue.schemaVersion !== 1 || !Array.isArray(queue.candidates)) throw new Error('Invalid candidate queue');
  const candidates = queue.candidates.map((value: unknown): Candidate => {
    const c = object(value, 'candidate'), e = object(c.evidence, 'candidate evidence');
    const statuses: CandidateStatus[] = ['needs-review', 'already-published', 'approved', 'rejected'];
    const status = statuses.find(s => s === c.status);
    if (!status || typeof e.commentId !== 'number' || !Number.isSafeInteger(e.commentId) || e.commentId < 1) throw new Error('Invalid candidate status or HN comment ID');
    return {
      id: text(c.id, 'candidate id'), status,
      discoveredAt: text(c.discoveredAt, 'candidate discovery date'), lastSeenAt: text(c.lastSeenAt, 'candidate last-seen date'),
      queries: stringList(c.queries, 'candidate queries'), proposedNames: stringList(c.proposedNames, 'proposed names'),
      evidence: { provider: text(e.provider, 'evidence provider'), commentId: e.commentId, storyId: typeof e.storyId === 'number' ? e.storyId : null, author: nullableString(e.author), date: nullableString(e.date), url: text(e.url, 'evidence URL'), text: text(e.text, 'evidence text'), rawHtml: nullableString(e.rawHtml), storyTitle: nullableString(e.storyTitle) || '' },
      placeId: optionalString(c.placeId), reviewedAt: optionalString(c.reviewedAt), reviewer: optionalString(c.reviewer), rejectedAt: optionalString(c.rejectedAt), rejectionReason: optionalString(c.rejectionReason),
    };
  });
  return { schemaVersion: 1, updatedAt: optionalString(queue.updatedAt), candidates };
}
export function parseSearchResponse(value: unknown): SearchResponse {
  const response = object(value, 'Algolia search response');
  if (!Array.isArray(response.hits) || typeof response.nbPages !== 'number' || !Number.isInteger(response.nbPages) || response.nbPages < 0) throw new Error('Invalid Algolia response');
  const hits = response.hits.map((value: unknown): AlgoliaHit => {
    const hit = object(value, 'Algolia search hit');
    return { ...hit, objectID: text(hit.objectID, 'Algolia item ID'), comment_text: nullableString(hit.comment_text), story_id: typeof hit.story_id === 'number' ? hit.story_id : null, author: nullableString(hit.author), created_at: nullableString(hit.created_at), story_title: nullableString(hit.story_title) };
  });
  return { hits, nbPages: response.nbPages };
}
