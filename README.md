# VYRO

VYRO is a multi-tenant gym management application built with Next.js, Supabase Auth, and PostgreSQL. The current application includes the platform-owner and gym-admin workspaces. Tenant access is enforced by PostgreSQL row-level security.

## Local setup

Requirements: Node.js 20.9 or newer, the Supabase CLI, and Docker Desktop or another Docker-compatible runtime for the local database.

```powershell
npm install
npx supabase start
npx supabase status
Copy-Item .env.example .env.local
# Set the local Supabase URL, publishable key, service-role key, and site URL in .env.local
npx supabase db reset
npm run dev
```

Open `http://localhost:3000/login`. The app does not include demo accounts or seeded business records.

For a hosted Supabase project, set the same environment variables from its API settings, run `npx supabase link --project-ref <your-project-ref>`, then `npx supabase db push`.

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
npm run build
npx supabase test db
```

Database policy tests are in `supabase/tests/tenant_isolation.test.sql` and require the Supabase CLI/local Postgres test environment with pgTAP. The production build needs the public Supabase URL and publishable key to be set at build time.

## Production deployment

Deploy the Next.js app to a Node-compatible host, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL`, apply committed migrations, and configure the Supabase Auth site URL and allowed redirect URLs to the production domain. Set `SUPABASE_SERVICE_ROLE_KEY` only in the host's server environment. Enforce HTTPS, configure transactional email and backups, and provision the first platform owner through a trusted database workflow. No payment gateway or biometric integration is included.
