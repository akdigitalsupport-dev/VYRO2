begin;

-- Exact aggregate ledger totals: UI lists remain paginated/capped, while KPI totals
-- do not silently stop counting after the first N rows.
create or replace function public.get_platform_payment_aggregates(
  p_since timestamptz default null
)
returns table (
  currency char(3),
  total_records bigint,
  pending_count bigint,
  completed_count bigint,
  completed_amount_all numeric,
  completed_amount_since numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_platform_owner() then
    raise exception using errcode = '42501', message = 'Not authorized to read platform payment aggregates';
  end if;

  return query
  select
    p.currency,
    count(*)::bigint,
    count(*) filter (where p.status = 'pending')::bigint,
    count(*) filter (where p.status = 'completed')::bigint,
    coalesce(sum(p.amount) filter (where p.status = 'completed'), 0)::numeric,
    coalesce(sum(p.amount) filter (where p.status = 'completed' and (p_since is null or p.payment_date >= p_since)), 0)::numeric
  from public.platform_subscription_payments p
  group by p.currency
  order by p.currency;
end;
$$;
revoke all on function public.get_platform_payment_aggregates(timestamptz) from public, anon;
grant execute on function public.get_platform_payment_aggregates(timestamptz) to authenticated;

commit;
