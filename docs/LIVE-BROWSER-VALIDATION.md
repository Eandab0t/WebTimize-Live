# WebTimize Live — complete local browser validation

> The 0.3.0 Chrome/Firefox build and popup validation is recorded separately in
> [browser-validation-0.3.0.md](browser-validation-0.3.0.md). This report remains the Chrome-only
> Coolmath history from 0.2.0.

**Run date:** 2026-11-06

**Repository:** local `main` at `d1a0c83` (nothing committed or pushed)

**Result:** 168/168 browser checks passed, readiness 9/9, local fixture architecture 11/11. No product defect was found in that browser run; the changes in that milestone were test harnesses and documentation.

A subsequent code audit found settings, CSS-validation and DNR-scoping defects that the browser
run did not exercise. They are listed in the post-validation section below; the historical 168/168
result is not being reinterpreted.

This report continues the history in [browser-verification.md](browser-verification.md), which records the
2026-11-05 readiness gate and homepage width sweep. The earlier results were not replaced or
reinterpreted. The 2026-11-05 run covered one site, one route and six desktop widths; this run adds
the game route, the complete viewport matrix, zoom, keyboard/focus/scroll effects, dynamic content,
settings persistence and the multi-profile architecture probe.

## Post-validation hardening (2026-11-06)

The follow-up audit added **88 dependency-free tests** (82 before) covering multi-domain DNR
scoping, unrelated storage events, exception clearing, relative CSS resources, domain-label
validation and manifest coverage of indexed profile domains. The options page was exercised in
real Chrome: enabling a site with an existing exception now removes the exception and leaves a
sparse settings object; initial controls are disabled until the async load completes.

After the fixes, `npm run browser:readiness` passed all nine checks again on Chrome
157.0.8103.39: extension loaded, stylesheet applied, setting reached the page, disable removed it,
re-enable restored it, and the MV3 worker restarted. The suite now has **90 tests**, including
popup status/label markup checks. A 2026-11-07 readiness rerun after that markup change also
passed 9/9 on the same Chrome build. `npm run browser:options` also passed: the
options page loaded enabled controls and clicking the site switch on an excepted site cleared the
exception without adding a per-site override. The local-only evidence is
`__development/experiments/browser-options/options.json`. This confirms the existing browser behavior still
works; it is not a new full 168-check sweep.

## Environment and method

| Item | Value |
| --- | --- |
| Browser | Google Chrome 157.0.8103.39, headed, protocol 1.3 |
| Automation | Chrome DevTools Protocol on `127.0.0.1:9333`; dependency-free harness |
| Extension | WebTimize Live 0.2.0, unpacked `Extensions.loadUnpacked` |
| Extension id | `aanjkafabmilibapmfeeajikpahifpbm` |
| Shipped profile | `coolmathgames.com` 1.0.1, 11 cleanup selectors, 1600 px layout cap |
| Browser profile | disposable `%TEMP%/webtim-live-cdp`, never the normal profile |
| Site session | signed out; no login, purchase, ad click or consent action |
| OS | Windows, headed desktop browser |
| Routes | homepage, `/0-drift-boss`, `/0-drift-boss/play` |
| Viewports | 320×568 through 2560×1440, exact list below |
| Zoom levels | 80, 90, 100, 110, 125, 150, 175, 200% |

The four readiness criteria were reconfirmed before the new experiments:

| Readiness check | Result | Measured detail |
| --- | --- | --- |
| Extension loaded | PASS | id above, MV3 0.2.0, service worker running |
| Stylesheet applied | PASS | 395-char `<style id="webtim-live-style">`, `data-webtim-live="on"`, wrapper max 1600 px |
| Setting changes the real page | PASS | per-site `layout:false` changed the wrapper to the site's 1188 px |
| Disabling removes the stylesheet | PASS | style element and attribute gone; native 1188 px layout remained |
| Re-enabling restores styling | PASS | 395-char style returned without a page reload |
| Service worker terminates/restarts | PASS | worker target closed, reopened popup woke a new worker |
| Styles survive worker restart | PASS | fresh navigation still received the 395-char stylesheet |

The readiness evidence is in the local-only `__development/experiments/browser-readiness/readiness.json`;
the curated screenshots are already linked from the previous report.

## Game route

### Campaign page, 1440×900

`https://www.coolmathgames.com/0-drift-boss` was loaded with the extension enabled, then disabled
through its own settings and re-enabled in the same tab.

| Item | Enabled | Disabled | Result |
| --- | ---: | ---: | --- |
| Game iframe | 785×589 at (240, 66), `display:block` | same | PASS, unchanged |
| Game iframe source | `/0-drift-boss/play` | same | PASS |
| Inner document | complete; canvas 785×589, backing 1279×960 | same | PASS |
| Extension inside game frame | 0 style elements, no flag | 0 | PASS, `all_frames:false` held |
| Header | 58 px high, 105 visible header/nav links | present | PASS |
| Account control | visible | visible | PASS |
| Footer | 708 px high at y=3470 | present | PASS |
| Matched cleanup nodes | 32 matched, 0 visible | 32 matched, visible in baseline | PASS |
| Page height | 4178 px | not used as a pass/fail metric | recorded |
| Horizontal overflow | 1425 px scroll / 1425 px client | same | PASS, no extension overflow |

The campaign page sometimes restores the game iframe immediately and sometimes shows its timed
`#continue-link` gate. Both paths were accepted; the run above restored the frame without a gate.
The campaign page is ad-heavy and its fill varies, so the direct `/play` route is the stable
functional test.

### Direct game canvas

`https://www.coolmathgames.com/0-drift-boss/play` renders the game canvas directly, avoiding the
campaign's ad preroll. The canvas filled the viewport at every required width with no horizontal
overflow. The extension never matched or hid the canvas.

| Viewport | Canvas CSS size | Canvas backing store | Client / scroll width |
| --- | ---: | ---: | ---: |
| 320×568 | 320×568 | 540×960 | 320 / 320 |
| 375×667 | 375×667 | 540×960 | 375 / 375 |
| 430×932 | 430×932 | 540×1170 | 430 / 430 |
| 596×900 | 596×900 | 635×960 | 596 / 596 |
| 768×1024 | 768×1024 | 720×960 | 768 / 768 |
| 900×900 | 900×900 | 960×960 | 900 / 900 |
| 1024×768 | 1024×768 | 1280×960 | 1024 / 1024 |
| 1280×800 | 1280×800 | 1536×960 | 1280 / 1280 |
| 1440×900 | 1440×900 | 1536×960 | 1440 / 1440 |
| 1600×1000 | 1600×1000 | 1536×960 | 1600 / 1600 |
| 1920×1080 | 1920×1080 | 1706×960 | 1920 / 1920 |
| 2560×1440 | 2560×1440 | 1706×960 | 2560 / 2560 |

At 1440 and 390 the canvas was also measured with the extension disabled and re-enabled. Its CSS
size and position were unchanged (1440×1440 and 390×390 respectively), the style element disappeared
when disabled, and exactly one style element returned when re-enabled. The cleanup selector set
matched zero nodes on this route, which is correct: the game page does not use the homepage ad
placeholder markup.

Curated: [campaign](../evidence/live-game-campaign.jpg),
[1440 canvas](../evidence/live-play-1440x900.jpg),
[1440 disabled](../evidence/live-play-1440x900-disabled.jpg),
[390 canvas](../evidence/live-play-390x844.jpg).

![Campaign game page with the extension enabled](../evidence/live-game-campaign.jpg)

## Complete viewport matrix

Styled = extension enabled with the shipped profile. Baseline = the same tab after disabling the
extension through its settings, so the comparison isolates the injected CSS rather than an
unloaded extension. Every width used the required height.

| Viewport | Wrapper styled | Wrapper max | Client / scroll | Baseline scroll | Height styled / baseline | Visible ads styled / baseline | Navigation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 320×568 | 360 | 100% | 305 / 360 | 360 | 11415 / 11889 | 0 / 10 | 41 |
| 375×667 | 360 | 100% | 360 / 360 | 360 | 11415 / 11865 | 0 / 10 | 41 |
| 430×932 | 415 | 100% | 415 / 415 | 415 | 11321 / 11771 | 0 / 10 | 41 |
| 596×900 | 581 | 100% | 581 / 581 | 581 | 11310 / 11760 | 0 / 10 | 41 |
| 768×1024 | 753 | 100% | 753 / 753 | 753 | 7217 / 7867 | 0 / 10 | 41 |
| 900×900 | 885 | 100% | 885 / 885 | 885 | 7499 / 8149 | 0 / 10 | 41 |
| 1024×768 | 1009 | 1600px | 1009 / 1009 | 1009 | 6684 / 7374 | 0 / 10 | 103 |
| 1280×800 | 1265 | 1600px | 1265 / 1265 | 1265 | 7223 / 7898 | 0 / 10 | 103 |
| 1440×900 | 1425 | 1600px | 1425 / 1425 | 1425 | 6496 / 6609 | 0 / 10 | 103 |
| 1600×1000 | 1585 | 1600px | 1585 / 1585 | 1585 | 6526 / 6763 | 0 / 10 | 103 |
| 1920×1080 | 1600 | 1600px | 1905 / 1905 | 1905 | 6553 / 6763 | 0 / 10 | 103 |
| 2560×1440 | 1600 | 1600px | 2545 / 2545 | 2545 | 6553 / 6763 | 0 / 10 | 103 |

All twelve widths passed: one stylesheet, zero visible matched ad containers, navigation present,
disable and restore reversible, and no **new** horizontal overflow. At 320×568 the page itself is
360 px wide against a 305 px client width in both styled and baseline states. That is a site-level
overflow, not an extension regression; the extension neither creates nor widens it. The visual
comparison is [styled](../evidence/live-320x568-styled.jpg) versus
[baseline](../evidence/live-320x568-baseline.jpg).

At 1024 and 1280 the 1600 px layout rule is not binding because the wrapper is already smaller than
the viewport. At 1920 and 2560 it is binding: the wrapper is exactly 1600 px, leaving 153 px and
473 px side gutters respectively. That is the same measured trade-off documented in the prior
2026-11-05 sweep, not a new regression. At 150% zoom and above the rule is also inert because the
CSS viewport falls below 1024 px; cleanup remains active.

![Styled homepage at 1440](../evidence/live-1440x900-styled.jpg)

![Baseline homepage at 1440](../evidence/live-1440x900-baseline.jpg)

More curated captures: [768](../evidence/live-768x1024-styled.jpg),
[1920](../evidence/live-1920x1080-styled.jpg), [2560](../evidence/live-2560x1440-styled.jpg).

## Browser zoom and keyboard access

### Method and limitation

Native `Ctrl`+`+`/`Ctrl`+`-` sent through CDP `Input.dispatchKeyEvent` did **not** change
`innerWidth`, `visualViewport.scale` or the browser zoom. That experiment is recorded as failed.
The zoom matrix therefore used Chrome's device metrics override: physical 1440×900 was divided by
the zoom factor for the CSS viewport, and the device-pixel ratio was set to the zoom factor. This
reproduces browser-zoom reflow and DPR without changing the normal profile or guessing at private
Chrome preferences. It is an emulated browser zoom, not a native menu/shortcut zoom; a future run
should repeat at least 80/125/200% with the real Chrome zoom control.

| Zoom | CSS viewport | Client / scroll | Layout max | Visible tab stops | Focused controls without outline |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 80% | 1800×1125 | 1785 / 1785 | 1600px | 8/8 | 0 |
| 90% | 1600×1000 | 1585 / 1585 | 1600px | 8/8 | 0 |
| 100% | 1440×900 | 1425 / 1425 | 1600px | 8/8 | 0 |
| 110% | 1309×818 | 1294 / 1294 | 1600px | 8/8 | 0 |
| 125% | 1152×720 | 1137 / 1137 | 1600px | 8/8 | 0 |
| 150% | 960×600 | 945 / 945 | 100% | 8/8 | 0 |
| 175% | 823×514 | 808 / 808 | 100% | 8/8 | 0 |
| 200% | 720×450 | 705 / 705 | 100% | 8/8 | 0 |

Every zoom level applied exactly one stylesheet, produced no horizontal overflow, retained eight
visible tab stops through the sampled sequence, and every focused control had an outline. At
150–200% the CSS viewport is below the layout rule's 1024 px breakpoint, so only cleanup is active.
Curated: [80%](../evidence/live-zoom-80.jpg), [125%](../evidence/live-zoom-125.jpg),
[200%](../evidence/live-zoom-200.jpg).

## Focus, scroll and removal side effects

The focus test deliberately reversed the usual order: the extension was disabled first so a matched
`leaderboard-atf` container was visible, a real `<button>` was inserted inside it and focused, and
then the extension was enabled. This measured what happens to an already-focused element when its
ancestor becomes `display:none`.

| Observation | Result |
| --- | --- |
| Focused target | `leaderboard-atf` probe, `document.activeElement` matched it before hide |
| `blur` events | 1 |
| `focusout` events | 1 |
| `document.activeElement` after hide | `BODY` (focus did not remain in the hidden subtree) |
| Scroll position | 1200 before and 1200 after hide |
| Page height | 6609 px before hide, 6496 px after; 113 px removed |
| Re-enable | styles and containers returned; the probe was removed |
| Hidden interactive content | no matched cleanup container remained visible; tab order did not enter the hidden probe |

The page height reduction is the expected result of removing ad slots, not an unexplained layout
collapse. Re-enabling the stylesheet restores the elements and the injected CSS is fully reversible.
Focus is **not** restored automatically: the browser moved it to `BODY`, and the site may have
already handled `focusout`/`blur`. That is a browser/site consequence of hiding a focused subtree,
not something a stylesheet can undo. The 113 px height change means a scroll position is a
snapshot, not a guarantee: in this run scroll stayed at 1200, but a different page height or a
site scroll handler could clamp it. Document the page as **conditionally reversible**: CSS and
visibility reverse; focus and any site-handled events do not necessarily reverse.

With the extension enabled, 12/12 sampled tab stops were visible and none lacked an outline. This
is a keyboard/focusability check, not a screen-reader audit: no real screen reader or full
accessibility-tree traversal was run. The hidden ad containers are not keyboard-reachable while
hidden, and no necessary control was found inside the matched ad placeholders.

## Dynamic content and navigation

| Experiment | Result |
| --- | --- |
| Late inserted `.ad-placeholder` / `[id^="leaderboard-"]` node | computed `display:none` |
| Late inserted generic content | computed `display:block`, untouched |
| `history.pushState` to a second route | exactly one stylesheet remained |
| Six enable/disable cycles | exactly one stylesheet at the end |
| `history.back()` | cleanup and exactly one stylesheet remained |
| Campaign iframe / direct canvas load | no duplicate style, no extension style inside the game frame |
| Late-loading images | page remained usable; no selector removed non-ad images |

The content script applies cleanup continuously, so a node inserted after load is covered by the
same selector set. No stale status or duplicate `<style>` element was observed.

## Settings, persistence and concurrency

The sparse override system was retested with real storage writes and real page effects.

| Case | Result |
| --- | --- |
| Global `layout:false` | wrapper changed from 1600 px cap to native 1188 px |
| Per-site `cleanup:false` | 10 matched ad containers became visible again; layout stayed independent |
| Exception for `coolmathgames.com` | stylesheet removed entirely |
| Reset to defaults | exactly one 395-char stylesheet returned |
| Ten rapid writes | final state converged to the last value; wrapper 1188 px |
| Page reload | default styles still applied (395 chars) |
| Service worker terminated | reopened popup woke a new worker; fresh page still styled |
| Full Chrome restart | same extension id, stored per-site `layout:false` survived; page re-applied 1188 px |
| Restore defaults after the restart test | completed; final state has no per-site overrides |

No preference silently reverted or was overwritten during the rapid-write test. The browser-restart
check used the same disposable profile and reloaded the unpacked extension after relaunch; it is
not evidence about a normal signed-in Chrome profile.

## Selector audit

Every shipped selector was queried on the homepage, campaign and direct game route. Counts are
matches; visible means the node still had layout while the extension was enabled. All rows had zero
visible matches.

| Selector | Homepage | Campaign | Direct game | Visible | Target content |
| --- | ---: | ---: | ---: | ---: | --- |
| `[id^="leaderboard-"]` | 5 | 2 | 0 | 0 | `leaderboard-atf/btf/...` empty ad placeholders |
| `[id^="med-rect-"]` | 0 | 3 | 0 | 0 | `med-rect-*` ad placeholders |
| `[id^="sky-"]` | 0 | 2 | 0 | 0 | `sky-*` ad placeholders |
| `.ad-placeholder` | 5 | 7 | 0 | 0 | same ad placeholder family |
| `#adBanner` | 0 | 1 | 1 | 0 | the same combined ad banner node |
| `.adLeaderboard` | 0 | 1 | 1 | 0 | same node as `#adBanner` |
| `.adBanner` | 0 | 1 | 1 | 0 | same node as `#adBanner` |
| `.leaderboard_ad` | 0 | 1 | 1 | 0 | same node as `#adBanner` |
| `.pw_report_ad_container` | 0 | 0 | 0 | 0 | Playwire report container (absent in this run) |
| `.playwire_report_ad_link` | 0 | 0 | 0 | 0 | Playwire report link (absent) |
| `#fallMerchPromoTile` | 0 | 0 | 0 | 0 | seasonal merchandise tile (absent) |

The four `#adBanner` rows are redundant descriptors of one node, not four removals. No selector
matched more than 20 nodes, none matched a game canvas, header, navigation, account control, footer
or game tile, and none contained links or form controls in the matched placeholders. The direct
game route has zero cleanup matches, so its canvas is untouched. No production profile change was
made: there is no browser evidence that a selector is too broad or that the 1600 px cap should
change. The zero-match selectors are harmless but are candidates for removal only after a separate
seasonal/ad-layout check.

## Multi-profile and local-fixture architecture

No second production profile was added. A disposable copy of the extension was loaded against
local HTML fixtures under `__development/experiments/second-profile/` (gitignored).

| Fixture check | Result |
| --- | --- |
| Two valid profiles from one index | PASS: `fixture-a`, `fixture-b` both loaded |
| Invalid profile (`:root` selector) | PASS: skipped, valid profiles still loaded |
| Profile A on `127.0.0.1` | PASS: `.a-ad` hidden, `.b-ad` untouched |
| Profile B on `127.0.0.2` | PASS: `.b-ad` hidden, `.a-ad` untouched |
| Missing selector in a profile | PASS: profile still applies; missing target is not an error |
| Second route via `pushState` | PASS: exactly one stylesheet |
| Late inserted matching node | PASS: hidden |
| Per-site `cleanup:false` | PASS: `.a-ad` returned |
| Unknown host `127.0.0.9` | PASS: no content script, no stylesheet |
| Combined fixture suite | 11/11 PASS |

This confirms the profile index can carry multiple genuinely separate profiles and that hostname
matching keeps their selectors isolated. Two architectural constraints matter:

1. **Manifest allowlisting is separate from the profile index.** `manifest.json` lists both the
   Coolmath host permissions and the content-script `matches`; adding a profile without adding its
   host there means the profile never reaches the page. This is why the production manifest still
   has one site.
2. **Domains must contain a dot.** The profile validator rejects `localhost`, and an index containing
   it is refused as a whole. That is fail-closed and correct for production, but it means local
   fixtures must use dotted numeric hosts (as this run did), not `localhost`. Profile conflicts are
   already covered by the passing `validateIndex` tests for duplicate domains and duplicate files;
   the browser fixture did not duplicate that unit-test coverage.

Curated: [fixture A](../evidence/live-fixture-a.jpg), [fixture B](../evidence/live-fixture-b.jpg).
The machine-readable fixture result is local-only at
`__development/experiments/second-profile/results.json`.

## Failed experiments and harness corrections

These are retained because the negative results explain the final method.

1. **Campaign mobile preroll.** At 390 and 768 the campaign's outer game iframe stayed 0×0 behind an
   inner ad/preroll; clicking the outer `#playNowButton` did not activate it. This was not a profile
   defect. Direct `/0-drift-boss/play` loads the same game canvas and was used for the functional
   mobile/tablet and sizing checks.
2. **Campaign gate variability.** One run showed `#continue-link`, another restored the frame
   directly, and one run presented neither while the page shell stayed intact. The harness now
   accepts either a loaded frame or an intact page shell and relies on direct `/play` for the
   functional assertion. A site-controlled campaign gate is not treated as an extension failure.
3. **Native zoom shortcut.** CDP keyboard `Ctrl`+`+`/`-` did not change Chrome zoom; the first
   probe was a no-op. The matrix uses device-metrics zoom emulation and is labelled as such.
4. **Focus probe order.** The first probe looked for a visible matched container while the extension
   was enabled, so every candidate was already hidden and the probe was `null`. Fixed by disabling
   the extension first, focusing a real inserted button in the baseline, then enabling cleanup.
5. **`localhost` fixture.** The first local index used `localhost`; validation rejected the whole
   index and no profile loaded. Changed the fixtures to dotted numeric hosts. This is a documented
   architecture constraint, not a product change.
6. **320 px overflow.** The page's own 360 px content width exceeds the 305 px client width at
   320×568 in both states. It is site-level, not extension-created; no overflow was added at any
   required width.

## Changes and final state

No production defect required a source fix. The only repository changes in this milestone are:

- `scripts/browser/live-audit.js`: new dependency-free 168-check audit (campaign, direct game,
  12 widths, 8 zoom levels, focus/scroll, dynamic, settings, selector targets).
- `scripts/browser/second-profile.js`: new disposable multi-profile/local-fixture probe.
- `package.json`: `browser:audit` and `browser:fixtures` convenience scripts.
- `docs/LIVE-BROWSER-VALIDATION.md` and curated `evidence/live-*` captures/summary.
- The focus audit now records the pre-hide height and scroll values for reproducibility.

The shipped profile, manifest, content script, settings logic and service worker were not changed.
Existing local modifications elsewhere in the worktree were preserved.

## Recommendations

1. Keep the shipped cleanup defaults and the 1600 px cap. The cap is appropriate at 1920; the 2560
   gutter is a deliberate trade-off already documented, not a bug introduced here.
2. Use `/0-drift-boss/play` as the stable game regression route. The campaign page's ad/preroll and
   gate are site-controlled and make it a poor pass/fail target, though its header/footer/account
   and cleanup behavior should still be spot-checked.
3. Do not add a second production profile without adding its host permission and content-script
   match to `manifest.json`, then rerun the local fixture and a real signed-out site check.
4. Treat focus and scroll as **conditionally reversible**. Re-enabling restores CSS; it cannot undo a
   `blur`, a site `focusout` handler, or a site scroll clamp.
5. Recheck the three zero-match selectors and the four duplicate `#adBanner` descriptors only when
   the site changes its ad markup; there is no current evidence to remove them.
6. Repeat the zoom matrix with native Chrome zoom when a reliable automation path is available.

## Limitations

- One real site, one signed-in-free session, one shipped profile; cabin ad fill and campaign gates
  vary between runs.
- Zoom was emulated through device metrics, not driven through Chrome's native zoom UI.
- No screen reader, full accessibility-tree semantics, reduced-motion, forced-colors or
  high-contrast test was run. Keyboard focus and outlines were checked.
- No CPU/network throttling, memory measurement or first-paint performance claim is made.
- No payment, login, account settings or ad interaction was performed.
- Chrome 157 on Windows only; Firefox, Safari, macOS and Linux are unverified.
- Campaign mobile functional testing relies on the direct `/play` route; the outer mobile preroll
  remains a site behavior that this extension does not attempt to control.
- Full-resolution captures and raw audit JSON are local-only under `__development/experiments/`; the curated
  versioned evidence is in `evidence/`.

## Reproduce

Start a disposable headed Chrome, then run from the repository root:

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --user-data-dir="$TEMP/webtim-live-cdp" \
  --remote-debugging-port=9333 \
  --enable-unsafe-extension-debugging \
  --no-first-run --no-default-browser-check --window-size=1440,900 about:blank

npm run browser:readiness
npm run browser:audit
npm run browser:fixtures
npm test
npm run lint:profiles -- --strict
```

`browser:audit` writes `__development/experiments/live-audit/audit.json` and 32 screenshots. `browser:fixtures`
writes `__development/experiments/second-profile/results.json` and two fixture screenshots. The curated
`evidence/live-audit-summary.json` contains the compact result set used in this report; it is
versioned, while the raw files are local-only. The previous 2026-11-05 sweep remains reproducible
with `npm run browser:sweep`.
