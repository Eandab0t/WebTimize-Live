# Live store metadata — pending owner values

Status: **PROVIDED by owner on 2026-11-11 — placeholders replaced.**

The `[ACTION REQUIRED]` placeholders in `CHROMEWEBSTORE.md`,
`docs/PRIVACY.md`, and `scripts/package-extension.ps1` are intentional
guards. The packaging script refuses `-ForSubmission` until every
placeholder is replaced with a real, owner-approved value.

## Required values (none invented)

1. **Monitored support email** — `eandab0t@outlook.com`.
   Status: provided.
2. **Public homepage URL** — `https://github.com/Eandab0t/WebTimize-Live`.
   Status: provided.
3. **Public privacy-policy URL and privacy contact** —
   `https://github.com/Eandab0t/WebTimize-Live/blob/main/docs/PRIVACY.md`
   plus privacy contact `eandab0t@outlook.com`.
   Status: provided.

## Rules

- Never invent an email address or URL to satisfy the guard.
- When the owner provides values, replace the placeholders in the three
  files above, re-run the submission guard, and rebuild both ZIPs.
- Screenshots checklist and signed-ZIP checklist live with the store
  listing preparation; both remain pending alongside these values.
