import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { validatePublished } from './pipeline-core.ts';
const source = await readFile('data/places.json', 'utf8');
validatePublished(JSON.parse(source));
await mkdir('public', {recursive:true});
await writeFile('public/places.json', source);
