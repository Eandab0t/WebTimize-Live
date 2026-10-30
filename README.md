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
- **Layout recovery** — on desktop, widens the content wrapper; on game pages, removes the two ad
  side columns so the game container can use the reclaimed width.
- **Per-site controls** — global on/off, site on/off, and independent cleanup/layout/network
  switches.
- **Site profiles** — versioned JSON, validated locally before use.
- **Optional network rules** — the service worker can turn profile-provided DNR rules into dynamic
  rules. The first profile ships none, so the UI disables that switch.
- **Reversible** — all page changes are one injected stylesheet. Disabling the extension or a site
  removes it; the site's DOM and JavaScript are not replaced.

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
- Layout: desktop content wrapper expands to 1600px; game-page ad side columns are removed.
- Known limits: first-party creatives that use normal page markup, ads inside cross-origin iframes,
  and future site redesigns are not guaranteed. Use the popup to disable a site immediately.

## Test

```bash
npm test
```

Covers profile schema validation, domain matching, default/per-site settings, exception handling,
CSS composition, manifest version, narrow permissions, and referenced local files. No dependencies
are installed.

Real-page selector checks were performed against the live Coolmath homepage and game page in Chrome
during development. Browser-level automated extension loading is not part of the test suite.

## Privacy and permissions

- `storage` — local/synced settings only.
- `activeTab` — read the current tab's hostname when the popup opens.
- `declarativeNetRequest` — optional profile-driven blocking; no rules are active in the first
  profile.
- Host access — `coolmathgames.com` and `www.coolmathgames.com` only.

No analytics, telemetry, accounts, remote scripts, or external profile downloads. See
[docs/competitive-research.md](docs/competitive-research.md) for the competitor and Manifest V3
research behind these choices.
