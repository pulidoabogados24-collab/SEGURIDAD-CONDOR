-- ============================================================================
-- 0008_auth_trigger.sql
-- Al crear un usuario en auth.users, si trae metadata de rol/empresa
-- (asignada por una Edge Function con service role, nunca por el propio
-- usuario), se crea automáticamente su fila en user_profiles.
-- ============================================================================

create or replace function handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role app_role;
  v_company_id uuid;
begin
  -- Solo actuamos si la creación del usuario trajo metadata explícita de
  -- provisioning (la pone la Edge Function admin-create-user, nunca el
  -- signup público directo). Si no viene, no se crea perfil automáticamente:
  -- evita que cualquiera se auto-asigne un rol al registrarse.
  if new.raw_app_meta_data ? 'provisioned_role' then
    v_role := (new.raw_app_meta_data->>'provisioned_role')::app_role;
    v_company_id := nullif(new.raw_app_meta_data->>'provisioned_company_id', '')::uuid;

    insert into user_profiles (id, company_id, role, full_name, phone, document_id)
    values (
      new.id,
      v_company_id,
      v_role,
      coalesce(new.raw_app_meta_data->>'full_name', split_part(new.email, '@', 1)),
      new.raw_app_meta_data->>'phone',
      new.raw_app_meta_data->>'document_id'
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_handle_new_auth_user on auth.users;
create trigger trg_handle_new_auth_user
  after insert on auth.users
  for each row execute function handle_new_auth_user();

comment on function handle_new_auth_user() is
  'Crea user_profiles solo si el usuario fue aprovisionado por una Edge Function con service role (raw_app_meta_data.provisioned_role). El signup público nunca puede auto-asignarse rol ni empresa.';
