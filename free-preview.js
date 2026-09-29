import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve('free-site');
const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 配置无效');
const requestedHost = process.env.HOST ?? '127.0.0.1';
const allowLan = process.env.ALLOW_LAN === 'true';
const host = requestedHost === '127.0.0.1'
  ? requestedHost
  : allowLan && requestedHost === '0.0.0.0'
    ? requestedHost
    : (() => { throw new Error('局域网监听必须显式设置 ALLOW_LAN=true，且 HOST 只能为 0.0.0.0'); })();
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'], ['.svg', 'image/svg+xml']
]);

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  const relativePath = normalize(pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
  const candidate = resolve(join(root, relativePath));
  return candidate === root || candidate.startsWith(root + sep) ? candidate : null;
}

createServer(async (request, response) => {
  let filePath;
  try { filePath = resolveRequestPath(request.url ?? '/'); } catch { response.writeHead(400).end('Bad Request'); return; }
  if (!filePath) { response.writeHead(403).end('Forbidden'); return; }
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
    response.writeHead(200, {
      'content-type': mimeTypes.get(extname(filePath)) ?? 'application/octet-stream',
      'cache-control': filePath.endsWith('policies.json') ? 'no-store' : 'no-cache',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not Found');
  }
}).listen(port, host, () => console.log('免费手机网页版已监听：' + host + ':' + port));
