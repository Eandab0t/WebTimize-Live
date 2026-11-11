# Authoring a WebTimize Live profile

A profile is a promise: "these selectors hide advertising clutter on this site, and these layout
rules reclaim space, without touching navigation, account or game controls." A profile without
evidence is worse than no profile.

## 1. Files

```text
profiles/
  index.json                 the only entry point the extension reads
  example.com.json           one profile per file
```

`profiles/index.json`:

```json
{
  "schemaVersion": 1,
  "profiles": [{ "domain": "example.com", "file": "example.com.json" }]
}
```

- `file` must be a plain `.json` file name directly under `profiles/`; paths with `/`, `\` or `..`
  are rejected, as are duplicate files and duplicate domains.
- The profile must list the indexed domain in its own `domains`.
- Adding a profile also requires extending `host_permissions` and the content-script `matches` in
  `manifest.json`. This is deliberate: a new domain is never granted silently.

## 2. Profile schema (version 1)

| Field | Required | Rules |
|---|---|---|
| `schemaVersion` | yes | exactly `1` |
| `id` | yes | lowercase slug, letters/digits/hyphens |
| `name` | yes | 1–80 characters |
| `version` | yes | `MAJOR.MINOR.PATCH`; bump when selectors or styles change |
| `updated` | yes | `YYYY-MM-DD`, a real date |
| `domains` | yes | non-empty, unique, real domains; `www.` and a trailing dot are normalised away; labels cannot start or end with a hyphen |
| `features` | yes | three booleans: `cleanup`, `layout`, `network` |
| `selectors.hide` | no | array of CSS selectors used by cleanup |
| `styles.cleanup` | no | extra CSS applied only when cleanup is on |
| `styles.layout` | no | CSS applied only when layout is on |
| `networkRules` | yes | array (may be empty) |
| `compatibility` | no | `testedAt`, `testedViewports`, `notes` |

Unknown fields are rejected, so a typo cannot ship silently. All CSS is concatenated into one
stylesheet; the validator rejects `@import`, `javascript:`, `expression(...)`, `behavior:`,
`-moz-binding`, every `url(...)` resource (including relative URLs) and unbalanced braces.

Selectors are inserted into that stylesheet, so they must not contain `{ } ; < > @`, and they must
not target the whole document (`*`, `html`, `body`, `:root`, `:is(html)`, `:where(body)`). Each selector is also checked against the live
DOM by the content script; a selector the browser rejects is dropped with a console warning while
the rest of the profile still applies.

## 3. What to hide — and what never to hide

Good candidates: containers whose id/class names the site's own ad stack (for example
`[id^="leaderboard-"]`), verified empty ad wrappers, a promo tile for merchandise.

Never hide:

- login, signup, password, payment or checkout controls;
- the only route to a next step (a "continue" or "play" button);
- site navigation, search, or account menus;
- game canvases, iframes, or controls;
- anything inside a cross-origin iframe (you cannot style it anyway).

A visually empty element is not automatically an ad. If a selector could match a layout wrapper that
later contains content, narrow it. `npm run lint:profiles` warns when a selector looks like it
targets `a`, `button`, `input`, `form`, `iframe`, `canvas`, `nav`, `header`, `footer`, or names such
as login/account/checkout/payment/cart/game.

## 4. Layout rules

Layout CSS must not hide content: the lint tool treats `display: none` in `styles.layout` as an
error. Prefer `max-width`, padding and gap adjustments inside a desktop media query. A
`position: fixed` full-page overlay is flagged because it can cover controls.

## 5. Evidence and compatibility dates

For each route you support:

1. Open the route at the viewports you will record (for example 596×900, 1440×900, 1600×1000).
2. Confirm every selector matches the intended element and nothing else. If a selector is broad,
   narrow it.
3. Confirm navigation, account controls, the game area and the footer still work.
4. Write the date in `updated` and `compatibility.testedAt`, and the viewport list in
   `compatibility.testedViewports`.
5. Note the routes you checked in `compatibility.notes`.

Profiles older than 180 days are marked stale in the options page and by the lint tool. Staleness is
a prompt to re-check, not proof of breakage.

## 6. Network rules

Network filtering is off by default and must stay optional.

- Only add a rule when you have verified it blocks an ad/tracker request and does not break the site.
- `urlFilter` is required; `resourceTypes` is optional and defaults to
  `script, image, xmlhttprequest, sub_frame`.
- Only `block` actions are accepted. Unknown resource types are rejected rather than widened.
- Each enabled domain in a multi-domain profile gets its own rule with `initiatorDomains` scoped
  to that domain, so one paused site cannot inherit another site's blocking.
- Dynamic rule IDs are derived from the rule content, so adding a profile cannot renumber another
  profile's rules. Duplicate rules are emitted once.
- `features.network` must be `true` and `networkRules` must be non-empty before the UI enables the
  switch for that site.

## 7. Checklist

```bash
npm test
npm run lint:profiles
```

Then, manually:

- Load unpacked in `chrome://extensions`.
- Visit each recorded route at each recorded viewport.
- Toggle cleanup, layout, pause and global off/on; reload; confirm the page returns to its original
  appearance when everything is off.
- Confirm the popup shows the right profile version and compatibility date.
- Confirm the site has no unexpected extension errors in the console.

Do not add a profile just to increase the supported-site count.
