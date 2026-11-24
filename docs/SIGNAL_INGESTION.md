# Host signal intake contract

The current endpoint is a foundation for host-to-subscriber signal fan-out. It is not a broker webhook adapter and does not submit destination orders.

## Endpoint

`POST /api/v1/host/signals`

- Requires an authenticated, active user with the approved `HOST` role.
- Requires the exact trusted browser origin for mutation requests.
- Rate limited to 30 requests per minute per API client/IP policy.
- Requires a connected source broker connection owned by the authenticated host and in the same market.
- Requires at least one published listing for that host and market.
- Accepts only normalized India or Crypto instruments; the instrument market must match the signal market.
- `idempotencyKey` is unique within the host tenant. A duplicate returns HTTP 409.
- Signal persistence and one CopyIntent per active PAPER subscription are committed in one serializable database transaction.
- Suspended/inactive subscribers and paused/unpublished listings are excluded.
- Each CopyIntent snapshots the destination connection selected by that subscriber at the time the signal is accepted.

## Entry request example

```json
{
  "idempotencyKey": "host-order-982734-entry-v1",
  "hostConnectionId": "host-broker-connection-id",
  "market": "CRYPTO",
  "event": "ENTRY",
  "instrument": {
    "market": "CRYPTO",
    "venue": "DELTA",
    "segment": "PERPETUAL",
    "symbol": "BTCUSD",
    "quoteCurrency": "USD",
    "tickSize": "0.5"
  },
  "payload": {
    "side": "BUY",
    "orderType": "LIMIT",
    "quantity": "0.001",
    "limitPrice": "90000"
  },
  "occurredAt": "2026-11-24T03:00:00.000Z"
}
```

The example is illustrative only. Use the source broker's actual normalized instrument identity, order side, quantity, order type and prices.

## Response

Accepted fan-out returns HTTP 202 with `accepted: true`, the internal signal ID, fan-out count, and `QUEUED_FOR_PAPER_EVALUATION`. This confirms durable intake only. It does not mean any subscriber order was evaluated, submitted, acknowledged, or filled.

## Current limitations

- No public broker webhook authentication or broker-specific event parser is implemented.
- No broker connection wizard or credential vault is implemented.
- No verified cross-broker instrument mapping registry is implemented.
- No background worker currently evaluates CopyIntent records.
- No real broker adapter is connected and no order is submitted.
- India and Crypto remain PAPER_ONLY; live execution remains disabled.

Do not expose this endpoint directly to broker callbacks until broker-specific signature/authentication, replay protection, IP policy, event normalization, and adapter contracts have been implemented and reviewed.
