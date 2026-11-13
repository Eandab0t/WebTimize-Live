# Chrome Web Store Listing — WebTimize Live

> Last Updated: 2026-11-11
> Status: Draft — contact, policy URL, and screenshots complete; signed store ZIP still requires completion.

## Store Listing

**Extension Name**

WebTimize Live

**Short Description**

Restore tested page layouts and hide verified ad placeholders on supported websites.

**Detailed Description**

WebTimize Live restores usable page space on supported websites by applying tested, reversible cleanup and layout improvements.

Features:

Clean up verified ad placeholders and promotional blocks.
Restore content width on supported desktop layouts.
Turn cleanup and layout features on or off independently.
Pause a site, use site-specific settings, or return to inherited defaults.
Review the current profile, supported site, compatibility date, and feature state before changes are applied.

How to use it:

Install WebTimize Live, open a supported website, and select the extension icon. Use the popup to enable or pause the site and choose which tested features are active. Open Options for global defaults and site exceptions.

WebTimize Live does not use an account, analytics, remote code, proxy, or WebTimize-operated server. Settings may be synchronized by the browser's built-in sync service when enabled. See the privacy policy for details.

**Category**

Productivity

**Single Purpose**

Restore tested page layouts and hide verified ad placeholders on supported websites.

**Primary Language**

English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------:|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Screenshot 1 | 1280×800 | ✅ Ready | `evidence/store-screenshot-1-styled-1280x800.png` |
| Screenshot 2 | 1280×800 | ✅ Ready | `evidence/store-screenshot-2-options-1280x800.png` |
| Screenshot 3 | 1280×800 | ✅ Ready | `evidence/store-screenshot-3-popup-1280x800.png` |
| Small Promo Tile | 440×280 | ✅ Ready | `evidence/store-promo-tile-440x280.png` |

The evidence images are validation captures. Re-export or crop store assets to the exact accepted dimensions and confirm that every screenshot matches the submitted version.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Saves global defaults, per-site overrides, exceptions, and the profile state needed to restore the user's choices. Chrome Sync may synchronize these settings when the browser account has sync enabled. |
| `activeTab` | permissions | Lets the popup identify the active tab's supported hostname after the user opens the extension, so it can show the correct site controls. |
| `declarativeNetRequest` | permissions | Enables optional profile-defined network blocking rules when a tested profile provides them and the user turns network filtering on. The initial profile provides no network rules. |
| `https://coolmathgames.com/*` | host_permissions | Applies the tested cleanup and layout profile to pages on the supported bare domain. |
| `https://www.coolmathgames.com/*` | host_permissions | Applies the same tested profile to pages on the supported `www` domain. |

## Privacy & Data Use

### Data Collection

The extension does not collect analytics, telemetry, browsing history, page content, credentials, payment information, or advertising identifiers. It does not transmit data to WebTimize or another service.

The extension stores user preferences in `chrome.storage.sync`: global feature defaults, supported-domain overrides, exception domain names, and the schema version. When browser sync is enabled, the browser may transmit those settings through the user's browser account. The extension does not control or independently access that sync service.

### Data Use Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**

`https://github.com/Eandab0t/WebTimize-Live/blob/main/docs/PRIVACY.md` — verify this URL after the repository is updated and public.

## Distribution

**Visibility:** Public after publisher review

**Regions:** All regions, subject to supported-site availability

## Developer Info

**Publisher Name:** Eandab0t

**Contact Email:** `eandab0t@outlook.com`

**Support URL:** `https://github.com/Eandab0t/WebTimize-Live/issues`

**Homepage URL:** `https://github.com/Eandab0t/WebTimize-Live`

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 0.3.0 | 2026-11-09 | Tested site-specific cleanup and layout recovery, reversible controls, profile diagnostics, Chrome/Firefox builds, and narrow supported-site access. | Draft |

## Review Notes

### Known Issues / Limitations

- The first release supports one tested site profile.
- Sites may change their markup; users can pause the extension or disable individual features.
- Cross-origin iframe content and creatives using ordinary first-party markup are not guaranteed to be changed.
- The extension has no remote profile download or remote code path.
- The privacy policy URL, contact email, final store screenshots, and signed submission ZIP must be completed before submission.

