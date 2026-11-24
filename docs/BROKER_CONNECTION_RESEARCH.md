# Broker API research and connection requirements

Reviewed: 24 November 2026. This is a research baseline, not a claim that any provider is integrated or approved for third-party copy trading.

## Design rules
Every host and subscriber connects their own account. A connection belongs to exactly one user and one workspace (INDIA or CRYPTO). Host and destination providers may differ. Use provider-specific adapters; never forward raw source payloads or silently substitute unsupported order semantics.

Connection flow: official developer portal; app creation and callback guidance; broker-hosted OAuth where available; exact provider credential fields; server-side encryption using managed KMS/vault; account identity and scope checks; token expiry and static-IP checks; health and capability tests; reconnect/rotate/disconnect/delete; tenant-scoped audit events.

Never request withdrawal, fund-transfer or payout permissions. Never store TOTP seeds or broker PINs as general API credentials. A one-time challenge must be handled only in a broker-authorized flow and discarded. No plaintext secret may be returned to the browser, logged or committed to Git.

## India provider research

| Provider | Authentication model | Setup fields / method | Important constraints | Research status |
|---|---|---|---|---|
| Zerodha Kite Connect | API key + API secret; broker login and request-token exchange | API key, API secret, registered redirect URL | Server-side handshake; plan entitlements; verify current static-IP and third-party routing rules | Official docs reviewed; adapter not built |
| DhanHQ | User access token or API-key authentication; partner onboarding is separate | Access token or approved API key/secret flow | Individual vs partner eligibility; 24-hour token; static IP mandatory for order placement per docs | Official docs reviewed; adapter not built |
| Angel One SmartAPI | API key + client code + PIN + TOTP; JWT/refresh/feed tokens | API key, client code, one-time login challenge | Session normally ends at midnight; do not persist PIN/TOTP; verify static-IP and partner permissions | Official docs reviewed; adapter not built |
| Upstox | OAuth 2.0 authorization code | Client ID, client secret, redirect URI; broker-hosted authorization | Broker handles user login; token expiry and partner/copy permissions need verification | Official docs reviewed; adapter not built |
| FYERS v3 | OAuth authorization code; app ID/secret; daily access token | App ID, app secret, redirect URI | Personal apps are only for their creator; third-party platform requires common app approval | Official docs reviewed; approval gate |
| Shoonya | Current official docs describe OAuth authorization code and 24-hour token | Client/app identifier and server-side checksum material per current flow | Older community material describes legacy TOTP; do not implement without current official confirmation | Official docs reviewed; adapter not built |
| Flattrade Pi | Registered API key/secret and broker session flow | API key, API secret, callback/session material per current docs | Order-volume profile selection; confirm current static-IP and partner rules | Official docs reviewed; adapter not built |
| 5paisa Xstream | OAuth or TOTP-assisted request-token flow; exchange for daily token | App identity/key, encryption material, broker-issued request token | Daily token; verify app/account approval, static-IP and third-party terms | Official docs reviewed; adapter not built |
| ICICI Direct Breeze | App key/secret and broker-generated session token | App key, secret, session token, redirect URL | 100 calls/min and 5,000/day documented; NSE only in current docs; order API requires registered static IP | Official docs reviewed; adapter not built |
| Kotak Neo | Current auth/API flow requires renewed direct verification | No credential form enabled | Authentication changed; do not collect TOTP/MPIN or assume unattended access until current official terms are confirmed | Review required |
| Alice Blue ANT | App code/key + API secret and session authentication | App code/API key, API secret, approved app/session | Official docs describe app approval; verify partner status and static IP | Official docs reviewed; adapter not built |
| Groww Trade API | User-generated access token / API credential via Trading APIs portal | Current API token or key material from user portal | Token documented to expire daily at 6:00 AM; CASH/FNO supported; MCX not supported; paid API entitlement | Official docs reviewed; adapter not built |

## Crypto provider research

| Provider | Authentication model | Setup fields | Important constraints | Research status |
|---|---|---|---|---|
| Delta Exchange India | API key + API secret; HMAC-SHA256 REST signing and authenticated private WebSocket | API key, API secret, fixed egress IP allowlist | Trading permission requires IP allowlisting; short signature window; India production and demo/testnet keys use different endpoints; no withdrawal permission | Official docs reviewed; first crypto candidate, adapter not built |

## Additional India research queue

IIFL Markets, Motilal Oswal, SAMCO, Tradejini, Nuvama, HDFC Securities/HDFC SKY, m.Stock, Sharekhan, Axis Direct, Choice, Jainam, Mastertrust, Zebu and SAS Online remain research-only. Do not render them as connectable or collect credentials until current official developer docs, authentication, segments, order lifecycle, rate limits, static-IP and platform/vendor permissions are reviewed.

A broker without a supported official API must remain unavailable. Do not scrape websites, automate browser logins, collect broker passwords or imply support based on a third-party connector.

## Official docs reviewed
- Zerodha Kite Connect v3: https://kite.trade/docs/connect/v3/
- DhanHQ authentication: https://dhanhq.co/docs/v2/authentication/
- Angel One SmartAPI: https://smartapi.angelone.in/docs
- Upstox authentication: https://upstox.com/developer/api-documentation/authentication/
- FYERS third-party app: https://fyers.in/api-docs/v3/api/authentication/third-party-app/
- Shoonya authentication: https://www.shoonya.com/api-documentation/auth-overview
- Flattrade Pi v2: https://pi.flattrade.in/docs
- 5paisa Xstream: https://xstream.5paisa.com/dev-docs/docFundamentals/integration-flow
- ICICI Direct Breeze: https://api.icicidirect.com/breezeapi/documents/index.html
- Alice Blue ANT API: https://ant.aliceblueonline.com/productdocumentation/
- Groww Trading API: https://groww.in/trade-api/docs
- Delta Exchange API: https://docs.delta.exchange/

## Implementation sequence
1. Complete managed credential vault and key rotation design (AWS KMS/Secrets Manager; no AWS provisioning without explicit owner approval).
2. Implement typed provider registry and credential schema. OAuth providers must use redirect-based authorization, not a generic password form.
3. Implement tenant-scoped connection lifecycle, one-time OAuth state, CSRF protection, strict redirect URI validation, encrypted storage, masked metadata and audit logs.
4. Implement one adapter at a time, paper-first, with official sandbox/contract tests and exact capability records.
5. Add health checks, token-expiry warnings, static-IP status, reconnect/rotate/disconnect and reconciliation.
6. India live orders remain disabled until written broker and legal clearance.

## Current implementation state
The connection catalogue UI is a research/education surface only. It does not submit credentials, create connections, perform OAuth callbacks, encrypt API secrets or place orders. Existing connection records and the marketplace destination selector are foundations only. No provider is production-ready until its adapter and test evidence are complete.
