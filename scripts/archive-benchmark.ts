import { readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { DuckDBInstance } from '@duckdb/node-api';
import { object } from './pipeline-core.ts';
const directory = fileURLToPath(new URL('../data/archive/open-index-hacker-news/', import.meta.url));
async function main() {
  const manifest = object(JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8')), 'manifest');
  if (!Array.isArray(manifest.files)) throw new Error('Invalid archive manifest');
  const files: { path: string; bytes: number }[] = [];
  for (const value of manifest.files) {
    const f = object(value,'file');
    if (typeof f.path !== 'string' || !/^data\/\d{4}\/\d{4}-\d{2}\.parquet$/.test(f.path) || typeof f.bytes !== 'number') throw new Error('Invalid file entry');
    try { if ((await stat(resolve(directory,f.path))).size === f.bytes) files.push({ path: f.path, bytes: f.bytes }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const partial = files.length !== manifest.files.length;
  if (partial && !process.argv.includes('--available')) throw new Error('Download incomplete. Use --available for a partial benchmark, or wait for all monthly files.');
  if (!files.length) throw new Error('No completed monthly files available');
  const instance = await DuckDBInstance.create(':memory:', { threads: '4', memory_limit: '4GB' });
  const connection = await instance.connect();
  await connection.run("SET TimeZone='UTC'");
  const results: { path: string; bytes: number; elapsedMs: number; counts: Record<string, unknown> }[] = [];
  const startedAt = new Date().toISOString(), started = performance.now();
  try {
    for (const f of files) {
      const before = performance.now();
      const data = await connection.runAndReadAll(`
        WITH comments AS (
          SELECT type, dead, deleted, time, lower(coalesce(text,'')) AS body
          FROM read_parquet($file)
        ), signals AS (
          SELECT *, type = 2 AND coalesce(dead,0) = 0 AND coalesce(deleted,0) = 0 AS live_comment,
            regexp_matches(body, 'museum|observatory|observatories|planetarium|library|libraries|pumping station|science cent(er|re)|heritage|telescope|historic site') AS place_terms,
            regexp_matches(body, 'recommend|worth visiting|worth a visit|must see|must-see|check out|enjoyed visiting|love visiting|great place|amazing place') AS recommendation_terms
          FROM comments
        ) SELECT count(*) AS items, count(*) FILTER (WHERE live_comment) AS live_comments,
          coalesce(sum(length(body)) FILTER (WHERE live_comment),0) AS comment_characters,
          count(*) FILTER (WHERE live_comment AND place_terms) AS keyword_matches,
          count(*) FILTER (WHERE live_comment AND place_terms AND recommendation_terms) AS possible_endorsements,
          min(time)::VARCHAR AS earliest_item, max(time)::VARCHAR AS latest_item
        FROM signals`, { file: resolve(directory,f.path) });
      const counts = object(data.getRowObjectsJson()[0], 'counts');
      const result = { ...f, elapsedMs: Math.round(performance.now()-before), counts };
      results.push(result);
      console.log(JSON.stringify(result));
    }
  } finally { connection.closeSync(); instance.closeSync(); }
  const report = { revision: manifest.revision, startedAt, finishedAt: new Date().toISOString(), elapsedMs: Math.round(performance.now()-started), partial, expectedFiles: manifest.files.length, scannedFiles: files.length, compressedBytesScanned: files.reduce((n,f)=>n+f.bytes,0), threads: 4, memoryLimit: '4GB',
    totals: Object.fromEntries(['items','live_comments','comment_characters','keyword_matches','possible_endorsements'].map(k => [k, results.reduce((sum,r)=>sum+BigInt(String(r.counts[k])),0n).toString()])),
    limitations: ['Simple text-scan benchmark only; not entity extraction, deduplication, indexing, model labeling, or verification.', 'Keyword matches and possible endorsements include false positives and omit real recommendations.', 'Local filesystem caching and concurrent downloads affect timings.'], results };
  const path = resolve(directory, partial ? 'benchmark-partial.json' : 'benchmark.json');
  await writeFile(path, JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({ ...report, results: undefined, report: path }));
}
main().catch(error=>{console.error(error instanceof Error ? error.message : String(error));process.exitCode=1;});
