import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { build } from 'vite';
import './prepare-data.mjs';
import { validatePublished } from './pipeline-core.mjs';
const data = JSON.parse(await readFile('data/places.json', 'utf8'));
validatePublished(data);
await build();
const html = await readFile('dist/index.html', 'utf8');
for (const path of ['places', 'saved', 'about', 'fonts', 'playgrounds', 'credits', ...data.places.map(p => `places/${p.id}`)]) {
  await mkdir(`dist/${path}`, { recursive: true });
  await writeFile(`dist/${path}/index.html`, html);
}
await writeFile('dist/404.html', html);
console.log(`Built React + Tailwind site: ${data.places.length} reviewed places, ${data.places.length + 6} deep-link routes.`);
