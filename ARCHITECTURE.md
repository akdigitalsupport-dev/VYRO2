# VYRO Architecture

## Chosen stack

- Next.js App Router with React and strict TypeScript for server-rendered routes and a small client bundle.
- Supabase Auth and managed PostgreSQL, accessed with `@supabase/ssr` cookie-backed clients.
- SQL migrations are the source of truth for schema, indexes, constraints, helper functions, and row-level security (RLS).
- CSS Modules and shared design tokens keep the management UI lightweight and avoid a large component dependency.
- Node.js 24 is available in the development environment.

## Architecture

Pages and route layouts compose server-rendered UI. Server actions and server-only data modules own mutations and query orchestration. Data access uses the cookie-backed server client; privileged service credentials are never added to the browser bundle. The database is the final authorization boundary. No business data is cached across users or tenants.

## Database entities

- `gyms`: tenant identity, contact and address information, status, and branding.
- `user_profiles`: application-level identity linked one-to-one to `auth.users`.
- `gym_user_memberships`: a user's gym and role assignment, designed to admit future roles without implementing those experiences now.
- `platform_subscriptions`: billing relationship from a gym to VYRO, kept separate from member payments.
- `membership_plans`, `members`, `attendance_records`, `member_payments`, and `gym_settings`: gym-owned data, each carrying a non-null `gym_id` foreign key.
- `audit_logs`: append-only record of actor, tenant, action, target, and structured metadata.

UUID keys, foreign keys, tenant-scoped uniqueness, timestamps, status checks, and query indexes protect data integrity and common access paths.

## Authentication model

Supabase Auth manages credentials and sessions. The Next.js server client reads and refreshes the PKCE session through secure cookies. Role and tenant membership are stored in protected database tables, not trusted from request parameters or user-editable metadata. Every protected route resolves the current authenticated user on the server.

The platform-owner invite action uses a server-only Supabase service-role client to send Gym Admin invitations. A database function callable only by a verified platform owner links the invited Auth user to the selected tenant. This credential is never used for normal data access or sent to a browser.

## Authorization and tenant isolation

The current roles are `platform_owner` and `gym_admin`; the membership role constraint permits later `trainer`, `receptionist`, and `member` identities without shipping their workflows. A gym administrator receives tenant scope only from `gym_user_memberships`. Postgres RLS checks `auth.uid()` against that membership for every gym-owned row. Platform-owner access is granted by a separate database role lookup. Client-provided gym IDs never grant access. Mutation APIs derive tenant scope server-side and RLS remains active even if a route or action has a bug.

## Folder structure

```text
app/                    App Router routes and layouts
  (auth)/login/         Sign-in flow
  (platform)/platform/  Platform-owner routes
  (gym)/gym/            Gym-admin routes
components/             Shared shell and UI primitives
lib/auth/               Server-side identity and route guards
lib/supabase/           Browser/server Supabase clients
lib/validation/         Shared input validation
supabase/migrations/    Versioned PostgreSQL schema and RLS
```

## Major routes

- `/login`
- `/platform/dashboard`, `/platform/gyms`, `/platform/gyms/[id]`, `/platform/subscriptions`, `/platform/renewals`, `/platform/revenue`, `/platform/reports`, `/platform/system`, `/platform/settings`
- `/gym/dashboard`, `/gym/members`, `/gym/members/[id]`, `/gym/plans`, `/gym/attendance`, `/gym/payments`, `/gym/reports`, `/gym/settings`

Platform and gym layouts enforce roles server-side. Data-bearing routes are implemented incrementally against real queries and empty/error states, never fixture metrics.

## Future extension points

The membership role model supports future staff/member access. Attendance has a source field for later QR/device providers. Audit events are structured for notification and analytics consumers. Platform subscriptions remain separate from gym member payments so later VYRO billing plans and payment gateways can evolve independently.

## Security considerations

- Enable RLS on all tenant tables; policies use the verified session subject and database membership mapping.
- Keep the Supabase service-role key out of application flows and public environment variables.
- Validate inputs on the server, use parameterized Supabase queries, return generic auth/server errors, and rate-limit authentication at the hosting/auth provider boundary.
- Store audit records separately from operational data and prevent ordinary users from editing them.
- Configure production secrets, HTTPS, Auth email/domain settings, backups, monitoring, and provider-level rate limits before launch.
- The schema and application are a security foundation, not a claim of complete security; authorization tests and operational review are required before production data is used.
