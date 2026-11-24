# Phase 1 implementation progress

Branch: `phase1-foundation`

## Implemented in source

- Fastify API now registers authentication, host listing and subscriber subscription route modules.
- Invite-only account creation: one-time invite tokens are generated with 256-bit entropy; only SHA-256 token hashes are stored. Invite redemption claims the token once inside a serializable transaction and creates a subscriber account with an Argon2id password hash.
- Login/logout/me endpoints use opaque random session tokens. Only token hashes are persisted. Session records are revocable and expire after 12 hours. Session cookie is HttpOnly, SameSite=Strict, scoped to the API path, and Secure in production.
- TOTP MFA enrollment, encrypted secret storage (AES-256-GCM), authenticator verification, MFA login challenge and 10-minute admin step-up verification are implemented. The encryption key is supplied through `MFA_ENCRYPTION_KEY` and must be kept in a production secret manager.
- Login, invite redemption and invite issuance have per-route rate limits. Mutating auth/admin routes require exact `APP_ORIGIN` match.
- Admin invite issuance and user management require ADMIN role plus recent MFA verification. Admin APIs can list users/invites, approve HOST role, suspend/reactivate users, and revoke unused invites.
- Host listing endpoints support create, list, edit, publish, pause and soft-remove. Every host query is scoped by the authenticated host user ID. Marketplace listing reads require authentication. Pausing, unpublishing or removing a listing also pauses its active subscriptions to prevent new routing.
- Subscription endpoints support list, subscribe and unsubscribe. A subscription is linked to one listing and market, defaults to PAPER mode, rejects self-subscription, stores subscriber sizing caps, and marks unsubscribe as `UNSUBSCRIBED` so future routing must stop.
- Initial host listing and subscriber marketplace pages are connected to these APIs. Hosts can create, edit, publish, pause and remove listings; subscribers can browse India/Crypto listings and subscribe/unsubscribe.
- Audit events are written for invite creation, host listing changes and subscription changes.
- Health readiness checks PostgreSQL connectivity; liveness remains independent.
- The Prisma schema includes hashed session records and the shared database client package.

## Required environment

- `DATABASE_URL`: PostgreSQL connection string.
- `APP_ORIGIN`: exact browser origin (scheme + host + optional port), required for login, invite redemption, logout and admin invite issuance.
- `MFA_ENCRYPTION_KEY`: base64-encoded 32-byte AES key; generate a unique key and keep it in a secret manager. Never commit it.
- `NODE_ENV=production` enables Secure on the session cookie.
- Admin bootstrap requires the one-time variables documented in [ADMIN_BOOTSTRAP.md](./ADMIN_BOOTSTRAP.md).

## Not yet complete

- Recent MFA re-authentication can be further improved with a dedicated short-lived step-up challenge endpoint and session revocation management.
- Host application workflow, audit-log viewer and additional account recovery controls. Admin APIs and an initial owner console are implemented; frontend integration tests remain.
- Broker connection wizard and KMS-backed broker credential encryption.
- Prisma initial PostgreSQL migration is committed, with deployment/status scripts and migration runbook. It has not yet been applied to a database or validated by a successful CI run.
- Paper execution engine, event lifecycle/replay, broker adapters and reconciliation.

## Safety gates

- This API has no real broker adapters and no live execution route.
- All subscription records are PAPER mode only.
- India live trading remains disabled pending written legal and broker approvals.
- No user can read another user's broker credential material through these endpoints.
