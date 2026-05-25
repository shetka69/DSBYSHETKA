import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mime from 'mime-types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const apiDir = path.join(__dirname, 'api');
const port = Number(process.env.PORT || process.env.AMVERA_PORT || 8080);

const apiRoutes = new Map([
  ['/api/account', 'account.js'],
  ['/api/friends', 'friends.js'],
  ['/api/login', 'login.js'],
  ['/api/me', 'me.js'],
  ['/api/messages', 'messages.js'],
  ['/api/presence', 'presence.js'],
  ['/api/push-config', 'push-config.js'],
  ['/api/push-subscribe', 'push-subscribe.js'],
  ['/api/register', 'register.js']
]);

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(JSON.stringify(data));
}

async function handleApi(req, res, url) {
  const routeFile = apiRoutes.get(url.pathname);
  if (!routeFile) {
    sendJson(res, 404, { error: 'API route not found' });
    return;
  }

  req.query = Object.fromEntries(url.searchParams.entries());
  const moduleUrl = pathToFileURL(path.join(apiDir, routeFile)).href;
  const mod = await import(moduleUrl);
  await mod.default(req, res);
}

async function serveFile(res, filePath) {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) return false;

  res.statusCode = 200;
  res.setHeader('Content-Type', mime.lookup(filePath) || 'application/octet-stream');
  res.setHeader('Cache-Control', filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
  createReadStream(filePath).pipe(res);
  return true;
}

async function handleStatic(req, res, url) {
  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const requestedPath = path.join(distDir, safePath === '/' ? 'index.html' : safePath);

  try {
    if (await serveFile(res, requestedPath)) return;
  } catch {
    // Fall through to SPA index.
  }

  try {
    const indexHtml = await readFile(path.join(distDir, 'index.html'));
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(indexHtml);
  } catch {
    res.statusCode = 500;
    res.end('Build output not found. Run npm run build first.');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    await handleStatic(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`DSBYSHETKA server listening on ${port}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down`);
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
