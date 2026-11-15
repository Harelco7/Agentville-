/**
 * Serves the Vercel build (.vercel/output) locally, the way Vercel would: static files plus the /api functions.
 * Needs DATABASE_URL (any Postgres) and optionally GEMINI_API_KEY. Port: PORT or 3000.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.vercel/output');
const require = createRequire(import.meta.url);
for (const file of ['.env']) if (existsSync(join(root, file))) process.loadEnvFile(join(root, file));

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream' };
const fns = {};

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const fn = url.pathname.match(/^\/api\/(\w+)$/)?.[1];
  if (fn) {
    const dir = join(out, 'functions/api', `${fn}.func`);
    if (!existsSync(dir)) return res.writeHead(404).end();
    fns[fn] ??= require(join(dir, 'index.js'));
    return fns[fn](req, res);
  }
  let file = join(out, 'static', normalize(decodeURIComponent(url.pathname)));
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(out, 'static/index.html');
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(Number(process.env.PORT || 3000), () => console.log(`Vercel build served on http://localhost:${process.env.PORT || 3000}`));
