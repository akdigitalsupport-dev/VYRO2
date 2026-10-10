# VYRO

VYRO is a multi-tenant gym management application built with Next.js, Supabase Auth, and PostgreSQL. The current application includes the platform-owner and gym-admin workspaces. Tenant access is enforced by PostgreSQL row-level security.

## Local setup

Requirements: Node.js 20.9 or newer, the Supabase CLI, and Docker Desktop or another Docker-compatible runtime for the local database.

```powershell
npm ci
npx supabase start
npx supabase migration up --local
Copy-Item .env.example .env.local
# Set the local Supabase URL, publishable key, service-role key, and site URL in .env.local
npm run dev
```

Open `http://localhost:3000/login`. The app does not include demo accounts or seeded business records.

For hosted projects, review migration history and the release procedure before using any linked-project migration command. Never use the disposable local rehearsal instructions against a linked database.

## Identity provisioning

Public self-registration is not exposed. Platform owners can send a Gym Admin invitation from a gym's detail page. This needs `SUPABASE_SERVICE_ROLE_KEY` configured as a server-only environment variable and a configured Supabase Auth email provider. The invite creates a `gym_admin` profile and the server then calls a database function that links that Auth user to the selected gym. The invitee chooses a password through the signed-in setup flow. Never accept a role or gym ID from the browser as proof of access.

For the first local owner, invite/create a user in the Supabase Studio Auth screen at `http://localhost:54323`, then provision the platform role in the SQL editor with:

```sql
update public.user_profiles
set role = 'platform_owner'
where user_id = '<auth.users UUID>';
```

For manual recovery, a trusted database administrator can link the invited user's UUID to the gym in `public.gym_user_memberships` with role `gym_admin`. Authenticated application users cannot write profile roles or membership rows.

## Database and security

Apply the versioned migration in `supabase/migrations`. It creates gyms, platform subscriptions and payments, membership plans, members, attendance, gym member payments, gym settings, platform settings, user profiles, memberships, and audit logs. Gym-owned rows include a tenant ID and RLS policies resolve access from the verified Auth subject. Gym admins can read and write only their own tenant. Platform subscription revenue is stored separately from member-to-gym payments. Operational tables have no authenticated hard-delete grants; member removal is archival.

The application uses a cookie-backed Supabase SSR client. Normal data access uses only the Supabase publishable key; the service-role key is confined to a server-only invitation action. Gym creation/profile changes and tenant records are audited by database triggers. Configure Supabase Auth email delivery, session policies, backups, monitoring, and provider-level authentication rate limits before production use.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npx supabase test db --local
```

Role-routing policy tests run with Node's built-in test runner. Database policy tests are in `supabase/tests/tenant_isolation.test.sql` and require the Supabase CLI/local Postgres test environment with pgTAP. The production build needs the public Supabase URL and publishable key to be set at build time.

## Clean-install migration order

The migration `20261008000350_clean_install_storage_path_gym_id.sql` creates the verified `public.storage_path_gym_id(text)` prerequisite immediately after `202610080003_membership_payment_integrity.sql` and before `202610080004_operations_suite.sql`. A historical production migration uses that helper but the helper was not in the tracked migration chain. This new forward migration makes clean installs deterministic without rewriting prior migrations. It remains an unapplied migration on any database that does not already record its version; never repair or mark history manually.

For a fresh local database, stage all migrations first, start the local Postgres instance, then run `npx supabase migration up --local`. This CLI command applies local pending migrations in version order. The rehearsal should confirm the overlay is applied before `202610080004` and assert the exact applied-version set through `202610090002` plus the overlay. `supabase/seed.sql` is not used as a prerequisite because seed execution follows migrations.

## Production deployment

For a staging deployment, use a separate Vercel project and Supabase project with separate Auth, Storage, and environment settings. Set `NEXT_PUBLIC_SUPABASE_URL`, one of `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SITE_URL` to the staging origin. Set `SUPABASE_SERVICE_ROLE_KEY` only in the server environment. For browser push, configure `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`; configure `CRON_SECRET` for the scheduled endpoint. The public and server VAPID public keys must match.

Before applying migrations to a hosted database, compare its migration ledger with the reviewed migration files and inspect any pre-existing objects. In particular, `20261008000350_clean_install_storage_path_gym_id.sql` uses `CREATE OR REPLACE` to preserve the verified helper contract when the helper already exists, but this does not establish that the migration version is recorded in a particular database. Do not run hosted migrations until that database's ledger and helper have been checked. Configure the Supabase Auth site URL and allowed callback URLs for the actual staging or production origin. Enforce HTTPS, configure transactional email and backups, and provision the first platform owner through a trusted workflow. No payment gateway or biometric integration is included.
