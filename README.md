# Copy Trading by Salts

Private, invite-only, multi-user copy-trading platform. India and Crypto are separate workspaces. Hosts connect their own source accounts and publish host listings; subscribers connect their own destination accounts and configure independent risk controls.

## Current implementation status

This branch starts Phase 1 foundations only. It does not yet connect to a live broker, execute orders, provision AWS resources, or enable live trading. Broker integrations must be implemented and tested individually against current official documentation and approved terms.

## Stack

- pnpm + Turborepo monorepo
- Next.js web application
- Fastify API
- PostgreSQL and Redis for local development
- Shared TypeScript contracts and execution-domain packages

## Local setup

1. Install Node.js 22+ and pnpm 10+.
2. Copy `.env.example` to `.env` and replace local-only values if needed.
3. Run `docker compose up -d`.
4. Run `pnpm install`.
5. Run `pnpm dev`.

## Safety boundaries

- Paper mode is the default.
- No real broker credentials belong in source control or environment files.
- No withdrawal or fund-transfer permissions.
- India live execution remains disabled pending legal and broker written approval.
- Unsupported cross-broker order semantics must fail closed, never be silently approximated.
- Every tenant's accounts, orders, positions and settings must remain isolated.
