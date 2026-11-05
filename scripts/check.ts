import { readFile, access } from 'node:fs/promises';
import { validatePublished } from './pipeline-core.ts';
const data = validatePublished(JSON.parse(await readFile('data/places.json', 'utf8')));
for (const p of data.places) if (p.image) { await access(`public${p.image.path}`); if (!p.image.author || !p.image.license || !p.image.sourceUrl || !p.image.licenseUrl) throw new Error(`Missing photo attribution for ${p.id}`); }
console.log(`Checks passed: ${data.places.length} reviewed places, photo credits, and shared schemas.`);
