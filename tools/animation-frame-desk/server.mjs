import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { decodeSource, exportProject, limits } from './lib/animation.mjs';

const root = new URL('./', import.meta.url);
const port = Number(process.env.PORT || 4317);
const maxBody = 36 * 1024 * 1024;
let busy = false;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.webp': 'image/webp' };
const staticPaths = new Map([['/', 'public/index.html'], ['/app.js', 'public/app.js'], ['/style.css', 'public/style.css'], ['/sample.json', 'samples/provenance.json'], ['/demo.webp', 'samples/animation.webp'], ['/demo.html', 'samples/playback.html']]);
for (let i = 1; i <= 16; i++) staticPaths.set(`/sample/${i}.png`, `samples/frames/${String(i).padStart(2, '0')}.png`);
async function body(req) {
  const pieces = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > maxBody) throw new Error('Request exceeds 36 MiB'); pieces.push(part); }
  return JSON.parse(Buffer.concat(pieces).toString('utf8'));
}
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); }
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'");
  try {
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host)) return json(res, 403, { error: 'Use the localhost launch URL' });
    const path = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
    if (req.method === 'GET' && staticPaths.has(path)) {
      const file = staticPaths.get(path), ext = file.slice(file.lastIndexOf('.'));
      const content = await readFile(new URL(file, root));
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' }); return res.end(content);
    }
    if (req.method === 'GET' && path === '/api/health') return json(res, 200, { ok: true, limits });
    if (req.method !== 'POST' || !['/api/inspect', '/api/export'].includes(path)) return json(res, 404, { error: 'Not found' });
    if (req.headers.origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin)) return json(res, 403, { error: 'Cross-origin requests are not allowed' });
    if (req.headers['content-type'] !== 'application/json') return json(res, 415, { error: 'Use application/json' });
    if (busy) return json(res, 409, { error: 'Another image operation is running. Try again shortly.' });
    busy = true;
    try {
      const input = await body(req);
      if (path === '/api/inspect') {
        if (typeof input.data !== 'string' || input.data.length > Math.ceil(limits.sourceBytes / 3) * 4) throw new Error('Source exceeds 8 MiB');
        const decoded = await decodeSource(Buffer.from(input.data, 'base64'));
        return json(res, 200, { hash: decoded.sourceHash, width: decoded.width, height: decoded.height, preview: decoded.png.toString('base64'), orientation: decoded.orientation, color: decoded.profile });
      }
      const result = await exportProject(input);
      json(res, 200, { webp: result.webp.toString('base64'), specimen: result.specimen.toString('base64'), manifest: result.manifest });
    } finally { busy = false; }
  } catch (err) { json(res, 400, { error: err.message || 'Image operation failed' }); }
});
server.requestTimeout = 120000;
server.listen(port, '127.0.0.1', () => console.log(`Animation Frame Desk: http://127.0.0.1:${port}\nLocal files stay on this machine. Press Ctrl+C to stop.`));
export { server };
