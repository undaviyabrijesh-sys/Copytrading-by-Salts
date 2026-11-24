# Paper routing policy

The domain package now exposes `evaluatePaperRouting`. This is a deterministic, side-effect-free eligibility gate; it does not place orders, read quotes, update balances or simulate fills.

## New entry requirements

A new ENTRY is eligible only when:
- the subscription is ACTIVE and its host listing is PUBLISHED;
- host, subscriber and destination connection ownership match;
- subscription, source signal, destination adapter and destination instrument all use the same market;
- subscription and destination are PAPER mode;
- destination connection is healthy and connected;
- instrument mapping and order-type capability are explicitly verified;
- subscriber sizing, lot size, minimum quantity, max quantity, open-order cap and daily-loss cap pass.

Quantities and notional caps use exact decimal string arithmetic. The gate does not round a quantity up to satisfy a lot size.

## Existing position management

After unsubscribe, subscription pause, or host listing pause/removal, new entries are blocked. Linked position-management events may still be eligible so the eventual execution engine can process exits, square-offs, cancellations and supported protective-order changes. A management event requires a linked copied position/order, connected destination, mapped destination instrument and the required adapter capability.

Unsupported operations return a skip decision. The caller must not approximate an unsupported stop order, silently change an instrument, or route across markets.

## Not an execution engine

This policy is not yet connected to database fan-out, a durable queue, market data, broker adapters, order reconciliation or paper fills. The API must continue to report PAPER_ONLY and must not claim a copy has executed until those components exist and are tested.
