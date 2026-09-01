-- ============================================================================
-- 0005_rls_helpers.sql
-- Funciones auxiliares SECURITY DEFINER para RLS. Estas funciones son la
-- ÚNICA fuente de verdad sobre "quién soy y a qué empresa pertenezco".
-- Nunca confiar en valores enviados desde el frontend (headers, body, etc.)
-- ============================================================================

-- Empresa del usuario autenticado actual (null si es super_admin o anónimo)
create or replace function current_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from user_profiles where id = auth.uid();
$$;

-- Rol del usuario autenticado actual
create or replace function current_user_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from user_profiles where id = auth.uid();
$$;

create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from user_profiles where id = auth.uid()), false);
$$;

create or replace function is_company_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin') from user_profiles where id = auth.uid()), false);
$$;

create or replace function is_admin_or_supervisor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','supervisor') from user_profiles where id = auth.uid()), false);
$$;

-- El usuario actual (portal cliente) tiene acceso a este client_id?
create or replace function has_client_access(target_client_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from client_users cu
    where cu.user_id = auth.uid() and cu.client_id = target_client_id
  );
$$;

comment on function current_company_id() is 'Fuente única de verdad del tenant del usuario autenticado. Usada por todas las políticas RLS.';
