import { readPipelineStatus } from './pipeline-status.ts';
import {getPool} from '../server/db/connection.ts';
import type { Plugin } from 'vite';
import { normalizeName, object } from './pipeline-core.ts';
import { parseCandidateQueue } from './pipeline-data.ts';
import type { Candidate } from './pipeline-data.ts';
import { parseLabels } from './labeling-core.ts';
import type { Label } from './labeling-core.ts';
import type { PilotPlaceGroup, PilotPreviewData } from '../shared/pilot-preview.ts';

export function createPilotPreview(candidates: Candidate[], labels: Label[]): PilotPreviewData {
  const byId = new Map(candidates.map(c => [c.id,c]));
  const groups = new Map<string,PilotPlaceGroup>();
  const useful = labels.filter(l => l.decision === 'recommendation' && l.places.some(p => p.stance === 'positive' && p.confidence !== 'low'));
  for (const label of useful) {
    const candidate = byId.get(label.candidateId);
    if (!candidate) throw new Error('Missing pilot source evidence');
    for (const place of label.places.filter(p => p.stance === 'positive' && p.confidence !== 'low')) {
      // Deliberately preserve unresolved aliases and absent locations, as in the pilot report.
      const id = [place.name,place.city ?? '',place.country ?? ''].map(normalizeName).join('|');
      const group = groups.get(id) ?? { id, name: place.name, city: place.city, country: place.country, sources: [] };
      if (!group.sources.some(s => s.commentId === candidate.evidence.commentId)) group.sources.push({ commentId: candidate.evidence.commentId, author: candidate.evidence.author, date: candidate.evidence.date, url: candidate.evidence.url, reason: place.reason, quote: place.quote, confidence: place.confidence });
      groups.set(id,group);
    }
  }
  return { sampled: labels.length, usefulComments: useful.length, decisions: Object.fromEntries([...new Set(labels.map(l => l.decision))].map(d => [d,labels.filter(l => l.decision === d).length])), groups: [...groups.values()].sort((a,b) => a.name.localeCompare(b.name)) };
}
export async function readPipelinePreview(){
 const rows=await getPool().query<{payload:unknown;output:unknown}>(`SELECT DISTINCT ON(c.id) c.payload,l.output FROM candidates c JOIN labels l ON l.candidate_id=c.id JOIN place_proposals p ON p.label_id=l.id WHERE p.state<>'rejected' ORDER BY c.id DESC,l.created_at DESC,l.id LIMIT 200`);
 const candidates=parseCandidateQueue({schemaVersion:1,candidates:rows.rows.map(r=>r.payload)}).candidates;
 const labels=parseLabels({labels:rows.rows.map(r=>r.output)},candidates);
 const pipeline=await readPipelineStatus();
 const counts=await getPool().query(`SELECT output->>'decision' AS decision,count(*)::int AS count FROM(SELECT DISTINCT ON(candidate_id) output FROM labels ORDER BY candidate_id,created_at DESC,id)latest GROUP BY 1`);
 const useful=await getPool().query('SELECT count(DISTINCT l.candidate_id)::int AS count FROM labels l JOIN place_proposals p ON p.label_id=l.id');
 return {...createPilotPreview(candidates,labels),sampled:pipeline.database.labeled,usefulComments:useful.rows[0].count,decisions:Object.fromEntries(counts.rows.map(r=>[r.decision,r.count])),pipeline};
}
export function pilotPreviewPlugin(): Plugin {
 return {name:'local-pilot-preview',apply:'serve',configureServer(server){
  server.middlewares.use('/__pipeline/pilot',async(request,response)=>{
   response.setHeader('Cache-Control','no-store');response.setHeader('Content-Type','application/json');
   if(request.method!=='GET'){response.writeHead(405,{Allow:'GET'}).end(JSON.stringify({error:'GET only'}));return;}
   try{response.end(JSON.stringify(await readPipelinePreview()));}catch(error){server.config.logger.error(String(error));response.writeHead(503).end(JSON.stringify({error:'Database pipeline results are unavailable.'}));}
  });
 }};
}
