# Changelog

## Unreleased

### Added

- **Licensing**: MIT `LICENSE`, package metadata and a copy of the license in both generated
  extension builds.

## 0.3.0 — 2026-11-07

### Added

- **Chrome and Firefox builds from one source tree**: `npm run build` writes dedicated
  `dist/chrome` and `dist/firefox` directories. The Firefox build uses a MV3 event page
  (`background.scripts`), the stable id `webtimize-live@webtimize.dev`, `strict_min_version` 142.0
  and `data_collection_permissions` of `none`.
- A small Promise-based `WebTimizeBrowser` adapter. Firefox uses the native `browser` namespace and
  Chrome's callback APIs are wrapped without a `webextension-polyfill` dependency.
- Redesigned toolbar popup with the real active site, global state, inherit/enable/pause behavior,
  feature switches, inherited/custom labels, save progress, error state and accessible status
  regions. Popup saves are serialized and storage changes re-render the open popup.
- Dependency-free real-browser harnesses: `npm run browser:popup:chrome` and
  `npm run browser:popup:firefox`, with a controlled loopback fixture and disposable profiles.
- 96 dependency-free tests, including build output, browser adapter, popup markup and manifest
  generation.

### Changed

- Options copy and controls are browser-neutral; the Firefox build is generated with its own
  manifest metadata rather than a second source tree.
- `manifest.json` and `package.json` are version 0.3.0.

### Verified

- Chrome 157.0.8103.39 passed **12/12** checks, including the actual toolbar action popup, popup
  states, sparse site pause, DNR blocking and 390 px options layout.
- Firefox 159.0.1 passed **8/8** checks after temporary add-on installation: content script,
  popup page, storage updates, DNR blocking and responsive options.
- Details and curated captures: [docs/browser-validation-0.3.0.md](docs/browser-validation-0.3.0.md).

### Not verified in this release

- The actual Firefox toolbar panel was not opened; the popup page was exercised at the Firefox
  minimum window width. Coolmath was not re-run in Firefox. No release-signing or store submission
  was performed.

### Fixed

- **Per-domain DNR scoping**: a profile with multiple domains used the first domain to decide
  whether network rules were enabled, then applied those rules to every domain. Each enabled domain
  now gets its own rule scope, so a disabled site cannot inherit another site's blocking.
- **Unrelated storage writes**: the service worker rebuilt DNR rules for any `chrome.storage.sync`
  change, not just the WebTimize settings key. It now reacts only to that key, and serializes rule
  updates so concurrent storage events cannot leave an older rule set installed.
- **Options “Enable site” did not clear an exception**, unlike the popup, so the site stayed disabled.
  Enabling a site now removes its exception, and the site switch is disabled while global protection
  is off.
- **Profile CSS resource bypass**: validation rejected only absolute/protocol-relative `url(...)`;
  a relative `url(...)` could still make an unexpected same-origin request. All CSS `url()` forms
  are now rejected.
- **Domain labels**: domains with a leading/trailing hyphen in any label were accepted. They are now
  rejected, and a trailing dot is normalized consistently in profiles and settings.
- **Initial UI interaction**: popup/options controls start disabled and are enabled only after their
  asynchronous settings/profile load completes, avoiding writes from default placeholder state.
- **Popup status announcements**: the global state and per-site status now expose `role="status"`
  and `aria-live="polite"`, so a screen reader is told when protection is toggled or a site is
  paused. The popup error banner already used `role="alert"`; all switches have accessible names.

### Additional coverage

- Regression coverage for multi-domain rule scoping, unrelated storage events, exception clearing,
  relative CSS resources, domain-label validation, and manifest coverage of indexed profile domains.
- Test count: **96** (was 90; browser adapter and build tests added).
- `npm run browser:options`: a focused Chrome check for initialized controls and exception clearing.

## 0.2.0

### Fixed

- **Per-site settings now inherit global defaults.** Version 1 wrote every feature as a boolean for
  every site, so disabling cleanup globally had no effect on a site where only layout had been
  changed. Site entries are now sparse; only explicit choices are stored. Stored version-1 settings
  are migrated on read without changing any site's current behaviour.
- **Network rule ids can no longer collide.** They were `profileIndex * 100 + ruleIndex + 1`, which
  repeated once a profile had more than 100 rules or two profiles overlapped. Ids now come from a
  stable content hash with deterministic collision resolution.
- **Profile paths are confined to `profiles/`.** Index entries with `..`, separators or non-JSON
  names are rejected before loading; the index is validated as a whole.
- **The content script no longer fails silently.** Storage or messaging failures fall back to
  defaults or leave the page untouched, with the reason exposed in the status response. Listener
  registration happens before the async startup so the popup always gets an answer.
- **Whole-document selectors cannot hide the page through `:root`.** Validation rejected `*`,
  `html` and `body` but accepted `:root`, `:is(html)` and `:where(body)`; all six forms are now
  rejected by the shared profile validator.
- **Popup and options can no longer drop concurrent saves** (writes are serialised), and they show
  a failure instead of pretending settings were saved.

### Added

- Strict profile validation: ids, versions, dates, duplicate domains, unknown fields, selector
  injection characters, whole-document selectors, CSS balance, external `url(...)` resources,
  network-rule resource types and actions.
- Profile compatibility diagnostics: tested date, age, viewports, stale warning in the options page
  and the popup.
- `npm run lint:profiles` (`tools/profile-lint.js`): schema/index validation, stale profiles, risky
  selectors, layout rules that hide content, `--strict` and `--json` modes.
- Popup: pause/resume the current site, stale-profile warning, explicit error banner.
- Options: per-site "Use defaults", inherited/override labels, profile diagnostics panel, and a
  "Re-apply network rules" action.
- 82 dependency-free tests (was 14), including service-worker and content-script integration tests.
- Headed-Chrome CDP harness (`scripts/browser/`): loads the unpacked extension without
  `--load-extension`, verifies the rendered stylesheet, settings changes, disable/remove and MV3
  worker restart, and sweeps 1024–2560 px while keeping styled and extension-disabled baselines.
  Results and rejected candidates are in `docs/browser-verification.md`, with a curated evidence set
  in `evidence/`; the 26 MB of full captures stays in gitignored `__development/experiments/`.

### Changed

- `manifest.json` and `package.json` are version 0.2.0.
- `profiles/coolmathgames.com.json` is 1.0.1: metadata records the 2026-11-05 browser re-check and
  the measured 2560 px gutter limitation; no selector or CSS changed.
- `networkRules` must be present (an empty array is fine) and requires `features.network: true` when
  non-empty.

### Not verified in this release

- First-paint timing, focus/scroll side effects, the game page, and browsers other than Chrome.
  Rendering, settings propagation, disable/remove and worker restart were exercised in Chrome 157.
