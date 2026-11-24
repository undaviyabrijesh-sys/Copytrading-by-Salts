# Copy Trading by Salts — Delivery Roadmap

Branch: `phase1-foundation`  
Product objective: a secure, multi-tenant, cross-broker platform that copies a host's trading activity into each subscriber's independently connected broker account, with exact instrument/order translation, subscriber risk controls and complete order lifecycle reconciliation.

## Delivery rules

- Work only in this repository and the `phase1-foundation` branch until the owner explicitly approves a merge.
- Paper-first. Live execution remains disabled by default.
- Never collect broker passwords, PIN/MPIN, TOTP seeds, recovery codes or withdrawal credentials in generic forms.
- A provider is not "supported" because it appears in the catalogue or can authenticate. It must pass authentication, identity, permissions, instrument mapping, order lifecycle and reconciliation acceptance tests.
- Never silently substitute an unsupported order type, instrument, venue, expiry, strike, quantity or market order.
- Do not provision paid AWS infrastructure, incur spend, deploy production, or enable live orders without explicit approval.
- India live execution remains blocked until legal review and written broker/platform permissions are confirmed.
- Report only verified commits, tests, deployments and broker evidence. A CI job with no runner steps/logs is an infrastructure/CI failure, not a passing test.

## Phased delivery plan

| Phase | Scope | Exit criteria | Status |
|---|---|---|---|
| 0. Foundation and product guardrails | Monorepo, architecture, tenant-owned data model, invite-only auth, MFA, host/listing/subscription foundations, paper-only policy | Schema and core route contracts reviewed; CI can run and report actionable results | Foundation committed; validation still blocked |
| 1. Broker connection completion | Provider credential contracts; secure broker-hosted auth; one-time callback correlation; token lifecycle; account identity; health/re-auth; provider permission and static-IP evidence | Each enabled provider passes automated contract tests and account-level verification; unverified providers remain visibly unavailable | In progress |
| 2. Canonical instruments and capability matrix | Normalized exchange/segment/instrument/expiry/strike/lot-size/precision; per-broker order/event capabilities; verified source→destination mappings | Mapping is deterministic, versioned and fail-closed; every supported pair has fixtures and tests | Started: strict instrument validation and destination-segment gating committed; mapping registry still pending |
| 3. Durable copy execution engine | Queue worker, transactional claims, idempotency, retry/backoff, outbox/inbox, per-subscriber evaluation, order submission abstraction | Paper intents progress through durable states; duplicate delivery cannot duplicate orders; crash recovery tested | Not started |
| 4. Full order lifecycle and reconciliation | Entry/exit/partial exit, modify/cancel, SL/TP/trailing, square-off, partial fills, rejects, reconnect/replay and broker reconciliation | Lifecycle contract tests pass for every enabled adapter; unmatched exposure and unknown states are surfaced safely | Not started |
| 5. Host/subscriber product completion | Host listings and controls; subscriber discovery/subscription/risk/destination selection; activity and execution history; support/admin operations | End-to-end multi-user workflows pass with isolated tenant data and usable operational visibility | Foundation present; completion pending |
| 6. Security, reliability and observability | Tenant isolation, session/MFA, KMS/Secrets Manager integration, key rotation, audit, monitoring, rate limits, backups, recovery, load/failure tests | Security and operational acceptance suite passes; no cross-tenant access or secret leakage | Partial foundation; tests pending |
| 7. Cross-broker paper certification | Host/subscriber broker-pair matrix across India and Crypto, market-hours, sizing, rejection and outage simulations | Repeatable paper certification report for every enabled broker pair; no live order path | Not started |
| 8. Compliance, infrastructure and controlled launch | Legal/broker written approvals, AWS Mumbai deployment, static egress where required, monitoring/backup/DR, invite-only launch controls | Owner approval, legal clearance, broker permissions, infrastructure/security sign-off and documented rollback | Blocked on approvals and AWS authorization |

## Phase 1 work breakdown — broker connections

1. Audit current provider registry, credential form contract, API schema and UI actions for mismatches.
2. Keep separate flags for credential intake, authentication implementation, account verification and execution readiness.
3. Complete safe callback/token flows for Dhan, Shoonya, Flattrade, ICICI Breeze and Alice Blue only where official docs support a secure tenant-binding design. Do not invent undocumented OAuth state parameters or use ambiguous callback correlation.
4. Add provider-specific auth contract tests, expiry/re-auth tests, failure tests and sanitized audit behavior.
5. Confirm official platform/third-party permissions, supported segments, static-IP requirements, order events and rate limits.
6. Keep remaining catalogue providers research-only until their official API and permission review is complete.
7. Fix CI visibility so failures expose the failing step and logs; do not treat runner provisioning failures as test results.

## Current verified baseline (24 November 2026)

- Active branch: `phase1-foundation`.
- Last recorded commit before this roadmap: `dd87f8e537928cfe6ccc2860e37abdf672b9658e`.
- Authentication source exists for Zerodha, Upstox, FYERS, Angel One and 5paisa.
- Read-only account verification source exists for Groww and Delta Exchange India.
- Dhan, Shoonya, Flattrade, ICICI Breeze and Alice Blue do not yet have complete authentication flows.
- No broker order-execution adapter or copy-intent worker is complete.
- No real broker account has been used to validate the flows; no live orders have been sent.
- AWS KMS, static egress IP and production AWS resources are not provisioned.
- The latest recorded GitHub Actions run failed at job level with no step summaries/logs; repository tests/build are therefore not certified.

## Immediate next deliverable

Complete Phase 1 provider contract alignment and tests before expanding broker count. In parallel, prepare Phase 2's canonical instrument/capability contract, but do not route orders until the provider pair is certified.


## Implementation log — 24 November 2026 (Phase 2 groundwork)

- Added runtime canonical-instrument validation for venue, segment, symbol, quote currency, positive tick/lot/multiplier values, and complete option identity (underlying, ISO expiry, positive strike, CE/PE).
- Applied instrument validation to paper-routing eligibility and destination-instrument checks.
- Added destination segment capability checks so a broker cannot receive a mapped instrument in an undeclared segment.
- Hardened lifecycle eligibility: management events require exact target order IDs; partial exits require explicit positive quantity, an order-event capable adapter, a reconciled open position quantity, and scaled quantity no greater than the copied position. Partial-exit quantity is calculated with exact decimal arithmetic.
- Updated the broker connection UI to load credential field keys and labels from the server's authoritative provider registry instead of maintaining a second independent field-key map. This reduces UI/API credential naming drift.
- Added focused domain tests for instrument validation, segment gating, target-order references, partial-exit sizing and market identity.

These are committed source changes, not a validated build. GitHub Actions continues to terminate at job initialization with no steps or logs, and no local test runner has been available in this session. No passing test is claimed.
