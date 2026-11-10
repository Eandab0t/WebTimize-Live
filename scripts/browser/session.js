'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { CDP, getJson, waitFor } = require('./cdp');

const EXTENSION_NAME = 'WebTimize Live';

async function connect(port) {
  const info = await getJson(`http://127.0.0.1:${port}/json/version`);
  if (!info.webSocketDebuggerUrl) throw new Error('Chrome did not expose a browser WebSocket');
  const browser = await CDP.connect(info.webSocketDebuggerUrl);
  return { browser, info };
}

/**
 * Chrome 137+ ignores --load-extension for Google Chrome. The supported automation path is the
 * Extensions domain, which requires the browser to run with --enable-unsafe-extension-debugging.
 * Returns the extension id, or throws with the reason a manual load is required.
 */
async function loadExtension(browser, extensionPath) {
  const absolute = path.resolve(extensionPath);
  if (!fs.existsSync(path.join(absolute, 'manifest.json'))) {
    throw new Error(`no manifest.json in ${absolute}`);
  }
  let id;
  try {
    ({ id } = await browser.send('Extensions.loadUnpacked', { path: absolute }));
  } catch (error) {
    throw new Error(
      `Extensions.loadUnpacked failed (${error.message}). ` +
      'Restart Chrome with --enable-unsafe-extension-debugging, or load the directory manually at chrome://extensions.'
    );
  }
  if (!id) throw new Error('Extensions.loadUnpacked returned no extension id');
  return id;
}

async function targets(browser) {
  const { targetInfos } = await browser.send('Target.getTargets');
  return targetInfos;
}

async function waitForServiceWorker(browser, extensionId, { timeout = 20000 } = {}) {
  return waitFor(async () => {
    const all = await targets(browser);
    return all.find((target) => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${extensionId}/`)) || null;
  }, { timeout, label: `service worker for ${extensionId}` });
}

async function attach(browser, targetId) {
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  return new Page(browser, targetId, sessionId);
}

class Page {
  constructor(browser, targetId, sessionId) {
    this.browser = browser;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.console = [];
    this.failures = [];
    browser.on('Runtime.consoleAPICalled', (params, fromSession) => {
      if (fromSession !== sessionId) return;
      this.console.push({
        type: params.type,
        text: params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' ')
      });
    });
    browser.on('Runtime.exceptionThrown', (params, fromSession) => {
      if (fromSession !== sessionId) return;
      this.failures.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'unknown exception');
    });
  }

  send(method, params = {}, timeout = 30000) {
    return this.browser.send(method, params, this.sessionId, timeout);
  }

  async init() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Log.enable').catch(() => {});
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails;
      throw new Error(`evaluate failed: ${detail.exception?.description || detail.text}`);
    }
    return result.result.value;
  }

  async navigate(url, { timeout = 45000 } = {}) {
    // A token in the old document proves the new one committed; ad-heavy pages can stay
    // "interactive" for a long time, so waiting for readyState "complete" is not reliable.
    await this.evaluate('window.__webtimNavToken = true').catch(() => {});
    await this.send('Page.navigate', { url });
    await waitFor(() => this.evaluate(
      'typeof window.__webtimNavToken === "undefined" && document.readyState !== "loading" && location.href'
    ).catch(() => null), { timeout, label: `load of ${url}` });
  }

  async settle(ms = 2000) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false
    });
  }

  async screenshot(file, { fullPage = false } = {}) {
    let params = { format: 'png' };
    if (fullPage) {
      const metrics = await this.send('Page.getLayoutMetrics');
      const size = metrics.cssContentSize || metrics.contentSize;
      params = {
        ...params,
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 }
      };
    }
    const { data } = await this.send('Page.captureScreenshot', params, 60000);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }

  close() {
    this.browser.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {});
  }
}

async function openPage(browser, url, { width = 1440, height = 900, newWindow = false } = {}) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', newWindow });
  const page = await attach(browser, targetId);
  await page.init();
  await page.setViewport(width, height);
  if (url) await page.navigate(url);
  return page;
}

module.exports = {
  EXTENSION_NAME,
  connect,
  loadExtension,
  waitForServiceWorker,
  targets,
  attach,
  openPage,
  waitFor
};
