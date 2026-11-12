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

// 1. Start NestJS API on internal port 4000
const apiProc = spawn('node', [apiEntry], {
  cwd: rootDir,
  env: { ...process.env, PORT: String(API_PORT), API_PORT: String(API_PORT) },
  stdio: 'inherit',
});

// 2. Start Next.js Web on internal port 3001
const webProc = spawn('npx', ['next', 'start', '-p', String(WEB_PORT), '-H', '127.0.0.1'], {
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

