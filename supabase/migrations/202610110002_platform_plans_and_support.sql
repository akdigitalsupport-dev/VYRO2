begin;

-- Pricing catalogue belongs to VYRO, not to an individual gym's member plans.
create table public.platform_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text,
  price numeric(12,2) check (price is null or price >= 0),
  currency char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  billing_period text not null default 'monthly' check (billing_period in ('monthly', 'quarterly', 'yearly', 'custom')),
  trial_days integer not null default 14 check (trial_days between 1 and 90),
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_active or (price is not null and price > 0))
);
create index platform_plans_active_period_idx on public.platform_plans(is_active, billing_period, name);

alter table public.platform_subscriptions
  add column plan_id uuid references public.platform_plans(id) on delete set null;
create index platform_subscriptions_plan_idx on public.platform_subscriptions(plan_id, status);

alter table public.platform_plans enable row level security;
revoke all on public.platform_plans from anon, authenticated;
grant select, insert, update on public.platform_plans to authenticated;
create policy "platform plans admin access" on public.platform_plans
  for all to authenticated using (public.is_platform_owner())
  with check (public.is_platform_owner());
create trigger platform_plans_set_updated_at before update on public.platform_plans
  for each row execute function public.set_updated_at();

create function public.audit_platform_plan_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  event_action text;
  event_metadata jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    event_action := 'platform_plan.created';
  else
    event_action := 'platform_plan.updated';
    if new.is_active is distinct from old.is_active then
      event_metadata := jsonb_build_object('from_active', old.is_active, 'to_active', new.is_active);
    end if;
  end if;
  insert into public.audit_logs(actor_user_id, gym_id, action, entity_type, entity_id, metadata)
  values ((select auth.uid()), null, event_action, 'platform_plan', new.id, event_metadata);
  return new;
end;
$$;
create trigger platform_plans_audit_event after insert or update on public.platform_plans
  for each row execute function public.audit_platform_plan_event();

-- Support tickets track customer requests. No public/tenant-facing table access is granted here.
create table public.platform_support_tickets (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid references public.gyms(id) on delete set null,
  subject text not null check (char_length(trim(subject)) between 3 and 180),
  description text not null check (char_length(trim(description)) between 1 and 8000),
  requester_name text check (requester_name is null or char_length(requester_name) <= 120),
  requester_email text check (requester_email is null or char_length(requester_email) <= 254),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed')),
  internal_notes text check (internal_notes is null or char_length(internal_notes) <= 8000),
  resolution_summary text check (resolution_summary is null or char_length(resolution_summary) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index platform_support_tickets_status_created_idx on public.platform_support_tickets(status, created_at desc);
create index platform_support_tickets_gym_created_idx on public.platform_support_tickets(gym_id, created_at desc);
alter table public.platform_support_tickets enable row level security;
revoke all on public.platform_support_tickets from anon, authenticated;
grant select, insert, update on public.platform_support_tickets to authenticated;
create policy "platform support tickets admin access" on public.platform_support_tickets
  for all to authenticated using (public.is_platform_owner())
  with check (public.is_platform_owner());
create trigger platform_support_tickets_set_updated_at before update on public.platform_support_tickets
  for each row execute function public.set_updated_at();

create function public.audit_platform_support_ticket_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  event_action text;
  event_metadata jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    event_action := 'support_ticket.created';
    event_metadata := jsonb_build_object('priority', new.priority, 'status', new.status);
  elsif new.status is distinct from old.status then
    event_action := 'support_ticket.status_changed';
    event_metadata := jsonb_build_object('from', old.status, 'to', new.status);
  else
    event_action := 'support_ticket.updated';
    event_metadata := jsonb_build_object('priority', new.priority, 'status', new.status);
  end if;
  insert into public.audit_logs(actor_user_id, gym_id, action, entity_type, entity_id, metadata)
  values ((select auth.uid()), new.gym_id, event_action, 'platform_support_ticket', new.id, event_metadata);
  return new;
end;
$$;
create trigger platform_support_tickets_audit_event after insert or update on public.platform_support_tickets
  for each row execute function public.audit_platform_support_ticket_event();

-- Seed plan templates without inventing prices. Platform Admin must set pricing before activation.
insert into public.platform_plans(slug, name, description, price, billing_period, trial_days, is_active)
values
  ('starter', 'Starter', 'Core gym operations for a single gym workspace.', null, 'monthly', 14, false),
  ('growth', 'Growth', 'For gyms that need stronger reporting and operating controls.', null, 'monthly', 14, false),
  ('pro', 'Pro', 'Advanced gym operations for established businesses.', null, 'monthly', 14, false),
  ('enterprise', 'Enterprise', 'Custom-fit VYRO platform plan and commercial terms.', null, 'custom', 14, false)
on conflict (slug) do nothing;

commit;
