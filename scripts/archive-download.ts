import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { object, requestJson, text } from './pipeline-core.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = resolve(root, 'data/archive/open-index-hacker-news');
const repository = 'open-index/hacker-news';
interface ArchiveFile { path: string; bytes: number; sha256: string }
interface Manifest { schemaVersion: 1; repository: string; revision: string; createdAt: string; files: ArchiveFile[] }
const manifestPath = resolve(directory, 'manifest.json');
const exists = async (path: string) => { try { return await stat(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } };
async function checksum(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
function parseFile(value: unknown): ArchiveFile {
  const f = object(value, 'archive file');
  const path = text(f.path, 'archive path');
  if (!/^data\/\d{4}\/\d{4}-\d{2}\.parquet$/.test(path)) throw new Error(`Unexpected archive path ${path}`);
  const bytes = f.bytes ?? f.size;
  const sha256 = f.sha256 ?? object(f.lfs, 'LFS metadata').oid;
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 0 || typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid archive size or checksum');
  return { path, bytes, sha256 };
}
async function manifest(): Promise<Manifest> {
  if (await exists(manifestPath)) {
    const m = object(JSON.parse(await readFile(manifestPath, 'utf8')), 'manifest');
    if (m.schemaVersion !== 1 || m.repository !== repository || typeof m.revision !== 'string' || !/^[a-f0-9]{40}$/.test(m.revision) || !Array.isArray(m.files)) throw new Error('Invalid archive manifest');
    const files = m.files.map(parseFile);
    if (new Set(files.map(f => f.path)).size !== files.length || !files.length) throw new Error('Duplicate or empty archive manifest');
    return { schemaVersion: 1, repository, revision: m.revision, createdAt: text(m.createdAt, 'manifest date'), files };
  }
  const metadata = object(await requestJson(`https://huggingface.co/api/datasets/${repository}/revision/main`), 'dataset revision');
  const revision = text(metadata.sha, 'revision');
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid dataset revision');
  // Current monthly archive is below the 1,000-entry endpoint limit. Refuse truncation.
  const listing = await requestJson(`https://huggingface.co/api/datasets/${repository}/tree/${revision}/data?recursive=true&expand=false&limit=1000`);
  if (!Array.isArray(listing) || listing.length >= 1000) throw new Error('Archive listing needs pagination; refusing an incomplete download');
  const files = listing.filter(v => { const f = object(v, 'tree entry'); return f.type === 'file' && typeof f.path === 'string' && f.path.endsWith('.parquet'); }).map(parseFile).sort((a,b) => a.path.localeCompare(b.path));
  if (!files.length || new Set(files.map(f => f.path)).size !== files.length) throw new Error('Empty or duplicate archive listing');
  const result: Manifest = { schemaVersion: 1, repository, revision, createdAt: new Date().toISOString(), files };
  await writeFile(manifestPath + '.tmp', JSON.stringify(result, null, 2) + '\n');
  await rename(manifestPath + '.tmp', manifestPath);
  return result;
}
async function main() {
  await mkdir(directory, { recursive: true });
  const m = await manifest();
  const totalBytes = m.files.reduce((sum,f) => sum + f.bytes, 0);
  console.log(JSON.stringify({ revision: m.revision, monthlyFiles: m.files.length, bytes: totalBytes, directory }));
  if (process.argv.includes('--plan-only')) return;
  let index = 0, completed = 0, verifiedBytes = 0;
  const errors: { path: string; error: string }[] = [];
  const startedAt = new Date().toISOString();
  const heartbeat = setInterval(() => console.log(`Verified ${completed}/${m.files.length} monthly files · ${(verifiedBytes/1e9).toFixed(2)}/${(totalBytes/1e9).toFixed(2)} GB`), 30_000);
  try {
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (index < m.files.length) {
        const f = m.files[index++], destination = resolve(directory, f.path), partial = destination + '.part';
        try {
          await mkdir(dirname(destination), { recursive: true });
          const existing = await exists(destination);
          if (!existing || existing.size !== f.bytes || await checksum(destination) !== f.sha256) {
            if (existing) throw new Error('Existing final file differs from pinned manifest; inspect it before retrying');
            await new Promise<void>((resolve, reject) => {
              const child = spawn('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '4', '--retry-all-errors', '--retry-delay', '2', '--connect-timeout', '20', '--speed-limit', '1024', '--speed-time', '90', '--continue-at', '-', '--output', partial, `https://huggingface.co/datasets/${repository}/resolve/${m.revision}/${f.path}?download=true`], { stdio: ['ignore', 'ignore', 'pipe'] });
              let stderr = '';
              // URLs in curl errors may contain temporary signed query strings: do not print them.
              child.stderr.on('data', chunk => { stderr += String(chunk); });
              child.on('error', reject);
              child.on('exit', code => code === 0 ? resolve() : reject(new Error(`curl exited ${code}; ${stderr.includes('403') ? 'server returned 403' : stderr.includes('429') ? 'server throttled request' : 'network/download failure'}`)));
            });
            if ((await stat(partial)).size !== f.bytes || await checksum(partial) !== f.sha256) throw new Error('Downloaded size or SHA-256 mismatch; partial retained for inspection');
            await rename(partial, destination);
          }
          completed++; verifiedBytes += f.bytes;
          console.log(`[${completed}/${m.files.length}] ${f.path} verified`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push({ path: f.path, error: message });
          console.error(`${f.path}: ${message}`);
        }
      }
    }));
  } finally { clearInterval(heartbeat); }
  const report = { revision: m.revision, startedAt, finishedAt: new Date().toISOString(), expectedFiles: m.files.length, verifiedFiles: completed, expectedBytes: totalBytes, verifiedBytes, errors };
  await writeFile(resolve(directory, 'download-report.json.tmp'), JSON.stringify(report, null, 2) + '\n');
  await rename(resolve(directory, 'download-report.json.tmp'), resolve(directory, 'download-report.json'));
  console.log(JSON.stringify(report));
  if (errors.length) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
