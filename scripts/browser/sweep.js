'use strict';

// Viewport and layout-rule sweep against the real site, with the unpacked extension active.
// Baseline = the extension disabled through settings, so the page is exactly what a visitor sees.
//
// Usage: node scripts/browser/sweep.js [--port=9333] [--out=__development/experiments/browser-sweep]

const fs = require('node:fs');
const path = require('node:path');
const {
  connect, loadExtension, waitForServiceWorker, openPage, waitFor
} = require('./session');

const ROOT = path.resolve(__dirname, '..', '..');
const PROFILE = JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles', 'coolmathgames.com.json'), 'utf8'));
const HIDE = PROFILE.selectors.hide;
const SITE_URL = 'https://www.coolmathgames.com/';
const WIDTHS = [1024, 1280, 1440, 1600, 1920, 2560];
const HEIGHT = 900;
const CANDIDATE_WIDTHS = [1440, 1920, 2560];

function arg(name, fallback) {
  const found = process.argv.find((item) => item.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

const DEFAULT_SETTINGS = {
  schemaVersion: 2,
  enabled: true,
  features: { cleanup: true, layout: true, network: false },
  sites: {},
  exceptions: []
};

const MEASURE = `(() => {
  const selectors = ${JSON.stringify(HIDE)};
  const wrapper = document.querySelector('#main-content .wrapper');
  const computed = wrapper && getComputedStyle(wrapper);
  const box = wrapper && wrapper.getBoundingClientRect();
  const matched = [];
  for (const selector of selectors) {
    try { matched.push(...document.querySelectorAll(selector)); } catch { /* invalid selector */ }
  }
  const visible = matched.filter((el) => getComputedStyle(el).display !== 'none' && el.getClientRects().length);
  const style = document.getElementById('webtim-live-style');
  const header = document.querySelector('header');
  const headerBox = header && header.getBoundingClientRect();
  return {
    viewport: innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    stylePresent: Boolean(style),
    flag: document.documentElement.getAttribute('data-webtim-live'),
    wrapper: wrapper ? {
      x: Math.round(box.x),
      width: Math.round(box.width),
      maxWidth: computed.maxWidth,
      paddingLeft: computed.paddingLeft,
      paddingRight: computed.paddingRight
    } : null,
    gutter: wrapper ? Math.round(box.x) : null,
    headerWidth: headerBox ? Math.round(headerBox.width) : null,
    matchedSelectors: matched.length,
    visibleUnhidden: visible.length,
    visibleNames: visible.slice(0, 10).map((el) => el.id || el.className || el.tagName),
    adFrames: document.querySelectorAll('iframe[id*="ad" i], iframe[src*="doubleclick"], iframe[src*="googlesyndication"]').length,
    documentHeight: document.documentElement.scrollHeight,
    bodyTextLength: (document.body?.innerText || '').length
  };
})()`;

async function measure(page) {
  return page.evaluate(MEASURE);
}

async function writeSettings(extensionPage, settings) {
  await extensionPage.evaluate(`chrome.storage.sync.set({ webtimSettings: ${JSON.stringify(settings)} })`);
}

async function waitForState(page, predicate, label, timeout = 8000) {
  return waitFor(async () => {
    const state = await measure(page);
    return predicate(state) ? state : null;
  }, { timeout, label });
}

function safeName(value) {
  return value.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
}

async function main() {
  const port = Number(arg('port', '9333'));
  const outDir = path.resolve(ROOT, arg('out', '__development/experiments/browser-sweep'));
  const shotDir = path.join(outDir, 'screenshots');
  fs.mkdirSync(shotDir, { recursive: true });

  const { browser, info } = await connect(port);
  const extensionId = await loadExtension(browser, ROOT);
  console.log(`Chrome ${info.Browser}; extension ${extensionId}`);

  const popup = await openPage(browser, `chrome-extension://${extensionId}/src/popup/popup.html`, { width: 420, height: 700 });
  await waitForServiceWorker(browser, extensionId);
  await writeSettings(popup, DEFAULT_SETTINGS);

  const page = await openPage(browser, SITE_URL, { width: 1440, height: HEIGHT });
  const applied = await waitForState(page, (state) => state.stylePresent && state.flag === 'on', 'extension styles');
  console.log(`Initial state: wrapper ${applied.wrapper?.width}px, max ${applied.wrapper?.maxWidth}`);

  const results = {
    startedAt: new Date().toISOString(),
    chrome: info.Browser,
    extensionId,
    site: SITE_URL,
    viewportHeight: HEIGHT,
    widths: WIDTHS,
    viewports: [],
    candidates: []
  };

  for (const width of WIDTHS) {
    await page.setViewport(width, HEIGHT);
    await page.settle(1200);
    const styled = await measure(page);
    const styledShot = path.join(shotDir, `styled-${width}.png`);
    await page.screenshot(styledShot);
    if (width === 1440) await page.screenshot(path.join(shotDir, `styled-${width}-full.png`), { fullPage: true });

    await writeSettings(popup, { ...DEFAULT_SETTINGS, enabled: false });
    const baseline = await waitForState(page, (state) => !state.stylePresent, `baseline at ${width}`);
    await page.settle(600);
    const baselineShot = path.join(shotDir, `baseline-${width}.png`);
    await page.screenshot(baselineShot);
    if (width === 1440) await page.screenshot(path.join(shotDir, `baseline-${width}-full.png`), { fullPage: true });

    await writeSettings(popup, DEFAULT_SETTINGS);
    await waitForState(page, (state) => state.stylePresent && state.flag === 'on', `styles back at ${width}`);

    results.viewports.push({
      width,
      styled: { ...styled, screenshot: path.relative(ROOT, styledShot) },
      baseline: { ...baseline, screenshot: path.relative(ROOT, baselineShot) }
    });
    console.log(
      `${String(width).padStart(4)}px  styled wrapper ${String(styled.wrapper?.width).padStart(4)} ` +
      `(gutter ${String(styled.gutter).padStart(3)}, ads visible ${styled.visibleUnhidden})  ` +
      `baseline wrapper ${String(baseline.wrapper?.width).padStart(4)} (ads visible ${baseline.visibleUnhidden})`
    );
  }

  // Layout candidates, measured at the widths where the cap actually matters.
  for (const width of CANDIDATE_WIDTHS) {
    await page.setViewport(width, HEIGHT);
    await page.settle(800);

    // Native: the site's own layout, cleanup still active.
    await writeSettings(popup, { ...DEFAULT_SETTINGS, sites: { 'coolmathgames.com': { layout: false } } });
    await waitForState(page, (state) => state.wrapper?.maxWidth !== '1600px', `native layout at ${width}`);
    await page.settle(500);
    const native = await measure(page);
    const nativeShot = path.join(shotDir, `candidate-native-${width}.png`);
    await page.screenshot(nativeShot);
    results.candidates.push({ width, candidate: 'native (extension layout off)', ...native, screenshot: path.relative(ROOT, nativeShot) });

    await writeSettings(popup, DEFAULT_SETTINGS);
    await waitForState(page, (state) => state.wrapper?.maxWidth === '1600px', `1600px layout at ${width}`);
    await page.settle(500);

    const candidateCss = {
      'current-1600': null,
      'cap-1440': '1440px',
      'cap-1760': '1760px',
      'fluid-100': 'none'
    };
    for (const [name, maxWidth] of Object.entries(candidateCss)) {
      if (maxWidth) {
        await page.evaluate(`(() => {
          let style = document.getElementById('webtim-experiment');
          if (!style) { style = document.createElement('style'); style.id = 'webtim-experiment'; document.head.appendChild(style); }
          style.textContent = '#main-content .wrapper { max-width: ${maxWidth} !important; padding-left: 24px !important; padding-right: 24px !important; }';
        })()`);
        await page.settle(500);
      } else {
        await page.evaluate('document.getElementById("webtim-experiment")?.remove()');
        await page.settle(300);
      }
      const state = await measure(page);
      const shot = path.join(shotDir, `candidate-${safeName(name)}-${width}.png`);
      await page.screenshot(shot);
      results.candidates.push({ width, candidate: name, ...state, screenshot: path.relative(ROOT, shot) });
      console.log(`${String(width).padStart(4)}px  ${name.padEnd(12)} wrapper ${String(state.wrapper?.width).padStart(4)} gutter ${state.gutter}`);
    }
    await page.evaluate('document.getElementById("webtim-experiment")?.remove()');
    await page.settle(200);
  }

  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, 'sweep.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log(`\nSaved ${path.relative(ROOT, path.join(outDir, 'sweep.json'))} and ${results.viewports.length * 2 + results.candidates.length} screenshots.`);
  popup.close();
  page.close();
  browser.close();
}

main().catch((error) => {
  console.error(`sweep failed: ${error.stack || error.message}`);
  process.exit(1);
});
