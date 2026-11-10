# Browser verification and viewport sweep — 2026-11-05

> Continuation: the 2026-11-06 game, full viewport, zoom and focus validation is recorded in
> [LIVE-BROWSER-VALIDATION.md](LIVE-BROWSER-VALIDATION.md). This report remains the history of the
> first readiness gate and homepage sweep.

Real headed Chrome, the unpacked extension, and the live Coolmath Games homepage. This is the
first run where the extension was verified in a browser rather than only in the VM harness, so the
readiness gate and the sweep results are recorded together.

## Environment and method

| Item | Value |
| --- | --- |
| Browser | Google Chrome 157.0.8103.39 (headed, isolated `--user-data-dir`) |
| Automation | Chrome DevTools Protocol over `127.0.0.1:9333`; no Playwright/Puppeteer dependency |
| Extension | WebTimize Live 0.2.0, unpacked via `Extensions.loadUnpacked` |
| Profile | `coolmathgames.com` 1.0.0 at run time (metadata updated to 1.0.1 afterwards) |
| Site | `https://www.coolmathgames.com/` homepage, signed out |
| Viewport height | 900 CSS px for every capture; width varied |
| OS | Windows 10.0.26200 |
| Date | 2026-11-05 |

Chrome 157 ignores `--load-extension`. The harness starts Chrome with
`--enable-unsafe-extension-debugging` and calls the DevTools `Extensions.loadUnpacked` command.
Loading was treated as unproven until the extension id, its service worker, and its effect on the
page were all observed; a launch without those would not have counted.

### Transport and load response

The harness used the port transport: Chrome started with `--remote-debugging-port=9333`, and the
client connected to `ws://127.0.0.1:9333/devtools/browser/<uuid>`. It did **not** use
`--remote-debugging-pipe`, which Chrome DevRel's 2025 guidance recommends for
`Extensions.loadUnpacked`; this client implements WebSocket framing only, and the port path is the
one that was exercised. The exact successful exchange is saved verbatim as
[load-unpacked.json](../evidence/load-unpacked.json):

```json
{"request":{"id":1,"method":"Extensions.loadUnpacked","params":{"path":"<absolute repository path>"}},
 "response":{"id":1,"result":{"id":"aanjkafabmilibapmfeeajikpahifpbm"}}}
```

That is the raw DevTools response for Chrome 157.0.8103.39, protocol 1.3, not a value read from
`chrome://extensions`. A future Chrome or transport change must re-capture it: the method rejects an
already-loaded unpacked directory, and the id is per-profile.

## Readiness gate

All nine checks passed (`../__development/experiments/browser-readiness/readiness.json`). The four acceptance criteria are
the first four rows; the rest guard against a false positive.

| Check | Result | Evidence |
| --- | --- | --- |
| Extension installed and enabled | PASS | id `aanjkafabmilibapmfeeajikpahifpbm`, MV3 manifest 0.2.0 |
| Content script applies the stylesheet | PASS | `<style id="webtim-live-style">` 395 chars, `<html data-webtim-live="on">`, wrapper `max-width: 1600px` |
| Changing a setting updates the real page | PASS | per-site `layout: false` changed the wrapper from 1425 px to the site's 1188 px while cleanup stayed active |
| Disabling removes the injected styling | PASS | style element and `data-webtim-live` gone; wrapper stayed at native 1188 px |
| Re-enabling restores the styling | PASS | 395-char style returned without a reload |
| Service worker running | PASS | `chrome-extension://…/src/background/service-worker.js` |
| Popup responds | PASS | title "WebTimize Live" |
| Worker terminates and restarts | PASS | target closed, then a new worker served the reopened popup |
| Styles apply after worker restart | PASS | fresh navigation, 395-char style, wrapper max 1600 px |

The worker had already gone idle before the harness looked for it, which is expected MV3 behaviour;
the readiness run wakes it by opening the popup rather than assuming it is resident. Page console
and uncaught-error logs were empty for the whole run.

Screenshots (curated, versioned copies): [applied](../evidence/readiness-applied-1440.jpg),
[disabled](../evidence/readiness-disabled-1440.jpg), [popup](../evidence/readiness-popup.png),
[after restart](../evidence/readiness-after-restart-1440.jpg). Full-resolution originals are local-only
under `__development/experiments/browser-readiness/`.

## Viewport sweep

Styled = extension enabled with the shipped profile. Baseline = the same page after switching the
extension off through its own settings (not by unloading it). Both were measured in the same tab at
the same width; the only difference is the injected stylesheet.

| Width | Styled wrapper | Side gutter | Baseline wrapper | Visible ad containers (styled / baseline) | Document height (styled / baseline) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1024 | 1009 px | 0 | 1009 px | 0 / 10 | 6684 / 7374 px |
| 1280 | 1265 px | 0 | 1265 px | 0 / 14 | 7223 / 7898 px |
| 1440 | 1425 px | 0 | 1188 px | 0 / 22 | 6496 / 6889 px |
| 1600 | 1585 px | 0 | 1402 px | 0 / 22 | 6526 / 7043 px |
| 1920 | 1600 px | 153 px | 1402 px | 0 / 22 | 6553 / 7043 px |
| 2560 | 1600 px | 473 px | 1402 px | 0 / 22 | 6553 / 7043 px |

No width produced horizontal overflow in either state. Ad containers matched by the profile are
all hidden while styled; 9 cross-origin ad iframes still exist in the baseline at ≥1440 px but sit
inside hidden containers (iframe contents are out of scope, as documented). Baseline counts vary
with ad fill and are not a stable metric; the zero in the styled column is the profile's own
selector result. Document height is a layout measurement only; nothing here is a load-time or
runtime-performance measurement.

At **1024 and 1280** the layout rule has no measurable effect — the wrapper is already limited by
the viewport, so the 1600 px cap is not binding. Cleanup still removes 10–14 ad containers. The
"1024 was better" impression from earlier work cannot be attributed to this rule; at those widths
the layout CSS is inert.

At **1440** the rule changes the page materially: the wrapper goes from the site's 1188 px centred
column to 1425 px, using the full viewport. Four game tiles per row remain, and the page is 393 px
shorter because ad slots are gone. This is the width where the current rule looks best.

At **1920** the 1600 px cap leaves 153 px on each side; the header and content still read as one
balanced layout.

At **2560** the same cap leaves **473 px gutters on both sides**. The content is not broken, but it
reads as a narrow column stranded on a large display — the "awkward content spacing" concern is
reproducible and measurable. The native layout is worse (1402 px, 572 px gutters).

Rendered evidence: [styled 1440](../evidence/styled-1440.jpg) vs
[baseline 1440](../evidence/baseline-1440.jpg), and
[styled 2560](../evidence/styled-2560.jpg) vs [baseline 2560](../evidence/baseline-2560.jpg).
The 1920 styled capture is [here](../evidence/styled-1920.jpg). Full-page captures exist for 1440 only
(local-only: `__development/experiments/browser-sweep/screenshots/styled-1440-full.png` and
`baseline-1440-full.png`); the rest are viewport captures.

![Styled at 1440](../evidence/styled-1440.jpg)

![Baseline at 1440](../evidence/baseline-1440.jpg)

## Layout-rule candidates

Candidates were injected as an additional stylesheet after the extension's, with the same selector
and `!important`, so they override the shipped rule without editing the profile. "Native" means the
shipped layout rule switched off (cleanup left on).

| Width | Native | Current 1600 | Cap 1440 | Cap 1760 | Fluid 100% |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1440 | 1188 px (gutter 119) | 1425 px (0) | 1425 px (0) | 1425 px (0) | 1425 px (0) |
| 1920 | 1402 px (252) | 1600 px (153) | 1440 px (233) | 1760 px (73) | 1905 px (0) |
| 2560 | 1402 px (572) | 1600 px (473) | 1440 px (553) | 1760 px (393) | 2545 px (0) |

At 1440 every candidate is viewport-bound, so that row cannot distinguish them — the experiment is
inconclusive there and should not be cited as evidence for any cap.

At 1920 the 1760 px cap is the closest fit (73 px gutters) and fluid fills the screen without
overflow. At 2560 the fixed caps all leave large gutters; fluid is the only option that uses the
display, but the game tiles become very large and text lines very long. See
[1760 cap](../evidence/candidate-cap-1760-2560.jpg), [1600 (current)](../evidence/candidate-current-1600-2560.jpg),
[1440 cap](../evidence/candidate-cap-1440-2560.jpg), [native](../evidence/candidate-native-2560.jpg), and
[fluid](../evidence/candidate-fluid-100-2560.jpg) at 2560.

## Failed and rejected experiments

These are kept deliberately; the negative results are the useful part.

1. **Waiting for the `load` event timed out.** The first readiness run failed after 30 s because the
   homepage stays `readyState: "interactive"` while ad/consent iframes keep loading. It was a harness
   bug, not a site or extension failure. Fixed by proving document replacement with a navigation
   token and waiting for `readyState !== "loading"`. The first blank probe screenshot was discarded.
2. **Assuming the MV3 worker stays resident.** The worker was absent from `Target.getTargets` within
   a minute of the page loading, even though styles were applied. Readiness now wakes it through the
   popup and separately terminates it to prove restart and reconnection.
3. **Expecting `--load-extension` to load the extension.** Current branded Chrome ignores it. A
   launch would have looked successful while nothing was installed; the CDP domain reports the
   extension id or an explicit error, so that is the only accepted path.
4. **Comparing layout caps at 1440.** All candidates collapse to the same viewport-bound width, so
   the 1440 candidate screenshots are duplicates and prove nothing about cap choice.
5. **Narrower caps at 2560.** A 1440 px cap leaves 553 px gutters — worse than the current rule. A
   1760 px cap reduces gutters to 393 px but still leaves the layout looking narrow; it was not
   adopted without a design decision.
6. **Fluid 100% at 2560.** It eliminates gutters (2545 px) but makes each Top 10 tile roughly 500 px
   wide and produces very long text lines. Rejected for now as visually worse, not as a technical
   failure — there is no overflow.

## Decision

No profile CSS change in this milestone. The shipped 1600 px cap is reasonable at 1440–1920 and
measurably leaves 473 px gutters at 2560. Changing that needs a deliberate design choice (for
example a wider cap only above 2000 px, or accepting fluid tiles); the measurements here are the
input to that decision, not a verdict.

Profile metadata now records the widths actually inspected and the 2560 px caveat (version 1.0.1,
no behavioural change).

## Evidence: versioned and local-only

`evidence/` holds a curated selection (about 1 MB): readiness applied, disabled and
after-restart, the styled/baseline 1440 pair, styled 1920 and 2560, baseline 2560, all 2560
candidates, and the raw `load-unpacked.json`. These are copies; the report and these files are
versioned.

The 26 MB of full-resolution PNGs, `readiness.json`, `sweep.json` and the remaining captures live
under `__development/experiments/`, which `.gitignore` excludes. Any link marked local-only will not resolve in a
clone; it exists on the machine that ran the sweep. Re-run the two scripts to regenerate everything.

## Limitations

- One site, one page (homepage), one profile, one signed-out session.
- The game route was not tested, so the profile's game-page behaviour remains unverified.
- Mobile/tablet widths (below 1024 px, where the layout rule is inert) and browser zoom were not
  part of this sweep.
- No dynamic-content test: no SPA transition, infinite scroll, or post-load DOM mutation.
- No CPU or network throttling, no first-paint timing, no focus/scroll side effects measured.
- Chrome 157 on Windows only; rendering on macOS, Linux, Firefox or Safari is unverified.
- Screenshots are visual evidence, not pixel diffs; the site can change at any time.
- **Out of scope:** WebTimize Compressor. Its browser validation (original vs optimized rendering,
  image formats, Brotli/Gzip responses, cache behavior, JS execution) is a separate milestone.

## Reproduce

```bash
# 1. headed Chrome, throwaway profile, localhost-only debugging
"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --user-data-dir="$TEMP/webtim-live-cdp" \
  --remote-debugging-port=9333 \
  --enable-unsafe-extension-debugging \
  --no-first-run --no-default-browser-check about:blank

# 2. in another terminal, from the repository root
node scripts/browser/readiness.js --port=9333
node scripts/browser/sweep.js --port=9333
```

Both scripts load the unpacked extension themselves and exit non-zero when a readiness check fails.
The exact DevTools exchange that proves the load is in
[load-unpacked.json](../evidence/load-unpacked.json); both scripts call the same method.
Raw artifacts: `readiness.json`, `sweep.json`, and `screenshots/` under `__development/experiments/browser-sweep/` (29 PNGs: 12 viewport captures = 6
styled/baseline pairs, 2 full-page 1440 captures, 15 candidate captures).

The 26 MB of capture PNGs and the JSON evidence live under `__development/experiments/`, which is gitignored; this
report is versioned, the raw captures stay local. Re-run the two scripts to regenerate them.
