'use strict';

// Local-only architecture probe: load a disposable copy of the extension against local HTML
// fixtures to verify multiple profiles, route changes, missing selectors, an invalid profile and
// an unknown domain. Nothing here touches the production manifest or profiles.
//
// Usage: node scripts/browser/second-profile.js [--port=9333]
// Fixtures stay in __development/experiments/second-profile (gitignored).

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {
  connect, loadExtension, waitForServiceWorker, openPage, waitFor
} = require('./session');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, '__development', 'experiments', 'second-profile');
const EXT = path.join(OUT, 'extension');
const SITE = path.join(OUT, 'site');
const PORT = 8765;
const results = { checks: [], pages: [], profiles: null, screenshots: [] };

function check(name, passed, detail) {
  results.checks.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function writeFixture(file, body, extra = '') {
  fs.writeFileSync(path.join(SITE, file), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${file}</title><style>${extra}</style></head><body><h1>${file}</h1><div class="a-ad">A ad</div><div class="b-ad">B ad</div><main class="content">Fixture content</main></body></html>`);
}

async function buildExtension() {
  fs.rmSync(EXT, { recursive: true, force: true });
  fs.rmSync(SITE, { recursive: true, force: true });
  fs.mkdirSync(EXT, { recursive: true });
  fs.mkdirSync(SITE, { recursive: true });
  fs.mkdirSync(path.join(EXT, 'src'), { recursive: true });
  fs.mkdirSync(path.join(EXT, 'profiles'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'src'), path.join(EXT, 'src'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'icons'), path.join(EXT, 'icons'), { recursive: true });

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  manifest.name = 'WebTimize Live Fixture';
  manifest.host_permissions = ['http://127.0.0.1/*', 'http://127.0.0.2/*'];
  manifest.content_scripts[0].matches = ['http://127.0.0.1/*', 'http://127.0.0.2/*'];
  fs.writeFileSync(path.join(EXT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles', 'coolmathgames.com.json'), 'utf8'));
  const profile = (id, name, domain, selectors) => ({
    ...base,
    id,
    name,
    domain: undefined,
    domains: [domain],
    selectors: { hide: selectors },
    styles: { cleanup: [], layout: [] },
    version: '1.0.0',
    compatibility: { testedAt: '2026-11-06', testedViewports: ['1440x900'], notes: 'Local fixture only.' }
  });
  fs.writeFileSync(path.join(EXT, 'profiles', 'fixture-a.json'), `${JSON.stringify(profile('fixture-a', 'Fixture A', '127.0.0.1', ['.a-ad', '.missing-element']), null, 2)}\n`);
  fs.writeFileSync(path.join(EXT, 'profiles', 'fixture-b.json'), `${JSON.stringify(profile('fixture-b', 'Fixture B', '127.0.0.2', ['.b-ad']), null, 2)}\n`);
  const invalid = profile('fixture-invalid', 'Fixture Invalid', '127.0.0.3', [':root']);
  fs.writeFileSync(path.join(EXT, 'profiles', 'fixture-invalid.json'), `${JSON.stringify(invalid, null, 2)}\n`);
  fs.writeFileSync(path.join(EXT, 'profiles', 'index.json'), `${JSON.stringify({
    schemaVersion: 1,
    profiles: [
      { domain: '127.0.0.1', file: 'fixture-a.json' },
      { domain: '127.0.0.2', file: 'fixture-b.json' },
      { domain: '127.0.0.3', file: 'fixture-invalid.json' }
    ]
  }, null, 2)}\n`);

  writeFixture('a.html', 'A page');
  writeFixture('b.html', 'B page');
  writeFixture('plain.html', 'Plain page');
}

async function pageState(page) {
  return page.evaluate(`(() => {
    const get = (selector) => { const el = document.querySelector(selector); return el ? getComputedStyle(el).display : 'missing'; };
    const style = document.getElementById('webtim-live-style');
    return {
      url: location.href,
      host: location.hostname,
      style: Boolean(style),
      styleChars: style ? style.textContent.length : 0,
      styleCount: document.querySelectorAll('#webtim-live-style').length,
      flag: document.documentElement.getAttribute('data-webtim-live'),
      aAd: get('.a-ad'),
      bAd: get('.b-ad'),
      h1: document.querySelector('h1')?.textContent
    };
  })()`);
}

async function main() {
  buildExtension();
  const server = http.createServer((request, response) => {
    const name = (request.url || '/').split('?')[0].replace(/^\/+/, '') || 'a.html';
    const file = path.join(SITE, name);
    if (!file.startsWith(SITE) || !fs.existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '::', resolve);
  });

  const port = Number(process.argv.find((item) => item.startsWith('--port='))?.slice(7) || 9333);
  const { browser, info } = await connect(port);
  results.chrome = info.Browser;
  const extensionId = await loadExtension(browser, EXT);
  const popup = await openPage(browser, `chrome-extension://${extensionId}/src/popup/popup.html`, { width: 420, height: 700 });
  await waitForServiceWorker(browser, extensionId);
  await popup.evaluate(`chrome.storage.sync.set({webtimSettings:{schemaVersion:2,enabled:true,features:{cleanup:true,layout:true,network:false},sites:{},exceptions:[]}})`);

  const listed = await popup.evaluate(`new Promise((resolve) => chrome.runtime.sendMessage({type:'webtim:list-profiles'}, resolve))`);
  results.profiles = listed;
  check('fixture: valid profiles load and invalid profile is skipped', listed?.profiles?.length === 2 && listed.profiles.every((item) => item.id !== 'fixture-invalid'), `${listed?.profiles?.map((item) => item.id).join(', ')}`);

  const a = await openPage(browser, `http://127.0.0.1:${PORT}/a.html`, { width: 1440, height: 900 });
  await waitFor(async () => (await pageState(a)).style, { timeout: 15000, label: 'fixture A style' });
  const aState = await pageState(a);
  results.pages.push(aState);
  check('fixture A: profile A applies to 127.0.0.1', aState.style && aState.flag === 'on', `style=${aState.styleChars}`);
  check('fixture A: A selector hides its own target', aState.aAd === 'none', aState.aAd);
  check('fixture A: selector from another profile does not apply', aState.bAd !== 'none', aState.bAd);
  check('fixture A: missing selector does not prevent the profile', aState.styleCount === 1, `styles=${aState.styleCount}`);
  await a.screenshot(path.join(OUT, 'fixture-a.png'));
  results.screenshots.push('__development/experiments/second-profile/fixture-a.png');

  await a.evaluate(`history.pushState({}, '', '/a.html?route=second')`);
  const routeState = await pageState(a);
  check('fixture A: a second route keeps exactly one stylesheet', routeState.styleCount === 1 && routeState.aAd === 'none', `${routeState.styleCount} styles`);

  const inserted = await a.evaluate(`(() => { const el = document.createElement('div'); el.className = 'a-ad'; el.textContent = 'late'; document.body.appendChild(el); return getComputedStyle(el).display; })()`);
  check('fixture A: dynamically inserted target is hidden', inserted === 'none', inserted);

  await popup.evaluate(`chrome.storage.sync.set({webtimSettings:{schemaVersion:2,enabled:true,features:{cleanup:true,layout:true,network:false},sites:{'127.0.0.1':{cleanup:false}},exceptions:[]}})`);
  const off = await waitFor(async () => {
    const state = await pageState(a);
    return state.aAd !== 'none' ? state : null;
  }, { timeout: 10000, label: 'fixture A cleanup override' });
  check('fixture A: per-site cleanup override restores the target', off.aAd !== 'none', off.aAd);

  const b = await openPage(browser, `http://127.0.0.2:${PORT}/b.html`, { width: 1440, height: 900 });
  await waitFor(async () => (await pageState(b)).style, { timeout: 15000, label: 'fixture B style' });
  const bState = await pageState(b);
  results.pages.push(bState);
  check('fixture B: profile B applies to localhost', bState.style && bState.bAd === 'none', `style=${bState.styleChars}`);
  check('fixture B: A selector does not leak across hostnames', bState.aAd !== 'none', bState.aAd);
  await b.screenshot(path.join(OUT, 'fixture-b.png'));
  results.screenshots.push('__development/experiments/second-profile/fixture-b.png');

  const unknown = await openPage(browser, `http://127.0.0.9:${PORT}/a.html`, { width: 1440, height: 900 });
  await unknown.settle(2000);
  const unknownState = await pageState(unknown);
  check('unknown domain: no content script and no stylesheet', !unknownState.style, `style=${unknownState.style}, url=${unknownState.url}`);

  b.close(); a.close(); unknown.close(); popup.close(); server.close(); browser.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), `${JSON.stringify({ ...results, finishedAt: new Date().toISOString() }, null, 2)}\n`);
  const failed = results.checks.filter((item) => !item.passed);
  console.log(`\n${failed.length ? 'FIXTURE FAILED' : 'FIXTURE PASSED'} — ${results.checks.length} checks, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(2); });
