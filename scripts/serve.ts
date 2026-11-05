import http from 'node:http';
import { closeDatabase } from '../server/db/connection.ts';
import { handleApi } from '../server/api.ts';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('dist');
const port = Number(process.env.PORT || 4317);
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  try {
    if (await handleApi(request,response)) return;
    const url = new URL(request.url || '/', 'http://localhost');
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { response.writeHead(400).end('Bad request'); return; }
    let path = resolve(root, '.' + pathname);
    if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403).end('Forbidden'); return; }
    try { if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html'); }
    catch { if (!extname(path)) path = resolve(root, 'index.html'); }
    const body = await readFile(path);
    response.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream', 'referrer-policy': 'strict-origin-when-cross-origin', 'cache-control': 'no-cache' });
    response.end(body);
  } catch { response.writeHead(404).end('Not found'); }
});
const host=process.env.HOST||'127.0.0.1';
server.listen(port,host,()=>console.log(`hacker.living ready on ${host}:${port}`));
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{
 const timeout=setTimeout(()=>process.exit(1),10000);timeout.unref();
 server.close(()=>{void closeDatabase().then(()=>{clearTimeout(timeout);process.exit(0);}).catch(()=>process.exit(1));});
 server.closeIdleConnections();
});
