# Browser harnesses

Dependency-free scripts that drive the generated extension in real browsers. They exist because the
VM tests prove logic, not rendering or installation.

- `readiness.js` is the gate. It must pass before any sweep result is trusted.
- `sweep.js` measures viewport and layout-rule behaviour and saves styled and baseline screenshots.
- `options-check.js` verifies initialized controls and that enabling an excepted site clears the
  exception without creating a redundant per-site override.
- `popup-check.js` loads the generated Chrome build in a disposable profile and checks the popup,
  options, toolbar action popup, storage convergence and DNR fixture. It requires Google Chrome.
- `firefox-check.js` installs the generated Firefox build as a temporary add-on through
  geckodriver, checks the popup page and options, and verifies DNR on the same fixture. The Firefox
  and geckodriver binaries are expected under the gitignored `__development/experiments/firefox/` directory.

`firefox-check.js` enables `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` only for its isolated test session so
WebDriver can load extension pages. Do not use that setting in an everyday Firefox profile.

## Requirements

- Google Chrome 137+ (developed against 157.0.8103.39 on Windows).
- Node 24 (uses the built-in `WebSocket`; no npm install).
- Network access to `https://www.coolmathgames.com/`.

## Start Chrome

Chrome 137+ ignores `--load-extension` in branded builds. Start a headed instance with a throwaway
profile and the extension-debugging switch:

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --user-data-dir="$TEMP/webtim-live-cdp" \
  --remote-debugging-port=9333 \
  --enable-unsafe-extension-debugging \
  --no-first-run --no-default-browser-check about:blank
```

Keep the debugging port on loopback. The profile is disposable; do not point it at your everyday
Chrome profile.

This harness uses the port/WebSocket transport, not `--remote-debugging-pipe`. The exact successful
`Extensions.loadUnpacked` request and raw response (Chrome 157, protocol 1.3) are recorded in
`evidence/load-unpacked.json`. The method rejects an already-loaded directory, so a repeat run
needs a fresh profile.

## Run

From the repository root, with Chrome still running:

```bash
node scripts/browser/readiness.js --port=9333
node scripts/browser/sweep.js --port=9333
node scripts/browser/options-check.js --port=9333
npm run browser:popup:chrome
npm run browser:popup:firefox
# or: npm run browser:readiness / npm run browser:sweep / npm run browser:options
```

The Chrome scripts accept `--out=<dir>` and exit non-zero when a check fails. They load the unpacked
extension themselves through `Extensions.loadUnpacked` and print its id.

The popup scripts are self-contained: they build a test copy, start the fixture server and launch a
disposable browser profile. They do not need an already-running Chrome or the public internet. The
test copy alone receives `http://127.0.0.1/*`; `dist/` is not modified.

## What the readiness gate proves

1. The unpacked extension loaded (id returned, manifest version read from its worker).
2. The content script applied a non-empty stylesheet to the real page, with
   `data-webtim-live="on"` and the expected computed wrapper width.
3. A per-site setting written through the extension changes the rendered page (not just storage).
4. Turning the extension off removes the style element and the attribute.
5. The MV3 worker exists, can be terminated, and restarts to serve the popup.
6. A fresh navigation after that restart still receives styles.

The worker is woken by opening the popup rather than assumed resident: idle MV3 workers disappear
from `Target.getTargets` within about 30 seconds. Navigation waits for document replacement and
`readyState !== "loading"`; this page can stay `interactive` for a long time under ad load, so the
`load` event is not a usable signal.

## Sweep behaviour

- Widths 1024, 1280, 1440, 1600, 1920, 2560 at height 900, measured in one tab.
- Styled state = shipped profile; baseline = extension disabled through `chrome.storage` (same tab,
  same width). Ads are never clicked and no account is used.
- Layout candidates (native, 1600, 1440, 1760, fluid) are injected as an extra stylesheet with the
  same selector and `!important`; the profile is not edited by the sweep.
- Screenshots are viewport captures; full-page captures exist for 1440 only.

The written report is `docs/browser-verification.md`; a curated ~1 MB screenshot set is versioned in
`evidence/`. Raw evidence (`sweep.json`, 29 PNGs) is in `__development/experiments/browser-sweep/`, which is
gitignored. Read the report before quoting numbers: the 1440 candidate comparison is inconclusive
and the 2560 fixed caps were rejected for now.

## Manual fallback

If `Extensions.loadUnpacked` is unavailable, `readiness.js` stops with an explicit error. Load the
extension by hand in the same Chrome instance:

1. Open `chrome://extensions` and enable Developer mode.
2. Choose **Load unpacked** and select the repository root.
3. Confirm WebTimize Live appears without an error.

The scripts still need the DevTools endpoint; they do not automate `chrome://extensions`.

## Limits

`readiness.js` and `sweep.js` were run against one site, one profile, one signed-out homepage, and
Chrome 157 on Windows. They do not measure first paint, focus/scroll side effects, CPU or network
throttling, or other browsers. Chrome must stay running for the scripts to work; closing it makes
both fail with a connection error.
