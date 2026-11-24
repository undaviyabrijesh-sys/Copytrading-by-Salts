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
- Tenant-scoped broker connection endpoints expose provider schemas, accept only exact fields for DhanHQ access token, Groww access token and Delta Exchange India API key/secret, encrypt before database persistence, return sanitized connection metadata, and support owner-scoped deletion. Saved records remain PENDING; no provider health/identity test can yet mark them CONNECTED.
- OAuth-based providers deliberately reject generic credential submission until their own state/callback/token-exchange flows are implemented. The connection UI exposes only the three guarded credential forms and lists/deletes the signed-in user's own connection records.

## Required environment

- `DATABASE_URL`: PostgreSQL connection string.
- `APP_ORIGIN`: exact browser origin (scheme + host + optional port), required for login, invite redemption, logout and admin invite issuance.
- `MFA_ENCRYPTION_KEY`: base64-encoded 32-byte AES key; generate a unique key and keep it in a secret manager. Never commit it.
- `NODE_ENV=production` enables Secure on the session cookie.
- Admin bootstrap requires the one-time variables documented in [ADMIN_BOOTSTRAP.md](./ADMIN_BOOTSTRAP.md).

## Not yet complete

- Account recovery, MFA reset and administrative session revocation UX remain to be implemented.
- Host application workflow, audit-log viewer and additional account recovery controls. Admin APIs and an initial owner console are implemented; frontend integration tests remain.
- Provider-specific OAuth callbacks/token exchange for Zerodha, Angel One, Upstox, FYERS, Shoonya, Flattrade, 5paisa, ICICI Breeze and Alice Blue; provider-by-provider research and integration for the remaining listed brokers.
- Provider health adapters, account identity/permission verification, token refresh/expiry handling, static egress IP verification, secret rotation/re-encryption and verified capability tests. Connection records are only PENDING; no broker is CONNECTED or trade-ready.
- AWS KMS key, ECS task role and deployment secrets are not provisioned. The API fails closed with 503 when the KMS vault is not configured.
- Prisma initial PostgreSQL migration is committed, with deployment/status scripts and migration runbook. It has not yet been applied to a database or validated by a successful CI run. CI now provisions ephemeral PostgreSQL and attempts schema validation/migration; GitHub is still reporting a job-level failure with no step list or downloadable logs.
- Paper execution worker, verified instrument mapping, broker adapters, event lifecycle/replay and reconciliation. The current paper-routing policy is a pure domain gate with unit tests added, not an active copy worker.

## Safety gates

- This API has no real broker adapters and no live execution route.
- All subscription records are PAPER mode only.
- India live trading remains disabled pending written legal and broker approvals.
- No user can read another user's broker credential material through these endpoints.
