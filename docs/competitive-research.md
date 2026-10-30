# WebTimize Live — competitive and technical research

Research date: 2026-10-30. Sources were read directly; marketing/store listing text was not treated as technical evidence.
WebTimize Live is a local-first Chrome Manifest V3 extension for site-specific layout cleanup. It is not a general ad blocker and does not use a proxy.

## 1. Competitor overview

| Tool | Architecture | Strengths | Limits relevant to Live | License |
|---|---|---|---|---|
| [uBlock Origin](https://github.com/gorhill/ublock) | MV2 background filtering engine + cosmetic filters | Extremely expressive procedural filters, element picker, mature lists | Removed from Chrome Web Store in 2026; MV2; expert filter syntax | GPL-3.0 |
| [uBlock Origin Lite](https://github.com/uBlockOrigin/uBOL-home) | Declarative DNR rulesets + packaged CSS/JS | MV3-native, no idle CPU, permission-light | Generic cosmetic filtering off by default; rule freshness tied to releases | GPL-3.0 |
| [AdGuard](https://github.com/AdguardTeam/AdguardBrowserExtension) | DNR + local script rules + assistant | Industrial filter maintenance, visual blocker | Ad/annoyance focus; large permission surface | GPL-3.0 |
| [Ghostery](https://github.com/ghostery/ghostery-extension) | MV3 service-worker cosmetic engine + DNR | Tracker transparency | CPU/battery cost, DNR quota compromises, telemetry/anti-tracking scope | GPL-3.0 |
| [SponsorBlock](https://github.com/ajayyy/SponsorBlock) | Content script + crowdsourced API | Community segments, graceful degradation | Server-dependent by design; video-only | GPL-3.0 |
| [Stylus](https://github.com/openstyles/stylus) | Tiny content script + UserCSS | Powerful CSS authoring, variables, import/export | Author-first UX; broad host access; no layout intent | GPL-3.0 |
| [Stylebot](https://github.com/ankit/stylebot) | Background prepares CSS; page injects it | Best visual point-and-click UX, profiles, shadow DOM support | Edits declarations, not structural layout recovery | MIT |

Single-site “cleaner” extensions for X, YouTube, and Reddit demonstrate demand, but each is a one-off. There is no widely adopted general engine for user-defined, per-origin layout patches.

## 2. Relevant open-source projects

- **uBlock Origin** — reference for expressive cosmetic filtering (`:has-text`, `:has()`, `:style()`, `:remove()`) and element picking. Its syntax is more powerful than Live needs and its Chrome availability has changed.
- **uBO Lite** — reference for declarative MV3 architecture: compile rules ahead of time, avoid service-worker work on navigation, request minimal permissions.
- **AdGuard** — reference for filter maintenance, but not a model for a small local product.
- **Ghostery** — cautionary example of moving a cosmetic-filter engine into the MV3 service worker and paying CPU/rule-quota costs.
- **Stylus** — reference for a small content script and a portable UserCSS format. Live can export compatible CSS later.
- **Stylebot** — reference for visual editing, per-site profiles, `!important` handling, and shadow-DOM awareness.
- **SponsorBlock** — reference for graceful degradation and public data formats, but its server dependency is out of scope.

## 3. Technologies and libraries worth evaluating

| Need | Approach for Live | Why |
|---|---|---|
| Page CSS cleanup | `scripting.insertCSS` or content-script `<style>` | No network, pre-paint application, reversible |
| Element hiding | Scoped CSS selectors, not DOM deletion | Keeps site JavaScript and event handlers intact |
| Layout recovery | Narrowly anchored `:has()`/child selectors and spacing rules | Collapses wrappers left behind by hidden ads |
| Network blocking | `declarativeNetRequest` rules generated from profiles | Supported MV3 path; no proxy/response rewriting |
| Settings | `chrome.storage.sync` | Local-first, per-browser sync without an account |
| Profile format | Versioned JSON, validated locally | Declarative, testable, no remote code |
| UI | Plain HTML/CSS/JS | No framework or build step needed for this scope |

## 4. Technical limitations

- MV3 has no general API for rewriting arbitrary HTTP response bodies. DNR can block/redirect/change supported headers, not transform page HTML.
- The service worker is event-driven and can be suspended; it must not hold durable state in globals.
- DNR rule quotas exist (roughly 30,000 guaranteed static rules, 5,000 session rules, 1,000 regex rules). Live should use few, specific rules.
- CSS `:has()` is widely available but can be expensive on mutation-heavy pages if anchored broadly. Scope it to a site and a container.
- Hiding an ad slot does not automatically reclaim its grid/flex space; a separate, tested layout patch is required.
- First-party ads, iframes, canvas games, and dynamically generated controls cannot be classified reliably by generic names. Site-specific testing is mandatory.
- A content script on `<all_urls>` creates a broad permission warning. Live should start with a narrow host list and optional per-site grants.

## 5. Licensing considerations

- uBlock Origin, uBO Lite, AdGuard, Ghostery, SponsorBlock, and Stylus are GPL-family. Do not copy their code into a permissively licensed product; use documented formats and independent implementations.
- Stylebot is MIT; still verify any reused code and attribution.
- Chrome extension APIs are platform interfaces, not licensed source.
- Profile data authored for Live should be original and tested; do not scrape proprietary filter lists without checking their licenses.

## 6. Features Live should adopt

1. Declarative, validated site profiles with a schema version.
2. CSS-first hiding and layout patches that are reversible by removing one style element.
3. Per-site and global enable/disable controls.
4. A narrow permission footprint: only the first supported domain at install time.
5. Optional DNR network rules, generated from profiles and independently toggleable.
6. Clear status in the popup: supported/unsupported, profile version, which features are active.
7. Local settings with no account, telemetry, or remote code.
8. Documented compatibility limits and a kill switch for each site.

## 7. Features Live should avoid duplicating

- A full EasyList-compatible ad-blocking engine or filter subscription manager.
- Generic cosmetic filtering across every site at install time.
- Remote script execution or remotely supplied JavaScript.
- A local HTTP proxy or MITM certificate.
- Anti-adblock circumvention.
- Cloud accounts, telemetry, or server-side profiles.
- Broad `<all_urls>` access before a feature requires it.

## 8. Identified opportunity

**Layout patches, not blocking.** Existing blockers hide ad elements but often leave reserved whitespace, collapsed sidebars, and empty grid cells. Live can own the missing step: a small, site-specific, reversible stylesheet that removes the leftover space and gives content more room, applied before first paint.

The first profile targets Coolmath Games because its ad placeholders and side columns are identifiable, while its game container and controls are distinct and must be preserved.

## 9. Recommended development priorities

1. Ship the Coolmath profile with CSS-only cleanup and layout recovery. (This milestone.)
2. Add a visual element picker that proposes layout operations, not arbitrary CSS.
3. Add profile export/import as plain JSON and optional UserCSS export.
4. Expand to a second site only after the profile format and compatibility tests stabilize.
5. Add optional DNR rules only when a verified request list exists and can be toggled safely.
6. Add a measured before/after layout report (vertical extent, hidden elements, reclaimed width).

## 10. Sources

All accessed 2026-10-30.

- https://github.com/gorhill/ublock
- https://github.com/gorhill/uBlock/wiki/Static-filter-syntax
- https://github.com/gorhill/uBlock/wiki/Procedural-cosmetic-filters
- https://github.com/uBlockOrigin/uBOL-home
- https://github.com/uBlockOrigin/uBOL-home/wiki/Frequently-asked-questions-(FAQ)
- https://github.com/AdguardTeam/AdguardBrowserExtension
- https://github.com/ghostery/ghostery-extension
- https://www.ghostery.com/blog/manifest-v3-the-ghostery-perspective
- https://github.com/ajayyy/SponsorBlock
- https://github.com/openstyles/stylus
- https://github.com/openstyles/stylus/wiki/Writing-UserCSS
- https://github.com/ankit/stylebot
- https://github.com/ankit/stylebot/blob/main/docs/css.md
- https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- https://developer.chrome.com/docs/extensions/reference/api/scripting
- https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- https://developer.mozilla.org/en-US/docs/Web/CSS/:has
