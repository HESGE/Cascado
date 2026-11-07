import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve(process.argv.includes('--dist') ? 'dist' : '.');
const port = Number(process.env.PORT || 4173);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.wav':'audio/wav', '.mp3':'audio/mpeg', '.txt':'text/plain; charset=utf-8' };

function sendAudio(req, res, file, size, headers) {
  headers['Accept-Ranges'] = 'bytes';
  const range = req.method === 'GET' && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    if (range[1] && range[2]) end = Math.min(end, Number(range[2]));
    if (start > end) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` });
      res.end();
      return;
    }
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    status = 206;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || size === 0) {
    res.end();
    return;
  }
  const stream = createReadStream(file, { start, end });
  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = resolve(root, '.' + pathname);
    if (!file.startsWith(root + sep) && file !== root) throw new Error('Forbidden');
    if (pathname.split('/').some(part => part.startsWith('.')) || (!process.argv.includes('--dist') && /^\/(docs|tmp|tests|scripts|output)\//.test(pathname))) {
      res.writeHead(404); res.end(); return;
    }
    let info = await stat(file);
    if (info.isDirectory()) {
      file = resolve(file, 'index.html');
      info = await stat(file);
    }
    const extension = extname(file);
    const headers = { 'Content-Type': types[extension] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options':'nosniff' };
    if (extension === '.mp3') {
      sendAudio(req, res, file, info.size, headers);
      return;
    }
    const bytes = await readFile(file);
    res.writeHead(200, headers);
    res.end(bytes);
  } catch {
    res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }); res.end('Ressource introuvable.');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Cascado · http://127.0.0.1:${port}`));
