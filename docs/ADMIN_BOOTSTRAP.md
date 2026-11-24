# Initial owner administrator

The platform supports multiple independent user accounts. The first administrator is provisioned through a one-time, operator-run bootstrap command after PostgreSQL is deployed and the Prisma schema is migrated.

## Owner account

- The initial administrator is created with the email supplied as `ADMIN_BOOTSTRAP_EMAIL`.
- The password is hashed with Argon2id before storage.
- The account is activated and receives only the `ADMIN` role. It is not automatically a host or subscriber and has no broker connection or trading permission.
- Bootstrap refuses to run if any administrator already exists or the email is already registered. The insert is performed in a serializable database transaction.
- There is no hard-coded owner email, password, or bootstrap token in the repository. The owner must provide their preferred login email and set a strong, unique password in the deployment secret store when the database is ready.

## One-time bootstrap procedure

1. Apply the reviewed Prisma migration to the production database.
2. In a secure deployment shell or one-time task, set:
   - `DATABASE_URL`
   - `ADMIN_BOOTSTRAP_EMAIL`
   - `ADMIN_BOOTSTRAP_PASSWORD` (at least 16 characters)
   - `ADMIN_BOOTSTRAP_TOKEN`
   - `ADMIN_BOOTSTRAP_EXPECTED_TOKEN` (same independently generated one-time value; at least 16 characters)
   - Optional `ADMIN_BOOTSTRAP_DISPLAY_NAME`
3. Run `pnpm --filter @salts/database admin:bootstrap`.
4. Remove all bootstrap variables from the runtime/secret store immediately. Never commit them or send them in chat.
5. Confirm the account can sign in after the authentication endpoints and UI are deployed; enforce MFA before enabling privileged admin actions.

The bootstrap command is not a login endpoint and does not expose a public way to create administrators. Do not run it against a shared or production database until migrations, backups, and the secure operator environment are ready.

## Admin authority and boundaries

The platform administrator will be able to manage invitations, user status and role approvals, host/listing approvals, broker catalogue configuration, platform-level safety switches, audit review, and operational health. Admin actions must be audited and protected by MFA and recent re-authentication.

Admin status does **not** grant permission to view another user's plaintext broker credentials, impersonate a user, submit trades on a user's behalf, access withdrawals, or bypass market and risk controls. Broker credentials remain encrypted and tenant-scoped. India live execution remains disabled until the required written legal and broker approvals are verified.

## Current implementation status

The database schema now includes revocable sessions stored as token hashes, and a one-time owner bootstrap command. Public registration, invite redemption, login/logout, MFA enrollment/challenge, session rotation, role-guarded admin APIs, and the admin UI are still pending. The initial admin account cannot be created until a database is provisioned and migrated.
