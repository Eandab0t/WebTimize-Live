'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TEST_DOMAIN = '127.0.0.1';

function prepareTestExtension(source, target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
  const manifestPath = path.join(target, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.host_permissions.includes('http://127.0.0.1/*')) {
    manifest.host_permissions.push('http://127.0.0.1/*');
  }
  for (const script of manifest.content_scripts) {
    if (!script.matches.includes('http://127.0.0.1/*')) script.matches.push('http://127.0.0.1/*');
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const profile = {
    schemaVersion: 1,
    id: 'local-fixture',
    name: 'Local Fixture',
    version: '1.0.0',
    updated: '2026-11-07',
    domains: [TEST_DOMAIN],
    features: { cleanup: true, layout: true, network: true },
    selectors: { hide: ['.ad-slot'] },
    styles: { cleanup: [], layout: ['.content { max-width: none !important; }'] },
    networkRules: [{ urlFilter: 'ad.js', resourceTypes: ['script'] }],
    compatibility: { testedAt: '2026-11-07', testedViewports: ['360x700'], notes: 'Local browser harness.' }
  };
  fs.writeFileSync(path.join(target, 'profiles', 'local-fixture.json'), `${JSON.stringify(profile, null, 2)}\n`);
  fs.writeFileSync(path.join(target, 'profiles', 'index.json'), `${JSON.stringify({
    schemaVersion: 1,
    profiles: [{ domain: TEST_DOMAIN, file: 'local-fixture.json' }]
  }, null, 2)}\n`);
  return target;
}

function startFixture() {
  const http = require('node:http');
  const server = http.createServer((request, response) => {
    if (request.url.startsWith('/ad.js')) {
      response.writeHead(200, { 'content-type': 'text/javascript' });
      response.end('window.__adLoaded = true;\n');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Live fixture</title>
<style>body{margin:0;font:16px/1.5 system-ui;background:#f4f1ea;color:#2a1d15}.content{max-width:760px;margin:40px auto;padding:24px;background:#fffdf8;border:2px solid #2a1d15}.ad-slot{height:80px;background:#ddd;display:grid;place-items:center}</style></head>
<body><main class="content"><h1>Controlled fixture</h1><div class="ad-slot">Ad placeholder</div><p>Navigation, content and controls stay visible.</p><a href="/next">Next page</a></main>
<script src="/ad.js"></script></body></html>`);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port, url: `http://127.0.0.1:${port}/` });
    });
  });
}

module.exports = { TEST_DOMAIN, prepareTestExtension, startFixture };
