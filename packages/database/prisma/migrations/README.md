# Database migrations

This package uses Prisma migrations against PostgreSQL.

## Local development

1. Configure `DATABASE_URL` for a disposable development database.
2. Generate the Prisma client: `pnpm --filter @salts/database db:generate`.
3. Apply committed migrations: `pnpm --filter @salts/database db:migrate:deploy`.
4. Inspect migration state: `pnpm --filter @salts/database db:migrate:status`.

Do not use `prisma db push` against shared, staging or production databases. Schema changes must be reviewed and committed as a new migration.

## Production

- Back up the database before applying a migration.
- Run `db:migrate:status` and verify the target database and migration history.
- Apply migrations as a controlled release step with a restricted deployment identity.
- Keep database credentials in AWS Secrets Manager; never place them in source control or browser configuration.
- Do not run the one-time owner bootstrap until the initial migration is applied and the operator has verified the target database.

The initial migration creates the user, invite, session, listing, subscription, broker connection, signal, copy order, disclosure and audit tables. Live broker execution is not enabled by these migrations.
