import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { build } from 'vite';
import './prepare-data.ts';
import { validatePublished } from './pipeline-core.ts';
const data = validatePublished(JSON.parse(await readFile('data/places.json', 'utf8')));
await build();
const html = await readFile('dist/index.html', 'utf8');
for (const path of ['places', 'saved', 'about', 'credits', ...data.places.map(p => `places/${p.id}`)]) {
  await mkdir(`dist/${path}`, { recursive: true });
  await writeFile(`dist/${path}/index.html`, html);
}
await writeFile('dist/404.html', html);
console.log(`Built React + Tailwind site: ${data.places.length} reviewed places, ${data.places.length + 6} deep-link routes.`);
