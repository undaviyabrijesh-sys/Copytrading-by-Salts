# Copy Trading Desk — Architecture Framework

**Project:** Copy Trading by Salts  
**Repository:** `undaviyabrijesh-sys/Copytrading-by-Salts`  
**Document:** Phase 0 — Architecture and delivery framework  
**Status:** Draft for owner approval; no trading or hosting resources provisioned  
**Last researched:** 24 November 2026  
**Decision gate:** Do not begin Phase 1 or spend money until the owner approves this framework and the regulatory/broker-access blockers are resolved.

---

## 1. Product scope and non-negotiable decisions

Build one invite-only, free-to-use copy-trading platform for the owner's host account and approved subscribers. Each subscriber connects their own broker/exchange account. The platform sends orders only to that subscriber's account, never holds funds, never requests withdrawal permissions, and must not imply guaranteed returns.

Supported product areas:

- **India:** NSE/BSE equities, equity derivatives and (subject to broker permissions) commodity derivatives.
- **Crypto:** Delta Exchange India first; other exchanges only after India-resident availability, legal status, API terms and product suitability are checked.
- **Host inputs:** host broker/exchange events, manual host ticket, authenticated HMAC webhook.
- **Modes:** paper by default; live mode only after explicit, auditable go-live checks.
- **Access:** invite-only; no public registration; invites single-use, expiring, revocable.
- **No:** payments, billing, public strategy marketplace, custody, withdrawal access, third-party copy-trading SaaS, Tradetron dependency.

### Important regulatory gate — India

This is not merely a software deployment decision. The SEBI retail-algo framework and exchange implementation standards are live considerations in November 2026. NSE's published implementation standards state that a client must provide a static IP mapped to the API key(s) used to connect to the broker. SEBI's framework also places obligations on brokers and algo providers/vendors, including controls, audit trails and broker/exchange processes. NSE's current page describes a Client Direct API / Member Frontend application path and references additional 2026 circulars.

**Before enabling live copy trading for other people, obtain written advice from an Indian securities-law professional and written acceptance from each launch broker that this exact host-to-subscriber, multi-client, third-party order-routing model is permitted under its current API terms and regulatory process.** Confirm whether the platform/operator must be empanelled, registered, hosted in a broker-approved environment, or onboarded as an algo provider/vendor. Free/invite-only status does not itself establish an exemption. Do not assume a disclaimer solves this.

A particularly important concern: the host's trades are being converted into automated orders in separate clients' accounts. That may be treated differently from a subscriber running their own direct API algo. The framework therefore supports paper mode and read-only research first; live Indian order placement is feature-flagged off until written clearance exists.

**Performance display gate:** SEBI's 2025 framework contains restrictions on brokers providing algo services referring directly or indirectly to past/expected algorithm returns, with a specific PaRRVA-verified risk/return metrics exception described in the relevant provisions. The proposed host-performance page must be reviewed by counsel and the participating broker before it is exposed to subscribers. For now, design it as an authenticated, factual operational report based on actual fills, not promotional performance claims; keep performance widgets behind a feature flag until cleared.

Primary references:
- SEBI Feb 4, 2025 circular: https://www.sebi.gov.in/legal/circulars/feb-2025/safer-participation-of-retail-investors-in-algorithmic-trading_91614.html
- SEBI Sep 30, 2025 implementation timeline extension: https://www.sebi.gov.in/legal/circulars/sep-2025/extension-of-timeline-for-implementation-of-sebi-circular-dated-february-04-2025-on-safer-participation-of-retail-investors-in-algorithmic-trading-_96979.html
- NSE implementation standards (NSE/INVG/67858): https://nsearchives.nseindia.com/content/circulars/INVG67858.pdf
- NSE algo / Client Direct API guidance (updated May 27, 2026): https://betanseapi.nseindia.com/static/trade/platform-services-non-neat-decision-support-tools-algorithm-trading
- SEBI Master Circular / relevant algo provisions (June 2025 PDF): https://www.sebi.gov.in/sebi_data/attachdocs/jun-2025/1750158789381.pdf

---

## 2. Recommended architecture

### Hosting decision: AWS is the target

The owner has an AWS account and has explicitly selected AWS for hosting. Therefore AWS replaces the earlier Railway + Vercel deployment suggestion for this repository. Do not deploy this project to Railway or Vercel unless the owner later changes this decision.

Use **AWS ap-south-1 (Mumbai)** as the initial region, subject to broker latency tests and data-residency/legal review. Keep provider abstractions so a second region can be added later.

### Logical architecture

```text
                     Browser / PWA
                           |
                    CloudFront + WAF
                           |
                    Web app (Next.js)
                           |
                 ALB / API Gateway (TBD)
                           |
                  API service (Fastify)
                    /      |       \
                   /       |        \
             PostgreSQL  Redis    Auth / TOTP
              (RDS)   (ElastiCache)  (Cognito or app auth)
                   \       |        /
                    \      |       /
                   Signal intake + validation
                           |
                    Durable event queue
                   (SQS or Redis/BullMQ)
                           |
                  Copy orchestration engine
                           |
                 Risk / sizing / dedupe gate
                           |
             Per-subscriber execution isolation
                 /                       \
        India broker adapters       Crypto adapters
        Zerodha / Dhan / ...        Delta India / ...
                 \                       /
                  Broker/exchange APIs
                           |
               WebSocket / postback updates
                           |
                  Reconciliation workers
                           |
                 Audit + metrics + alerts
```

### AWS service mapping

| Concern | AWS service / choice | Notes |
|---|---|---|
| Web | Next.js on ECS Fargate initially; CloudFront in front | Avoid introducing a second hosting vendor; static assets via CloudFront/S3 if useful. |
| API | ECS Fargate service behind ALB | Fastify + REST + WebSocket/SSE. |
| Engine | Separate ECS Fargate worker service | Isolated deploy/scaling from API; no trading logic in request handlers. |
| Scheduled jobs | EventBridge Scheduler + worker tasks | Instrument sync, daily token reminders, reports, reconciliation. |
| Database | RDS PostgreSQL | Multi-AZ for production after MVP; migrations via Prisma or Drizzle. |
| Queue/cache | ElastiCache Redis + BullMQ for MVP; consider SQS for durable fan-out | Redis locks/idempotency are not the sole correctness boundary; database uniqueness constraints remain authoritative. |
| Secrets | AWS Secrets Manager + KMS | Envelope encryption; no credentials in logs or browser. |
| Network | VPC private subnets, NAT Gateway / Elastic IP | Fixed egress; per-client IP issue described below. |
| Edge security | CloudFront + AWS WAF + ACM | TLS, rate limits, managed protections. |
| Observability | CloudWatch logs/metrics/alarms; OpenTelemetry | Trace signal-to-order path with correlation IDs. |
| CI/CD | GitHub Actions + ECR + ECS deploy | OIDC role assumption; no long-lived AWS keys in GitHub secrets. |

**Framework choice:** pnpm + Turborepo monorepo; TypeScript; Next.js App Router, Tailwind and shadcn/ui; Fastify; PostgreSQL + Prisma; Redis + BullMQ; Zod; Vitest; Playwright; k6. Keep adapter contracts in a shared package. This is a practical single-language stack for API, engine and web with strong type sharing.

### Service boundaries

1. **Web app:** presentation only; no broker secrets or direct order calls.
2. **API:** auth, invite lifecycle, settings, dashboards, broker connection management, manual host ticket, diagnostics, admin operations.
3. **Signal intake:** validates source authentication, timestamp, replay window, schema and idempotency; writes immutable accepted/rejected event.
4. **Copy engine:** resolves eligible subscribers, calculates quantities, evaluates risk, schedules executions, tracks lifecycle.
5. **Broker adapters:** provider-specific auth, mapping, order lifecycle, WebSocket/postback and normalized errors.
6. **Execution gateway:** sole outbound order-placement path; fixed egress, rate limiting, per-account serialization, circuit breakers and kill switches.
7. **Reconciliation:** compares broker fills/positions with internal state; reports drift; auto-correction disabled by default until explicitly tested.
8. **Reporting:** builds performance only from broker-confirmed fills and fees; never infer fills from successful order acknowledgements.
9. **Notifications:** email and Telegram delivery with retry/outbox pattern.
10. **Audit/observability:** append-only audit events, metrics, traces and incident history.

---

## 3. Static egress IP and broker compliance strategy

### Technical finding

AWS public NAT Gateways use an Elastic IP as their outbound public IPv4 address. This gives a stable egress address for resources routed through that NAT Gateway. AWS documents that the NAT Gateway maps the private source IP to the NAT Gateway's Elastic IP when traffic exits through an Internet Gateway.

References:
- AWS NAT Gateway behavior: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html
- NAT Gateway pricing model: https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-pricing.html
- Public IPv4 pricing: https://aws.amazon.com/vpc/pricing/

### Critical product constraint

A single shared NAT EIP is **not automatically a compliant solution** for every subscriber. NSE's standards describe static IPs mapped to the individual client's API keys; brokers may also prohibit sharing a static IP across unrelated clients or require platform/vendor onboarding. Zerodha explicitly says sharing a static IP is limited to immediate family. Dhan says each individual needs a unique static IP. FYERS describes a common static IP exception only for eligible family members and says third-party platforms must be empanelled/hosted within broker infrastructure under its guidance.

Therefore:
- Do not register one platform-wide AWS EIP for every unrelated subscriber and assume it is accepted.
- Treat static IP assignment as a per-broker, per-client onboarding requirement.
- The execution gateway abstraction must support multiple egress identities, but **do not provision one EIP per subscriber yet**: cost and broker policy need confirmation.
- Ask each broker for written confirmation of its approved architecture for a third-party platform copying host signals into independently owned client accounts.
- If a broker requires the client to own/control the static IP, design a customer-specific execution agent/gateway or a broker-approved partner architecture. Do not route around broker policy.
- Until that is settled, India live execution remains disabled. Paper trading and mock adapter tests can proceed.

### AWS egress design options

| Option | Description | Pros | Risks / cost |
|---|---|---|---|
| A. Shared NAT EIP | One NAT Gateway with EIP for all execution workers | Simple, stable, low operational burden | May violate client-specific mapping or broker IP-sharing rules. Not assumed compliant. |
| B. Per-client egress | Isolated egress route/NAT EIP for each subscriber or approved group | Can map a client-specific IP | NAT Gateway hourly cost and EIP cost scale linearly; route-table/VPC design complexity. |
| C. Subscriber-owned gateway | Subscriber runs a small agent/VPS with their registered static IP | Stronger client-specific ownership/control | More onboarding/support burden; local agent security and uptime complexity. |
| D. Broker-approved partner setup | Broker supplies/approves the vendor execution model | Potentially the correct scalable route | Requires broker approval/empanelment; terms vary. |

**Recommendation:** pursue D first; retain B/C as design alternatives if brokers explicitly approve them. Use one AWS NAT EIP only for internal outbound services and non-order APIs until each broker confirms the order path.

---

## 4. Data model (minimum logical schema)

All tenant-owned rows carry `tenant_id` / `user_id`; enforce PostgreSQL Row-Level Security (RLS) where feasible, plus service-layer authorization. Host/admin privileges are explicit roles, not inferred from email address.

| Entity | Important fields / constraints |
|---|---|
| users | id, email, password_hash or auth_subject, role, status, totp_state, created_at |
| invites | id, token_hash, created_by, expires_at, max_uses=1, used_by, revoked_at |
| disclaimer_versions | id, version, market_scope, body, published_at, content_hash |
| disclaimer_acceptances | id, user_id, version_id, accepted_at, IP, user_agent |
| broker_connections | id, user_id, provider, encrypted_credentials, key_fingerprint, status, last_health_at, egress_profile_id |
| egress_profiles | id, owner_user_id, provider, public_ip, verification_state, broker_approval_ref |
| instruments | id, market, canonical_symbol, exchange, expiry, strike, option_type, lot_size, tick_size, freeze_qty, contract_size, provider_symbol, provider_token |
| host_strategies | id, name, market, enabled, metadata |
| signals | id, source, host_account_id, strategy_id, canonical_instrument_id, event_type, side, qty, order_type, price, SL/TP, event_time, idempotency_key, payload_hash |
| host_trades | id, signal_id, broker_order_id, broker_trade_id, fill_qty, fill_price, fees, status, filled_at |
| subscriber_settings | id, user_id, market_enabled, mode, sizing_mode, multiplier, fixed_qty, capital_pct, risk_per_trade, max_daily_loss, max_positions, max_order_qty, slippage_guard, late_join_policy |
| copy_orders | id, signal_id, user_id, broker_connection_id, client_order_id, idempotency_key, broker_order_id, requested_qty, filled_qty, average_fill, status, latency_ms, slippage, failure_code |
| positions | id, user_id, connection_id, instrument_id, net_qty, avg_price, realized_pnl, unrealized_pnl, reconciled_at |
| reconciliation_runs | id, user_id, connection_id, started_at, completed_at, drift_count, result |
| errors | id, user_id, copy_order_id, normalized_code, raw_code_redacted, timeline, resolution_state |
| notifications | id, user_id, channel, type, payload, status, attempts |
| audit_logs | id, actor_id, tenant_id, action, target_type, target_id, request_id, before_hash, after_hash, created_at |
| paper_accounts | id, user_id, market, virtual_capital, fee_model, slippage_model, balance |
| outbox_events | id, aggregate_id, event_type, payload, published_at, attempts |

**Data isolation rules:** tenant ownership is mandatory; no cross-user reads through API, query, cache key, queue payload or logs. Redis keys are tenant-scoped. Every worker re-authorizes the subscriber/connection before execution. Admin access is audited and least-privilege. Never return encrypted credential blobs to clients.

---

## 5. API surface (initial contract)

Base path: `/api/v1`; JSON; Zod validation; OpenAPI generated from route schemas; all timestamps UTC in storage and rendered in Asia/Kolkata.

### Auth / invites / legal
- `POST /auth/invites/consume`
- `POST /auth/signup` (invite token required)
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/totp/setup`, `POST /auth/totp/verify`
- `GET /legal/current`
- `POST /legal/acceptances`

### Host / admin
- `POST /admin/invites`, `GET /admin/invites`, `POST /admin/invites/:id/revoke`
- `GET /admin/subscribers`, `GET /admin/subscribers/:id`
- `POST /admin/kill-switch`, `POST /admin/subscribers/:id/pause`
- `POST /host/signals/manual`
- `POST /host/webhooks/:source` (HMAC + timestamp + nonce + replay cache)
- `GET /host/performance`, `GET /host/trades`, `GET /host/positions`

### Subscriber
- `GET /me`, `GET /me/dashboard`
- `POST /me/markets`
- `POST /me/broker-connections`, `POST /me/broker-connections/:id/test`, `POST /me/broker-connections/:id/disconnect`
- `GET /me/broker-connections/:id/diagnostics`
- `PUT /me/copy-settings`
- `POST /me/copy/pause`, `POST /me/copy/resume`, `POST /me/copy/square-off`
- `GET /me/copy-orders`, `GET /me/positions`, `GET /me/errors`
- `POST /me/mode/paper`, `POST /me/mode/live` (live endpoint checks all gates server-side)

### Realtime
- `GET /events` via SSE initially; WebSocket only if required for order-book style updates.
- Every event is scoped to the authenticated user; no room subscription by arbitrary user ID.

---

## 6. Normalized signal and order lifecycle

### Signal schema (conceptual)

```ts
type SignalEvent =
  | { event: "ENTRY"; signalId: string; idempotencyKey: string; strategyId: string;
      instrument: CanonicalInstrument; side: "BUY" | "SELL"; quantity: number;
      orderType: "MARKET" | "LIMIT" | "SL" | "SL-M"; limitPrice?: number;
      stopLoss?: number; takeProfit?: number; occurredAt: string; source: SignalSource }
  | { event: "EXIT" | "PARTIAL_EXIT"; signalId: string; idempotencyKey: string;
      instrument: CanonicalInstrument; side: "BUY" | "SELL"; quantity?: number;
      exitFraction?: number; occurredAt: string; source: SignalSource }
  | { event: "MODIFY_SL" | "TRAIL_SL" | "MODIFY_TP"; signalId: string;
      idempotencyKey: string; instrument: CanonicalInstrument; value: number;
      targetLegId?: string; occurredAt: string; source: SignalSource }
  | { event: "CANCEL" | "SQUARE_OFF_ALL"; signalId: string; idempotencyKey: string;
      instrument?: CanonicalInstrument; occurredAt: string; source: SignalSource };
```

Use decimal-safe numeric representation (decimal strings or integer ticks/paise where possible); do not use JS floating-point for money/quantity arithmetic. Include host order/trade references, source account, strategy, correlation ID, schema version and event-time/received-time separately in the persisted envelope.

### Execution state machine

```text
RECEIVED -> VALIDATED -> ELIGIBILITY_CHECKED -> RISK_APPROVED
         -> ORDER_SUBMITTED -> ACKNOWLEDGED -> PARTIALLY_FILLED
         -> FILLED / CANCELLED / REJECTED / UNKNOWN
```

- A successful place-order HTTP response is an acknowledgement, not proof of fill.
- Fills are derived from trade events or authoritative order/trade history.
- Persist the signal and fan-out intent transactionally (outbox pattern).
- Enforce unique keys on (subscriber_id, signal_id, action/leg) and broker client-order ID.
- Per-account order serialization, provider rate buckets and bounded retries.
- Never blindly retry an order after an ambiguous timeout; first query broker state by tag/order history to avoid duplicates.
- Entry stale threshold configurable; late join defaults to no entry into already-open host trades.
- Orphan exits ignored unless explicitly enabled position-sync mode confirms a corresponding subscriber position.
- Stop/target changes map to subscriber-specific child orders/legs; leg IDs and quantities must be tracked to support partial exits and per-lot trailing stops.
- Kill switch blocks new entries immediately; exits and risk-reducing actions remain allowed unless the operator explicitly invokes emergency broker-side restrictions.

---

## 7. Broker adapter contract

One adapter per provider; no provider-specific response leaks into the engine.

```ts
interface BrokerAdapter {
  connect(input: ConnectionInput): Promise<ConnectionResult>;
  authenticate(): Promise<AuthState>;
  refreshSession?(): Promise<AuthState>;
  validatePermissions(): Promise<PermissionReport>;
  getInstruments(): AsyncIterable<BrokerInstrument>;
  getFunds(): Promise<FundsSnapshot>;
  placeOrder(order: NormalizedOrder, idempotency: IdempotencyContext): Promise<OrderAck>;
  modifyOrder(orderId: string, patch: NormalizedOrderPatch): Promise<OrderAck>;
  cancelOrder(orderId: string): Promise<OrderAck>;
  getOrders(query?: OrderQuery): Promise<NormalizedOrder[]>;
  getTrades(query?: TradeQuery): Promise<NormalizedTrade[]>;
  getPositions(): Promise<NormalizedPosition[]>;
  subscribeOrderUpdates?(handler: (event: BrokerOrderEvent) => void): Promise<Unsubscribe>;
  healthCheck(): Promise<HealthReport>;
  mapError(error: unknown): NormalizedBrokerError;
}
```

Every adapter also declares capabilities and constraints: supported segments/order types, token expiry model, order-rate buckets, static-IP policy, WebSocket/postback support, sandbox/testnet, auto-slicing, market protection, and broker-specific onboarding/approval status. Contract tests run against MockBroker and SimulatedBroker before a real adapter is enabled.

---

## 8. Broker and exchange research register

The table records official-document findings as of 24 Nov 2026. Exact API plan pricing, partner eligibility and account-specific access must be rechecked before implementation; do not infer a feature from an SDK or third-party sample.

### India — proposed launch order

| Provider | Official docs / verified facts | Current constraint / open item | Priority |
|---|---|---|---|
| Zerodha Kite Connect | https://kite.trade/docs/connect/v3/ ; orders, trades, postbacks and autoslice documented. Support FAQ states API order placement requires registered static IP; up to 10 OPS, 400 orders/min and 5,000 orders/day. | Kite Connect API subscription pricing must be confirmed in the developer console. Static IP sharing is restricted to immediate family; ask Zerodha in writing whether a vendor platform can route independent subscribers' orders. | Tier 1, subject to written approval |
| DhanHQ | https://dhanhq.co/docs/v2/ ; trading APIs; partner category exists and Dhan asks prospective platforms to contact them. | Individual access tokens are 24-hour validity; static IP required for place/modify/cancel. Docs state each individual needs a unique static IP. Partner onboarding and commercial terms must be obtained. | Tier 1, partner discussion first |
| Angel One SmartAPI | https://smartapi.angelone.in/docs ; official regulation page: https://smartapi.angelbroking.com/exchange-regulations | Static IP required for API order execution effective 1 Apr 2026; published order API combined rate is 9 requests/sec. Confirm partner/third-party execution permission and auth/session lifecycle. | Tier 1, approval pending |
| Upstox | https://upstox.com/developer/api-documentation/ | Order APIs: regular-algo 10/sec, 500/min, 2,000/30 min; static IP management API published Apr 10 2026; static IP updates once per calendar week and invalidate existing tokens. Algo name header requirement applies to algo app orders. | Tier 1, approval pending |
| FYERS | https://fyers.in/api-docs/v3/ | Order endpoints documented with 10 OPS. Current guide says App Type 200 supports order placement; static IP must be whitelisted; login endpoint 10 requests / 2 min. FYERS guidance says third-party platforms must be empanelled/hosted within broker infrastructure under current framework. | Tier 1, partner/empanelment gate |



### Expanded India broker coverage — catalogue and adapter roadmap

The platform's long-term Indian connector scope is broader than the initial launch trio. The adapter architecture must be provider-neutral and the broker picker should be data-driven. We will not claim every listed provider is immediately live-ready: an entry becomes **order-enabled** only after official documentation, API access, pricing, OAuth/vendor onboarding, static-IP mapping, exchange segments, rate limits and the multi-client copy-trading permission are verified.

#### Tier 1 — launch/pilot candidates (subject to written platform approval)

| Broker | API / official entry point | Initial scope | Gate / notes |
|---|---|---|---|
| Zerodha | https://kite.trade/docs/connect/v3/ | NSE/BSE, NFO, CDS, MCX where account/segment enabled | Static IP, API subscription and third-party vendor permission to be confirmed. |
| Dhan | https://dhanhq.co/docs/v2/ | NSE/BSE, F&O, MCX where enabled | 24-hour token lifecycle and individual static-IP mapping; partner onboarding required for multi-client platform. |
| Angel One | https://smartapi.angelone.in/docs | NSE/BSE, F&O, commodity where enabled | Static IP, OAuth/vendor onboarding and rate limits must be confirmed against current official notices. |
| Upstox | https://upstox.com/developer/api-documentation/ | NSE/BSE, F&O, commodity where enabled | Static IP, algo-app identification and API rate limits; verify partner route. |
| FYERS | https://fyers.in/api-docs/v3/ | NSE/BSE, F&O, commodity where enabled | Static IP and third-party platform empanelment/hosting requirements. |
| Shoonya (Finvasia) | https://www.shoonya.com/api-documentation | NSE/BSE, F&O, currency/commodity subject to account segments | Official docs describe REST + WebSocket, OAuth 2.0, trading APIs and vendor OAuth for platform integrators. Confirm vendor onboarding, API terms and current rate limits. |
| Flattrade | https://flattrade.in/ (official API/docs entry to be confirmed with provider) | NSE/BSE, F&O, commodity subject to account | Pi API/Noren ecosystem is referenced by broker documentation; obtain current official docs, rate limits, auth and platform/vendor approval directly. |
| 5paisa | https://xstream.5paisa.com/ (developer portal) | NSE/BSE, F&O | Xstream/Open API availability is documented; confirm current API plan, static IP, OAuth/vendor model and rate limits. |
| ICICI Direct | https://www.icicidirect.com/futures-and-options/api/breeze | NSE/BSE, F&O | Breeze API; verify account eligibility, session lifecycle, rate limits, static-IP and third-party platform permissions. |
| Kotak Neo | https://www.kotakneo.com/trade-api/ | NSE/BSE, F&O | Static IP required for order execution from 1 Apr 2026 per Kotak's notice. Confirm current login/session flow and vendor eligibility. |
| Alice Blue | https://ant.aliceblueonline.com/ (ANT API portal; verify current docs with broker) | NSE/BSE, F&O, commodity subject to account | ANT API exists; obtain current official developer pack, auth, limits, static-IP and partner terms. |
| Groww | https://groww.in/trade-api | NSE/BSE, F&O subject to API/product support | Official Trade API exists; verify account-level access, key issuance, order types, static IP and whether third-party OAuth/vendor onboarding is supported. |

#### Tier 2 — expanded coverage after first pilot

| Broker / provider | Official starting point | Status and verification required |
|---|---|---|
| IIFL Securities / IIFL Capital | https://www.iiflcapital.com/ | API/XTS availability is referenced in provider ecosystem material. Obtain current official developer docs, order API eligibility, pricing and vendor approval. |
| Motilal Oswal | https://www.motilaloswal.com/ | Open API / XTS route is referenced; confirm current developer portal, account eligibility, rate limits and commercial terms. |
| SAMCO | https://www.samco.in/ | Trade API availability is referenced; obtain current official API docs and verify OAuth/session, static IP, limits and multi-client vendor permission. |
| Tradejini | https://tradejini.com/ | CubePlus/API route is referenced; verify current official API pack, supported segments, pricing and vendor onboarding. |
| Nuvama | https://www.nuvama.com/ | API Connect availability is referenced; verify access eligibility, order endpoints, rate limits and platform/vendor terms. |
| HDFC Securities / HDFC SKY | https://www.hdfcsec.com/ and https://hdfcsky.com/ | Confirm whether retail order APIs are publicly available to the target account type; do not assume website/app access implies an API. |
| Mirae Asset m.Stock | https://www.mstock.com/ | API availability is referenced in market materials; verify current official developer documentation, plan/pricing and allowed usage. |
| Sharekhan | https://www.sharekhan.com/ | Trading API availability varies by program/account; obtain current official developer access and written vendor terms. |
| Axis Direct | https://simplehai.axisdirect.in/ | Verify whether a current retail order API is offered and whether third-party platform integration is allowed. |
| Choice Broking | https://choiceindia.com/ | Verify current API availability, XTS/partner access, segments and vendor onboarding. |
| Jainam | https://www.jainam.in/ | Verify retail API availability versus prop-only access; confirm supported segments and vendor permission. |
| Mastertrust | https://www.mastertrust.co.in/ | Verify official API documentation, access eligibility, order support and vendor terms. |
| Zebu | https://zebuetrade.com/ | Verify official API access, supported segments, current docs and platform permission. |
| SAS Online | https://www.sasonline.in/ | Verify current API status, developer docs and account eligibility. |
| Paytm Money | https://www.paytmmoney.com/ | Verify current retail API availability and whether order APIs remain open for new integrations. |
| Pocketful | https://pocketful.in/ | Verify current official developer docs, API access, supported segments and terms. |
| Firstock | https://firstock.in/ | Verify current API docs, Noren/vendor access, pricing and order placement permissions. |
| Stoxkart | https://www.stoxkart.com/ | Verify current Superr API documentation, account eligibility and partner model. |
| TradeSmart | https://www.tradesmartonline.in/ | Verify current API access and XTS/partner integration terms. |
| Wisdom Capital | https://wisdomcapital.in/ | Verify current API access, account eligibility and supported order types. |
| RMoney | https://rmoneyindia.com/ | Verify current API documentation and whether retail API order placement is available. |
| Compositedge | https://compositedge.com/ | Verify broker/API entity, regulatory status, API access and supported segments before adding. |
| Definedge | https://www.definedge.com/ | Verify current broker/API offering and retail order placement eligibility. |
| HDFC / other Symphony XTS, ODIN or Noren member brokers | Provider-specific official site | Do not treat a shared OMS protocol as proof of API entitlement. Each broker must approve the account and platform integration separately. |

#### Broker discovery and connector governance

The roadmap should remain extensible beyond the names above. Add a provider only after it meets these checks:

1. SEBI-registered broker identity and official API documentation are confirmed.
2. Retail API order placement is available for the subscriber's account type; data-only APIs do not qualify.
3. Broker explicitly permits the intended third-party, multi-client copy-trading workflow and has completed required vendor/empanelment steps.
4. Authentication is broker-approved OAuth or the current mandated flow; never collect broker web passwords, MPIN or TOTP in our own UI if the broker requires user-to-broker authorization.
5. Static IP is mapped to the correct end-user/API key; the broker confirms whether a platform-operated or subscriber-operated egress IP is accepted.
6. Supported exchanges/segments, order types, freeze quantity, lot size, rate limits, token expiry, WebSocket/postback behavior, sandbox and fees are documented.
7. Adapter contract tests pass and the broker is shown as **Paper**, **Live approved**, **Read-only**, or **Unavailable** in the product. Never display a connector as live-ready based only on a package/SDK.

#### Research evidence and limitations

- Shoonya's official API documentation explicitly describes OAuth 2.0, REST + WebSocket, trading APIs and platform/vendor integrators: https://www.shoonya.com/api-documentation
- Shoonya API terms describe programmatic order placement, modification, cancellation and account/portfolio access: https://www.shoonya.com/api-terms-and-conditions
- Kotak Neo's static-IP notice says order APIs require whitelisted static IPs and a session created from that IP effective 1 April 2026: https://www.kotakneo.com/platform/kotak-neo-trade-api/static-ip-details/
- NSE implementation standards require client static IP address(es) mapped to API keys: https://nsearchives.nseindia.com/content/circulars/INVG67858.pdf
- SEBI's June 2025 master circular says brokers deal with empanelled algo providers and requires unique vendor-client API keys, static IP whitelisting, OAuth and two-factor authentication for the relevant API-provider model: https://www.sebi.gov.in/sebi_data/attachdocs/jun-2025/1750158789381.pdf

Third-party broker directories and aggregator lists were used only to discover names, not to assert API availability or permissions. Every provider's final status must be based on current first-party documentation and written broker confirmation. API pricing and access can change; no cost is treated as confirmed until checked at implementation time.


### Crypto — proposed launch order

| Provider | Official docs / verified facts | Current constraint / open item | Priority |
|---|---|---|---|
| Delta Exchange India | https://docs.delta.exchange/ ; India production host https://api.india.delta.exchange ; demo/testnet host https://cdn-ind.testnet.deltaex.org | Trading API key requires whitelisted IP(s); separate India production and demo/testnet credentials. Docs describe default 20,000 weighted quota per 5-minute window; endpoint weights apply. Verify Indian account product availability, key permission scopes, websocket limits and exact testnet parity. | Tier 1 |
| CoinDCX | https://docs.coindcx.com/ | API access, product scope, IP rules, account eligibility, current India legal/tax implications and rate limits require fresh official verification before adapter commitment. | Tier 2 |
| Binance | https://developers.binance.com/docs | Do not assume availability or legality for Indian users. Confirm current India access, FIU-IND status/obligations, product availability and exchange terms before any implementation. | Research only |
| Bybit | https://bybit-exchange.github.io/docs/v5/intro | Do not assume availability or suitability for Indian residents. Confirm current restrictions, FIU-IND status/obligations, product availability and terms before any implementation. | Research only |
| OKX / Bitget | https://www.okx.com/docs-v5/en/ ; https://www.bitget.com/api-doc/common/intro | Same jurisdiction, user eligibility, product and regulatory checks; not launch commitments. | Research only |

### Broker cost / commercial checks

- Zerodha: confirm current Kite Connect subscription charge and any app/partner terms.
- Dhan: individual trading APIs described as free; partner access requires contact and may have separate terms. Market-data APIs may be charged.
- Angel One, Upstox, FYERS: verify current plan, market-data costs, partner onboarding and any platform/vendor fees in writing.
- Do not build Tier 2 adapters until a current official API, user eligibility, price and order-placement terms are recorded in this register.

---

## 9. Sizing, risk, execution and reconciliation

### Sizing modes
- Multiplier: host fill quantity × subscriber multiplier.
- Fixed quantity.
- Percentage of available capital.
- Risk-per-trade based on subscriber-defined risk amount and stop distance.

For derivatives, round down to valid lot/contract size. If scaled quantity is below one lot, default to **skip with reason**; never silently round up. For crypto, enforce min quantity, step size and min notional.

### Mandatory pre-trade checks
- Market/asset class enabled; account connected and authenticated.
- Instrument mapping unambiguous and contract not expired.
- Market session/segment enabled; expiry-day policy applied.
- Margin/funds check where available.
- Daily loss, max positions, max order qty and allow/deny list.
- Slippage tolerance, price sanity and signal staleness.
- Broker order rate bucket and per-account lock.
- Host trade eligibility and subscriber's entry/position state.
- Live mode + disclaimers + broker permission + IP approval gates.

### Failure policy
- Insufficient margin: skip, do not resize automatically unless subscriber opted in.
- Token expired: pause new entries; attempt risk-reducing exits only where broker authentication still permits; notify subscriber to re-authenticate.
- IP not whitelisted: hard block and show exact remediation; never retry from another IP without approved configuration.
- Rate limited: provider-specific backoff; do not exceed broker limits.
- Ambiguous timeout: query broker state before retry.
- Partial fill: track actual filled quantity and mirror only the remaining/filled quantities according to configured policy.
- Reconciliation: compare positions and trades every configurable interval; auto-fix OFF by default. Never issue a blind corrective order.
- Kill switch: global, subscriber and market-level; every transition audited.

### Latency objective

Target p95 host-fill-to-subscriber-order-submit < 1 second at 500 concurrent subscribers is a performance objective, not a promise. Broker rate limits, network latency, per-account sequencing and broker-side OMS latency can make it unattainable for some fan-outs. Load testing must measure separately:
1. signal ingest -> fan-out enqueue;
2. queue wait;
3. risk/mapping;
4. broker request start;
5. broker acknowledgement;
6. actual fill latency.

A 500-subscriber fan-out may exceed per-client order limits if several host events arrive together. The engine must throttle per account and report queue delay honestly. Acceptance criterion should distinguish platform processing p95 from broker acknowledgement/fill p95.

---

## 10. Paper trading and verified reporting

Paper mode uses the same signal, sizing, risk, fan-out and lifecycle pipeline as live mode, with a SimulatedBroker adapter. It must use live quotes where licensed/available and configurable bid/ask or LTP fill model, slippage, fees and brokerage. Badge PAPER/LIVE on every trading surface and notification.

Go-live checklist (server-enforced):
- invite accepted, email verified, TOTP active;
- latest required disclaimer versions accepted;
- broker connection healthy and order permission validated;
- static IP/partner approval confirmed for that broker/account;
- instrument mapping validated;
- funds/margin preflight succeeds;
- minimum N paper trades completed without critical unresolved errors;
- user explicitly confirms live activation with step-up authentication;
- kill switch and notifications tested.

Performance numbers are derived from confirmed trades/fills and actual fees. Distinguish realized from unrealized P&L, host vs subscriber fill, slippage, currency conversion source/time, and stale data. Do not show synthetic or backfilled values as real fills. Typical subscriber-vs-host comparison must show sample size and methodology and remain disabled pending legal review.

---

## 11. UI page map / wireframe inventory

### Invite and onboarding
1. Invite landing / expiry and single-use status.
2. Sign-up / login.
3. TOTP enrollment and recovery-code display.
4. Mandatory market-specific disclosures and versioned acceptance.
5. Market selection: India / Crypto / both.
6. Broker connection wizard with step-by-step official links, API-key permission checklist, IP setup and live diagnostic.

### Subscriber workspace
- Overview: PAPER/LIVE, copy state, connected brokers, funds timestamp, day P&L, health.
- Positions: instrument, side, quantity, average, unrealized/realized P&L, host reference, exit controls.
- Copy activity: signal -> order -> acknowledgement -> fill timeline, host/subscriber price and slippage.
- Settings: sizing, max loss, max positions, instrument filters, stale threshold, late-join policy.
- Error Center: normalized reason, exact fix, reconnect/retry action with confirmation.
- Diagnostics: auth, permission, IP, funds, instrument, latency, WebSocket.
- Notifications and security settings.

### Host/admin workspace
- Performance report (feature-flagged pending legal clearance).
- Host open positions and verified trade log.
- Manual order ticket and host signal source status.
- Subscriber list, connection health, per-user overrides.
- Invite create/revoke/expiry/usage.
- Global/market/subscriber kill switches.
- Signal stream, strategy/source controls.
- Error and drift console.
- System health: queue depth, adapter health, latency percentiles, rate-limit pressure.
- Immutable audit log and announcement tool.

Design: mobile-first PWA, dark/light theme, clear trading-terminal density without visual clutter, accessible contrast, IST display, INR lakh/crore formatting, USD for crypto, no fake live values. Use TradingView Lightweight Charts or Recharts only where useful. All pages must have loading, empty, stale and error states.

---

## 12. Security model

- Invite tokens stored as hashes; single-use transactionally; expiry and revocation.
- Password hashing with Argon2id if app-managed auth; TOTP MFA with recovery codes; rate-limited login and step-up auth for live activation and square-off.
- Consider Cognito for managed identity, but validate TOTP, invite-only flow and custom consent UX before deciding. No public self-registration.
- AES-256-GCM envelope encryption for broker credentials; data key wrapped by AWS KMS; key version and rotation metadata stored; secrets only decrypted in execution service memory.
- Reject crypto keys with withdrawal permission; request trade-only scope. Do not request transfer/withdrawal scopes.
- Never log API keys, secrets, auth headers, tokens, TOTP seeds, raw webhook secrets or full broker payloads containing credentials.
- HMAC webhook signatures include timestamp + nonce + body digest; replay cache and key rotation.
- Strict tenant isolation in API, database, cache, queue, object storage, logs and SSE/WebSocket.
- CSRF protections for cookie sessions, secure HttpOnly SameSite cookies, CSP, XSS-safe rendering, CORS allowlist, request-size limits and schema validation.
- Append-only audit log with actor, tenant, request ID and action; privileged reads are audited.
- Separate production/staging accounts or at minimum separate VPC, databases, KMS keys and secrets.
- Backups with restore drills; RDS encryption at rest; TLS in transit; least-privilege IAM; GitHub OIDC.
- Data export/deletion workflow with legal retention exceptions for trading/audit records.
- Security review and penetration test before live trading.

---

## 13. Compliance checklist — professional review required

This is an engineering checklist, not legal advice.

Before any Indian securities live subscriber is onboarded, obtain written answers to:
1. Does host-to-subscriber automated replication constitute an algo service, investment advice, portfolio management, an intermediary activity, or another regulated activity under the applicable facts?
2. Does the operator need SEBI registration, broker empanelment, exchange algo registration, vendor registration, or other approval?
3. Which broker-approved model permits the platform to place orders on behalf of each independent client?
4. Are host performance pages, equity curves, win rates, risk-return metrics or subscriber comparisons permitted? Is PaRRVA verification required?
5. Who is responsible for algo tagging, static IP mapping, client-specific authentication, audit logs, order-to-trade ratio controls and incident reporting?
6. Can an execution service hosted in AWS Mumbai route orders for multiple clients? Does the broker require client-specific IPs or a broker-hosted/empanelled platform?
7. What client consent, risk disclosures, recordkeeping, complaint handling and grievance redressal apply?
8. What data retention, privacy, DPDP Act, cybersecurity and breach notification duties apply?
9. For crypto, confirm FIU-IND / PMLA obligations, exchange eligibility, product restrictions, Indian tax reporting and TDS treatment with qualified professionals.
10. Confirm all provider terms allow the intended API key storage, automated order placement and third-party platform usage.

### Draft disclosure templates for legal review

These are placeholders only; counsel must approve exact text and versions.

- **Risk disclosure:** “Trading in securities, derivatives and crypto-assets involves substantial risk, including loss of capital. Leverage can magnify losses. Orders may be delayed, rejected, partially filled or executed at prices different from the host account. You remain responsible for your own account and decisions.”
- **No advice:** “The platform provides technical order-routing functionality only and does not provide investment advice, recommendations, research or a guarantee of performance.”
- **Past performance:** “Past performance is not indicative of future results. Host fills and subscriber fills can differ materially due to timing, liquidity, fees, slippage, margin, broker rules and account settings.”
- **Own account:** “I trade at my own risk and in my own account. I authorize the platform to transmit orders to my connected broker/exchange account within the settings and permissions I configure.”
- **API permission:** “I understand that the platform will use my API credentials solely for the permitted account-data and trading functions described. I will not grant withdrawal or fund-transfer permission.”
- **Data use:** “I consent to processing my account, order, trade, connection and diagnostic data to provide copy execution, support, security, audit and legally required recordkeeping.”

Store the exact text, content hash, version, market scope, accepted timestamp, IP and user agent. Re-accept when a material version changes.

---

## 14. Testing, observability and release gates

### Test pyramid
- Unit: lot rounding, multiplier math, risk checks, stale signal, orphan exit, fee/slippage math, idempotency.
- Adapter contract: MockBroker and SimulatedBroker; capability and normalized-error tests.
- Integration: provider sandbox/testnet where available; otherwise recorded fixtures clearly marked non-live.
- Replay: deterministic signal replay including duplicate events, partial fills, trailing stops, timeouts and reconnects.
- Chaos: broker down, 429, expired token, unregistered IP, out-of-order WebSocket events, DB/Redis failover, worker crash.
- E2E: invite -> signup -> TOTP -> disclaimer -> connect -> paper -> copy -> error fix -> live checklist (live order submission excluded from CI).
- Load: 500 synthetic subscribers, queue pressure, per-account limits, duplicate prevention and p95 breakdown.

### Observability
- Structured JSON logs with correlation ID, tenant ID (opaque), signal ID and copy-order ID; never secrets.
- OpenTelemetry traces across ingest, queue, risk and adapter.
- Metrics: signal-to-submit p50/p95/p99, queue depth/age, adapter latency, 429 rate, rejection rate, partial fill rate, drift, stale signals, duplicate suppression, token expiry and kill-switch events.
- Health endpoints: liveness, readiness and dependency health; no secrets or account details exposed.
- Alerts: failed copies, auth expiry, IP issue, drift, broker outage, queue lag, kill switch and unusual order volume.

### Production release gates
No live trading until all of the following are true:
- regulatory/broker approval documented;
- security review passed;
- adapter contract tests passed;
- paper acceptance flow passed end-to-end;
- duplicate/orphan tests passed;
- recovery and reconciliation tested;
- audit trail and alerting verified;
- static egress identity verified with broker;
- load test results reviewed and limitations documented;
- manual emergency stop drill completed.

---

## 15. Deployment and operating plan

### Environments
- Local: Docker Compose for Postgres + Redis; MockBroker and SimulatedBroker only.
- Staging: separate AWS account/VPC or fully isolated resources; testnet/sandbox credentials only.
- Production: AWS ap-south-1; private subnets for API/engine/database; public ALB/CloudFront edge; Secrets Manager/KMS; backups and alarms.

### CI/CD
1. GitHub Actions checks formatting, lint, typecheck, unit, contract, build and dependency/security scan.
2. Build immutable Docker images and push to ECR using GitHub OIDC.
3. Deploy staging and run migrations as a one-off task.
4. Run smoke/E2E tests.
5. Production deploy requires manual approval and migration compatibility check.
6. Roll back app image; database migrations must be backward-compatible and use expand/contract pattern.

### Initial purchases / account checklist — approval required before spend

| Item | Needed now? | Indicative cost / note |
|---|---|---|
| AWS account | Already owned by user | No new purchase. Confirm billing, region and IAM access; do not request root credentials. |
| AWS VPC + NAT Gateway + EIP | Later, once broker confirms static IP design | Public IPv4 currently listed at $0.005/hour per address (~$3.65/month). NAT Gateway is charged hourly plus per-GB processing; exact ap-south-1 price must be confirmed in AWS Pricing Calculator. |
| Per-client static egress | Not yet | Potentially one egress IP per subscriber if broker mandates it; NAT hourly/IP charges scale with count. Do not buy until broker confirms. |
| RDS PostgreSQL / Redis | At MVP deployment | Cost depends on instance class, HA, storage and traffic; begin small in staging, size production after load tests. |
| Domain + DNS | Optional for MVP, required before public onboarding | Price depends on TLD/registrar; user approval required. |
| Email delivery | Before invite rollout | SES pricing is usage-based; verify sender/domain and production access. |
| Telegram bot | Optional, no platform fee expected | User creates bot; no secret in repository. |
| Broker API plans | Before each live adapter | Verify current pricing and partner terms directly with broker. |
| Legal review | Required before live Indian securities onboarding | Quote from qualified professional; amount unknown. |
| Security / penetration test | Before production live mode | Obtain quotes; amount unknown. |

No resources, paid services, domains, broker plans or legal services are to be purchased or provisioned without the owner's explicit approval.

### Initial monthly AWS estimate

Do not treat this as a quote. A minimal always-on staging footprint may cost tens to low hundreds of USD/month depending on compute, database, NAT and logging. Production HA and per-client egress can materially increase this. NAT Gateway hourly and data processing fees plus public IPv4 hourly charges are the main fixed-network items to model. Run the AWS Pricing Calculator for ap-south-1 with actual instance sizes before approval.

---

## 16. Phased delivery plan

### Phase 0 — framework (this document)
- Inspect repository and record baseline.
- Confirm AWS target and broker regulatory gates.
- Owner reviews/approves this architecture.
- No live trading code or paid resource provisioning.

### Phase 1 — safe MVP
- Monorepo foundations, CI, local Docker.
- Invite-only auth, TOTP, versioned disclaimers, tenant isolation.
- Host operational dashboard (performance widgets feature-flagged pending legal clearance).
- SimulatedBroker and MockBroker.
- Delta Exchange India testnet adapter first, after current testnet docs and account access are verified.
- India broker adapter scaffolding; no live order placement until broker approval/IP mapping.
- Signal ingestion, idempotent copy engine, paper mode, error center and admin console.
- Automated unit/integration/E2E tests.

### Phase 2 — approved live pilot
- Delta live only after account permissions, IP allowlist and test evidence.
- India live adapter only after written broker/vendor approval and client-specific IP design.
- Zerodha and Dhan first based on owner priority and approval; then Angel One, Upstox and FYERS.
- Telegram/email alerts, reconciliation, reports and incident runbooks.

### Phase 3 — scale and expansion
- Tier 2 India brokers and crypto venues after eligibility/terms review.
- 500-subscriber load test and queue/rate-limit tuning.
- Security hardening, external penetration test, DR drills and operational dashboards.

---

## 17. Decisions requested from owner

The following are the only decisions that block the next phase:

1. **Approve AWS as the sole hosting target** (this framework assumes yes; it replaces Railway/Vercel).
2. **Confirm India live trading is gated** until counsel and each broker provide written clearance for the multi-client copy-trading model.
3. **Confirm first paper-mode connectors:** Delta Exchange India + Zerodha + Dhan (as specified).
4. **Confirm whether to keep the proposed host-performance page hidden** until the legal/broker review approves its exact content.

Everything else uses the defaults documented above. No additional repository, hosting platform or UI reference will be introduced without your direction.

---

## 18. Source register

All API behavior must be rechecked against official provider docs during adapter implementation; this document is an architecture baseline, not a substitute for endpoint-by-endpoint implementation research.

- Zerodha API docs: https://kite.trade/docs/connect/v3/
- Zerodha static IP and rate limit FAQ: https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/kite-connect-api-faqs
- DhanHQ v2 docs: https://dhanhq.co/docs/v2/
- DhanHQ authentication: https://dhanhq.co/docs/v2/authentication/
- DhanHQ releases / 24-hour token and static IP changes: https://dhanhq.co/docs/v2/releases/
- Angel One SmartAPI docs: https://smartapi.angelone.in/docs
- Angel One static IP notice: https://smartapi.angelbroking.com/exchange-regulations
- Upstox rate limits: https://upstox.com/developer/api-documentation/rate-limiting/
- Upstox static IP announcement: https://upstox.com/developer/api-documentation/announcements/static-ip-apis/
- FYERS v3 docs: https://fyers.in/api-docs/v3/
- FYERS troubleshooting / static IP / auth: https://fyers.in/api-docs/v3/getting-started/guides/troubleshooting-guide/
- Delta Exchange API docs: https://docs.delta.exchange/
- AWS NAT Gateway: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html
- AWS NAT Gateway pricing: https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-pricing.html
- AWS public IPv4 pricing: https://aws.amazon.com/vpc/pricing/
