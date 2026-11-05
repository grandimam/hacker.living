import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { build } from 'vite';
// Catalog data comes from PostgreSQL at runtime, never from the build context.
await build();
const html = await readFile('dist/index.html', 'utf8');
const routes=['places','saved','about','credits','pipeline','pipeline/fonts','fonts'];
for(const path of routes){
 await mkdir(`dist/${path}`,{recursive:true});
 await writeFile(`dist/${path}/index.html`,html);
}
await writeFile('dist/404.html',html);
console.log(`Built React + Tailwind site with ${routes.length+2} entry routes; place details use the server SPA fallback.`);
