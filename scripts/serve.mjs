// The demo: serves this folder at http://localhost:5173 and a mock Storefront API at /mock-api/storefront/v1.
// A checkout opened in the demo is paid after 8 polls (about 16 s), or at once from the hosted pay page.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockApi } from '../test/mock/mock-api.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 5173;
const api = createMockApi({ payAfterPolls: 8 });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.map': 'application/json', '.svg': 'image/svg+xml', '.css': 'text/css' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname.startsWith('/mock-api/')) {
    if (url.pathname === '/mock-api/pay') {
      api.payAll();
      return void res.writeHead(204).end();
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    const answer = api.handle({ method: req.method, path: url.pathname, headers: req.headers, body: body ? JSON.parse(body) : undefined });
    res.writeHead(answer.status, answer.headers);
    return void res.end(answer.body == null ? undefined : JSON.stringify(answer.body));
  }
  if (url.pathname === '/') return void res.writeHead(302, { Location: '/demo/' }).end();
  const path = normalize(join(root, decodeURIComponent(url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname)));
  if (!path.startsWith(root) || path.includes('node_modules')) return void res.writeHead(404).end();
  try {
    const file = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(file);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Demo: http://localhost:${port}/demo/`));
