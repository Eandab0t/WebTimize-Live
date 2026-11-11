# WebTimize Live 0.3.0 browser validation

**Date:** 2026-11-07

**Result:** Chrome **12/12** checks and Firefox **8/8** checks passed. Both were real browser
sessions against a controlled loopback fixture, not manifest validation alone. The full JSON
receipts are [live-030-chrome.json](../evidence/live-030-chrome.json) and
[live-030-firefox.json](../evidence/live-030-firefox.json).

## Environment

| Item | Chrome | Firefox |
| --- | --- | --- |
| Version | Google Chrome 157.0.8103.39 | Mozilla Firefox 159.0.1 |
| Driver | DevTools Protocol, port transport | geckodriver 0.37.1 |
| Extension | `dist/chrome`, id `fpcapgbkgbmcdjgjefpfajjocboclhkh` | `dist/firefox`, id `webtimize-live@webtimize.dev` |
| Install | `Extensions.loadUnpacked` | temporary add-on through WebDriver |
| Profile | disposable `%TEMP%/webtim-live-chrome-*` | disposable WebDriver profile |
| Fixture | local `127.0.0.1` listener with a fake ad script and stylesheet | same |
| OS | Windows | Windows |

Both harnesses copy the generated build to `__development/experiments/popup-check/` and add
`http://127.0.0.1/*` only to that copy. The shipped manifests still request only the tested
Coolmath host. The fixture server is closed at the end; neither browser profile is the everyday
profile.

## Chrome checks

| Check | Result |
| --- | --- |
| Generated Chrome build loads and reports 0.3.0 | PASS |
| Content script applies the controlled cleanup and layout rules | PASS |
| Popup identifies the supported active site | PASS |
| Popup reflects a storage change to global off | PASS |
| Site pause is stored as `{ "enabled": false }`, not a materialized copy | PASS |
| Choosing inherit removes the pause | PASS |
| Rapid global toggles converge to one stored value | PASS |
| DNR rule is installed and blocks the fixture script | PASS — 1 rule, `__adLoaded` true before and false after |
| Unsupported active page gets the explicit unsupported state | PASS |
| Actual toolbar action popup opens through `chrome.action.openPopup()` | PASS |
| Options page renders at desktop and 390 px | PASS — scroll width 390, footer right edge 379 |
| No popup console errors or failed requests | PASS |

The popup document was captured in inherited, global-off, site-paused and unsupported states. The
screenshots use the same extension popup page in a normal tab so the viewport is stable; separately,
Chrome opened the real toolbar action popup and reported its target. Popup content is about 590 px
high at 360 px wide.

## Firefox checks

| Check | Result |
| --- | --- |
| Firefox starts under WebDriver | PASS — 159.0.1 |
| Generated Firefox build installs as a temporary add-on | PASS — stable id returned |
| Content script applies the controlled cleanup and layout rules | PASS |
| Popup page identifies the controlled active site | PASS |
| Popup reacts to a storage change and shows the paused state | PASS |
| Clearing a pause removes the sparse site override | PASS |
| DNR rule blocks the fixture script | PASS — 1 rule, `__adLoaded` true before and false after |
| Options page renders without horizontal overflow | PASS — 500 px native minimum window width |

Firefox popup screenshots crop to the 360 px popup plate inside the test window. The Firefox options
window cannot go below its 500 px native minimum (WebDriver clamps a 390 px request), so the
narrow-options check uses 500 px. Chrome provides the 390 px options evidence.

### Firefox manifest details verified in the build

- `background.scripts` is used instead of `background.service_worker`.
- `browser_specific_settings.gecko.id` is `webtimize-live@webtimize.dev`.
- `strict_min_version` is `142.0`.
- `data_collection_permissions.required` is `["none"]`.
- The permission set remains `storage`, `activeTab` and `declarativeNetRequest`; host access remains
  `coolmathgames.com` and `www.coolmathgames.com`.

## Build output

`npm run build` produced **21 files in `dist/chrome`** and **21 files in `dist/firefox`**, each with
only the manifest, icons, profiles, popup/options/content assets and required shared/background
modules. `dist/` is gitignored and is not a source tree.

## Reproduction

```bash
cd "WebTimize Live"
npm test
npm run build
npm run browser:popup:chrome
npm run browser:popup:firefox
```

Chrome must be installed at its normal Windows path. The Firefox script expects the local test
binaries under `__development/experiments/firefox/` (`portable/core/firefox.exe` and `geckodriver.exe`); that
directory is gitignored. Both browser scripts exit non-zero on a failed check.

## Evidence

| Capture | File |
| --- | --- |
| Chrome popup, inherited | [live-030-chrome-popup-inherited.png](../evidence/live-030-chrome-popup-inherited.png) |
| Chrome popup, global off | [live-030-chrome-popup-global-off.png](../evidence/live-030-chrome-popup-global-off.png) |
| Chrome popup, site paused | [live-030-chrome-popup-site-paused.png](../evidence/live-030-chrome-popup-site-paused.png) |
| Chrome popup, unsupported page | [live-030-chrome-popup-unsupported.png](../evidence/live-030-chrome-popup-unsupported.png) |
| Chrome options, full | [live-030-chrome-options.png](../evidence/live-030-chrome-options.png) |
| Chrome options, 390 px | [live-030-chrome-options-390.png](../evidence/live-030-chrome-options-390.png) |
| Firefox popup page | [live-030-firefox-popup.png](../evidence/live-030-firefox-popup.png) |
| Firefox popup page, paused | [live-030-firefox-popup-paused.png](../evidence/live-030-firefox-popup-paused.png) |
| Firefox options, top | [live-030-firefox-options-top.png](../evidence/live-030-firefox-options-top.png) |
| Firefox options, bottom | [live-030-firefox-options-bottom.png](../evidence/live-030-firefox-options-bottom.png) |

## Not verified

- The actual **Firefox toolbar panel** was not opened or photographed. Firefox was verified as a
  temporary extension with its popup page, content script, storage and DNR behavior. The Chrome
  action popup was opened for real.
- The Coolmath profile was not re-run in Firefox. The existing Coolmath browser history is
  Chrome-only and remains in [browser-verification.md](browser-verification.md).
- No Firefox release-signing or addons.mozilla.org submission was performed. Temporary loading is
  the documented development path.
- No browser-restart persistence test was repeated in this milestone; settings storage behavior is
  covered by the unit suite and by live storage changes in both browsers.
- No screen-reader audit or full keyboard traversal was run in this milestone. Popup/options
  accessibility markup and focus-visible styling are covered by the unit suite and the prior Chrome
  validation.
