import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(path.join(root, "supabase/migrations/202610110007_gym_leads.sql"), "utf8").toLowerCase();
const attributionMigration = readFileSync(path.join(root, "supabase/migrations/20261011131514_gym_leads_created_by_integrity.sql"), "utf8").toLowerCase();
const gymLeadsRoute = path.join(root, "app/(gym)/gym/leads/page.tsx");
const gymLeadsActions = path.join(root, "app/(gym)/gym/leads/actions.ts");

describe("gym leads feature contract (static checks; not live database tests)", () => {
  it("stores leads with tenant RLS and no authenticated delete grant", () => {
    expect(migration).toContain("create table public.gym_leads");
    expect(migration).toContain("alter table public.gym_leads enable row level security");
    expect(migration).toContain("grant select, insert, update on public.gym_leads to authenticated");
    expect(migration).toContain("public.has_gym_admin_leads_access(gym_id)");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("p.role = 'gym_admin'");
    expect(migration).toContain("m.role = 'gym_admin'");
    expect(migration).toContain("for select to authenticated");
    expect(migration).toContain("for insert to authenticated");
    expect(migration).toContain("for update to authenticated");
    expect(migration).not.toContain("for delete");
    expect(migration).not.toMatch(/grant[^;]*delete[^;]*on public\.gym_leads/);
  });

  it("keeps the production data model while removing Gym Admin leads UI routes", () => {
    expect(existsSync(gymLeadsRoute)).toBe(false);
    expect(existsSync(gymLeadsActions)).toBe(false);
    expect(existsSync(path.join(root, "components/leads/lead-forms.tsx"))).toBe(false);
    expect(migration).toContain("create table public.gym_leads");
  });

  it("adds database enforcement for creator attribution and prevents creator changes", () => {
    expect(migration).toContain("created_by uuid references auth.users(id) on delete set null");
    expect(attributionMigration).toContain("as restrictive");
    expect(attributionMigration).toContain("created_by is not distinct from (select auth.uid())");
    expect(attributionMigration).toContain("revoke update on public.gym_leads from public, anon, authenticated");
    expect(attributionMigration).toContain("grant update (name, phone, email, source, notes, status)");
    expect(attributionMigration).not.toMatch(/grant\s+update\s+on\s+public\.gym_leads\s+to\s+authenticated/);
    expect(attributionMigration).not.toMatch(/create\s+trigger[^;]*created_by/i);
  });
});
