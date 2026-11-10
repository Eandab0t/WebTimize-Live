'use strict';

// Focused browser check for the options page. Requires a fresh Chrome with
// --enable-unsafe-extension-debugging, like readiness.js.
//
// Usage: node scripts/browser/options-check.js [--port=9333] [--out=__development/experiments/browser-options]

const fs = require('node:fs');
const path = require('node:path');
const { connect, loadExtension, openPage, waitFor } = require('./session');

const ROOT = path.resolve(__dirname, '..', '..');

function arg(name, fallback) {
  const found = process.argv.find((item) => item.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

async function main() {
  const port = Number(arg('port', '9333'));
  const out = path.resolve(ROOT, arg('out', '__development/experiments/browser-options'));
  const { browser } = await connect(port);
  const id = await loadExtension(browser, ROOT);
  const page = await openPage(browser, `chrome-extension://${id}/src/options/options.html`, {
    width: 900,
    height: 900
  });
  await waitFor(() => page.evaluate('Boolean(document.querySelector("#sitesList .site"))'), {
    timeout: 10000,
    label: 'options site row'
  });

  const initial = await page.evaluate(`(() => ({
    globalDisabled: document.querySelector('#globalToggle').disabled,
    exceptionDisabled: document.querySelector('#exceptionInput').disabled,
    syncDisabled: document.querySelector('#syncRulesButton').disabled,
    restoreDisabled: document.querySelector('#restoreButton').disabled,
    saved: document.querySelector('#saveState').textContent
  }))()`);

  await page.evaluate(`(async () => {
    const settings = {
      schemaVersion: 2,
      enabled: true,
      features: { cleanup: true, layout: true, network: false },
      sites: {},
      exceptions: ['coolmathgames.com']
    };
    await chrome.storage.sync.set({ webtimSettings: settings });
  })()`);
  await waitFor(() => page.evaluate('document.querySelector("#sitesList .site").textContent.includes("Excluded")'), {
    timeout: 5000,
    label: 'exception rendered'
  });

  const before = await page.evaluate(`(() => ({
    checked: document.querySelector('#sitesList .site .switch input').checked,
    text: document.querySelector('#sitesList .site').textContent
  }))()`);
  await page.evaluate('document.querySelector("#sitesList .site .switch input").click()');
  await waitFor(() => page.evaluate(`(async () => {
    const stored = await chrome.storage.sync.get('webtimSettings');
    const value = stored.webtimSettings || {};
    return value.exceptions?.length === 0 && Object.keys(value.sites || {}).length === 0;
  })()`), { timeout: 5000, label: 'exception to clear' });

  const after = await page.evaluate(`(async () => {
    const stored = await chrome.storage.sync.get('webtimSettings');
    return {
      text: document.querySelector('#sitesList .site').textContent,
      settings: stored.webtimSettings
    };
  })()`);
  const passed = !before.checked
    && !before.text.includes('Active')
    && !after.text.includes('Excluded')
    && initial.globalDisabled === false
    && initial.exceptionDisabled === false
    && initial.syncDisabled === false
    && initial.restoreDisabled === false;
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'options.json'), `${JSON.stringify({
    extensionId: id,
    initial,
    before,
    after,
    passed,
    failures: page.failures
  }, null, 2)}\n`);
  console.log(`${passed ? 'PASS' : 'FAIL'}  options exception clearing`);
  console.log(JSON.stringify({ initial, before, after, passed, failures: page.failures }, null, 2));
  page.close();
  browser.close();
  if (!passed || page.failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
