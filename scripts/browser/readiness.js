'use strict';

// Proves the four readiness criteria over CDP before any sweep:
//   1. the unpacked extension loaded and has a live service worker
//   2. the content script applied its stylesheet to the real page
//   3. changing a setting changes the rendered page
//   4. disabling the extension removes the injected styling
// Also terminates the service worker to show it restarts and reconnects.
//
// Usage: node scripts/browser/readiness.js [--port=9333] [--out=__development/experiments/browser-readiness]

const fs = require('node:fs');
const path = require('node:path');
const {
  connect, loadExtension, waitForServiceWorker, attach, openPage, waitFor
} = require('./session');

const ROOT = path.resolve(__dirname, '..', '..');
const PROFILE = JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles', 'coolmathgames.com.json'), 'utf8'));
const HIDE = PROFILE.selectors.hide;
const SITE_URL = 'https://www.coolmathgames.com/';

function arg(name, fallback) {
  const found = process.argv.find((item) => item.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

function stamp() {
  return new Date().toISOString();
}

async function swEvaluate(browser, targetId, expression) {
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  try {
    const result = await browser.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    }, sessionId);
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
  } finally {
    browser.send('Target.detachFromTarget', { sessionId }).catch(() => {});
  }
}

const SNAPSHOT = `(() => {
  const selectors = ${JSON.stringify(HIDE)};
  const style = document.getElementById('webtim-live-style');
  const wrapper = document.querySelector('#main-content .wrapper');
  const computed = wrapper && getComputedStyle(wrapper);
  const box = wrapper && wrapper.getBoundingClientRect();
  const matched = [];
  for (const selector of selectors) {
    try { matched.push(...document.querySelectorAll(selector)); } catch { /* invalid selector */ }
  }
  const stillVisible = matched.filter((el) => getComputedStyle(el).display !== 'none' && el.getClientRects().length);
  return {
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    flag: document.documentElement.getAttribute('data-webtim-live'),
    stylePresent: Boolean(style),
    styleChars: style ? style.textContent.length : 0,
    styleHasCleanup: style ? style.textContent.includes('[id^="leaderboard-"]') : false,
    wrapper: wrapper ? {
      width: Math.round(box.width),
      x: Math.round(box.x),
      maxWidth: computed.maxWidth,
      paddingLeft: computed.paddingLeft,
      paddingRight: computed.paddingRight,
      marginLeft: computed.marginLeft
    } : null,
    matched: matched.length,
    stillVisible: stillVisible.length,
    visibleNames: stillVisible.slice(0, 8).map((el) => el.id || el.className || el.tagName),
    docClientWidth: document.documentElement.clientWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    adIframes: document.querySelectorAll('iframe[id*="ad" i], iframe[src*="doubleclick"], iframe[src*="googlesyndication"]').length
  };
})()`;

async function snapshot(page) {
  return page.evaluate(SNAPSHOT);
}

async function waitForApplied(page, { timeout = 30000 } = {}) {
  return waitFor(async () => {
    const state = await snapshot(page);
    return state.stylePresent && state.styleChars > 0 ? state : null;
  }, { timeout, label: 'content script to apply the stylesheet' });
}

async function main() {
  const port = Number(arg('port', '9333'));
  const outDir = path.resolve(ROOT, arg('out', '__development/experiments/browser-readiness'));
  fs.mkdirSync(outDir, { recursive: true });
  const evidence = {
    startedAt: stamp(),
    chrome: null,
    extension: { path: ROOT, id: null, manifestVersion: null },
    checks: [],
    snapshots: {},
    serviceWorker: {},
    console: [],
    pageErrors: []
  };
  const record = (name, passed, detail) => {
    evidence.checks.push({ name, passed, detail, at: stamp() });
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  };

  const { browser, info } = await connect(port);
  evidence.chrome = { browser: info.Browser, protocolVersion: info['Protocol-Version'], userAgent: info['User-Agent'] };
  console.log(`Chrome: ${info.Browser} (${info['User-Agent']})`);

  const extensionId = await loadExtension(browser, ROOT);
  evidence.extension.id = extensionId;
  record('extension unpacked and loaded', true, extensionId);

  const page = await openPage(browser, SITE_URL, { width: 1440, height: 900 });
  const enabled = await waitForApplied(page);
  evidence.snapshots.enabled = enabled;
  record(
    'content script applies the stylesheet',
    enabled.stylePresent && enabled.flag === 'on' && enabled.wrapper?.maxWidth === '1600px',
    `style ${enabled.styleChars} chars, flag=${enabled.flag}, wrapper=${enabled.wrapper?.width}px max=${enabled.wrapper?.maxWidth}`
  );
  await page.screenshot(path.join(outDir, '01-applied-1440.png'));

  // MV3 workers are allowed to sleep, so wake it the way a user does: open the popup.
  const popupUrl = `chrome-extension://${extensionId}/src/popup/popup.html`;
  let popup = await openPage(browser, popupUrl, { width: 420, height: 700 });
  const sw = await waitForServiceWorker(browser, extensionId);
  evidence.serviceWorker.initial = { targetId: sw.targetId, url: sw.url };
  evidence.extension.manifestVersion = await swEvaluate(
    browser,
    sw.targetId,
    'chrome.runtime.getManifest().manifest_version + ":" + chrome.runtime.getManifest().version'
  );
  record('service worker running', true, `${sw.url} (MV${evidence.extension.manifestVersion})`);
  const popupTitle = await popup.evaluate('document.title');
  record('popup page responds', Boolean(popupTitle), `title "${popupTitle}"`);
  await popup.screenshot(path.join(outDir, '02-popup.png'));

  // A per-site layout override proves a *setting* reaches the rendered page, not just storage.
  await swEvaluate(browser, sw.targetId, `(async () => {
    const stored = await chrome.storage.sync.get('webtimSettings');
    const settings = stored.webtimSettings || {};
    settings.schemaVersion = 2;
    settings.sites = settings.sites || {};
    settings.sites['coolmathgames.com'] = { ...(settings.sites['coolmathgames.com'] || {}), layout: false };
    await chrome.storage.sync.set({ webtimSettings: settings });
    return settings;
  })()`);
  let changed;
  try {
    changed = await waitFor(async () => {
      const state = await snapshot(page);
      return state.wrapper && state.wrapper.maxWidth !== '1600px' ? state : null;
    }, { timeout: 8000, label: 'layout override to reach the page' });
  } catch {
    changed = await snapshot(page);
  }
  evidence.snapshots.layoutOverride = changed;
  record(
    'setting change updates the real page',
    changed.stylePresent && changed.wrapper?.maxWidth !== '1600px',
    `style still present, wrapper max=${changed.wrapper?.maxWidth}`
  );

  await swEvaluate(browser, sw.targetId, `(async () => {
    const stored = await chrome.storage.sync.get('webtimSettings');
    const settings = stored.webtimSettings || {};
    settings.enabled = false;
    await chrome.storage.sync.set({ webtimSettings: settings });
    return settings;
  })()`);
  let disabled;
  try {
    disabled = await waitFor(async () => {
      const state = await snapshot(page);
      return !state.stylePresent && !state.flag ? state : null;
    }, { timeout: 8000, label: 'styles to be removed' });
  } catch {
    disabled = await snapshot(page);
  }
  evidence.snapshots.disabled = disabled;
  record(
    'disabling removes the injected styling',
    !disabled.stylePresent && disabled.flag === null,
    `style=${disabled.stylePresent}, flag=${disabled.flag}, wrapper max=${disabled.wrapper?.maxWidth}`
  );
  await page.screenshot(path.join(outDir, '02-disabled-1440.png'));

  // Restore the extension and prove it comes back without a reload.
  await swEvaluate(browser, sw.targetId, `(async () => {
    const stored = await chrome.storage.sync.get('webtimSettings');
    const settings = stored.webtimSettings || {};
    settings.enabled = true;
    delete (settings.sites || {})['coolmathgames.com'];
    await chrome.storage.sync.set({ webtimSettings: settings });
    return settings;
  })()`);
  const restored = await waitForApplied(page);
  evidence.snapshots.restored = restored;
  record('re-enabling restores the styling', restored.stylePresent && restored.flag === 'on', `style ${restored.styleChars} chars`);

  // Terminate the MV3 worker, then wake it the way a user would: open the popup again.
  popup.close();
  await new Promise((resolve) => setTimeout(resolve, 500));
  await browser.send('Target.closeTarget', { targetId: sw.targetId }).catch(async (error) => {
    console.log(`INFO  closeTarget refused (${error.message}); using ServiceWorker.stopAllWorkers`);
    await browser.send('ServiceWorker.enable').catch(() => {});
    await browser.send('ServiceWorker.stopAllWorkers');
  });
  await waitFor(async () => {
    const all = await browser.send('Target.getTargets');
    return !all.targetInfos.some((target) => target.targetId === sw.targetId);
  }, { timeout: 10000, label: 'service worker target to disappear' });
  evidence.serviceWorker.stoppedAt = stamp();
  console.log('INFO  service worker terminated; opening the popup to wake it');

  popup = await openPage(browser, popupUrl, { width: 420, height: 700 });
  const restarted = await waitForServiceWorker(browser, extensionId, { timeout: 20000 });
  evidence.serviceWorker.restarted = { targetId: restarted.targetId, url: restarted.url };
  evidence.serviceWorker.sameTarget = restarted.targetId === sw.targetId;
  const popupTitleAfter = await popup.evaluate('document.title');
  await popup.screenshot(path.join(outDir, '03-popup-after-restart.png'));
  popup.close();
  record('service worker restarts and serves the popup', Boolean(restarted.targetId) && Boolean(popupTitleAfter), `popup title "${popupTitleAfter}"`);

  // After a restart, a fresh navigation must still get styles from storage.
  await page.navigate(SITE_URL);
  const afterRestart = await waitForApplied(page, { timeout: 30000 });
  evidence.snapshots.afterRestart = afterRestart;
  record(
    'styles still apply after worker restart',
    afterRestart.stylePresent && afterRestart.flag === 'on',
    `style ${afterRestart.styleChars} chars, wrapper max=${afterRestart.wrapper?.maxWidth}`
  );
  await page.screenshot(path.join(outDir, '04-after-restart-1440.png'));

  evidence.console = page.console;
  evidence.pageErrors = page.failures;
  evidence.finishedAt = stamp();
  evidence.passed = evidence.checks.every((check) => check.passed);
  fs.writeFileSync(path.join(outDir, 'readiness.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`\n${evidence.passed ? 'READINESS PASSED' : 'READINESS FAILED'} — evidence in ${path.relative(ROOT, outDir)}`);
  page.close();
  browser.close();
  process.exit(evidence.passed ? 0 : 1);
}

main().catch((error) => {
  console.error(`readiness failed: ${error.stack || error.message}`);
  process.exit(2);
});
