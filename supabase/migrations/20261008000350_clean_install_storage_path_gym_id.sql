-- Reproducible clean-install prerequisite for 202610080004_operations_suite.sql.
-- This matches the verified live helper contract: invoker, immutable, empty search_path,
-- with execution limited to authenticated application users and the server service role.
create or replace function public.storage_path_gym_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $function$
begin
  return (storage.foldername(object_name))[1]::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$function$;

revoke all on function public.storage_path_gym_id(text) from public, anon;
grant execute on function public.storage_path_gym_id(text) to authenticated, service_role;
