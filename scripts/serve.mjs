import {createServer} from 'node:http';
import {readFile, realpath, stat} from 'node:fs/promises';
import {dirname, extname, join, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mimeTypes = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
const inside = (path, root) => path === root || path.startsWith(root + sep);

export function createStaticServer({directory = join(projectRoot, 'dist')} = {}) {
  const rootPromise = realpath(directory);
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    const fail = (status, message) => {
      response.writeHead(status, {'Content-Type':'text/plain; charset=utf-8'});
      response.end(request.method === 'HEAD' ? undefined : message + '\n');
    };
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      return fail(405, 'Method not allowed');
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { return fail(400, 'Malformed URL'); }
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part === '..')) return fail(400, 'Invalid path');
    try {
      const root = await rootPromise;
      let candidate = resolve(root, '.' + pathname);
      if (!inside(candidate, root)) return fail(403, 'Forbidden');
      if ((await stat(candidate)).isDirectory()) candidate = join(candidate, 'index.html');
      const path = await realpath(candidate);
      if (!inside(path, root)) return fail(403, 'Forbidden');
      if (!(await stat(path)).isFile()) return fail(404, 'Not found');
      const content = await readFile(path);
      response.writeHead(200, {'Content-Type':mimeTypes[extname(path)] || 'application/octet-stream','Content-Length':content.length});
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      fail(['ENOENT','ENOTDIR'].includes(error.code) ? 404 : 500, ['ENOENT','ENOTDIR'].includes(error.code) ? 'Not found' : 'Unable to serve file');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError('PORT must be an integer from 1 to 65535.');
  const server = createStaticServer();
  server.on('error', error => {console.error(error.message); process.exitCode = 1;});
  server.listen(port, '127.0.0.1', () => console.log(`Noether Local: http://127.0.0.1:${port}`));
}
