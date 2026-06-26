# Security Policy — Avito GPU Helper

## Reporting a Vulnerability

If you discover a security vulnerability in Avito GPU Helper, please report it
responsibly:

1. **Do NOT open a public GitHub issue.**
2. Email: <insert security contact email>
3. Include: description, steps to reproduce, affected version, CWE if known.
4. Response time: 72 hours for acknowledgment, 14 days for initial assessment.

## Supported Versions

| Version | Supported          | Notes                              |
|---------|--------------------|------------------------------------|
| 3.1.0   | :white_check_mark: | Security hotfix release (2026-06-26) |
| 3.0.5   | :x:                | Contains 4 critical vulnerabilities — UPGRADE |
| < 3.0.5 | :x:                | End of life                        |

## v3.1.0 Security Fixes

This release closes the following vulnerabilities identified in the security
audit dated 2026-06-26:

| ID  | CWE     | Title                                                          | Severity |
|-----|---------|----------------------------------------------------------------|----------|
| V-1 | CWE-601 | Open redirect via `data.url` in `show-notification`            | Critical |
| V-2 | CWE-923 | No `sender` validation in `chrome.runtime.onMessage`           | Critical |
| V-3 | CWE-601 | Phishing via `extractCardUrl` without host check               | Critical |
| V-4 | CWE-1357| Two diverging copies of `fetch_prices.py`                      | Critical |
| V-5 | CWE-770 | Storage leak `agpuh-deal-*` without TTL cleanup                | High     |
| V-6 | CWE-345 | SHA-256 bypass when `.sha256` file is absent (fail-open)       | High     |
| V-11| CWE-1117| Quality guard 40% in extension vs 30% in parser (desync)       | Medium   |

## Data Sources

Remote GPU market prices are loaded from:

- **Primary**: `https://raw.githubusercontent.com/ForseJDM/avito-gpu-prices/main/prices.json`
- **Hash verification**: `prices.json.sha256` (optional, fail-closed after first success)
- **Update interval**: every 4 hours (matches GitHub Actions cron in parser repo)
- **Parser source code**: https://github.com/ForseJDM/avito-gpu-prices

The parser repository is **not bundled** with this extension since v3.1.0.
Users who want offline-first operation should manually download `prices.json`
from the GitHub repository above.

## Permissions

This extension requests the minimum permissions required for operation:

- `storage` — cache prices, settings, view history
- `alarms` — periodic price update (default: 24h)
- `notifications` — optional push for "great_deal" listings (off by default)
- `host_permissions`: `raw.githubusercontent.com` (price source), `avito.ru`
  (content scripts)

No `tabs`, `cookies`, `webRequest`, `history`, or `bookmarks` permissions
are requested. The extension cannot read browsing history or intercept
network requests.

## Content Security Policy

Manifest V3 applies restrictive CSP by default for extension pages:
`script-src 'self'; object-src 'self'`. No external scripts are loaded.
