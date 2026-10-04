-- gym_settings uses gym_id as its primary key; audit rows use that as the entity ID.
create or replace function public.write_audit_event()
returns trigger language plpgsql set search_path = '' as $$
declare
  target_gym_id uuid;
  target_entity_id uuid;
  audit_action text;
  audit_entity text;
  audit_metadata jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'gyms' then
    target_gym_id := new.id;
  elsif tg_table_name = 'platform_settings' then
    target_gym_id := null;
  else
    target_gym_id := new.gym_id;
  end if;

  if tg_table_name = 'platform_settings' then
    target_entity_id := null;
  elsif tg_table_name = 'gym_settings' then
    target_entity_id := new.gym_id;
  else
    target_entity_id := new.id;
  end if;

  if tg_table_name = 'gyms' then
    audit_action := case when tg_op = 'INSERT' then 'gym.created' else 'gym.updated' end;
    audit_entity := 'gym';
    if tg_op = 'UPDATE' and new.status is distinct from old.status then
      audit_action := 'gym.status_changed';
      audit_metadata := jsonb_build_object('from', old.status, 'to', new.status);
    end if;
  elsif tg_table_name = 'platform_subscriptions' then
    audit_action := case when tg_op = 'INSERT' then 'subscription.created' else 'subscription.updated' end;
    audit_entity := 'platform_subscription';
  elsif tg_table_name = 'platform_subscription_payments' then
    audit_action := 'platform_payment.recorded';
    audit_entity := 'platform_subscription_payment';
  elsif tg_table_name = 'membership_plans' then
    audit_action := case when tg_op = 'INSERT' then 'membership_plan.created' else 'membership_plan.updated' end;
    audit_entity := 'membership_plan';
  elsif tg_table_name = 'members' then
    audit_action := case when tg_op = 'INSERT' then 'member.created' else 'member.updated' end;
    audit_entity := 'member';
  elsif tg_table_name = 'attendance_records' then
    audit_action := 'attendance.checked_in';
    audit_entity := 'attendance_record';
  elsif tg_table_name = 'member_payments' then
    audit_action := 'member_payment.recorded';
    audit_entity := 'member_payment';
  elsif tg_table_name = 'gym_settings' then
    audit_action := case when tg_op = 'INSERT' then 'gym_settings.created' else 'gym_settings.updated' end;
    audit_entity := 'gym_settings';
  else
    audit_action := 'platform_settings.updated';
    audit_entity := 'platform_setting';
  end if;

  insert into public.audit_logs(actor_user_id, gym_id, action, entity_type, entity_id, metadata)
  values (
    (select auth.uid()), target_gym_id, audit_action, audit_entity,
    target_entity_id, audit_metadata
  );
  return new;
end;
$$;
