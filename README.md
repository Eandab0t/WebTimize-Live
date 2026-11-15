![WebTimize Live social preview](https://repository-images.githubusercontent.com/1440322792/ac69e864-a801-4ff1-92e6-3cffb0d4d6c2)

# WebTimize Live

WebTimize Live is a small Chrome and Firefox extension for cleaning up supported sites. It hides
verified ad placeholders, restores wasted layout space, and applies site-specific rules. It does
not need an account, proxy, remote code, or a WebTimize server.

It is part of the [WebTimize suite](https://github.com/Eandab0t/WebTimize):
[Compressor](https://github.com/Eandab0t/WebTimize) works before deployment and
[Inspector](https://github.com/Eandab0t/WebTimize-Inspector) audits the result. Live can be used
on its own.

## Build and install for development

The extension is one source tree with one small browser adapter. `npm run build` writes a Chrome
build and a Firefox build to dedicated directories; neither directory contains source tests or
tooling.

```bash
npm run build          # dist/chrome and dist/firefox
npm run build:chrome
npm run build:firefox
powershell -NoProfile -File scripts/package-extension.ps1 chrome
powershell -NoProfile -File scripts/package-extension.ps1 firefox
```

The packaging script creates a clean store-submission ZIP from a validated build. It refuses to
overwrite an existing archive unless `-Force` is supplied. Review the store metadata and privacy
policy in [CHROMEWEBSTORE.md](CHROMEWEBSTORE.md) before submitting. After completing all store
metadata, use `-ForSubmission`; it rejects the package if required-contact or URL placeholders
remain:

```powershell
powershell -NoProfile -File scripts/package-extension.ps1 chrome -ForSubmission
```

**Chrome:** open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and
select `dist/chrome`.

**Firefox 142+:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**,
and select `dist/firefox/manifest.json`. The build has the stable id
`webtimize-live@webtimize.dev`, a `strict_min_version` of 142.0 and a `data_collection_permissions`
declaration of `none`. A normal signed install on a release build is a separate packaging step; the
temporary add-on is the development path used here.

The first profile supports `coolmathgames.com` only. The extension requests access to that domain
alone; it does not request `<all_urls>`. The test-only browser harness copies the build and adds a
loopback host permission for its controlled fixture; that permission is never added to the shipped
manifests.

### One codebase, two manifests

- The source manifest targets Chrome's `background.service_worker`.
- The Firefox build replaces it with `background.scripts` and adds the Gecko id, minimum version and
  data-collection declaration. Firefox does not support the MV3 service-worker background model.
- `src/shared/browser-api.js` exposes a small Promise-based `WebTimizeBrowser` adapter. Firefox uses
  its native `browser` namespace; Chrome uses chrome's callback APIs wrapped in promises. There is no
  `webextension-polyfill` dependency and no scattered browser checks in product code.

## What it does

- **Page cleanup** — hides ad placeholders (`leaderboard-*`, `med-rect-*`, `sky-*`, `adBanner`) and
  the merchandise promo tile with scoped CSS.
- **Layout recovery** — on desktop, widens the content wrapper. Game pages already render the game
  full width, so no game-page layout rule is shipped.
- **Per-site controls** — the popup shows the active site, a global on/off switch, inherit/enable/
  disable site behavior, independent cleanup/layout/network switches, and a live save state. The
  options page exposes the same model plus exceptions and per-site "Use defaults".
- **Site profiles** — versioned JSON with a strict schema, validated before use.
- **Optional network rules** — the service worker turns profile-provided DNR rules into dynamic
  rules with deterministic IDs. The first profile ships none, so the UI disables that switch.
- **Reversible, non-destructive** — all page changes are one injected stylesheet. Cleanup uses
  `display: none`; no element is deleted from the DOM. Disabling the extension or a site removes the
  stylesheet; the site's DOM and JavaScript are not replaced.
- **Diagnostics** — the options page shows profile version, tested viewports, compatibility age and
  a warning when a profile has not been verified recently.

## Settings semantics (schema version 2)

Settings have global defaults (`enabled`, `features.cleanup`, `features.layout`,
`features.network`) and per-site overrides. Version 2 stores **only the values you actually set** for
a site:

```json
{
  "schemaVersion": 2,
  "enabled": true,
  "features": { "cleanup": true, "layout": true, "network": false },
  "sites": { "coolmathgames.com": { "layout": false } },
  "exceptions": ["example.com"]
}
```

- A site with `{ "layout": false }` still inherits the global cleanup setting. Turning global
  cleanup off turns it off there too.
- A site with `{ "enabled": false }` is paused; removing the override resumes inheritance.
- **Enable here** in the popup clears a pause or exception and resumes inheritance. It does not
  write a redundant `enabled: true`: the master switch still decides whether any site is active.
- Global off always wins over inherited defaults and a site that was never paused.
- Exceptions disable a site but keep its overrides, so removing the exception restores your setup.
- `null` clears an override in the settings API; the options page exposes this as **Use defaults**.
- Old version-1 settings are migrated on read. Version 1 wrote every feature for every site; the
  migration drops values that matched the global default at migration time, which keeps every site's
  current behaviour identical while restoring inheritance for untouched features.

## Profile format

```json
{
  "schemaVersion": 1,
  "id": "example",
  "name": "Example",
  "version": "1.0.0",
  "updated": "2026-10-30",
  "domains": ["example.com"],
  "features": { "cleanup": true, "layout": true, "network": false },
  "selectors": { "hide": [".ad-slot"] },
  "styles": {
    "cleanup": [],
    "layout": [".content { max-width: none !important; }"]
  },
  "networkRules": [],
  "compatibility": { "testedAt": "2026-10-30", "testedViewports": ["1440x900"], "notes": "Homepage." }
}
```

Validation (shared by the service worker and the lint tool) rejects:

- unknown schema versions or unknown fields, invalid ids/versions/dates;
- non-string selector/style arrays, duplicate domains, malformed domains (including labels that
  start or end with a hyphen), and trailing dots normalized consistently;
- selectors containing `{ } ; < > @`, and selectors that target the whole document (`*`, `html`,
  `body`, `:root`, `:is(html)`, `:where(body)`);
- CSS with `@import`, `javascript:`, `expression(...)`, `behavior:`, `-moz-binding`, unbalanced
  braces, or any `url(...)` resource (relative, protocol-relative or absolute);
- network rules without a `urlFilter`, with unknown resource types, or with a non-`block` action;
- `networkRules` when `features.network` is `false`.

Profiles are loaded only through `profiles/index.json`, only from plain file names under
`profiles/`; the index itself is validated (unique domains and files, no traversal), and a profile
must declare the domain it is indexed under. Profiles cannot contain executable JavaScript, and
there is no remote profile download.

### Authoring workflow

```bash
npm test                 # unit and integration checks, no dependencies
npm run lint:profiles    # schema, compatibility age, risky selectors
node tools/profile-lint.js --strict --json
```

The lint tool reports selectors that may touch navigation, account, game or payment controls so they
get a manual check, flags layout CSS that hides content, and warns when a profile's `testedAt` date is
older than 180 days. A profile should not be added without evidence: open the site at the recorded
viewports, confirm the selector matches the intended element and nothing critical, and record the
date and viewports in `compatibility`.

## Coolmath profile notes

Verified on 2026-10-30 at 596×900, 1440×900, and 1600×1000 on the homepage and `/0-drift-boss`.

- Hidden: verified ad placeholders, ad banner containers, report-ad links, merchandise promo tile.
- Preserved: game iframe and controls, header navigation, account controls, game promotion cards,
  footer navigation.
- Layout: desktop content wrapper expands to 1600px. The game page already renders the game full
  width, so the profile ships no game-page layout rule.
- Known limits: first-party creatives that use normal page markup, ads inside cross-origin iframes,
  and future site redesigns are not guaranteed. Use the popup to disable a site immediately.

## Test

```bash
npm test
```

96 tests, no dependencies. They cover settings normalization and migration, profile and index
validation, deterministic DNR rule generation (including >100 rules, multi-domain scoping and the
rule cap), the service worker's profile loading and serialized rule sync, the content script's
apply/remove cycles and failure paths (run in a VM against a fake extension API), CSS composition,
presentation strings, profile lint, popup status/label markup, build output and manifest generation,
the browser adapter, and the manifest/permission coverage of every indexed domain.

### Real browsers

```bash
npm run browser:popup:chrome
npm run browser:popup:firefox
```

Both scripts build a dedicated test copy, start a local fixture, and use a disposable browser
profile. They never touch the everyday Chrome or Firefox profile and never add test host permissions
to `dist/`. The Chrome harness loads `dist/chrome` through `Extensions.loadUnpacked` on the DevTools
endpoint and confirms the actual toolbar popup can be opened; the Firefox harness installs
`dist/firefox` as a temporary add-on through geckodriver.

On 2026-11-07, Chrome 157.0.8103.39 passed all 12 checks and Firefox 159.0.1 passed all 8. Both
browsers applied the controlled profile, reflected storage changes in the popup, cleared a sparse
site pause, and installed a DNR rule that blocked the fixture script. Chrome also verified the global
off state, unsupported-page state and rapid-toggle convergence. The Firefox run verified the popup
page in a real Firefox window and options at Firefox's 500 px minimum window width; WebDriver cannot
open a toolbar panel, so that is not a claim that the actual Firefox toolbar popup was photographed.
Curated screenshots are in
[evidence](evidence); the full local-only set is under `__development/experiments/popup-check/`.

The older headed-Chrome Coolmath harness remains in `scripts/browser/`. Chrome 137+ ignores
`--load-extension` in branded builds, so `readiness.js` still loads the unpacked directory through
the DevTools endpoint and `sweep.js` records the 1024–2560 px layout results. That site-specific
history is in [docs/browser-verification.md](docs/browser-verification.md).

## Privacy and permissions

- `storage` — local/synced settings only.
- `activeTab` — read the current tab's hostname when the popup opens.
- `declarativeNetRequest` — optional profile-driven blocking; no rules are active in the first
  profile and filtering is off by default.
- Host access — `coolmathgames.com` and `www.coolmathgames.com` only.

No analytics, telemetry, accounts, remote scripts, or external profile downloads. Internal
competitive research is kept under local-only `__development/docs/`; see
[docs/profile-authoring.md](docs/profile-authoring.md) for the profile contract.

## Known limitations

- A stylesheet can hide an element, but removing it cannot undo a `blur`, `focusout` or scroll
  event the page already handled. Hiding a focused element can move focus; profiles must avoid
  interactive controls, and the lint tool warns about selectors that look like them.
- Styles are applied after settings and the profile resolve (both asynchronous). They are not
  guaranteed to exist before the first paint; the content script starts at `document_start` so it is
  as early as the extension model allows.
- CSS selectors apply to elements added later (SPA navigation, infinite scroll), but a profile
  change or a newly supported site needs a reload to inject/remove the stylesheet.
- Cross-origin iframes are not modified; ads inside them are out of scope.
- Profiles age. A stale profile is flagged, not silently trusted.

## Development

```text
manifest.json                 MV3 manifest, narrow host permissions
src/background/               service worker: profile loading, settings defaults, DNR sync
src/content/                  content script: validates selectors, injects/removes one style element
src/shared/                   settings, profile validation, rule building, presentation, CSS helpers
src/popup/                    compact current-site controls
src/options/                  global defaults, per-site overrides, exceptions, diagnostics, privacy
profiles/                     versioned site profiles and index
tools/                        profile lint
tests/                        Node built-in test runner (no dependencies)
docs/                         public documentation and profile authoring
evidence/                     curated screenshots and receipts
__development/                local-only experiments, research, browser profiles and captures
```

The extension uses declarative network rules only through `declarativeNetRequest`. It does not run a
local proxy and cannot rewrite arbitrary HTTP response bodies.

## Versioning

`package.json`, `manifest.json` and [CHANGELOG.md](CHANGELOG.md) move together; the current version is
0.3.0. The generated Firefox manifest adds only build-specific background metadata under
`browser_specific_settings`; the permission set is unchanged.

## License

WebTimize Live is released under the MIT License. See [LICENSE](LICENSE).
The generated Chrome and Firefox builds include the license file. The extension has no
runtime third-party dependencies.
