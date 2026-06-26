# Changelog — Avito GPU Helper

## [3.1.0] — 2026-06-26 — Security Hotfix

### Critical Fixes

- **V-1 (CWE-601)**: Open redirect via `data.url` in `show-notification`.
  Service worker now validates URL host against `avito.ru` before saving to
  storage and again before opening the tab on notification click.
  Files: `src/service-worker.js` (lines 104-117, 214-219, 263-268).

- **V-2 (CWE-923)**: No `sender` validation in `chrome.runtime.onMessage`.
  Added `isTrustedSender()` helper — accepts messages only from our own
  extension popup (sender.id === chrome.runtime.id) or content scripts
  running on avito.ru (sender.tab.url host check). All other senders
  are rejected with a warning.
  Files: `src/service-worker.js` (lines 84-125).

- **V-3 (CWE-601)**: Phishing via `extractCardUrl` without host check.
  Absolute URLs in search cards are now validated via `new URL().hostname`
  to ensure they belong to `avito.ru` or `*.avito.ru`. Non-avito URLs are
  silently rejected and do not enter the search cache. Same fix applied
  to `extractProfileUrl` in seller-analyzer.js.
  Files: `src/ui/badge-renderer.js` (lines 457-495),
  `src/core/seller-analyzer.js` (lines 232-252).

- **V-4 (CWE-1357)**: Two diverging copies of `fetch_prices.py`.
  Removed the embedded `avito-gpu-prices/` directory from the extension
  archive. The parser repository is the single source of truth and is
  fetched at runtime from `https://raw.githubusercontent.com/ForseJDM/avito-gpu-prices/main/prices.json`.

### High Severity Fixes

- **V-5 (CWE-770)**: Storage leak `agpuh-deal-*` without TTL cleanup.
  Added `cleanupOldDealKeys()` function — called on `onInstalled`,
  on every alarm fire, removes all `agpuh-deal-*` keys older than 24 hours.
  Files: `src/service-worker.js` (lines 53, 82, 483-509).

- **V-6 (CWE-345)**: SHA-256 bypass when `.sha256` file is absent.
  Switched from fail-open to fail-closed behavior: after the first
  successful hash verification, the `agpuh_hash_required` flag is set
  in storage. Subsequent updates that lack a valid `.sha256` file are
  rejected. First-time install still tolerates missing hash file.
  Files: `src/service-worker.js` (verifyHash function, lines 519-574).

### Medium Severity Fixes

- **V-11 (CWE-1117)**: Quality guard desync — extension used 40% threshold
  while parser used 30% (`MIN_PRICE_FRACTION = 0.30`). This caused the
  extension to silently drop entries that the parser accepted, reducing
  effective coverage. Aligned both to 30%.
  Files: `src/service-worker.js` (isValidPriceEntry, lines 471-475),
  `src/core/price-updater.js` (mergeRemotePrices, lines 96-105).

### Other Changes

- **V-13 (CWE-693)**: Added explicit CSP in `manifest.json`:
  `script-src 'self'; object-src 'self'; base-uri 'self'` (defence-in-depth,
  MV3 default was already restrictive).

- **V-15 (CWE-1078)**: README.md with incorrect "daily 06:00 UTC" cron
  description was part of the embedded parser copy — removed together
  with V-4. Users now refer to the parser repo on GitHub for accurate
  cron information.

- Added `SECURITY.md` with supported versions table, vulnerability
  disclosure policy, and permissions documentation.

### Files Modified

| File                                | Change                                                |
|-------------------------------------|-------------------------------------------------------|
| `manifest.json`                     | version → 3.1.0, added CSP                            |
| `popup.html`                        | version label → v3.1.0                                |
| `src/service-worker.js`             | V-1, V-2, V-5, V-6, V-11 fixes (~150 lines added)    |
| `src/core/price-updater.js`         | V-11 fix (40% → 30%)                                  |
| `src/core/seller-analyzer.js`       | V-3 fix (extractProfileUrl host validation)           |
| `src/ui/badge-renderer.js`          | V-3 fix (extractCardUrl host validation)              |
| `SECURITY.md`                       | NEW — security policy and disclosure info             |

### Files Removed

| Path                       | Reason                                                     |
|----------------------------|------------------------------------------------------------|
| `avito-gpu-prices/` (entire directory) | V-4: removed diverging embedded parser copy     |

### Migration Notes

- Users upgrading from v3.0.5 will automatically benefit from all fixes
  on extension reload. No data migration required.
- The `agpuh_hash_required` flag is set on the first successful hash
  verification after upgrade. If the parser repository does not publish
  a `prices.json.sha256` file, hash verification remains in tolerant
  mode (same as v3.0.5). Once published, the extension switches to
  fail-closed mode automatically.
- Old `agpuh-deal-*` keys from v3.0.5 will be cleaned up on first alarm
  fire after upgrade (within 24 hours).

### Known Issues (Not Fixed in v3.1.0)

The following findings from the security audit are deferred to v3.2.0:

- V-7 (cache-busting bypasses CDN) — requires server-side ETag support
- V-8 (GitHub Actions script injection) — requires workflow rewrite
- V-9 (storage quota handling) — requires wrapper refactoring
- V-10 (polling without exponential backoff) — minor performance issue
- V-12 (SHA-256 computed over filtered array) — documentation/comment fix only

See `SECURITY.md` for the complete vulnerability list and roadmap.

---

## [3.0.5] — 2026-06-26 (deprecated)

Contains 4 critical security vulnerabilities (V-1, V-2, V-3, V-4).
Users must upgrade to v3.1.0 immediately.

## [3.0.4] — 2026-06-25

Hotfix: added `extractCardUrl` and `extractCardLocation` functions
that were called but not defined in v3.0.3.

## [3.0.3] — 2026-06-25

Switched realtime prices from fetch to search cache (bypasses CAPTCHA).
Service worker no longer participates in realtime analog fetching.

## [3.0.2] — 2026-06-25

Bugfix: useDom option, main world fetch, notification icon via
`chrome.runtime.getURL`, H9 box detection.

## [3.0.1] — 2026-06-25

Bugfix: H1/params priority, condition from characteristics,
detectPageType improvements, badge reset.

## [3.0.0] — 2026-06-25

Major release: realtime prices, seller analysis, condition detection,
comparison panel, notifications.

## [2.x] — 2026-06-23 to 2026-06-25

See git history for v2.0.0 through v2.3.0 changes.
