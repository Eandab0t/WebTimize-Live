# WebTimize Live

A local-first Chrome Manifest V3 extension for site-specific layout cleanup. It hides verified ad
placeholders, reclaims wasted margins and side rails, and applies tested per-site rules. No account,
proxy, remote code, or WebTimize-operated server.

## Install for development

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder (`WebTimize Live`).
4. Open [Coolmath Games](https://www.coolmathgames.com/) and use the toolbar popup.

The first profile supports `coolmathgames.com` only. The extension requests access to that domain
alone; it does not request `<all_urls>`.

## What it does

- **Page cleanup** — hides ad placeholders (`leaderboard-*`, `med-rect-*`, `sky-*`, `adBanner`) and
  the merchandise promo tile with scoped CSS.
- **Layout recovery** — on desktop, widens the content wrapper. Game pages already render the game
  full width, so no game-page layout rule is shipped.
- **Per-site controls** — global on/off, site on/off, and independent cleanup/layout/network
  switches.
- **Site profiles** — versioned JSON, validated locally before use.
- **Optional network rules** — the service worker can turn profile-provided DNR rules into dynamic
  rules. The first profile ships none, so the UI disables that switch.
- **Reversible, non-destructive** — all page changes are one injected stylesheet. Cleanup uses
  `display: none`; no element is deleted from the DOM. Disabling the extension or a site removes the
  stylesheet; the site's DOM and JavaScript are not replaced.

## Architecture

```text
manifest.json                 MV3 manifest, narrow host permissions
src/background/               service worker: profile loading, settings defaults, DNR sync
src/content/                  content script: validates selectors, injects/removes one style element
src/shared/                   settings, profile validation, and pure CSS composition helpers
src/popup/                    compact current-site controls
src/options/                  global defaults, per-site overrides, exceptions, privacy
profiles/                     versioned site profiles and index
tests/                        Node built-in test runner (no dependencies)
docs/                         competitive and technical research
experiments/                  ignored legacy prototype archive; never shipped
```

The extension uses declarative network rules only through `declarativeNetRequest`. It does not run a
local proxy and cannot rewrite arbitrary HTTP response bodies.

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
  "compatibility": { "testedAt": "2026-10-30", "notes": "Tested on the homepage." }
}
```

Validation rejects unknown schema versions, non-string selector/style arrays, and CSS containing
`@import`, `javascript:`, `expression(...)`, or `behavior:`. Profiles cannot contain executable
JavaScript.

Add a profile by adding a file under `profiles/` and an index entry. The match list in
`manifest.json` must also be extended; this is intentional so a new domain is never granted silently.

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

Covers profile schema validation, domain matching, default/per-site settings, exception handling,
CSS composition, manifest version, narrow permissions, referenced local files, and that layout
rules never hide content. No dependencies are installed.

The extension was also loaded unpacked in Chromium 143 through Playwright and exercised against the
live site at 1440×900 and 596×900: stylesheet application, ad hiding, preserved navigation, the
game canvas route, popup and options rendering, cleanup/global toggles, restart persistence, and
absence of extension page errors (21 checks). Chrome's branded build ignores `--load-extension` for
automation, so loading `chrome://extensions` → **Load unpacked** remains the way to test in Chrome
itself; that manual load is not automated here.

## Privacy and permissions

- `storage` — local/synced settings only.
- `activeTab` — read the current tab's hostname when the popup opens.
- `declarativeNetRequest` — optional profile-driven blocking; no rules are active in the first
  profile.
- Host access — `coolmathgames.com` and `www.coolmathgames.com` only.

No analytics, telemetry, accounts, remote scripts, or external profile downloads. See
[docs/competitive-research.md](docs/competitive-research.md) for the competitor and Manifest V3
research behind these choices.
