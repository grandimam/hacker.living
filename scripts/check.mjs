import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { validatePublished } from './pipeline-core.mjs';
const data = JSON.parse(await readFile('data/places.json', 'utf8'));
validatePublished(data);
for (const p of data.places) if (p.image) { await access(`public${p.image.path}`); if (!p.image.author || !p.image.license || !p.image.sourceUrl || !p.image.licenseUrl) throw new Error(`Missing photo attribution for ${p.id}`); }
for (const file of ['shared/domain.mjs', 'scripts/pipeline.mjs', 'scripts/pipeline-core.mjs']) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`Checks passed: ${data.places.length} reviewed places, photo credits, pipeline syntax.`);
