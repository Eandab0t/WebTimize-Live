'use strict';

// Phase A browser validation for WebTimize Live: game route, small screens, zoom-equivalent
// viewports, focus/scroll, dynamic navigation, and injection timing. Runs against the real site
// with the unpacked extension, like readiness.js and sweep.js.
//
// Usage:
//   node scripts/browser/live-validation.js [--port=9333] [--out=__development/experiments/live-validation]
//                                           [--only=game,small,zoom,focus,nav,timing]
//
// Requires a fresh headed Chrome started with --enable-unsafe-extension-debugging; see README.md.

const fs = require('node:fs');
const path = require('node:path');
const {
  connect, loadExtension, waitForServiceWorker, openPage, waitFor
} = require('./session');

const ROOT = path.resolve(__dirname, '..', '..');
const PROFILE = JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles', 'coolmathgames.com.json'), 'utf8'));
const HIDE = PROFILE.selectors.hide;
const SITE_URL = 'https://www.coolmathgames.com/';
const GAME_URL = 'https://www.coolmathgames.com/0-drift-boss';
const DEFAULTS = {
  schemaVersion: 2,
  enabled: true,
  features: { cleanup: true, layout: true, network: false },
  sites: {},
  exceptions: []
};

function arg(name, fallback) {
  const found = process.argv.find((item) => item.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

const outDir = path.resolve(ROOT, arg('out', '__development/experiments/live-validation'));
const shotDir = path.join(outDir, 'screenshots');
const only = new Set(arg('only', 'game,small,zoom,focus,nav,timing').split(',').map((s) => s.trim()));

const SNAP = `(() => {
  const selectors = ${JSON.stringify(HIDE)};
  const rect = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const style = document.getElementById('webtim-live-style');
  const wrapper = document.querySelector('#main-content .wrapper');
  const main = document.querySelector('main');
  const header = document.querySelector('header');
  const matched = [];
  for (const selector of selectors) {
    try { matched.push(...document.querySelectorAll(selector)); } catch { /* invalid selector */ }
  }
  const visibleMatched = matched.filter((el) => getComputedStyle(el).display !== 'none' && el.getClientRects().length);
  const gf = document.getElementById('html5game');
  let gameFrame = null;
  let gameDoc = null;
  if (gf) {
    gameFrame = { ...rect(gf), display: getComputedStyle(gf).display, src: gf.src };
    try {
      const d = gf.contentDocument;
      if (d) {
        const c = d.querySelector('canvas');
        gameDoc = {
          ready: d.readyState,
          canvas: c ? { ...rect(c), width: c.width, height: c.height } : null,
          styleCount: d.querySelectorAll('#webtim-live-style').length,
          flag: d.documentElement.getAttribute('data-webtim-live'),
          text: (d.body?.innerText || '').slice(0, 120)
        };
      }
    } catch (error) {
      gameDoc = { error: error.message };
    }
  }
  const focusables = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const smallTargets = focusables.filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.width < 24 || b.height < 24); });
  const promos = [...document.querySelectorAll('img')]
    .filter((img) => /\\/promos?\\//i.test(img.src) && img.getBoundingClientRect().width > 100)
    .map((img) => ({ src: img.src.split('/').pop(), w: Math.round(img.getBoundingClientRect().width) }));
  return {
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    stylePresent: Boolean(style),
    styleChars: style ? style.textContent.length : 0,
    styleCount: document.querySelectorAll('#webtim-live-style').length,
    flag: document.documentElement.getAttribute('data-webtim-live'),
    wrapper: wrapper ? { ...rect(wrapper), maxWidth: getComputedStyle(wrapper).maxWidth, paddingLeft: getComputedStyle(wrapper).paddingLeft, paddingRight: getComputedStyle(wrapper).paddingRight } : null,
    main: main ? rect(main) : null,
    header: header ? rect(header) : null,
    matched: matched.length,
    visibleMatched: visibleMatched.length,
    visibleNames: visibleMatched.slice(0, 8).map((el) => el.id || String(el.className).slice(0, 60) || el.tagName),
    promoCount: promos.length,
    promos: promos.slice(0, 3),
    focusableCount: focusables.length,
    smallTargetCount: smallTargets.length,
    smallTargets: smallTargets.slice(0, 5).map((el) => { const b = el.getBoundingClientRect(); return { tag: el.tagName, text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30), w: Math.round(b.width), h: Math.round(b.height) }; }),
    gameFrame,
    gameDoc,
    viewportWidth: innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    scrollY: Math.round(scrollY),
    scrollHeight: document.documentElement.scrollHeight,
    lang: document.documentElement.lang,
    h1: [...document.querySelectorAll('h1')].map((el) => el.textContent.trim()).slice(0, 3)
  };
})()`;

const results = {
  startedAt: new Date().toISOString(),
  chrome: null,
  extensionId: null,
  viewportHeight: null,
  sections: {},
  screenshots: [],
  checks: []
};

function check(name, passed, detail) {
  results.checks.push({ name, passed, detail, at: new Date().toISOString() });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function snapshot(page) {
  return page.evaluate(SNAP);
}

async function waitForApplied(page, { timeout = 30000 } = {}) {
  return waitFor(async () => {
    const state = await snapshot(page);
    return state.stylePresent && state.styleChars > 0 ? state : null;
  }, { timeout, label: 'extension stylesheet' });
}

async function waitForStyle(page, present, { timeout = 10000 } = {}) {
  return waitFor(async () => {
    const state = await snapshot(page);
    return state.stylePresent === present ? state : null;
  }, { timeout, label: `stylesheet ${present ? 'present' : 'absent'}` });
}

async function setEnabled(popup, enabled) {
  await popup.evaluate(`(async () => {
    const stored = await chrome.storage.sync.get('webtimSettings');
    const settings = stored.webtimSettings || {};
    settings.schemaVersion = 2;
    settings.enabled = ${enabled};
    await chrome.storage.sync.set({ webtimSettings: settings });
    return settings;
  })()`);
}

async function screenshot(page, name) {
  const file = path.join(shotDir, `${name}.png`);
  await page.screenshot(file);
  results.screenshots.push(path.relative(ROOT, file));
  return file;
}

async function testGame(browser, popup, width, height, label) {
  const page = await openPage(browser, GAME_URL, { width, height });
  const applied = await waitForApplied(page);
  results.sections[`game-${label}`] = { applied };
  check(
    `game ${label}: extension applies`,
    applied.stylePresent && applied.flag === 'on' && applied.styleCount === 1,
    `style ${applied.styleChars} chars, wrapper=${applied.wrapper ? applied.wrapper.w : 'none'}, main=${applied.main?.w}`
  );
  check(
    `game ${label}: matched ad containers stay hidden`,
    applied.matched > 0 && applied.visibleMatched === 0,
    `${applied.matched} matched, ${applied.visibleMatched} visible`
  );

  let gate = null;
  try {
    gate = await waitFor(async () => {
      const text = await page.evaluate(`(() => { const el = document.getElementById('continue-link'); return el ? (el.innerText || '').replace(/\\s+/g, ' ').trim() : null; })()`);
      return text === 'Continue' ? text : null;
    }, { timeout: 50000, interval: 1000, label: 'game continue gate' });
  } catch {
    gate = await page.evaluate(`(() => { const el = document.getElementById('continue-link'); return el ? (el.innerText || '').replace(/\\s+/g, ' ').trim() : null; })()`).catch(() => null);
  }
  results.sections[`game-${label}`].gate = gate;
  if (gate === 'Continue') {
    await page.evaluate(`document.getElementById('continue-link').click()`);
  } else {
    check(`game ${label}: continue gate appeared`, false, `gate text ${JSON.stringify(gate)}`);
  }

  let loaded = null;
  try {
    loaded = await waitFor(async () => {
      const state = await snapshot(page);
      return state.gameFrame?.w > 0 && state.gameDoc?.canvas ? state : null;
    }, { timeout: 45000, label: 'game iframe and canvas' });
  } catch {
    loaded = await snapshot(page);
  }
  results.sections[`game-${label}`].loaded = loaded;
  check(
    `game ${label}: game iframe loads`,
    Boolean(loaded.gameFrame?.w > 0 && loaded.gameFrame?.src.includes('/0-drift-boss/play')),
    loaded.gameFrame ? `${loaded.gameFrame.w}x${loaded.gameFrame.h} ${loaded.gameFrame.src}` : 'no game iframe'
  );
  check(
    `game ${label}: canvas renders`,
    Boolean(loaded.gameDoc?.canvas && loaded.gameDoc.canvas.w > 0 && loaded.gameDoc.canvas.h > 0),
    loaded.gameDoc?.canvas ? `${loaded.gameDoc.canvas.w}x${loaded.gameDoc.canvas.h}, backing ${loaded.gameDoc.canvas.width}x${loaded.gameDoc.canvas.height}` : 'no canvas'
  );
  check(
    `game ${label}: extension did not inject into game frame`,
    loaded.gameDoc?.styleCount === 0 && loaded.gameDoc?.flag === null,
    `styleCount=${loaded.gameDoc?.styleCount}, flag=${loaded.gameDoc?.flag}`
  );
  check(
    `game ${label}: game iframe is inside the viewport`,
    loaded.gameFrame ? loaded.gameFrame.x >= 0 && loaded.gameFrame.x + loaded.gameFrame.w <= loaded.clientWidth + 1 : false,
    loaded.gameFrame ? `x=${loaded.gameFrame.x}, w=${loaded.gameFrame.w}, client=${loaded.clientWidth}` : 'no iframe'
  );
  await screenshot(page, `game-${label}-loaded`);

  // Compare with the extension disabled: this separates profile effects from the site's own layout.
  await setEnabled(popup, false);
  const disabled = await waitForStyle(page, false).catch(() => snapshot(page));
  results.sections[`game-${label}`].disabled = disabled;
  await setEnabled(popup, true);
  const restored = await waitForStyle(page, true).catch(() => snapshot(page));
  results.sections[`game-${label}`].restored = restored;
  check(
    `game ${label}: disabling/restoring does not disturb the game frame`,
    Boolean(disabled.gameFrame && restored.gameFrame) &&
      disabled.gameFrame.src === loaded.gameFrame.src &&
      Math.abs(disabled.gameFrame.w - loaded.gameFrame.w) < 2 &&
      Math.abs(restored.gameFrame.w - loaded.gameFrame.w) < 2,
    `loaded=${loaded.gameFrame?.w}, disabled=${disabled.gameFrame?.w}, restored=${restored.gameFrame?.w}`
  );
  check(
    `game ${label}: extension does not add horizontal overflow`,
    loaded.scrollWidth <= disabled.scrollWidth + 1 && restored.scrollWidth <= disabled.scrollWidth + 1,
    `styled=${loaded.scrollWidth}, disabled=${disabled.scrollWidth}, restored=${restored.scrollWidth} (client ${loaded.clientWidth})`
  );
  check(
    `game ${label}: no extension errors in console`,
    page.failures.filter((line) => /webtim/i.test(line)).length === 0,
    `${page.failures.length} total page errors (site/ad noise included)`
  );
  results.sections[`game-${label}`].pageErrors = page.failures.slice(0, 20);
  page.close();
}

async function testSmall(browser, popup) {
  const cases = [
    { width: 390, height: 844, label: 'mobile-390' },
    { width: 768, height: 1024, label: 'tablet-768' },
    { width: 1024, height: 768, label: 'small-desktop-1024' }
  ];
  for (const item of cases) {
    const page = await openPage(browser, SITE_URL, { width: item.width, height: item.height });
    const styled = await waitForApplied(page);
    await page.settle(1200);
    const enabledState = await snapshot(page);
    await setEnabled(popup, false);
    const disabledState = await waitForStyle(page, false).catch(() => snapshot(page));
    if (item.width === 390) await screenshot(page, `${item.label}-baseline`);
    await setEnabled(popup, true);
    const restoredState = await waitForStyle(page, true).catch(() => snapshot(page));
    results.sections[item.label] = { styled: enabledState, disabled: disabledState, restored: restoredState };
    check(
      `${item.label}: extension applies`,
      styled.stylePresent && styled.flag === 'on' && styled.styleCount === 1,
      `wrapper=${styled.wrapper ? `${styled.wrapper.w}px max ${styled.wrapper.maxWidth}` : 'none'}`
    );
    check(
      `${item.label}: no horizontal overflow`,
      !enabledState.horizontalOverflow && !restoredState.horizontalOverflow,
      `client=${enabledState.clientWidth}, scroll=${enabledState.scrollWidth}`
    );
    check(
      `${item.label}: cleanup leaves no matched ad visible`,
      enabledState.visibleMatched === 0,
      `${enabledState.matched} matched, baseline ${disabledState.visibleMatched} visible`
    );
    check(
      `${item.label}: disabling/restoring is reversible`,
      !disabledState.stylePresent && restoredState.stylePresent && restoredState.styleCount === 1,
      `disabled style=${disabledState.stylePresent}, restored styles=${restoredState.styleCount}`
    );
    await screenshot(page, `${item.label}-styled`);
    page.close();
  }
}

async function testZoom(browser, popup) {
  const cases = [
    { zoom: 1.25, width: 1152, height: 720 },
    { zoom: 1.5, width: 960, height: 600 },
    { zoom: 2, width: 720, height: 450 },
    { zoom: 4, width: 320, height: 640 }
  ];
  for (const item of cases) {
    const label = `zoom-${String(item.zoom).replace('.', '-')}`;
    const page = await openPage(browser, SITE_URL, { width: item.width, height: item.height });
    const state = await waitForApplied(page);
    await page.settle(1000);
    const measured = await snapshot(page);
    let baseline = null;
    if (item.width === 320) {
      await setEnabled(popup, false);
      baseline = await waitForStyle(page, false).catch(() => snapshot(page));
      await setEnabled(popup, true);
      await waitForStyle(page, true).catch(() => snapshot(page));
    }
    results.sections[label] = { equivalentZoom: item.zoom, cssViewport: `${item.width}x${item.height}`, state: measured, baseline };
    check(
      `${label}: extension does not add horizontal overflow`,
      baseline ? measured.scrollWidth <= baseline.scrollWidth + 1 : !measured.horizontalOverflow,
      baseline
        ? `styled client=${measured.clientWidth} scroll=${measured.scrollWidth}; baseline scroll=${baseline.scrollWidth}`
        : `${item.width}x${item.height} CSS px, client=${measured.clientWidth}, scroll=${measured.scrollWidth}`
    );
    check(
      `${label}: extension applies`,
      measured.stylePresent && measured.flag === 'on',
      `style ${measured.styleChars} chars, wrapper=${measured.wrapper ? measured.wrapper.w : 'none'}`
    );
    if (item.zoom === 2) await screenshot(page, 'zoom-200');
    page.close();
  }
}

async function testFocus(browser, popup) {
  const page = await openPage(browser, SITE_URL, { width: 1440, height: 900 });
  await waitForApplied(page);
  await page.settle(1000);
  const sequence = [];
  for (let i = 0; i < 12; i += 1) {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await page.settle(120);
    const active = await page.evaluate(`(() => {
      const el = document.activeElement;
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName,
        id: el.id,
        text: (el.innerText || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
        visible: Boolean(b.width || b.height),
        outlineStyle: cs.outlineStyle,
        outlineWidth: cs.outlineWidth,
        inHiddenAd: Boolean(el.closest(${JSON.stringify(HIDE.join(','))}))
      };
    })()`).catch(() => null);
    sequence.push(active);
  }
  await page.send('Accessibility.enable').catch(() => {});
  let ax = null;
  try {
    const { nodes } = await page.send('Accessibility.getFullAXTree');
    const roles = {};
    for (const node of nodes) {
      const role = node.role?.value;
      if (role) roles[role] = (roles[role] || 0) + 1;
    }
    ax = { nodeCount: nodes.length, roles, heading: roles.heading || 0, main: roles.main || 0, navigation: roles.navigation || 0 };
  } catch (error) {
    ax = { error: error.message };
  }
  const focusedVisible = sequence.filter((item) => item?.visible);
  const missingOutline = sequence.filter((item) => item && item.visible && item.outlineStyle === 'none');
  results.sections.focus = { sequence, ax };
  check(
    'focus: keyboard traversal reaches visible controls',
    focusedVisible.length >= 5,
    `${focusedVisible.length}/12 stops visible; first ${sequence[0]?.tag || 'none'}`
  );
  check(
    'focus: no hidden ad container receives focus',
    sequence.every((item) => !item?.inHiddenAd),
    `${sequence.filter((item) => item?.inHiddenAd).length} hidden-ad stops`
  );
  check(
    'focus: focused elements keep a visible outline',
    missingOutline.length === 0,
    `${missingOutline.length} stops with outline-style:none`
  );
  check(
    'accessibility: page exposes a language and heading structure',
    Boolean(await page.evaluate('document.documentElement.lang')) && ax.heading > 0,
    `lang=${await page.evaluate('document.documentElement.lang')}, headings=${ax.heading}, main=${ax.main}`
  );
  await screenshot(page, 'focus-after-tabs');

  // Scroll position and focus survive a full disable/restore cycle.
  await page.evaluate(`(() => { const a = [...document.querySelectorAll('main a[href]')].find((el) => el.getClientRects().length); if (a) a.focus({ preventScroll: true }); })()`);
  await page.evaluate('window.scrollTo(0, 1600)');
  await page.settle(400);
  const before = await snapshot(page);
  const focusBefore = await page.evaluate(`document.activeElement ? { tag: document.activeElement.tagName, text: (document.activeElement.innerText || '').trim().slice(0, 40) } : null`);
  await setEnabled(popup, false);
  const disabled = await waitForStyle(page, false).catch(() => snapshot(page));
  await page.settle(300);
  const disabledScroll = await page.evaluate('Math.round(scrollY)');
  await setEnabled(popup, true);
  const restored = await waitForStyle(page, true).catch(() => snapshot(page));
  await page.settle(400);
  const after = await snapshot(page);
  const focusAfter = await page.evaluate(`document.activeElement ? { tag: document.activeElement.tagName, text: (document.activeElement.innerText || '').trim().slice(0, 40) } : null`);
  results.sections.scroll = { before: { scrollY: before.scrollY, height: before.scrollHeight }, disabledScroll, after: { scrollY: after.scrollY, height: after.scrollHeight }, focusBefore, focusAfter, disabled, restored };
  check(
    'scroll: position is not reset by disabling/restoring',
    after.scrollY > 0 && disabledScroll > 0 && Math.abs(after.scrollY - before.scrollY) < 200,
    `before=${before.scrollY}, disabled=${disabledScroll}, after=${after.scrollY}`
  );
  check(
    'scroll: no horizontal overflow after restore',
    !after.horizontalOverflow,
    `client=${after.clientWidth}, scroll=${after.scrollWidth}`
  );
  check(
    'focus: survives a disable/restore cycle',
    Boolean(focusBefore && focusAfter && focusBefore.tag === focusAfter.tag && focusBefore.text === focusAfter.text),
    `${focusBefore?.tag}:${focusBefore?.text} -> ${focusAfter?.tag}:${focusAfter?.text}`
  );
  page.close();
}

async function testNavigation(browser) {
  const page = await openPage(browser, SITE_URL, { width: 1440, height: 900 });
  await waitForApplied(page);
  let link = null;
  for (let attempt = 0; attempt < 15 && !link; attempt += 1) {
    link = await page.evaluate(`(() => {
      const a = [...document.querySelectorAll('a[href*="/0-"]')].find((el) => el.getClientRects().length && el.target !== '_blank');
      return a ? { href: a.href, text: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50) } : null;
    })()`).catch(() => null);
    if (!link) await page.settle(1000);
  }
  if (!link) {
    check('navigation: a game link is available', false, 'no in-page game link');
    page.close();
    return;
  }
  await page.evaluate(`(() => { const a = [...document.querySelectorAll('a[href*="/0-"]')].find((el) => el.getClientRects().length && el.target !== '_blank'); a.click(); })()`);
  let game = null;
  try {
    game = await waitFor(async () => {
      const state = await snapshot(page);
      return state.url.includes('/0-') && state.stylePresent ? state : null;
    }, { timeout: 45000, label: 'game navigation' });
  } catch {
    game = await snapshot(page);
  }
  check(
    'navigation: client navigation reaches a game with styles',
    game.url.includes('/0-') && game.stylePresent && game.styleCount === 1,
    `${game.url} style=${game.styleChars}`
  );
  await page.evaluate('history.back()');
  let home = null;
  try {
    home = await waitFor(async () => {
      const state = await snapshot(page);
      return new URL(state.url).pathname === '/' && state.stylePresent ? state : null;
    }, { timeout: 45000, label: 'history back' });
  } catch {
    home = await snapshot(page);
  }
  check(
    'navigation: history back restores the homepage with one stylesheet',
    new URL(home.url).pathname === '/' && home.stylePresent && home.styleCount === 1,
    `${home.url} style=${home.styleChars}, styles=${home.styleCount}`
  );
  await page.evaluate('history.forward()');
  let forward = null;
  try {
    forward = await waitFor(async () => {
      const state = await snapshot(page);
      return state.url.includes('/0-') && state.stylePresent ? state : null;
    }, { timeout: 45000, label: 'history forward' });
  } catch {
    forward = await snapshot(page);
  }
  check(
    'navigation: history forward re-applies without duplicates',
    forward.stylePresent && forward.styleCount === 1,
    `${forward.url} styles=${forward.styleCount}`
  );
  results.sections.navigation = { link, game, home, forward };
  await screenshot(page, 'navigation-game');
  page.close();
}

async function testTiming(browser) {
  const page = await openPage(browser, null, { width: 1440, height: 900 });
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const state = window.__webtimTiming = { start: performance.now(), styleAt: null, dclAt: null };
      const mark = () => { if (state.styleAt === null && document.getElementById('webtim-live-style')) state.styleAt = performance.now(); };
      const observer = new MutationObserver(mark);
      observer.observe(document, { childList: true, subtree: true });
      document.addEventListener('DOMContentLoaded', () => { state.dclAt = performance.now(); mark(); }, { once: true });
    })();`
  });
  await page.navigate(SITE_URL);
  await waitForApplied(page);
  await page.settle(1500);
  const timing = await page.evaluate(`(() => {
    const state = window.__webtimTiming || {};
    const paints = Object.fromEntries(performance.getEntriesByType('paint').map((entry) => [entry.name, Math.round(entry.startTime)]));
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      start: Math.round(state.start || 0),
      styleAt: state.styleAt === null || state.styleAt === undefined ? null : Math.round(state.styleAt),
      dclAt: state.dclAt === null || state.dclAt === undefined ? null : Math.round(state.dclAt),
      firstPaint: paints['first-paint'] ?? null,
      firstContentfulPaint: paints['first-contentful-paint'] ?? null,
      responseEnd: nav ? Math.round(nav.responseEnd) : null,
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      styleCount: document.querySelectorAll('#webtim-live-style').length
    };
  })()`);
  results.sections.timing = timing;
  check(
    'first paint: stylesheet is present exactly once after load',
    timing.styleCount === 1,
    `styleAt=${timing.styleAt}ms, FCP=${timing.firstContentfulPaint}ms, DCL=${timing.dclAt}ms`
  );
  check(
    'first paint: injection timing was observed',
    timing.styleAt !== null,
    timing.styleAt !== null
      ? `injected ${timing.styleAt - (timing.firstContentfulPaint || 0)}ms after FCP`
      : 'MutationObserver did not see the style element'
  );
  check(
    'first paint: no duplicate styles from early injection',
    timing.styleCount === 1,
    `${timing.styleCount} style elements`
  );
  await screenshot(page, 'timing-1440');
  page.close();
}

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  const port = Number(arg('port', '9333'));
  const { browser, info } = await connect(port);
  results.chrome = { browser: info.Browser, protocolVersion: info['Protocol-Version'], userAgent: info['User-Agent'] };
  console.log(`Chrome: ${info.Browser}`);

  let extensionId;
  try {
    extensionId = await loadExtension(browser, ROOT);
  } catch (error) {
    const { targetInfos } = await browser.send('Target.getTargets');
    const worker = targetInfos.find((target) => target.type === 'service_worker' && target.url.startsWith('chrome-extension://'));
    if (!worker) throw error;
    extensionId = worker.url.split('/')[2];
    console.log(`INFO  extension already loaded: ${extensionId}`);
  }
  results.extensionId = extensionId;
  const popup = await openPage(browser, `chrome-extension://${extensionId}/src/popup/popup.html`, { width: 420, height: 700 });
  await waitForServiceWorker(browser, extensionId);
  await popup.evaluate(`chrome.storage.sync.set({ webtimSettings: ${JSON.stringify(DEFAULTS)} })`);
  await new Promise((resolve) => setTimeout(resolve, 300));

  async function section(name, fn) {
    try {
      await fn();
    } catch (error) {
      results.sections[name] = { error: error.message };
      check(`${name}: section completed`, false, error.message);
    }
  }

  if (only.has('game')) {
    await section('game-1440', () => testGame(browser, popup, 1440, 900, '1440'));
  }
  if (only.has('small')) await section('small', () => testSmall(browser, popup));
  if (only.has('zoom')) await section('zoom', () => testZoom(browser, popup));
  if (only.has('focus')) await section('focus', () => testFocus(browser, popup));
  if (only.has('nav')) await section('nav', () => testNavigation(browser));
  if (only.has('timing')) await section('timing', () => testTiming(browser));
  popup.close();

  results.finishedAt = new Date().toISOString();
  results.passed = results.checks.length > 0 && results.checks.every((item) => item.passed);
  fs.writeFileSync(path.join(outDir, 'validation.json'), `${JSON.stringify(results, null, 2)}\n`);
  const failed = results.checks.filter((item) => !item.passed);
  console.log(`\n${results.passed ? 'VALIDATION PASSED' : 'VALIDATION FAILED'} — ${results.checks.length} checks, ${failed.length} failed`);
  if (failed.length) for (const item of failed) console.log(`  FAIL ${item.name}: ${item.detail}`);
  console.log(`Evidence: ${path.relative(ROOT, outDir)}/validation.json`);
  browser.close();
  process.exit(results.passed ? 0 : 1);
}

main().catch((error) => {
  console.error(`live validation failed: ${error.stack || error.message}`);
  process.exit(2);
});
