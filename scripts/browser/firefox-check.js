'use strict';

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { build } = require('../build-extensions');
const { prepareTestExtension, startFixture, TEST_DOMAIN } = require('./test-extension');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, '__development', 'experiments', 'popup-check');
const FIREFOX = path.join(ROOT, '__development', 'experiments', 'firefox', 'portable', 'core', 'firefox.exe');
const GECKODRIVER = path.join(ROOT, '__development', 'experiments', 'firefox', 'geckodriver.exe');
const EXTENSION_ID = 'webtimize-live@webtimize.dev';
const EXTENSION_UUID = '4f0f4c1e-6f6f-4b8c-9a8e-5f6b7c8d9e0a';

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

async function waitFor(fn, { timeout = 15000, interval = 200, label = 'condition' } = {}) {
  const started = Date.now();
  let error;
  while (Date.now() - started < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (caught) {
      error = caught;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Timed out waiting for ${label}${error ? `: ${error.message}` : ''}`);
}

class Driver {
  constructor(base) {
    this.base = base;
    this.session = '';
  }

  async request(method, route, body) {
    const response = await fetch(`${this.base}${route}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let value = null;
    try {
      value = text ? JSON.parse(text) : null;
    } catch {
      value = text;
    }
    if (!response.ok) {
      throw new Error(`${method} ${route} -> ${response.status}: ${typeof value === 'string' ? value : value?.value?.message || JSON.stringify(value)}`);
    }
    return value;
  }

  async create(capabilities) {
    const result = await this.request('POST', '/session', { capabilities });
    this.session = result.value.sessionId;
    return result.value.capabilities;
  }

  route(suffix) {
    return `/session/${this.session}${suffix}`;
  }

  async navigate(url) {
    await this.request('POST', this.route('/url'), { url });
  }

  async execute(script, args = []) {
    const result = await this.request('POST', this.route('/execute/sync'), { script, args });
    return result.value;
  }

  async executeAsync(script, args = []) {
    const result = await this.request('POST', this.route('/execute/async'), { script, args });
    return result.value;
  }

  async screenshot(file) {
    const result = await this.request('GET', this.route('/screenshot'));
    fs.writeFileSync(file, Buffer.from(result.value, 'base64'));
  }

  async elementScreenshot(selector, file) {
    const found = await this.request('POST', this.route('/element'), { using: 'css selector', value: selector });
    const result = await this.request('GET', this.route(`/element/${found.value['element-6066-11e4-a52e-4f735466cecf']}/screenshot`));
    fs.writeFileSync(file, Buffer.from(result.value, 'base64'));
  }

  async loadExtensionPage(url) {
    await this.request('POST', this.route('/moz/context'), { context: 'chrome' });
    try {
      await this.execute(`
        openLinkIn(arguments[0], 'current', {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
        });
        return true;
      `, [url]);
    } finally {
      await this.request('POST', this.route('/moz/context'), { context: 'content' });
    }
  }

  async extensionUuid() {
    await this.request('POST', this.route('/moz/context'), { context: 'chrome' });
    try {
      return await this.execute(`
        const policy = WebExtensionPolicy.getByID(arguments[0]);
        return policy ? policy.mozExtensionHostname : null;
      `, [EXTENSION_ID]);
    } finally {
      await this.request('POST', this.route('/moz/context'), { context: 'content' });
    }
  }

  async windowHandle() {
    const result = await this.request('GET', this.route('/window'));
    return result.value;
  }

  async switchWindow(handle) {
    await this.request('POST', this.route('/window'), { handle });
  }

  async newWindow() {
    const result = await this.request('POST', this.route('/window/new'), { type: 'window' });
    return result.value.handle;
  }

  async rect(width, height) {
    await this.request('POST', this.route('/window/rect'), { width, height, x: 20, y: 20 });
  }

  async delete() {
    if (this.session) await this.request('DELETE', this.route('')).catch(() => {});
  }
}

async function main() {
  if (!fs.existsSync(FIREFOX)) throw new Error(`Firefox not found at ${FIREFOX}`);
  if (!fs.existsSync(GECKODRIVER)) throw new Error(`geckodriver not found at ${GECKODRIVER}`);
  fs.mkdirSync(OUT, { recursive: true });
  fs.rmSync(path.join(OUT, 'firefox-extension'), { recursive: true, force: true });
  build('firefox');
  prepareTestExtension(path.join(ROOT, 'dist', 'firefox'), path.join(OUT, 'firefox-extension'));

  const fixture = await startFixture();
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const driver = new Driver(base);
  const evidence = {
    browser: null,
    extension: { source: 'dist/firefox', id: EXTENSION_ID, uuid: EXTENSION_UUID, version: null },
    fixture: fixture.url,
    checks: [],
    screenshots: [],
    console: [],
    failures: []
  };
  const check = (name, passed, detail) => {
    evidence.checks.push({ name, passed, detail });
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  };

  const gecko = spawn(GECKODRIVER, ['--port', String(port), '--binary', FIREFOX], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' }
  });
  let log = '';
  gecko.stdout.on('data', (chunk) => { log += chunk; });
  gecko.stderr.on('data', (chunk) => { log += chunk; });

  try {
    await waitFor(async () => {
      const response = await fetch(`${base}/status`);
      if (!response.ok) return false;
      const status = await response.json();
      return status.value?.ready;
    }, { label: 'geckodriver' });

    const capabilities = await driver.create({
      alwaysMatch: {
        browserName: 'firefox',
        acceptInsecureCerts: true,
        'moz:firefoxOptions': {
          binary: FIREFOX,
          args: ['-headless'],
          prefs: {
            'extensions.webextensions.uuids': JSON.stringify({ [EXTENSION_ID]: EXTENSION_UUID }),
            'extensions.autoDisableScopes': 0,
            'extensions.enabledScopes': 15,
            'xpinstall.signatures.required': false,
            'browser.shell.checkDefaultBrowser': false,
            'browser.startup.page': 0,
            'browser.startup.homepage': 'about:blank',
            'browser.tabs.warnOnClose': false,
            'app.update.enabled': false,
            'datareporting.policy.dataSubmissionEnabled': false,
            'toolkit.telemetry.enabled': false
          },
          log: { level: 'error' }
        }
      }
    });
    evidence.browser = { browserName: capabilities.browserName, browserVersion: capabilities.browserVersion, platformName: capabilities.platformName };
    check('Firefox starts under WebDriver', true, `${capabilities.browserName} ${capabilities.browserVersion}`);

    const installed = await driver.request('POST', driver.route('/moz/addon/install'), {
      path: path.join(OUT, 'firefox-extension'),
      temporary: true
    });
    evidence.extension.installedId = installed.value;
    check('Firefox installs the generated Firefox build as a temporary add-on', Boolean(installed.value), installed.value);
    evidence.extension.uuid = await waitFor(() => driver.extensionUuid(), { label: 'extension UUID' }) || EXTENSION_UUID;

    const fixtureHandle = await driver.windowHandle();
    await driver.navigate(fixture.url);
    await waitFor(() => driver.execute(`
      const slot = document.querySelector('.ad-slot');
      return Boolean(slot && getComputedStyle(slot).display === 'none');
    `), { label: 'Firefox content script' });
    const layout = await driver.execute(`return getComputedStyle(document.querySelector('.content')).maxWidth;`);
    check('Firefox content script applies the controlled profile', layout === 'none', `max-width=${layout}`);

    const popupHandle = await driver.newWindow();
    await driver.switchWindow(popupHandle);
    await driver.rect(380, 820);
    const popupUrl = `moz-extension://${evidence.extension.uuid}/src/popup/popup.html`;
    await driver.loadExtensionPage(popupUrl);
    await waitFor(() => driver.execute(`
      return document.querySelector('#siteHost')?.textContent === '${TEST_DOMAIN}'
        || document.querySelector('#unsupportedCard')?.hidden === false;
    `), { label: 'Firefox popup to resolve the active site' });
    const popupState = await driver.execute(`
      return {
        site: document.querySelector('#siteName')?.textContent || '',
        host: document.querySelector('#siteHost')?.textContent || '',
        status: document.querySelector('#siteStatus')?.textContent || '',
        height: document.documentElement.scrollHeight,
        width: document.documentElement.scrollWidth
      };
    `);
    check('Firefox popup identifies the controlled site', popupState.site === 'Local Fixture' && popupState.host === TEST_DOMAIN, JSON.stringify(popupState));
    await driver.elementScreenshot('.app', path.join(OUT, 'firefox-popup-inherited.png'));
    evidence.screenshots.push('firefox-popup-inherited.png');

    const defaultSettings = await driver.executeAsync(`
      const done = arguments[arguments.length - 1];
      browser.storage.sync.get('webtimSettings').then((value) => done(value.webtimSettings));
    `);
    evidence.settings = { defaultSettings };

    await driver.executeAsync(`
      const settings = arguments[0];
      const done = arguments[arguments.length - 1];
      browser.storage.sync.set({ webtimSettings: settings }).then(() => done('saved'), (error) => done(String(error)));
    `, [{ ...defaultSettings, sites: { [TEST_DOMAIN]: { enabled: false } } }]);
    await waitFor(() => driver.execute(`return document.querySelector('#siteStatus')?.textContent === 'Paused';`), { label: 'Firefox paused status' });
    check('Firefox popup reacts to storage changes', true);
    await driver.elementScreenshot('.app', path.join(OUT, 'firefox-popup-site-paused.png'));
    evidence.screenshots.push('firefox-popup-site-paused.png');

    await driver.execute(`document.querySelector('#siteModeInherit').click(); return true;`);
    await waitFor(() => driver.executeAsync(`
      const done = arguments[arguments.length - 1];
      browser.storage.sync.get('webtimSettings').then((value) => done(!value.webtimSettings.sites?.['${TEST_DOMAIN}']));
    `), { label: 'Firefox inherit write' });
    check('Firefox clearing a pause removes the sparse site override', true);

    const clean = { schemaVersion: 2, enabled: true, features: { cleanup: true, layout: true, network: false }, sites: {}, exceptions: [] };
    await driver.executeAsync(`
      const done = arguments[arguments.length - 1];
      browser.storage.sync.set({ webtimSettings: arguments[0] }).then(() => done(true));
    `, [clean]);
    await driver.switchWindow(fixtureHandle);
    await driver.navigate(fixture.url);
    await waitFor(() => driver.execute(`return Boolean(window.__adLoaded);`), { label: 'fixture ad load' });
    const beforeNetwork = await driver.execute(`return Boolean(window.__adLoaded);`);
    await driver.switchWindow(popupHandle);
    await driver.executeAsync(`
      const done = arguments[arguments.length - 1];
      browser.storage.sync.set({ webtimSettings: arguments[0] }).then(() => done(true));
    `, [{ ...clean, features: { cleanup: true, layout: true, network: true }, sites: { [TEST_DOMAIN]: { network: true } } }]);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const rules = await driver.executeAsync(`
      const done = arguments[arguments.length - 1];
      browser.declarativeNetRequest.getDynamicRules().then((value) => done(value.length), (error) => done(String(error)));
    `);
    await driver.switchWindow(fixtureHandle);
    await driver.navigate(fixture.url);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const afterNetwork = await driver.execute(`return Boolean(window.__adLoaded);`);
    check('Firefox DNR rule blocks the fixture script', beforeNetwork === true && Number(rules) > 0 && afterNetwork === false, `before=${beforeNetwork}, rules=${rules}, after=${afterNetwork}`);

    const optionsHandle = await driver.newWindow();
    await driver.switchWindow(optionsHandle);
    await driver.rect(1100, 1100);
    const optionsUrl = `moz-extension://${evidence.extension.uuid}/src/options/options.html`;
    await driver.loadExtensionPage(optionsUrl);
    await waitFor(() => driver.execute(`return Boolean(document.querySelector('#globalToggle'));`), { label: 'Firefox options' });
    await waitFor(() => driver.execute(`return /Local Fixture/.test(document.querySelector('#sites')?.textContent || '');`), { label: 'Firefox supported site row' });
    await driver.screenshot(path.join(OUT, 'firefox-options-top.png'));
    await driver.execute(`window.scrollTo(0, document.body.scrollHeight); return true;`);
    await driver.screenshot(path.join(OUT, 'firefox-options-bottom.png'));
    evidence.screenshots.push('firefox-options-top.png', 'firefox-options-bottom.png');
    await driver.rect(390, 844);
    await driver.execute(`window.scrollTo(0, 0); return true;`);
    await driver.screenshot(path.join(OUT, 'firefox-options-narrow-top.png'));
    await driver.execute(`window.scrollTo(0, document.body.scrollHeight); return true;`);
    await driver.screenshot(path.join(OUT, 'firefox-options-narrow-bottom.png'));
    evidence.screenshots.push('firefox-options-narrow-top.png', 'firefox-options-narrow-bottom.png');
    const optionsLayout = await driver.execute(`return { width: document.documentElement.scrollWidth, viewport: innerWidth };`);
    check('Firefox options render in desktop and narrow windows', optionsLayout.width <= optionsLayout.viewport, JSON.stringify(optionsLayout));

    evidence.passed = evidence.checks.every((item) => item.passed);
    evidence.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, 'firefox.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(`\n${evidence.passed ? 'FIREFOX PASSED' : 'FIREFOX FAILED'} — ${path.relative(ROOT, path.join(OUT, 'firefox.json'))}`);
    process.exitCode = evidence.passed ? 0 : 1;
  } catch (error) {
    evidence.passed = false;
    evidence.failures.push(String(error.stack || error.message));
    evidence.log = log.slice(-8000);
    fs.writeFileSync(path.join(OUT, 'firefox.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    throw error;
  } finally {
    await driver.delete();
    fixture.server.close();
    spawnSync('taskkill', ['/PID', String(gecko.pid), '/T', '/F'], { stdio: 'ignore' });
  }
}

main().catch((error) => {
  console.error(`Firefox check failed: ${error.stack || error.message}`);
  process.exit(2);
});
