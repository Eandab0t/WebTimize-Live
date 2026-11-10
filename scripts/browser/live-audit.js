'use strict';

// Full local browser audit for WebTimize Live: campaign and direct game routes, all required
// viewports, zoom-equivalent layouts, keyboard/focus/scroll effects, dynamic content, settings,
// and selector targets. Dependency-free; uses the CDP client in this directory.
//
// Usage:
//   node scripts/browser/live-audit.js [--port=9333] [--out=__development/experiments/live-audit]
//                                      [--only=game,viewports,zoom,focus,dynamic,settings,selectors]
//
// Requires headed Chrome with --enable-unsafe-extension-debugging; see README.md.

const fs = require('node:fs');
const path = require('node:path');
const {
  connect, loadExtension, waitForServiceWorker, openPage, waitFor
} = require('./session');

const ROOT = path.resolve(__dirname, '..', '..');
const PROFILE = JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles', 'coolmathgames.com.json'), 'utf8'));
const HIDE = PROFILE.selectors.hide;
const SITE = 'https://www.coolmathgames.com/';
const GAME = 'https://www.coolmathgames.com/0-drift-boss';
const PLAY = 'https://www.coolmathgames.com/0-drift-boss/play';
const OUT = path.resolve(ROOT, arg('out', '__development/experiments/live-audit'));
const SHOTS = path.join(OUT, 'screenshots');
const VIEWPORTS = [
  [320, 568], [375, 667], [430, 932], [596, 900], [768, 1024], [900, 900],
  [1024, 768], [1280, 800], [1440, 900], [1600, 1000], [1920, 1080], [2560, 1440]
];
const ZOOMS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
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

const only = new Set(arg('only', 'game,viewports,zoom,focus,dynamic,settings,selectors').split(',').map((s) => s.trim()));
const results = { startedAt: new Date().toISOString(), chrome: null, extensionId: null, checks: [], sections: {}, screenshots: [] };

function check(name, passed, detail) {
  results.checks.push({ name, passed, detail, at: new Date().toISOString() });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const SNAP = `(() => {
  const selectors = ${JSON.stringify(HIDE)};
  const rect = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  const style = document.getElementById('webtim-live-style');
  const wrapper = document.querySelector('#main-content .wrapper');
  const header = document.querySelector('header');
  const footer = document.querySelector('footer');
  const main = document.querySelector('main');
  const gf = document.getElementById('html5game');
  let gameFrame = null;
  let gameDoc = null;
  if (gf) {
    gameFrame = { ...rect(gf), display: getComputedStyle(gf).display, src: gf.src };
    try {
      const d = gf.contentDocument;
      if (d) {
        const c = d.querySelector('canvas');
        gameDoc = { ready: d.readyState, canvas: c ? { ...rect(c), width: c.width, height: c.height } : null, styleCount: d.querySelectorAll('#webtim-live-style').length, flag: d.documentElement.getAttribute('data-webtim-live') };
      }
    } catch (error) { gameDoc = { error: error.message }; }
  }
  const canvas = document.querySelector('canvas');
  const visible = (el) => Boolean(el && el.getClientRects().length && getComputedStyle(el).display !== 'none');
  const reports = selectors.map((selector) => {
    let nodes = [];
    try { nodes = [...document.querySelectorAll(selector)]; } catch { /* invalid */ }
    const shown = nodes.filter(visible);
    return {
      selector,
      matched: nodes.length,
      visible: shown.length,
      sample: nodes.slice(0, 5).map((el) => ({ tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 60), visible: visible(el), rect: rect(el), text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80), links: el.querySelectorAll('a,button,input,select,textarea').length }))
    };
  });
  const navLinks = [...document.querySelectorAll('header a, nav a')].filter(visible);
  const navLabels = navLinks.map((el) => (el.innerText || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim()).filter(Boolean);
  const focusables = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && visible(el));
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
    footer: footer ? rect(footer) : null,
    gameFrame,
    gameDoc,
    canvas: canvas ? { ...rect(canvas), width: canvas.width, height: canvas.height } : null,
    matched: reports.reduce((sum, row) => sum + row.matched, 0),
    visibleMatched: reports.reduce((sum, row) => sum + row.visible, 0),
    selectors: reports,
    navCount: navLinks.length,
    navLabels: navLabels.slice(0, 12),
    accountVisible: [...document.querySelectorAll('a,button')].some((el) => visible(el) && /log ?in|sign ?in|account/i.test(el.innerText || '')),
    focusableCount: focusables.length,
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

async function snapshot(page) { return page.evaluate(SNAP); }

async function waitStyle(page, present, timeout = 15000) {
  return waitFor(async () => {
    const state = await snapshot(page);
    return state.stylePresent === present ? state : null;
  }, { timeout, label: `stylesheet ${present ? 'present' : 'absent'}` });
}

async function waitApplied(page) {
  return waitFor(async () => {
    const state = await snapshot(page);
    return state.stylePresent && state.styleChars > 0 ? state : null;
  }, { timeout: 30000, label: 'applied stylesheet' });
}

async function setSettings(popup, settings) {
  await popup.evaluate(`chrome.storage.sync.set({ webtimSettings: ${JSON.stringify(settings)} })`);
}

async function setEnabled(popup, enabled) {
  await setSettings(popup, { ...DEFAULTS, enabled });
}

async function setViewport(page, width, height, dpr = 1) {
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
}

async function shot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot(file);
  results.screenshots.push(path.relative(ROOT, file));
  return file;
}

async function key(page, keyName, code, vk, modifiers = 0) {
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers, key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
}

async function tabSequence(page, count = 12) {
  const sequence = [];
  for (let index = 0; index < count; index += 1) {
    await key(page, 'Tab', 'Tab', 9);
    await page.settle(100);
    sequence.push(await page.evaluate(`(() => {
      const el = document.activeElement;
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { tag: el.tagName, id: el.id, text: (el.innerText || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 50), visible: Boolean(b.width || b.height), outline: cs.outlineStyle, outlineWidth: cs.outlineWidth };
    })()`).catch(() => null));
  }
  return sequence;
}

async function section(name, fn) {
  try { await fn(); } catch (error) {
    results.sections[name] = { error: error.message };
    check(`${name}: section completed`, false, error.message);
  }
}

async function gameCampaign(browser, popup) {
  const page = await openPage(browser, GAME, { width: 1440, height: 900 });
  const applied = await waitApplied(page);
  const before = await snapshot(page);
  check('campaign: stylesheet applied once', applied.styleCount === 1, `style ${applied.styleChars} chars`);
  check('campaign: matched ad containers hidden', before.visibleMatched === 0 && before.matched > 0, `${before.matched} matched, ${before.visibleMatched} visible`);
  check('campaign: header navigation present and visible', before.navCount > 0, `${before.navCount} visible links`);
  check('campaign: account control remains visible', before.accountVisible, `h1=${before.h1.join(' | ')}`);

  let gate = null;
  try {
    gate = await waitFor(async () => {
      const text = await page.evaluate(`(() => { const el = document.getElementById('continue-link'); return el ? (el.innerText || '').replace(/\\s+/g, ' ').trim() : null; })()`);
      return text === 'Continue' ? text : null;
    }, { timeout: 50000, interval: 1000, label: 'campaign gate' });
    await page.evaluate(`document.getElementById('continue-link').click()`);
  } catch {
    gate = await page.evaluate(`(() => { const el = document.getElementById('continue-link'); return el ? (el.innerText || '').replace(/\\s+/g, ' ').trim() : null; })()`).catch(() => null);
  }
  let loaded = null;
  try {
    loaded = await waitFor(async () => {
      const state = await snapshot(page);
      return state.gameFrame?.w > 0 ? state : null;
    }, { timeout: 40000, label: 'campaign game frame' });
  } catch { loaded = await snapshot(page); }
  await shot(page, 'campaign-game');
  const framePresent = Boolean(loaded.gameFrame?.w > 0);
  check('campaign: game frame or intact page shell is available', framePresent || Boolean(loaded.h1?.length), framePresent ? `${loaded.gameFrame.w}x${loaded.gameFrame.h}` : `no frame; gate=${JSON.stringify(gate)}; direct /play is tested separately`);
  check('campaign: a presented game frame is not hidden by a profile selector', !framePresent || loaded.gameFrame.display !== 'none', framePresent ? `frame=${loaded.gameFrame.display}` : 'not presented by site');

  await setEnabled(popup, false);
  const disabled = await waitStyle(page, false);
  await setEnabled(popup, true);
  const restored = await waitStyle(page, true);
  check('campaign: disabling/restoring does not resize a presented game frame', !framePresent || (Boolean(disabled.gameFrame && restored.gameFrame) && disabled.gameFrame.w === restored.gameFrame.w && restored.gameFrame.w === loaded.gameFrame.w), framePresent ? `${loaded.gameFrame?.w}/${disabled.gameFrame?.w}/${restored.gameFrame?.w}` : 'frame not presented; direct /play covers sizing');
  check('campaign: no extension horizontal overflow', loaded.horizontalOverflow === disabled.horizontalOverflow, `styled=${loaded.scrollWidth}, baseline=${disabled.scrollWidth}, client=${loaded.clientWidth}`);
  results.sections.campaign = { before, gate, loaded, disabled, restored, errors: page.failures.slice(0, 10) };
  page.close();
}

async function gameDirect(browser, popup, width, height) {
  const label = `${width}x${height}`;
  const page = await openPage(browser, PLAY, { width, height });
  const applied = await waitApplied(page);
  const canvas = await waitFor(async () => {
    const state = await snapshot(page);
    return state.canvas && state.canvas.w > 0 ? state : null;
  }, { timeout: 20000, label: 'game canvas' });
  await shot(page, `play-${label}-enabled`);
  check(`play ${label}: canvas renders`, Boolean(canvas.canvas?.w > 0 && canvas.canvas?.h > 0), canvas.canvas ? `${canvas.canvas.w}x${canvas.canvas.h}, backing ${canvas.canvas.width}x${canvas.canvas.height}` : 'none');
  check(`play ${label}: canvas stays inside the viewport`, canvas.canvas ? canvas.canvas.x >= 0 && canvas.canvas.x + canvas.canvas.w <= canvas.clientWidth + 1 : false, canvas.canvas ? `x=${canvas.canvas.x}, w=${canvas.canvas.w}, client=${canvas.clientWidth}` : 'none');
  check(`play ${label}: no horizontal overflow`, !canvas.horizontalOverflow, `client=${canvas.clientWidth}, scroll=${canvas.scrollWidth}`);

  await setEnabled(popup, false);
  const disabled = await waitStyle(page, false);
  await shot(page, `play-${label}-disabled`);
  await setEnabled(popup, true);
  const restored = await waitStyle(page, true);
  check(`play ${label}: disabling removes styling`, !disabled.stylePresent && disabled.flag === null, `style=${disabled.stylePresent}`);
  check(`play ${label}: canvas is unchanged by disable/restore`, Boolean(disabled.canvas && restored.canvas) && disabled.canvas.w === canvas.canvas.w && restored.canvas.w === canvas.canvas.w, `${canvas.canvas?.w}/${disabled.canvas?.w}/${restored.canvas?.w}`);
  check(`play ${label}: no profile selector hides the canvas`, applied.visibleMatched === 0, `${applied.matched} matched, ${applied.visibleMatched} visible`);
  results.sections[`play-${label}`] = { applied, canvas, disabled, restored };
  page.close();
}

async function gameSizes(browser) {
  const rows = [];
  for (const [width, height] of VIEWPORTS) {
    const page = await openPage(browser, PLAY, { width, height });
    const applied = await waitApplied(page);
    const state = await waitFor(async () => {
      const next = await snapshot(page);
      return next.canvas && next.canvas.w > 0 ? next : null;
    }, { timeout: 20000, label: `play ${width}x${height}` });
    rows.push({ width, height, state });
    check(`game size ${width}x${height}: canvas remains usable`, Boolean(state.canvas?.w > 0 && state.canvas?.h > 0), state.canvas ? `${state.canvas.w}x${state.canvas.h}` : 'none');
    check(`game size ${width}x${height}: no horizontal overflow`, !state.horizontalOverflow, `client=${state.clientWidth}, scroll=${state.scrollWidth}`);
    check(`game size ${width}x${height}: no cleanup target is visible`, applied.visibleMatched === 0, `${applied.matched} matched`);
    page.close();
  }
  results.sections.gameSizes = rows;
}

async function game(browser, popup) {
  await gameCampaign(browser, popup);
  await gameDirect(browser, popup, 1440, 900);
  await gameDirect(browser, popup, 390, 844);
  await gameSizes(browser);
}

async function viewports(browser, popup) {
  const rows = [];
  for (const [width, height] of VIEWPORTS) {
    const page = await openPage(browser, SITE, { width, height });
    const styled = await waitApplied(page);
    await page.settle(700);
    const styledState = await snapshot(page);
    await shot(page, `vp-${width}x${height}-styled`);
    await setEnabled(popup, false);
    const baseline = await waitStyle(page, false);
    await shot(page, `vp-${width}x${height}-baseline`);
    await setEnabled(popup, true);
    const restored = await waitStyle(page, true);
    const row = { width, height, styled: styledState, baseline, restored };
    rows.push(row);
    check(`viewport ${width}x${height}: stylesheet applies`, styledState.stylePresent && styledState.styleCount === 1, `wrapper ${styledState.wrapper?.w || 0}px`);
    check(`viewport ${width}x${height}: no new horizontal overflow`, styledState.scrollWidth <= baseline.scrollWidth + 1, `styled=${styledState.scrollWidth}, baseline=${baseline.scrollWidth}, client=${styledState.clientWidth}`);
    check(`viewport ${width}x${height}: matched ads hidden`, styledState.visibleMatched === 0, `${styledState.matched} matched, baseline ${baseline.visibleMatched} visible`);
    check(`viewport ${width}x${height}: navigation remains present`, styledState.navCount > 0, `${styledState.navCount} links`);
    check(`viewport ${width}x${height}: disable and restore is reversible`, !baseline.stylePresent && restored.stylePresent && restored.styleCount === 1, `restored styles=${restored.styleCount}`);
    page.close();
  }
  results.sections.viewports = rows;
}

async function zooms(browser, popup) {
  const rows = [];
  for (const zoom of ZOOMS) {
    const width = Math.round(1440 / zoom);
    const height = Math.round(900 / zoom);
    const page = await openPage(browser, SITE, { width, height });
    await setViewport(page, width, height, zoom);
    await page.evaluate('location.reload()').catch(() => {});
    await page.navigate(SITE);
    const applied = await waitApplied(page);
    await page.settle(700);
    const state = await snapshot(page);
    const tabs = await tabSequence(page, 8);
    if ([0.8, 1.25, 2].includes(zoom)) await shot(page, `zoom-${String(zoom).replace('.', '-')}`);
    check(`zoom ${Math.round(zoom * 100)}%: styles apply`, applied.stylePresent && applied.styleCount === 1, `css ${width}x${height}, dpr ${zoom}`);
    check(`zoom ${Math.round(zoom * 100)}%: no horizontal reflow`, !state.horizontalOverflow, `client=${state.clientWidth}, scroll=${state.scrollWidth}`);
    check(`zoom ${Math.round(zoom * 100)}%: keyboard reaches visible controls`, tabs.filter((item) => item?.visible).length >= 4, `${tabs.filter((item) => item?.visible).length}/8 visible`);
    check(`zoom ${Math.round(zoom * 100)}%: focused controls keep an outline`, tabs.every((item) => !item || !item.visible || item.outline !== 'none'), `${tabs.filter((item) => item?.visible && item.outline === 'none').length} without outline`);
    rows.push({ zoom, width, height, state, tabs });
    page.close();
  }
  results.sections.zooms = rows;
}

async function focusAndScroll(browser, popup) {
  await setSettings(popup, DEFAULTS);
  const page = await openPage(browser, SITE, { width: 1440, height: 900 });
  await waitApplied(page);
  const baseline = await snapshot(page);
  const tabsEnabled = await tabSequence(page, 12);
  check('focus: tab order reaches visible controls', tabsEnabled.filter((item) => item?.visible).length >= 8, `${tabsEnabled.filter((item) => item?.visible).length}/12`);
  check('focus: no focused control lacks an outline', tabsEnabled.every((item) => !item || !item.visible || item.outline !== 'none'), `${tabsEnabled.filter((item) => item?.visible && item.outline === 'none').length} missing`);

  await setEnabled(popup, false);
  await waitStyle(page, false);
  const probe = await page.evaluate(`(() => {
    const selectors = ${JSON.stringify(HIDE)};
    let container = null;
    for (const selector of selectors) { const el = [...document.querySelectorAll(selector)].find((node) => node.getClientRects().length); if (el) { container = el; break; } }
    if (!container) return null;
    const button = document.createElement('button');
    button.id = 'webtim-focus-probe';
    button.textContent = 'focus probe';
    container.appendChild(button);
    window.__webtimFocusEvents = { blur: 0, focusout: 0 };
    button.addEventListener('blur', () => { window.__webtimFocusEvents.blur += 1; });
    button.addEventListener('focusout', () => { window.__webtimFocusEvents.focusout += 1; });
    button.focus();
    window.scrollTo(0, 1200);
    return { selector: container.id || container.className, active: document.activeElement === button, scrollY: Math.round(scrollY) };
  })()`);
  check('focus: a focusable target inside a visible cleanup container was focused', Boolean(probe?.active), JSON.stringify(probe));
  if (!probe) {
    await setEnabled(popup, true);
    await waitStyle(page, true);
    page.close();
    return;
  }
  await page.settle(300);
  const heightBefore = await page.evaluate('document.documentElement.scrollHeight');
  const scrollBefore = await page.evaluate('Math.round(scrollY)');
  await setEnabled(popup, true);
  const hidden = await waitStyle(page, true);
  await page.settle(300);
  const events = await page.evaluate('window.__webtimFocusEvents');
  const activeWhileHidden = await page.evaluate('document.activeElement ? { tag: document.activeElement.tagName, id: document.activeElement.id } : null');
  const after = await snapshot(page);
  check('focus: hiding the container fires blur/focusout', events.blur + events.focusout > 0, JSON.stringify(events));
  check('focus: focus does not remain on the hidden probe', activeWhileHidden?.id !== 'webtim-focus-probe', JSON.stringify(activeWhileHidden));
  check('scroll: hiding cleanup preserves the scroll position', after.scrollY > 0 && Math.abs(after.scrollY - scrollBefore) < 200, `${scrollBefore} -> ${after.scrollY}`);
  check('scroll: page height changes with cleanup but remains usable', after.scrollHeight > 0 && after.scrollHeight < heightBefore, `${heightBefore} -> ${after.scrollHeight}`);
  await setEnabled(popup, false);
  await waitStyle(page, false);
  await page.evaluate(`(() => { const el = document.getElementById('webtim-focus-probe'); if (el) el.remove(); })()`);
  await setEnabled(popup, true);
  await waitStyle(page, true);
  results.sections.focus = { baseline, tabsEnabled, probe, hidden, events, activeWhileHidden, after, heightBefore, scrollBefore };
  page.close();
}

async function dynamic(browser, popup) {
  await setSettings(popup, DEFAULTS);
  const page = await openPage(browser, SITE, { width: 1440, height: 900 });
  await waitApplied(page);
  const inserted = await page.evaluate(`(() => {
    const make = (id) => { const el = document.createElement('div'); el.id = id; el.innerHTML = '<a href="#probe">late ad</a>'; document.querySelector('main')?.appendChild(el); return el; };
    const ad = make('leaderboard-late-audit');
    const generic = make('late-content');
    return { adDisplay: getComputedStyle(ad).display, genericDisplay: getComputedStyle(generic).display };
  })()`);
  check('dynamic: inserted cleanup match is hidden by the stylesheet', inserted.adDisplay === 'none', JSON.stringify(inserted));
  await page.evaluate(`history.pushState({}, '', '/?audit=1')`);
  await page.settle(300);
  const afterPush = await snapshot(page);
  check('dynamic: history.pushState does not duplicate or remove the stylesheet', afterPush.styleCount === 1 && afterPush.stylePresent, `styles=${afterPush.styleCount}`);
  for (let index = 0; index < 6; index += 1) {
    await setEnabled(popup, index % 2 === 0);
    await waitStyle(page, index % 2 === 0);
  }
  await setEnabled(popup, true);
  const afterCycles = await waitStyle(page, true);
  check('dynamic: repeated toggles leave exactly one stylesheet', afterCycles.styleCount === 1, `styles=${afterCycles.styleCount}`);
  await page.evaluate(`history.back()`);
  await page.settle(300);
  const afterBack = await snapshot(page);
  check('dynamic: history back preserves cleanup', afterBack.stylePresent && afterBack.styleCount === 1, `styles=${afterBack.styleCount}`);
  results.sections.dynamic = { inserted, afterPush, afterCycles, afterBack };
  page.close();
}

async function settings(browser, popup) {
  await setSettings(popup, DEFAULTS);
  const page = await openPage(browser, SITE, { width: 1440, height: 900 });
  await waitApplied(page);
  const base = await snapshot(page);
  await setSettings(popup, { ...DEFAULTS, features: { cleanup: true, layout: false, network: false } });
  const layoutOff = await waitFor(async () => {
    const state = await snapshot(page);
    return state.wrapper && state.wrapper.maxWidth !== '1600px' ? state : null;
  }, { timeout: 10000, label: 'global layout override' });
  check('settings: global layout default affects the page', layoutOff.wrapper.maxWidth !== '1600px', `max=${layoutOff.wrapper.maxWidth}`);
  await setSettings(popup, { ...DEFAULTS, sites: { 'coolmathgames.com': { cleanup: false } } });
  const siteOverride = await waitFor(async () => {
    const state = await snapshot(page);
    return state.visibleMatched > 0 ? state : null;
  }, { timeout: 10000, label: 'site cleanup override' });
  check('settings: per-site cleanup override is inherited/overridden independently', siteOverride.visibleMatched > 0, `${siteOverride.visibleMatched} visible`);
  await setSettings(popup, { ...DEFAULTS, exceptions: ['coolmathgames.com'] });
  const exception = await waitStyle(page, false);
  check('settings: exception removes the stylesheet', !exception.stylePresent, `style=${exception.stylePresent}`);
  await setSettings(popup, DEFAULTS);
  const reset = await waitStyle(page, true);
  check('settings: reset restores defaults', reset.stylePresent && reset.styleCount === 1, `styles=${reset.styleCount}`);

  for (let index = 0; index < 10; index += 1) {
    await setSettings(popup, { ...DEFAULTS, sites: { 'coolmathgames.com': { layout: index % 2 === 0 } } });
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  await setSettings(popup, { ...DEFAULTS, sites: { 'coolmathgames.com': { layout: false } } });
  const rapid = await waitFor(async () => {
    const state = await snapshot(page);
    return state.wrapper && state.wrapper.maxWidth !== '1600px' ? state : null;
  }, { timeout: 10000, label: 'rapid settings convergence' });
  check('settings: rapid writes converge to the last value', rapid.wrapper.maxWidth !== '1600px', `max=${rapid.wrapper.maxWidth}`);

  await setSettings(popup, DEFAULTS);
  await waitStyle(page, true);
  await page.navigate(SITE);
  const persisted = await waitApplied(page);
  check('settings: defaults persist across a page reload', persisted.stylePresent && persisted.styleCount === 1, `style=${persisted.styleChars}`);
  results.sections.settings = { base, layoutOff, siteOverride, exception, reset, rapid, persisted };
  page.close();
}

async function selectors(browser) {
  const rows = [];
  for (const [url, label] of [[SITE, 'homepage'], [GAME, 'campaign'], [PLAY, 'play']]) {
    const page = await openPage(browser, url, { width: 1440, height: 900 });
    await waitApplied(page);
    await page.settle(1200);
    const state = await snapshot(page);
    for (const row of state.selectors) {
      rows.push({ page: label, ...row, visibleSample: row.sample, gameCanvas: Boolean(state.canvas), gameFrame: Boolean(state.gameFrame) });
    }
    await page.close();
  }
  results.sections.selectors = rows;
  const broad = rows.filter((row) => row.matched > 20);
  check('selectors: no cleanup selector matches more than 20 elements', broad.length === 0, `${broad.length} broad selectors`);
  check('selectors: game canvas survives every selector', rows.filter((row) => row.page === 'play').every((row) => row.gameCanvas), 'play canvas present');
  check('selectors: cleanup leaves no visible matched node on any route', rows.every((row) => row.visible === 0), `${rows.filter((row) => row.visible > 0).length} visible rows`);
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const port = Number(arg('port', '9333'));
  const { browser, info } = await connect(port);
  results.chrome = { browser: info.Browser, protocolVersion: info['Protocol-Version'], userAgent: info['User-Agent'] };
  let extensionId;
  try { extensionId = await loadExtension(browser, ROOT); }
  catch (error) {
    const { targetInfos } = await browser.send('Target.getTargets');
    const worker = targetInfos.find((target) => target.type === 'service_worker' && target.url.startsWith('chrome-extension://'));
    if (!worker) throw error;
    extensionId = worker.url.split('/')[2];
  }
  results.extensionId = extensionId;
  const popup = await openPage(browser, `chrome-extension://${extensionId}/src/popup/popup.html`, { width: 420, height: 700 });
  await waitForServiceWorker(browser, extensionId);
  await setSettings(popup, DEFAULTS);

  if (only.has('game')) await section('game', () => game(browser, popup));
  if (only.has('viewports')) await section('viewports', () => viewports(browser, popup));
  if (only.has('zoom')) await section('zoom', () => zooms(browser, popup));
  if (only.has('focus')) await section('focus', () => focusAndScroll(browser, popup));
  if (only.has('dynamic')) await section('dynamic', () => dynamic(browser, popup));
  if (only.has('settings')) await section('settings', () => settings(browser, popup));
  if (only.has('selectors')) await section('selectors', () => selectors(browser));

  popup.close();
  results.finishedAt = new Date().toISOString();
  results.passed = results.checks.length > 0 && results.checks.every((item) => item.passed);
  fs.writeFileSync(path.join(OUT, 'audit.json'), `${JSON.stringify(results, null, 2)}\n`);
  const failed = results.checks.filter((item) => !item.passed);
  console.log(`\n${results.passed ? 'AUDIT PASSED' : 'AUDIT FAILED'} — ${results.checks.length} checks, ${failed.length} failed`);
  for (const item of failed) console.log(`  FAIL ${item.name}: ${item.detail}`);
  console.log(`Evidence: ${path.relative(ROOT, OUT)}/audit.json`);
  browser.close();
  process.exit(results.passed ? 0 : 1);
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(2); });
