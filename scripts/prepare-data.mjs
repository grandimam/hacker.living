import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { validatePublished } from './pipeline-core.mjs';
const data = JSON.parse(await readFile('data/places.json', 'utf8'));
validatePublished(data);
await mkdir('public', {recursive:true});
await writeFile('public/places.json', JSON.stringify(data, null, 2) + '\n');
