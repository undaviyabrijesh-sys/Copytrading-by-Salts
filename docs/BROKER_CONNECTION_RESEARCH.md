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

## Expanded broker directory (catalogue coverage, not integration claims)

The connection directory now also lists the following India providers so they are visible in the product and can be researched in one place:

- IIFL Securities
- Motilal Oswal
- SAMCO
- Tradejini
- Nuvama
- HDFC SKY
- m.Stock
- Sharekhan
- Axis Direct
- Choice Broking
- Jainam
- Mastertrust
- Zebu
- SAS Online
- Paytm Money
- Pocketful
- Firstock
- Stoxkart
- Profitmart
- Wisdom Capital
- Composite Edge
- Definedge
- INDmoney
- Anand Rathi
- Religare Broking
- SMC Global
- Goodwill Wealth Management
- Arrow

These entries are intentionally marked **REVIEW_REQUIRED** and have no credential form. The official company website is a navigation starting point, not proof of a trading API. For each one, the research gate must establish: official API documentation and version; API availability for retail users; permitted application/partner model; supported order types and order lifecycle events; segments and instrument master; auth/token expiry/revocation; rate limits; static egress IP and whitelisting; order update stream/webhooks; sandbox or paper facilities; written third-party copy-trading permission. A broker that has no supported official API remains catalogue-only.

The product should present three separate states, never collapse them into one “supported” badge:
1. **Listed** — discoverable in the catalogue.
2. **Connection verified** — provider-specific auth and account identity/scope health checks passed.
3. **Copy execution validated** — source event ingestion, destination order lifecycle, reconciliation, risk gates and failure recovery passed the provider's acceptance suite.

Only the third state may be considered an eligible adapter, and only after the platform/legal approval gate is separately satisfied.

## Implementation sequence
1. Complete managed credential vault and key rotation design (AWS KMS/Secrets Manager; no AWS provisioning without explicit owner approval).
2. Implement typed provider registry and credential schema. OAuth providers must use redirect-based authorization, not a generic password form.
3. Implement tenant-scoped connection lifecycle, one-time OAuth state, CSRF protection, strict redirect URI validation, encrypted storage, masked metadata and audit logs.
4. Implement one adapter at a time, paper-first, with official sandbox/contract tests and exact capability records.
5. Add health checks, token-expiry warnings, static-IP status, reconnect/rotate/disconnect and reconciliation.
6. India live orders remain disabled until written broker and legal clearance.

## Current implementation state
The connection catalogue UI is a research/education surface only. It does not submit credentials, create connections, perform OAuth callbacks, encrypt API secrets or place orders. Existing connection records and the marketplace destination selector are foundations only. No provider is production-ready until its adapter and test evidence are complete.


## Credential intake forms — reviewed status

The earlier generic five-field form was not sufficient to connect brokers and could mislead users into entering the wrong credential type. It has been replaced with provider-specific static application-credential fields for the currently documented providers:

| Provider | Static credential fields collected by the form | Authentication still required after saving |
|---|---|---|
| Zerodha Kite Connect | API key, API secret | Broker-hosted Kite login, short-lived request-token callback, server-side checksum exchange, profile/scope verification; token is callback output, not a static form field |
| Angel One SmartAPI | SmartAPI app API key | Prefer SmartAPI publisher-login URL with random state and broker redirect returning auth_token/feed_token; direct loginByPassword needs client code + PIN + current TOTP and must only be an explicitly approved ephemeral challenge, never saved |
| Upstox | Client ID, client secret | Preferred: OAuth authorization-code redirect, exact redirect URI, one-time code exchange. Official API also documents a TOTP+PIN token endpoint, but this must not be the default platform flow or stored as reusable credentials |
| FYERS | App ID, app secret | Approved third-party/common-app OAuth flow, state validation, auth-code exchange; an individual app cannot authenticate other FYERS users |
| Shoonya | Client ID, secret code | Broker-hosted OAuth authorization, IP whitelist prerequisite, one-time code/checksum exchange; no password/TOTP collection |
| Flattrade | API key, API secret | Browser authorization URL; user enters UCC, broker password and PAN/year of birth on Flattrade; redirect returns one-time request_code, then server exchanges it using API key and SHA-256-derived secret from registered static IP. No OTP field in Salts |
| 5paisa Xstream | App key, encryption key | OAuth login, request-token exchange, user ID and daily access-token handling |
| ICICI Direct Breeze | App key, secret key | Broker-hosted OAuth login, API_Session → CustomerDetails session-token exchange, registered static IP and supported order-type checks |
| Alice Blue ANT | App code, API secret | Broker-hosted login, authCode + userId callback, server-side checksum/session exchange |
| DhanHQ | API key, API secret | Preferred individual API-key consent: Generate Consent → broker-hosted login/2FA → one-time tokenId callback → server-side Consume Consent → access token and Dhan profile. Manual 24-hour access-token entry remains a fallback, not the preferred host/subscriber onboarding |
| Groww Trade API | Access token | Validate token/profile, daily expiry and CASH/FNO entitlement |
| Delta Exchange India | API key, API secret | Signed REST/private WebSocket health checks, account identity, key permissions and IP allowlist |

The UI submits only non-empty values for the selected provider. It no longer sends blank placeholders for unused fields. Kotak Neo and the additional research-queue brokers have no credential form; their entries remain unavailable until their current official API and platform permission requirements are verified. The backend rejects credential intake for those research-only providers.

These fields are **not a connection wizard**. Saving static application credentials only creates a tenant-owned PENDING record. The provider-hosted authorization/callback, account identity, permission and health-check implementations are not yet built. No provider is CONNECTED or execution-ready based on this form. The API vault requires AWS KMS configuration; no KMS key or IAM role has been provisioned, so credential submission will currently fail closed with no credential stored.

Security boundary: never ask users to paste broker passwords, PIN/MPIN, TOTP seeds, recovery codes or withdrawal credentials into these static fields. Where a broker requires a user challenge, implement an approved broker-hosted or explicitly ephemeral one-time flow and discard the challenge immediately. Never persist a user's reusable login factors as general API credentials.

Research evidence reviewed against official provider documentation includes:
- Zerodha Kite login/request-token/checksum flow: https://www.kite.trade/docs/connect/v3/user/
- Angel One SmartAPI publisher login and client-code/PIN/TOTP login requirements: https://smartapi.angelone.in/docs
- Upstox OAuth authorization-code flow: https://upstox.com/developer/api-documentation/authentication/
- FYERS third-party app OAuth and common-app approval: https://fyers.in/api-docs/v3/api/authentication/third-party-app/
- Shoonya OAuth, IP whitelist and 24-hour access token: https://www.shoonya.com/api-documentation/auth-overview
- Flattrade Pi app key/secret and redirect token flow: https://pi.flattrade.in/docs
- 5paisa request-token and encryption-key access-token flow: https://xstream.5paisa.com/dev-docs/docFundamentals/integration-flow
- ICICI Breeze OAuth, session-token exchange, static IP and order restrictions: https://api.icicidirect.com/breezeapi/documents/index.html
- Alice Blue appCode/apiSecret and authCode/userId flow: https://ant.aliceblueonline.com/productdocumentation/Authentication/
- DhanHQ access token and individual static-IP requirements: https://dhanhq.co/docs/v2/authentication/
- Groww daily access token and CASH/FNO-only entitlement: https://groww.in/trade-api/docs/curl
- Delta API key/secret and trading-key IP allowlisting: https://docs.delta.exchange/


## OTP, TOTP, request-token and access-token field policy

Do not add a universal OTP/TOTP/PIN/token textbox. These values have different purposes and lifetimes and must be handled by the broker-specific flow:

| Provider | Is a one-time challenge applicable? | Correct handling in Salts |
|---|---|---|
| Zerodha | Broker login challenge; request_token follows successful login | Redirect user to Kite; capture request_token on the registered callback and exchange once server-side. Never ask for Zerodha password/TOTP in Salts |
| Angel One | Direct SmartAPI loginByPassword requires client code + PIN + current TOTP; publisher login is also documented | Prefer publisher-login redirect and validate returned state; handle returned auth_token/feed_token server-side. Do not persist PIN/TOTP or create generic OTP fields |
| Upstox | OAuth login can use broker-side OTP/TOTP; a separate official TOTP+PIN token endpoint exists | Prefer OAuth authorization code. TOTP+PIN is a sensitive alternate flow and must not be collected/stored by the general connection form |
| FYERS | Broker-hosted login/2FA then auth_code | Use approved third-party/common-app OAuth, validate state, exchange auth_code server-side; access token expires daily at 6:30 AM |
| Shoonya | Current official auth overview specifies OAuth | Broker-hosted OAuth and one-time callback; do not implement older community TOTP/password login recipes unless current official docs explicitly reinstate them |
| Flattrade | Browser login requires UCC, broker password and PAN/year of birth; redirect produces short-lived request_code | User enters credentials only on Flattrade. Capture request_code and exchange server-side from registered static IP. Do not add PIN/OTP field based on generic assumptions |
| 5paisa | OAuth or TOTP-assisted request-token generation | Prefer OAuth. If a documented TOTP alternative is approved, use a one-time in-memory challenge only; exchange request token immediately using app encryption key |
| ICICI Breeze | Broker login/session flow | Use the current documented broker login and API_Session callback/exchange; do not invent an OTP field until the exact supported flow is confirmed for the app |
| Alice Blue | Broker login produces authCode and userId | Capture callback values and exchange server-side with app credentials; do not collect broker password/TOTP in a reusable form |
| DhanHQ | Consent flow includes user login and 2FA on Dhan's own page; TOTP can be configured for API-only flows | Use Generate Consent → browser-based Dhan login → tokenId callback → Consume Consent. Manual 24-hour token is an optional fallback. Never store PIN/TOTP seed |
| Groww | Current API flow uses a user-generated API access token | User generates token in Groww's authenticated portal and pastes only the API token into the secure token field; do not ask for Groww password or OTP |
| Delta Exchange India | API key/secret signing; IP allowlisting | No OTP field for normal API signing. Verify signed account endpoint and permissions; restrict key to trading/read and no withdrawals |

**Token distinction:** a static app secret/API key identifies the application; an authorization/request code is short-lived and single-use; an access/session token is the resulting credential used for API calls and expires/revokes on the provider's schedule. Only the first category belongs in the static credential form. Callback codes and resulting access tokens must be handled by provider-specific server-side authentication, encrypted at rest, never exposed in logs or query analytics, and tied to the initiating user/connection using one-time state and replay protection.

**MFA boundary:** Salts' own authenticator MFA protects the Salts account. It is separate from broker OTP/TOTP. Broker OTP/TOTP/PIN are never interchangeable with Salts MFA and must never be stored in BrokerConnection.encryptedSecret as ordinary credentials.

The broker catalogue, credential intake, verified account connection and validated copy execution remain separate product states. A form being visible must never imply broker support or permission to copy trades.
