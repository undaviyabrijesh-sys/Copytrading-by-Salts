# Phase 1 implementation progress

Branch: `phase1-foundation`

## Implemented in source

- Fastify API registers authentication, host listing, subscriber subscription, platform catalogue, signal intake and broker connection route modules.
- Invite-only account creation: one-time invite tokens are generated with 256-bit entropy; only SHA-256 token hashes are stored. Invite redemption claims the token once inside a serializable transaction and creates a subscriber account with an Argon2id password hash.
- Login/logout/me endpoints use opaque random session tokens. Only token hashes are persisted. Session records are revocable and expire after 12 hours. Session cookie is HttpOnly, SameSite=Strict, scoped to the API path, and Secure in production.
- TOTP MFA enrollment, encrypted secret storage (AES-256-GCM), authenticator verification, MFA login challenge and 10-minute admin step-up verification are implemented. The encryption key is supplied through `MFA_ENCRYPTION_KEY` and must be kept in a production secret manager.
- Login, invite redemption and invite issuance have per-route rate limits. Mutating auth/admin routes require exact `APP_ORIGIN` match.
- Admin invite issuance and user management require ADMIN role plus recent MFA verification. Admin APIs can list users/invites/listings, approve HOST role, suspend/reactivate users, moderate listings, and revoke unused invites. Listing suspension pauses active subscriptions; reinstatement returns the listing to DRAFT so the host must review and republish. Moderation and its audit event are committed atomically.
- Host listing endpoints support create, list, edit, publish, pause and soft-remove. Hosts cannot edit or republish administrator-suspended listings. Every host query is scoped by the authenticated host user ID. Marketplace listing reads require authentication. Pausing, unpublishing or removing a listing also pauses its active subscriptions to prevent new routing.
- Subscription endpoints support list, subscribe, unsubscribe, subscriber-owned risk-setting updates and optional explicit destination broker-account binding. A selected destination must be a connected account owned by the subscriber in the same market. Destination connection inventory is exposed through a sanitized tenant-scoped API; credentials are never returned. A subscription defaults to PAPER mode, rejects self-subscription, stores subscriber sizing caps, and marks unsubscribe as `UNSUBSCRIBED` so future entries must stop.
- Initial host listing and subscriber marketplace pages are connected to these APIs. Hosts can create, edit, publish, pause and remove listings; subscribers can browse India/Crypto listings, subscribe/unsubscribe, set a quantity multiplier and optional max order value. Authenticated admin/host/marketplace pages include sign-out controls.
- Audit events are written for invite creation, host listing changes and subscription changes.
- Health readiness checks PostgreSQL connectivity; liveness remains independent.
- The Prisma schema includes hashed session records and the shared database client package.
- Broker directory now lists 40 Indian broker/provider brands plus Delta Exchange India in the Crypto workspace. Twelve India providers have researched provider-specific auth/setup notes; only Dhan, Groww and Delta have guarded credential forms, and all saved records remain PENDING. The additional directory entries are explicitly REVIEW_REQUIRED/catalogue-only, not claimed integrations. Each broker must pass official API, account eligibility, order lifecycle, static-IP, rate-limit and written platform-permission review before a connection form or adapter is enabled.
- Broker credential vault implementation uses AWS KMS GenerateDataKey envelope encryption with AES-256-GCM, per-record data keys and encryption context. No plaintext/static-key fallback exists. It requires an AWS KMS key and least-privilege runtime IAM role; neither has been provisioned.
- Tenant-scoped broker connection endpoints expose only provider-specific credential contracts. Credential intake is restricted to the providers whose fields have been explicitly reviewed; research-only catalogue providers have no fields and are not connectable. Submitted values are KMS-encrypted before database persistence, returned metadata is sanitized, and deletion is owner-scoped. Credential intake alone does not establish a broker session.
- The OAuth-attempt store persists one-time hashed state, user/connection/provider binding, exact callback URI, expiry and replay status. Broker-hosted authorization-code flows and server-side token exchange are implemented for Zerodha, Upstox, FYERS, Angel One publisher login and 5paisa OAuth; callbacks validate state, claim attempts once, verify the broker profile or token-exchange account identity, encrypt resulting access tokens, store expiry and write tenant-scoped audit events. Daily reauthorization is exposed in the connection UI. Delta India has a signed read-only authentication check, and Groww has a read-only user-profile verification check for its user-generated daily access token. These steps do not certify order permissions or enable live execution.

## Required environment

- `DATABASE_URL`: PostgreSQL connection string.
- `APP_ORIGIN`: exact browser origin (scheme + host + optional port), required for login, invite redemption, logout and admin invite issuance.
- `MFA_ENCRYPTION_KEY`: base64-encoded 32-byte AES key; generate a unique key and keep it in a secret manager. Never commit it.
- `NODE_ENV=production` enables Secure on the session cookie.
- Admin bootstrap requires the one-time variables documented in [ADMIN_BOOTSTRAP.md](./ADMIN_BOOTSTRAP.md).

## Not yet complete

- Account recovery, MFA reset and administrative session revocation UX remain to be implemented.
- Host application workflow, audit-log viewer and additional account recovery controls. Admin APIs and an initial owner console are implemented; frontend integration tests remain.
- Provider-specific authentication/callback/token exchange, account identity/permission checks, token renewal and health tests remain outstanding for Dhan, Shoonya, Flattrade, ICICI Breeze, Alice Blue and all other catalogue providers. The Dhan individual consent callback requires an explicitly configured, tenant-safe redirect strategy before implementation; broker-hosted login is not equivalent to a verified connection.
- Provider health adapters, account identity/permission verification, token refresh/expiry handling, static egress IP verification, secret rotation/re-encryption and verified capability tests. Connection records are only PENDING; no broker is CONNECTED or trade-ready.
- AWS KMS key, ECS task role and deployment secrets are not provisioned. The API fails closed with 503 when the KMS vault is not configured.
- Prisma initial PostgreSQL migration is committed, with deployment/status scripts and migration runbook. It has not yet been applied to a database or validated by a successful CI run. CI now provisions ephemeral PostgreSQL and attempts schema validation/migration; GitHub is still reporting a job-level failure with no step list or downloadable logs.
- Paper execution worker, verified instrument mapping, broker adapters, event lifecycle/replay and reconciliation. The current paper-routing policy is a pure domain gate with unit tests added, not an active copy worker.

## Safety gates

- This API has no real broker adapters and no live execution route.
- All subscription records are PAPER mode only.
- India live trading remains disabled pending written legal and broker approvals.
- No user can read another user's broker credential material through these endpoints.


## Phased delivery execution — 24 November 2026

The full delivery plan is tracked in `docs/IMPLEMENTATION_ROADMAP.md`. Phase 1 (broker connections) is active.

### Phase 1 contract alignment change

The provider registry and `GET /api/v1/brokers/providers` response now distinguish four separate states:
- `connectEnabled`: the exact static credential fields may be collected and encrypted.
- `authenticationImplemented`: a provider-specific account-authentication flow exists in source.
- `accountVerificationImplemented`: a provider-specific account verification flow exists in source.
- `executionReady`: full order execution and lifecycle acceptance has passed. This remains false for every provider.

Current source-level auth/account-verification implementations: Zerodha, Upstox, FYERS, Angel One, 5paisa, Groww and Delta Exchange India. Credential intake is configured for Dhan, Shoonya, Flattrade, ICICI Breeze and Alice Blue, but authentication/account verification remain pending. Other catalogue providers remain research-only.

A provider registry test now asserts the expected split and prevents a credential form from being interpreted as account authentication or execution readiness. This is a source change only; it has not yet been executed successfully because the latest GitHub Actions run fails at job initialization with `steps: null` and no job logs. No test pass is claimed.

Latest branch head: `9e6312bad84f236cc1edcbf19eb0b6f0ac820cde`.


## Phase 2 groundwork added — 24 November 2026

Canonical instrument validation now rejects malformed contract identity, invalid tick/lot/multiplier values and incomplete option specifications. Copy eligibility checks that the mapped destination segment is declared by the adapter capability profile. Lifecycle gates now require exact target order IDs for order modifications/cancellations and a reconciled position quantity before partial exits; partial-exit sizing uses exact decimal arithmetic and cannot exceed the copied open quantity. The connections UI now reads credential field keys and labels from the API provider registry rather than maintaining a second independent credential-key contract.

Tests have been added for these rules but remain unexecuted/unverified due the GitHub Actions job-initialization failure (no steps/logs). No broker execution adapter or live trading capability is introduced by these changes.


## Dhan credential contract correction — 24 November 2026

- Corrected Dhan's credential form contract to collect the Dhan client ID plus the app ID and app secret that the official individual-consent API expects as `app_id` and `app_secret` headers. Internal keys are now `clientId`, `appId` and `appSecret`; labels identify the actual Dhan API terms.
- Corrected the provider note: Dhan is currently credential-intake-only. Its individual consent start, callback correlation and access-token exchange are not implemented, so the form must not imply that saving credentials can authenticate or connect the account.
- This is a contract/documentation correction only. No Dhan authentication or order execution has been enabled, and no build/test pass is claimed.

## Broker connection framework hardening — 24 November 2026

- Fixed a callback URI defect: the OAuth start route previously constructed `/{provider}/callback`, while Fastify actually registers `/api/v1/brokers/oauth/:provider/callback`. Authorization attempts would therefore register/send a redirect URI that did not match the application's callback route. The route now uses a shared validated callback-URI builder that generates the registered path and rejects non-HTTPS, malformed, query-bearing or unsupported-provider bases.
- Added focused unit tests for the exact callback path, configured API path prefixes, HTTPS enforcement and provider allowlisting. These tests are committed but have not been executed in this environment.
- Updated the Dhan broker card in the connections UI to match the API contract keys: `clientId`, `appId`, `appSecret`. It now clearly says Dhan is credential-intake-only and that saving credentials does not authenticate or connect the account. The user is explicitly told not to submit broker password, PIN, OTP or TOTP to Salts.
- This work supports the intended user-owned account model: each host/subscriber connects their own broker account; the platform does not need to own or borrow broker accounts for each provider. Provider login and account verification remain provider-specific and must succeed before status is CONNECTED.
- No live execution, broker order adapter or permission certification was enabled. Build/test validation remains pending; no successful test result is claimed.

## Authenticated-user context correction — 24 November 2026

- Fixed the authenticated request context used by API routes: `currentUser()` now selects and returns the account `status` field alongside the existing tenant-scoped identity fields.
- Host signal routes read `actor.status` to enforce active-account checks. The prior `SafeUser` contract omitted that field, creating a TypeScript contract mismatch and preventing a reliable API typecheck.
- The returned status is sourced from the database; `currentUser()` still only selects sessions whose user is `ACTIVE`. This does not weaken authorization or expose additional account data.
- Source commits: `32ebc0a817c5012d52023f39c78c861ee464b7e2` and `a748ba55f86b97f2635e2605962fa13da59f8bd5`.
- Validation: source was re-fetched and checked for the updated type/query/return contract. A successful build or test run has not yet been observed; CI status currently reports no checks for the latest commit.
