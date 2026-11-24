# Phase 1 implementation progress

Branch: `phase1-foundation`

## Implemented in source

- Fastify API now registers authentication, host listing and subscriber subscription route modules.
- Invite-only account creation: one-time invite tokens are generated with 256-bit entropy; only SHA-256 token hashes are stored. Invite redemption claims the token once inside a serializable transaction and creates a subscriber account with an Argon2id password hash.
- Login/logout/me endpoints use opaque random session tokens. Only token hashes are persisted. Session records are revocable and expire after 12 hours. Session cookie is HttpOnly, SameSite=Strict, scoped to the API path, and Secure in production.
- Login, invite redemption and invite issuance have per-route rate limits. Mutating auth/admin routes require exact `APP_ORIGIN` match.
- Admin invite issuance requires ADMIN role and MFA enrollment. Until MFA enrollment is implemented, this endpoint intentionally refuses administrator invite creation.
- Host listing endpoints support create, list, edit, publish, pause and soft-remove. Every host query is scoped by the authenticated host user ID. Marketplace listing reads require authentication.
- Subscription endpoints support list, subscribe and unsubscribe. A subscription is linked to one listing and market, defaults to PAPER mode, rejects self-subscription, stores subscriber sizing caps, and marks unsubscribe as `UNSUBSCRIBED` so future routing must stop.
- Audit events are written for invite creation, host listing changes and subscription changes.
- Health readiness checks PostgreSQL connectivity; liveness remains independent.
- The Prisma schema includes hashed session records and the shared database client package.

## Required environment

- `DATABASE_URL`: PostgreSQL connection string.
- `APP_ORIGIN`: exact browser origin (scheme + host + optional port), required for login, invite redemption, logout and admin invite issuance.
- `NODE_ENV=production` enables Secure on the session cookie.
- Admin bootstrap requires the one-time variables documented in [ADMIN_BOOTSTRAP.md](./ADMIN_BOOTSTRAP.md).

## Not yet complete

- MFA/TOTP enrollment and challenge, recent re-authentication for admin actions.
- Admin UI, user/role approval APIs, invite revoke/list APIs, and host application workflow.
- Broker connection wizard and KMS-backed broker credential encryption.
- Database migrations, production deployment, operational secrets wiring and automated integration tests against PostgreSQL.
- Paper execution engine, event lifecycle/replay, broker adapters and reconciliation.

## Safety gates

- This API has no real broker adapters and no live execution route.
- All subscription records are PAPER mode only.
- India live trading remains disabled pending written legal and broker approvals.
- No user can read another user's broker credential material through these endpoints.
