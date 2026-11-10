'use strict';

const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { connect, loadExtension, waitForServiceWorker, openPage, waitFor } = require('./session');
const { getJson } = require('./cdp');
const { build } = require('../build-extensions');
const { prepareTestExtension, startFixture, TEST_DOMAIN } = require('./test-extension');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, '__development', 'experiments', 'popup-check');
const CHROME = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].find((file) => file && fs.existsSync(file));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForChrome(port) {
  return waitFor(() => getJson(`http://127.0.0.1:${port}/json/version`), {
    timeout: 20000,
    label: 'Chrome DevTools endpoint'
  });
}

async function serviceWorkerValue(browser, targetId, expression) {
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  try {
    await browser.send('Runtime.enable', {}, sessionId).catch(() => {});
    const result = await browser.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  } finally {
    browser.send('Target.detachFromTarget', { sessionId }).catch(() => {});
  }
}

async function setSettings(browser, worker, settings) {
  await serviceWorkerValue(browser, worker.targetId, `chrome.storage.sync.set({ webtimSettings: ${JSON.stringify(settings)} })`);
}

async function settingsFor(browser, worker) {
  return serviceWorkerValue(browser, worker.targetId, `chrome.storage.sync.get('webtimSettings').then((v) => v.webtimSettings)`);
}

async function resumePopup(popup) {
  await popup.navigate(popup.url);
  await waitFor(() => popup.evaluate(`document.querySelector('#siteName')?.textContent || ''`).catch(() => ''), {
    timeout: 10000,
    label: 'popup to render'
  });
}

async function main() {
  if (!CHROME) throw new Error('Google Chrome was not found');
  fs.mkdirSync(OUT, { recursive: true });
  fs.rmSync(path.join(OUT, 'chrome-extension'), { recursive: true, force: true });
  build('chrome');
  prepareTestExtension(path.join(ROOT, 'dist', 'chrome'), path.join(OUT, 'chrome-extension'));

  const fixture = await startFixture();
  const port = await freePort();
  const profile = path.join(os.tmpdir(), `webtim-live-chrome-${Date.now()}`);
  const evidence = {
    browser: null,
    extension: { source: 'dist/chrome', id: null, version: null },
    fixture: fixture.url,
    checks: [],
    settings: {},
    console: [],
    failures: [],
    actionPopup: null
  };
  const check = (name, passed, detail) => {
    evidence.checks.push({ name, passed, detail });
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  };

  const child = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    '--enable-unsafe-extension-debugging',
    '--window-size=420,760',
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    const info = await waitForChrome(port);
    evidence.browser = { browser: info.Browser, protocolVersion: info['Protocol-Version'], userAgent: info['User-Agent'] };
    const { browser } = await connect(port);
    const extensionId = await loadExtension(browser, path.join(OUT, 'chrome-extension'));
    const worker = await waitForServiceWorker(browser, extensionId);
    evidence.extension.id = extensionId;
    evidence.extension.version = await serviceWorkerValue(browser, worker.targetId, `chrome.runtime.getManifest().version`);
    check('Chrome loads the generated Chrome build', Boolean(extensionId), `${extensionId} v${evidence.extension.version}`);

    const fixturePage = await openPage(browser, fixture.url, { width: 1200, height: 800 });
    await waitFor(() => fixturePage.evaluate(`document.querySelector('.ad-slot') && getComputedStyle(document.querySelector('.ad-slot')).display === 'none'`), {
      timeout: 10000,
      label: 'fixture stylesheet'
    });
    check('content script applies the profile on the controlled fixture', true);
    const layout = await fixturePage.evaluate(`getComputedStyle(document.querySelector('.content')).maxWidth`);
    check('layout rule changes the fixture', layout === 'none', `max-width=${layout}`);

    const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;
    const popup = await openPage(browser, popupUrl, { width: 360, height: 700, newWindow: true });
    popup.url = popupUrl;
    await browser.send('Target.activateTarget', { targetId: fixturePage.targetId });
    await resumePopup(popup);
    let siteName = await popup.evaluate(`document.querySelector('#siteName')?.textContent || ''`);
    check('popup identifies the active supported site', siteName === 'Local Fixture', siteName);
    await popup.screenshot(path.join(OUT, 'chrome-popup-inherited.png'), { fullPage: true });

    const inherited = await settingsFor(browser, worker);
    evidence.settings.inherited = inherited;
    await setSettings(browser, worker, { ...inherited, enabled: false });
    await waitFor(() => popup.evaluate(`document.querySelector('#globalState')?.textContent === 'Off'`), { timeout: 5000, label: 'popup global off' });
    await popup.screenshot(path.join(OUT, 'chrome-popup-disabled.png'), { fullPage: true });
    check('popup reflects a global setting change', true);

    await setSettings(browser, worker, { ...inherited, sites: { [TEST_DOMAIN]: { enabled: false } } });
    await waitFor(() => popup.evaluate(`document.querySelector('#siteStatus')?.textContent === 'Paused'`), { timeout: 5000, label: 'popup paused site' });
    await popup.screenshot(path.join(OUT, 'chrome-popup-site-paused.png'), { fullPage: true });
    const pausedStorage = await settingsFor(browser, worker);
    check('site pause remains a sparse override', JSON.stringify(pausedStorage.sites[TEST_DOMAIN]) === '{"enabled":false}', JSON.stringify(pausedStorage.sites));

    await popup.evaluate(`document.querySelector('#siteModeInherit').click()`);
    await waitFor(async () => (await settingsFor(browser, worker)).sites[TEST_DOMAIN] === undefined, { timeout: 5000, label: 'inherit write' });
    check('choosing inherit clears the site override', true);

    await popup.evaluate(`document.querySelector('#globalToggle').click()`);
    await waitFor(async () => (await settingsFor(browser, worker)).enabled === false, { timeout: 5000, label: 'global toggle write' });
    for (let index = 0; index < 3; index += 1) await popup.evaluate(`document.querySelector('#globalToggle').click()`);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const rapid = await settingsFor(browser, worker);
    check('rapid toggles end in one stored state', typeof rapid.enabled === 'boolean', String(rapid.enabled));

    const clean = { schemaVersion: 2, enabled: true, features: { cleanup: true, layout: true, network: false }, sites: {}, exceptions: [] };
    await setSettings(browser, worker, clean);
    await fixturePage.navigate(fixture.url);
    await fixturePage.settle(500);
    const beforeNetwork = await fixturePage.evaluate(`Boolean(window.__adLoaded)`);
    await setSettings(browser, worker, { ...clean, features: { cleanup: true, layout: true, network: true }, sites: { [TEST_DOMAIN]: { network: true } } });
    await new Promise((resolve) => setTimeout(resolve, 700));
    const rules = await serviceWorkerValue(browser, worker.targetId, `chrome.declarativeNetRequest.getDynamicRules()`);
    await fixturePage.navigate(fixture.url);
    await fixturePage.settle(500);
    const afterNetwork = await fixturePage.evaluate(`Boolean(window.__adLoaded)`);
    check('DNR rule is installed and blocks the fixture script', beforeNetwork === true && rules.length > 0 && afterNetwork === false, `before=${beforeNetwork}, rules=${rules.length}, after=${afterNetwork}`);

    await setSettings(browser, worker, { ...clean, sites: { [TEST_DOMAIN]: { enabled: false } } });
    const blank = await openPage(browser, 'about:blank', { width: 1200, height: 800 });
    await browser.send('Target.activateTarget', { targetId: blank.targetId });
    await resumePopup(popup);
    const unsupported = await popup.evaluate(`({ title: document.querySelector('#unsupportedTitle')?.textContent, cardHidden: document.querySelector('#unsupportedCard')?.hidden })`);
    check('popup handles an unsupported active page', unsupported.cardHidden === false && /not a website/i.test(unsupported.title || ''), JSON.stringify(unsupported));
    await popup.screenshot(path.join(OUT, 'chrome-popup-unsupported.png'), { fullPage: true });

    await browser.send('Target.activateTarget', { targetId: fixturePage.targetId });
    let actionPopup = null;
    try {
      await serviceWorkerValue(browser, worker.targetId, `chrome.action.openPopup()`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const targets = (await browser.send('Target.getTargets')).targetInfos.filter((item) => item.url === popupUrl);
      actionPopup = { opened: targets.length > 0, targets: targets.length };
    } catch (error) {
      actionPopup = { opened: false, error: error.message };
    }
    evidence.actionPopup = actionPopup;
    check('toolbar action popup can be opened through the action API', actionPopup.opened, JSON.stringify(actionPopup));

    const optionsUrl = `chrome-extension://${extensionId}/src/options/options.html`;
    const options = await openPage(browser, optionsUrl, { width: 1100, height: 1100 });
    await options.settle(500);
    await options.screenshot(path.join(OUT, 'chrome-options.png'), { fullPage: true });
    await options.setViewport(390, 844);
    await options.screenshot(path.join(OUT, 'chrome-options-390.png'), { fullPage: true });
    const optionsLayout = await options.evaluate(`({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      footerRight: Math.round(document.querySelector('.footer').getBoundingClientRect().right)
    })`);
    evidence.optionsLayout = optionsLayout;
    check('options page renders in desktop and narrow viewports', optionsLayout.scrollWidth <= optionsLayout.clientWidth && optionsLayout.footerRight <= optionsLayout.clientWidth, JSON.stringify(optionsLayout));

    evidence.console = popup.console;
    evidence.failures = popup.failures;
    evidence.passed = evidence.checks.every((item) => item.passed);
    evidence.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, 'chrome.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    browser.close();
    console.log(`\n${evidence.passed ? 'CHROME PASSED' : 'CHROME FAILED'} — ${path.relative(ROOT, path.join(OUT, 'chrome.json'))}`);
    process.exitCode = evidence.passed ? 0 : 1;
  } finally {
    fixture.server.close();
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      console.warn(`Temporary Chrome profile left behind: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(`Chrome popup check failed: ${error.stack || error.message}`);
  process.exit(2);
});
