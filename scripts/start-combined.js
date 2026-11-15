const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const PUBLIC_PORT = parseInt(process.env.PORT || '3000', 10);
const API_PORT = 4000;
const WEB_PORT = 3001;

const rootDir = path.resolve(__dirname, '..');

console.log(`Starting NOOR CLOUD combined server (Public: ${PUBLIC_PORT}, API: ${API_PORT}, Web: ${WEB_PORT})...`);

const fs = require('fs');
const apiEntry = fs.existsSync(path.join(rootDir, 'apps/api/dist/src/main.js'))
  ? 'apps/api/dist/src/main.js'
  : 'apps/api/dist/main.js';

// Render Free Tier 512MB RAM Optimization:
// 1. Start NestJS API with strict 180MB heap limit and exposed GC
const apiProc = spawn('node', ['--max-old-space-size=180', '--expose-gc', apiEntry], {
  cwd: rootDir,
  env: { ...process.env, PORT: String(API_PORT), API_PORT: String(API_PORT) },
  stdio: 'inherit',
});

// 2. Start Next.js Web on internal port 3001 (direct node without npx wrapper to save 30MB)
const nextBin = [
  path.join(rootDir, 'apps/web/node_modules/next/dist/bin/next'),
  path.join(rootDir, 'node_modules/next/dist/bin/next'),
].find((p) => fs.existsSync(p));

const webArgs = nextBin
  ? ['--max-old-space-size=160', nextBin, 'start', '-p', String(WEB_PORT), '-H', '127.0.0.1']
  : ['next', 'start', '-p', String(WEB_PORT), '-H', '127.0.0.1'];

const webCmd = nextBin ? 'node' : 'npx';

const webProc = spawn(webCmd, webArgs, {
  cwd: path.join(rootDir, 'apps/web'),
  env: { ...process.env, PORT: String(WEB_PORT) },
  stdio: 'inherit',
});

function proxyRequest(req, res, targetPort) {
  const options = {
    hostname: '127.0.0.1',
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Service starting, please refresh in a moment.', error: err.message }));
    }
  });

  // Cleanup immediately if client closes connection (e.g. video scrub/pause, abort)
  res.on('close', () => {
    if (!res.writableEnded) {
      proxyReq.destroy();
    }
  });

  req.on('aborted', () => {
    proxyReq.destroy();
  });

  req.on('error', () => {
    proxyReq.destroy();
  });

  req.pipe(proxyReq, { end: true });
}

// 3. Single public HTTP router on Render's $PORT
const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith('/api')) {
    proxyRequest(req, res, API_PORT);
  } else {
    proxyRequest(req, res, WEB_PORT);
  }
});

server.listen(PUBLIC_PORT, '0.0.0.0', () => {
  console.log(`NOOR CLOUD listening on http://0.0.0.0:${PUBLIC_PORT}`);
});

function shutdown() {
  apiProc.kill();
  webProc.kill();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

