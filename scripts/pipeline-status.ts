import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { object } from './pipeline-core.ts';
import {databaseStatus} from '../server/db/status.ts';
import {listPlaces} from '../server/db/catalog.ts';
import type { PipelineActivity, PipelineFile, PipelineStatus } from '../shared/pilot-preview.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const archiveDirectory=resolve(root,'data/archive/open-index-hacker-news');
async function optionalJson(path: string): Promise<unknown | null> {
  try { return JSON.parse(await readFile(path,'utf8')); }
  catch(error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
async function fileStat(path: string) {
  try { return await stat(path); }
  catch(error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
/** Recent file writes are evidence of activity, not proof of an always-running scheduler. */
export function archiveState(total: number, completed: number, failures: number, lastWrite: string | null, now: number): PipelineStatus['archive']['state'] {
  if (!total) return 'waiting';
  if (completed === total) return 'complete';
  if (lastWrite && now-Date.parse(lastWrite) >= 0 && now-Date.parse(lastWrite)<90_000) return 'active';
  if (failures) return 'failed';
  return 'idle';
}
export async function readPipelineStatus(): Promise<PipelineStatus> {
  const [rawManifest,rawDownload,database,catalog] = await Promise.all([
    optionalJson(resolve(archiveDirectory,'manifest.json')),
    optionalJson(resolve(archiveDirectory,'download-report.json')),
    databaseStatus(),listPlaces({limit:1,offset:0}),
  ]);
  const activity: PipelineActivity[]=[];
  const partials: PipelineFile[]=[];
  let totalFiles=0, completedFiles=0, expectedBytes=0, receivedBytes=0, lastWrite=0;
  if (rawManifest) {
    const manifest=object(rawManifest,'archive manifest');
    if (!Array.isArray(manifest.files)) throw new Error('Invalid archive manifest');
    totalFiles=manifest.files.length;
    const observations=await Promise.all(manifest.files.map(async value=>{
      const f=object(value,'archive file');
      if (typeof f.path!=='string' || !/^data\/\d{4}\/\d{4}-\d{2}\.parquet$/.test(f.path) || typeof f.bytes!=='number' || f.bytes<0) throw new Error('Invalid archive file');
      const [complete,partial]=await Promise.all([fileStat(resolve(archiveDirectory,f.path)),fileStat(resolve(archiveDirectory,f.path+'.part'))]);
      return {path:f.path,bytes:f.bytes,complete,partial};
    }));
    for (const f of observations) {
      expectedBytes+=f.bytes;
      if (f.complete?.size===f.bytes) {
        completedFiles++; receivedBytes+=f.bytes;lastWrite=Math.max(lastWrite,f.complete.mtimeMs);
        activity.push({id:`archive:${f.path}`,at:f.complete.mtime.toISOString(),stage:'collect',message:`Monthly file received · ${f.path} · ${(f.bytes/1e6).toFixed(1)} MB`});
      } else if (f.partial) {
        receivedBytes+=Math.min(f.partial.size,f.bytes);lastWrite=Math.max(lastWrite,f.partial.mtimeMs);
        partials.push({path:f.path,bytes:f.partial.size,expectedBytes:f.bytes,modifiedAt:f.partial.mtime.toISOString()});
      }
    }
  }
  const download=rawDownload ? object(rawDownload,'download report') : null;
  const failures=Array.isArray(download?.errors) ? download.errors.length : 0;
  activity.push(...database.events);
  const published=catalog.total;
  const now=Date.now();
  return {observedAt:new Date(now).toISOString(),archive:{state:archiveState(totalFiles,completedFiles,failures,lastWrite?new Date(lastWrite).toISOString():null,now),totalFiles,completedFiles,expectedBytes,receivedBytes,files:partials.sort((a,b)=>a.path.localeCompare(b.path)),lastActivityAt:lastWrite?new Date(lastWrite).toISOString():null,failures},
    candidates:{total:database.candidates,pending:database.pending,updatedAt:database.updatedAt},published,database:{research:database.research,labeled:database.labeled,proposals:database.proposals,jobs:database.jobs,partitions:database.partitions},
    activity:activity.filter(event=>Number.isFinite(Date.parse(event.at))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,8)};
}
