# Security and privacy audit — WebTimize Live

Date: 2026-11-06  
Scope: MV3 manifest, content script, service worker, profile/index loading, DNR rules,
storage migration, popup/options pages, and the dependency footprint.  
Environment: source review plus the dependency-free Node test suite. No browser profile
was modified, no account was used, and no remote service was contacted.

## Threat model

Live runs only on `coolmathgames.com` and `www.coolmathgames.com`. The main threats are:

- a page trying to execute code or read extension storage;
- a malformed or malicious profile escaping `profiles/`, injecting CSS/JS, or creating
  unsafe DNR rules;
- one supported site's settings/profile affecting another site;
- settings surviving an uninstall/disable or being corrupted by a sync conflict;
- unexpected network traffic or unnecessary personal data storage.

Profiles are shipped inside the extension and are not downloaded at runtime. A user who
edits extension files can already execute arbitrary extension code; that is not the
boundary this audit claims to defend.

## Findings

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| L-1 | Low | Whole-document selector validation missed `:root`, `:is(html)` and `:where(body)`, allowing a profile to hide the entire page. | Fixed |
| L-2 | Low | Settings use `chrome.storage.sync`, so they may leave the device through the browser's sync service despite the "local-first" description. | Documented privacy choice |
| L-3 | Info | Service-worker messages have no explicit `sender.id`/tab check; no `externally_connectable` or web-accessible extension pages exist, so a normal web page cannot send them. | Residual hardening |
| L-4 | Info | A trusted profile can apply broad CSS (fixed overlays, hiding non-ad content) by design; validation cannot infer intent. | Trusted-profile boundary |
| L-5 | Info | The only runtime `fetch` is `chrome.runtime.getURL()` for bundled profiles. | Verified |

No high or critical issue was confirmed, and no exploitable cross-site path was found.

## L-1 — whole-document selector bypass

**Affected:** `src/shared/profile.js`, `WHOLE_PAGE_SELECTOR`.

The validator rejected selectors beginning with `*`, `html` or `body`, but not the CSS
pseudo-class `:root`, which also targets the document element. `:is(html)` and
`:where(body)` have the same effect. A profile containing
`"selectors": { "hide": [":root"] }` therefore validated and could generate:

```css
:root { display: none !important; }
```

**Reproduction before the fix:** take the shipped profile, replace `selectors.hide` with
`[":root"]`, and call `WebTimizeProfile.validate(profile)`; it returned no whole-document
error. The same held for `:is(html)` and `:where(body)`.

**Fix:** the whole-document regex now rejects those forms as well:

```js
/^(?:\*|html|body|:root)(?![\w-])|^:(?:is|where)\(\s*(?:html|body|:root)\s*\)/i
```

**Regression test:** `tests/profile-v2.test.js` — `selectors cannot inject CSS or target
the whole page` now iterates over `*`, `body`, `html`, `:root`, `:is(html)` and
`:where(body)`, requiring a validation error for each.

This remains a validation guard, not a sandbox: a trusted profile can still hide ordinary
page elements with an allowed selector. That is the product's purpose.

## L-2 — storage.sync privacy

Settings are stored under `webtimSettings` in `chrome.storage.sync`. The README lists
"local/synced" explicitly and no analytics or remote profile service exists, but a user
who expects "local-first" to mean "never leaves this computer" should know that Chrome may
sync these site preferences through their browser account. The payload is limited to
feature flags, supported-domain overrides and exception domains; no page content, URLs
with paths, query strings or browsing history are stored.

No code change was made: switching to `storage.local` would change an intentional
cross-device feature and the schema/migration contract. The privacy statement should stay
prominent in release notes.

## L-3 — message surface

`service-worker.js` handles `webtim:get-profile`, `webtim:list-profiles` and
`webtim:sync-network-rules`; `content.js` handles `webtim:status` and `webtim:refresh`.
Handlers validate message type and treat `hostname` through the normalizer. There is no
`externally_connectable` entry, no `web_accessible_resources`, and no listener for
`onMessageExternal`, so an ordinary web page cannot call these APIs. The content script's
isolated world is the only page-side sender.

Adding `sender.id === chrome.runtime.id` and tab checks would be defense in depth, not a
fix for a reproduced exploit, so it was not changed in this audit. Revisit if externally
connectable messaging or a second content-script host is added.

## L-4 — profile trust boundary

Profiles cannot contain executable JavaScript, but they can contain CSS and DNR block
rules. A profile can hide legitimate content, add a fixed overlay, or block a script if
its author writes it that way. Validation rejects known injection forms, whole-document
selectors, all `url(...)` resources, `@import`, `javascript:`, `expression`,
`behavior` and `-moz-binding`; it cannot decide whether a selector is semantically
appropriate. Profiles ship with the extension, are versioned, and have no runtime download
path, so the trust boundary is "whoever can edit the extension package."

## Confirmations

| Check | Evidence |
| --- | --- |
| Permissions | `manifest.json`: `storage`, `activeTab`, `declarativeNetRequest`; host permissions only the two Coolmath origins. `tests/manifest.test.js` asserts no `<all_urls>`. |
| Content-script isolation | Runs in the isolated world; `all_frames:false`; the game iframe is not modified. |
| Profile traversal | `safeProfilePath` restricts to plain `.json` names; `validateIndex` rejects separators, `..`, duplicates and unknown domains; service worker re-checks `entry.domain` against `profile.domains`. |
| CSS injection | Selector characters `{ } ; < > @` and whole-document forms are rejected; CSS directives and every `url()` resource are rejected. |
| DNR validation | Only `block`; resource types allowlisted; filter length capped; deterministic hash IDs with collision probing; cap 5,000; each enabled domain is scoped separately. |
| Storage integrity | `normalize()` rebuilds only known fields, drops invalid domains/sites, deduplicates exceptions and is idempotent. Corrupt or missing values fall back to defaults. |
| Settings migration | Version-1 sparse migration is covered by `tests/settings.test.js`; unknown future versions are normalized rather than trusted. |
| Popup/options injection | No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `new Function` or `document.write` in `src/`. Profile strings are rendered with `textContent`. |
| Remote code | No remote scripts, no external `fetch`, no `web_accessible_resources`; the only `fetch` is the bundled profile URL. |
| Data leakage | Settings contain domains/flags only; no page text, cookies or credentials. Storage sync caveat is L-2. |
| One site affecting another | Host permissions and content-script matches are fixed to the Coolmath origins; settings keys are normalized per hostname; a profile can intentionally list multiple domains, but there is no runtime cross-site data channel. |
| Disabling removes effects | `content.js` removes the single style element and `data-webtim-live`; `tests/content.test.js` covers disable, re-enable and repeated toggles without duplicates. |

## Dependency and secret audit

- Runtime npm dependencies: none. `package.json` has no `dependencies` or
  `devDependencies`; tests use Node's built-in runner. `npm audit` cannot run without a
  lockfile, and there is nothing to audit.
- No `.env`, private key, credential or token file was found. A regex scan of tracked text
  for common key formats, private-key headers and `password`/`token` assignments returned
  no matches.
- `.gitignore` excludes `__development/experiments/` (local evidence), `node_modules/` and `*.zip`.
  No generated secrets or build output are tracked.

## Test evidence

```text
npm test
90 tests, 90 pass, 0 fail
```

The six selector cases run in the existing profile test; the full suite was run after the
validation change. The browser-level disable/re-enable and service-worker restart evidence
is in `docs/browser-verification.md` and the ignored `__development/experiments/` directory.

## Remaining risk

- `storage.sync` can leave the device (L-2).
- No explicit sender/tab authorization (L-3); currently unreachable from ordinary pages.
- A trusted profile can still change the page broadly, and CSS cannot undo page event
  handlers or focus/blur effects.
- DNR rules can break a supported site if a profile author writes an over-broad filter;
  the cap and validation limit shape, not intent.
- The extension does not defend against a compromised browser profile or another
  extension with debugging access.
