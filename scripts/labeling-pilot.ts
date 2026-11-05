import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { CodexLabeler } from './codex-labeler.ts';
import { parseCandidateQueue } from './pipeline-data.ts';
import { hash, promptVersion, sampleCandidates, parseLabels, labelingPrompt, labelSchema, summarize } from './labeling-core.ts';
import type { Label } from './labeling-core.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'data/labeling-pilot');
async function write(name: string, value: unknown) {
  const path = resolve(output, name);
  await writeFile(path + '.tmp', JSON.stringify(value, null, 2) + '\n');
  await rename(path + '.tmp', path);
}
async function main() {
  const raw = await readFile(resolve(root, 'data/candidates.json'), 'utf8');
  const queue = parseCandidateQueue(JSON.parse(raw));
  const sample = sampleCandidates(queue.candidates, 150, 'hacker-living-pilot-2026-11-v1', hash(raw));
  await mkdir(output, { recursive: true });
  await write('sample.json', sample);
  if (process.argv.includes('--prepare-only')) { console.log(JSON.stringify({ population: sample.population, strata: sample.strata })); return; }
  const client = new CodexLabeler();
  const labels: Label[] = [], batches: unknown[] = [];
  try {
    await client.initialize();
    console.log('Connected to existing Codex app server');
    if (process.argv.includes('--probe')) return;
    for (let offset = 0; offset < sample.entries.length; offset += 15) {
      const candidates = sample.entries.slice(offset, offset + 15).map(e => e.candidate);
      const prompt = labelingPrompt(candidates), sourceHash = hash(promptVersion + prompt + JSON.stringify(labelSchema));
      const name = `batch-${String(offset / 15 + 1).padStart(2, '0')}.json`;
      let result: { sourceHash: string; model: string; usage: unknown; text: string };
      try {
        result = JSON.parse(await readFile(resolve(output, name), 'utf8'));
        if (result.sourceHash !== sourceHash) throw new Error('Stale batch');
        parseLabels(JSON.parse(result.text), candidates);
        console.log(`Reusing ${name}`);
      } catch {
        const classified = await client.classify(prompt, labelSchema, root);
        result = { sourceHash, ...classified };
        // Keep raw output even if validation fails. Rerun retries invalid batches.
        await write(name, { ...result, promptVersion, finishedAt: new Date().toISOString() });
      }
      labels.push(...parseLabels(JSON.parse(result.text), candidates));
      batches.push({ file: name, model: result.model, usage: result.usage });
      console.log(`Validated ${labels.length}/${sample.entries.length} comments`);
    }
    const usageSummary = { batchesWithUsage: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 };
    for (const batch of batches) {
      const usage = (batch as { usage?: { total?: Record<string, unknown> } }).usage?.total;
      if (usage && ['inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens'].every(key => typeof usage[key] === 'number')) {
        usageSummary.batchesWithUsage++;
        for (const key of ['inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens'] as const) usageSummary[key] += usage[key] as number;
      }
    }
    const report = { usageSummary, generatedAt: new Date().toISOString(), promptVersion, queueHash: sample.queueHash, ...summarize(sample, labels), batches };
    await write('labels.json', { labels });
    await write('report.json', report);
    console.log(JSON.stringify({ sampled: report.sampled, usefulComments: report.usefulComments, weightedYield: report.weightedYield, projectedUsefulComments: report.projectedUsefulComments, preliminaryNamedEntities: report.preliminaryNamedEntities.length, usageSummary, report: resolve(output, 'report.json') }));
  } finally { client.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
