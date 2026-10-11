begin;

create table public.gym_leads (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  phone text check (phone is null or char_length(phone) <= 40),
  email text check (email is null or char_length(email) <= 254),
  source text check (source is null or char_length(source) <= 80),
  notes text check (notes is null or char_length(notes) <= 1000),
  status text not null default 'new' check (status in ('new', 'contacted', 'trial', 'converted', 'lost')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gym_leads_id_gym_key unique (id, gym_id)
);

create index gym_leads_gym_status_created_idx
  on public.gym_leads (gym_id, status, created_at desc);

-- Unlike has_gym_access(), this helper never treats Platform Owner status as
-- gym membership. Requiring the sole admin membership also matches the route guard.
create function public.has_gym_admin_leads_access(target_gym_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.user_profiles p
      join public.gym_user_memberships m on m.user_id = p.user_id
      where p.user_id = (select auth.uid())
        and p.role = 'gym_admin'
        and m.gym_id = target_gym_id
        and m.role = 'gym_admin'
        and (
          select count(*)
          from public.gym_user_memberships own_memberships
          where own_memberships.user_id = (select auth.uid())
            and own_memberships.role = 'gym_admin'
        ) = 1
    )
    and public.has_gym_access(target_gym_id);
$$;
revoke all on function public.has_gym_admin_leads_access(uuid) from public, anon, authenticated;
grant execute on function public.has_gym_admin_leads_access(uuid) to authenticated;

alter table public.gym_leads enable row level security;
revoke all on public.gym_leads from anon, authenticated;
grant select, insert, update on public.gym_leads to authenticated;

create policy "gym leads select own gym" on public.gym_leads
  for select to authenticated
  using (public.has_gym_admin_leads_access(gym_id));
create policy "gym leads insert own gym" on public.gym_leads
  for insert to authenticated
  with check (public.has_gym_admin_leads_access(gym_id));
create policy "gym leads update own gym" on public.gym_leads
  for update to authenticated
  using (public.has_gym_admin_leads_access(gym_id))
  with check (public.has_gym_admin_leads_access(gym_id));

create trigger gym_leads_set_updated_at before update on public.gym_leads
  for each row execute function public.set_updated_at();

commit;
