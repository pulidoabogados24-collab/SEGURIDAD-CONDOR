-- ============================================================================
-- 0030_checkpoint_and_guard_management.sql
--
-- Gestión completa de puntos de control (QR) y soporte para desactivar
-- vigilantes, todo desde el panel.
--
-- MODELO REAL de Condor Security (migración 0025): cada casa/negocio es a la
-- vez un cliente, un servicio y un punto de control de la ronda. Por eso
-- "cambiar el nombre de un QR" significa cambiar el nombre del punto Y el del
-- cliente/servicio que lo acompañan (siempre que sean 1 a 1), y "añadir un QR"
-- significa crear cliente + servicio + punto + QR en un solo paso atómico.
--
-- Principios:
--   · Desactivar, no borrar. Borrar un punto o un vigilante con historial
--     arrastraría (ON DELETE CASCADE) todos sus escaneos y rondas — la
--     evidencia de que el servicio se prestó. Por eso lo normal es desactivar
--     (reversible, conserva historial) y el borrado definitivo solo se permite
--     cuando no existe ningún historial que perder.
--   · Todo corre con SECURITY DEFINER pero exige is_admin_or_supervisor() y
--     filtra por la empresa del usuario autenticado: nadie puede tocar datos
--     de otra empresa aunque conozca un id.
--   · Todo deja rastro en audit_logs (log_audit).
--   · Como el escaneo ya es en cualquier orden (0026), quitar o añadir puntos
--     no rompe rondas en curso; solo se recalcula expected_points de las
--     sesiones abiertas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. El generador diario de rondas no debe crear sesiones para vigilantes
--    desactivados (generaría alertas falsas de "ronda no iniciada").
-- ---------------------------------------------------------------------------
create or replace function public.generate_daily_route_sessions()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'America/Bogota')::date;
  v_dow   smallint := extract(dow from (now() at time zone 'America/Bogota'))::smallint;
  v_created integer := 0;
  r record;
  g record;
  v_expected integer;
begin
  for r in
    select routes.id, routes.company_id, routes.service_id, routes.scheduled_time
    from routes
    where routes.is_active = true
      and v_dow = any(routes.days_of_week)
  loop
    select count(*) into v_expected
    from route_points
    where route_points.route_id = r.id and route_points.is_active = true;

    for g in
      select route_guards.guard_id
      from route_guards
      join guards on guards.id = route_guards.guard_id
      where route_guards.route_id = r.id
        and guards.is_active = true
    loop
      if not exists (
        select 1 from route_sessions
        where route_id = r.id
          and guard_id = g.guard_id
          and (scheduled_at at time zone 'America/Bogota')::date = v_today
      ) then
        insert into route_sessions (
          company_id, route_id, service_id, guard_id, client_session_id,
          scheduled_at, status, expected_points
        ) values (
          r.company_id, r.id, r.service_id, g.guard_id, gen_random_uuid(),
          (v_today + r.scheduled_time) at time zone 'America/Bogota',
          'scheduled', v_expected
        );
        v_created := v_created + 1;
      end if;
    end loop;
  end loop;

  return v_created;
end;
$function$;

revoke execute on function public.generate_daily_route_sessions() from public;
revoke execute on function public.generate_daily_route_sessions() from anon;
revoke execute on function public.generate_daily_route_sessions() from authenticated;

-- ---------------------------------------------------------------------------
-- 1. Auxiliar interno: recalcular cuántos puntos esperan las rondas abiertas
--    de una ruta cuando se añade/desactiva/borra un punto.
--    No se expone a ningún rol: solo lo llaman las funciones de abajo.
-- ---------------------------------------------------------------------------
create or replace function public._resync_open_sessions(p_route_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update route_sessions rs
     set expected_points = (
       select count(*) from route_points rp
       where rp.route_id = p_route_id and rp.is_active = true
     )
   where rs.route_id = p_route_id
     and rs.status in ('scheduled', 'in_progress');
$$;

revoke all on function public._resync_open_sessions(uuid) from public;
revoke all on function public._resync_open_sessions(uuid) from anon;
revoke all on function public._resync_open_sessions(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- 2. create_checkpoint: añadir un punto (cliente + servicio + punto + QR)
-- ---------------------------------------------------------------------------
create or replace function public.create_checkpoint(
  p_route_id uuid,
  p_name text,
  p_monthly_fee integer default null,
  p_address text default null
)
returns route_points
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid := current_company_id();
  v_name text := btrim(coalesce(p_name, ''));
  v_route routes;
  v_sibling services;
  v_client_id uuid;
  v_service_id uuid;
  v_point route_points;
  v_next integer;
begin
  if not is_admin_or_supervisor() then
    raise exception 'No autorizado para crear puntos de control.';
  end if;
  if v_name = '' then
    raise exception 'El nombre del punto no puede estar vacío.';
  end if;
  if char_length(v_name) > 120 then
    raise exception 'El nombre es demasiado largo (máximo 120 caracteres).';
  end if;
  if p_monthly_fee is not null and p_monthly_fee < 0 then
    raise exception 'La tarifa no puede ser negativa.';
  end if;

  select * into v_route from routes where id = p_route_id and company_id = v_company_id;
  if not found then
    raise exception 'Ronda no encontrada.';
  end if;

  -- Hereda ciudad/radio/tipo de otro punto de la misma ronda, si existe.
  select s.* into v_sibling
    from route_points rp
    join services s on s.id = rp.service_id
   where rp.route_id = p_route_id and rp.company_id = v_company_id
   order by rp.sequence_order desc
   limit 1;

  insert into clients (company_id, name, is_active)
  values (v_company_id, v_name, true)
  returning id into v_client_id;

  insert into services (company_id, client_id, name, service_type, address, city, gps_radius_meters, is_active)
  values (
    v_company_id, v_client_id, v_name,
    coalesce(v_sibling.service_type, 'other'),
    coalesce(nullif(btrim(p_address), ''), v_sibling.address),
    v_sibling.city,
    coalesce(v_sibling.gps_radius_meters, 60),
    true
  )
  returning id into v_service_id;

  select coalesce(max(sequence_order), 0) + 1 into v_next
    from route_points where route_id = p_route_id;

  insert into route_points (company_id, route_id, service_id, name, sequence_order, monthly_fee_cop, is_active)
  values (v_company_id, p_route_id, v_service_id, v_name, v_next, p_monthly_fee, true)
  returning * into v_point;

  insert into qr_codes (company_id, route_point_id) values (v_company_id, v_point.id);

  perform _resync_open_sessions(p_route_id);
  perform log_audit('checkpoint.create', 'route_points', v_point.id,
    jsonb_build_object('name', v_name, 'monthly_fee_cop', p_monthly_fee));

  return v_point;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. update_checkpoint: renombrar (punto + cliente + servicio) y editar tarifa
-- ---------------------------------------------------------------------------
create or replace function public.update_checkpoint(
  p_point_id uuid,
  p_name text,
  p_monthly_fee integer default null,
  p_reset_location boolean default false
)
returns route_points
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid := current_company_id();
  v_name text := btrim(coalesce(p_name, ''));
  v_point route_points;
  v_old_name text;
  v_service services;
  v_client clients;
begin
  if not is_admin_or_supervisor() then
    raise exception 'No autorizado para editar puntos de control.';
  end if;
  if v_name = '' then
    raise exception 'El nombre del punto no puede estar vacío.';
  end if;
  if char_length(v_name) > 120 then
    raise exception 'El nombre es demasiado largo (máximo 120 caracteres).';
  end if;
  if p_monthly_fee is not null and p_monthly_fee < 0 then
    raise exception 'La tarifa no puede ser negativa.';
  end if;

  select * into v_point from route_points where id = p_point_id and company_id = v_company_id;
  if not found then
    raise exception 'Punto no encontrado.';
  end if;
  v_old_name := v_point.name;

  update route_points
     set name = v_name,
         monthly_fee_cop = p_monthly_fee,
         latitude  = case when p_reset_location then null else latitude end,
         longitude = case when p_reset_location then null else longitude end
   where id = p_point_id
   returning * into v_point;

  -- Si el servicio y el cliente son exclusivos de este punto y llevaban su
  -- mismo nombre, se renombran juntos para que el panel no muestre un nombre
  -- viejo en "Clientes" o "Servicios". Si fueron personalizados, no se tocan.
  if v_name <> v_old_name then
    select * into v_service from services where id = v_point.service_id and company_id = v_company_id;
    if found
       and v_service.name = v_old_name
       and (select count(*) from route_points where service_id = v_service.id) = 1
    then
      update services set name = v_name where id = v_service.id;

      select * into v_client from clients where id = v_service.client_id and company_id = v_company_id;
      if found
         and v_client.name = v_old_name
         and (select count(*) from services where client_id = v_client.id) = 1
      then
        update clients set name = v_name where id = v_client.id;
      end if;
    end if;
  end if;

  perform log_audit('checkpoint.update', 'route_points', p_point_id,
    jsonb_build_object('old_name', v_old_name, 'name', v_name,
                       'monthly_fee_cop', p_monthly_fee, 'reset_location', p_reset_location));
  return v_point;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. set_checkpoint_active: desactivar / reactivar (conserva todo el historial)
--    Al desactivar, el QR activo pasa a 'invalidated' (un QR pegado en la pared
--    deja de contar). Al reactivar, se restaura ESE mismo QR, así la etiqueta
--    ya impresa sigue sirviendo; solo se crea uno nuevo si no había ninguno.
-- ---------------------------------------------------------------------------
create or replace function public.set_checkpoint_active(p_point_id uuid, p_active boolean)
returns route_points
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid := current_company_id();
  v_point route_points;
  v_qr qr_codes;
begin
  if not is_admin_or_supervisor() then
    raise exception 'No autorizado para cambiar el estado de puntos de control.';
  end if;

  select * into v_point from route_points where id = p_point_id and company_id = v_company_id;
  if not found then
    raise exception 'Punto no encontrado.';
  end if;

  if p_active then
    update route_points set is_active = true where id = p_point_id returning * into v_point;

    if not exists (select 1 from qr_codes where route_point_id = p_point_id and status = 'active') then
      select * into v_qr from qr_codes
       where route_point_id = p_point_id and invalidated_reason = 'point_deactivated'
       order by version desc, created_at desc limit 1;
      if found then
        update qr_codes set status = 'active', invalidated_at = null, invalidated_reason = null
         where id = v_qr.id;
      else
        insert into qr_codes (company_id, route_point_id, version)
        values (v_company_id, p_point_id,
                coalesce((select max(version) from qr_codes where route_point_id = p_point_id), 0) + 1);
      end if;
    end if;
  else
    update route_points set is_active = false where id = p_point_id returning * into v_point;
    update qr_codes
       set status = 'invalidated', invalidated_at = now(), invalidated_reason = 'point_deactivated'
     where route_point_id = p_point_id and status = 'active';
  end if;

  perform _resync_open_sessions(v_point.route_id);
  perform log_audit(case when p_active then 'checkpoint.activate' else 'checkpoint.deactivate' end,
    'route_points', p_point_id, jsonb_build_object('name', v_point.name));
  return v_point;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. regenerate_checkpoint_qr: QR nuevo (el anterior queda 'replaced')
--    Para cuando se pierde, se daña o se compromete una etiqueta.
-- ---------------------------------------------------------------------------
create or replace function public.regenerate_checkpoint_qr(p_point_id uuid)
returns qr_codes
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid := current_company_id();
  v_point route_points;
  v_new qr_codes;
begin
  if not is_admin_or_supervisor() then
    raise exception 'No autorizado para regenerar códigos QR.';
  end if;

  select * into v_point from route_points where id = p_point_id and company_id = v_company_id;
  if not found then
    raise exception 'Punto no encontrado.';
  end if;
  if not v_point.is_active then
    raise exception 'El punto está desactivado. Reactívalo antes de regenerar su QR.';
  end if;

  update qr_codes
     set status = 'replaced', invalidated_at = now(), invalidated_reason = 'regenerated'
   where route_point_id = p_point_id and status = 'active';

  insert into qr_codes (company_id, route_point_id, version)
  values (v_company_id, p_point_id,
          coalesce((select max(version) from qr_codes where route_point_id = p_point_id), 0) + 1)
  returning * into v_new;

  perform log_audit('checkpoint.regenerate_qr', 'qr_codes', v_new.id,
    jsonb_build_object('route_point_id', p_point_id, 'version', v_new.version));
  return v_new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. delete_checkpoint: borrado definitivo, SOLO si no hay historial.
--    Si el punto ya tiene escaneos o novedades, se rechaza con un mensaje que
--    explica por qué y propone desactivarlo.
-- ---------------------------------------------------------------------------
create or replace function public.delete_checkpoint(p_point_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid := current_company_id();
  v_point route_points;
  v_service services;
begin
  if not is_admin_or_supervisor() then
    raise exception 'No autorizado para borrar puntos de control.';
  end if;

  select * into v_point from route_points where id = p_point_id and company_id = v_company_id;
  if not found then
    raise exception 'Punto no encontrado.';
  end if;

  if exists (select 1 from checkpoint_scans where route_point_id = p_point_id)
     or exists (select 1 from incidents where route_point_id = p_point_id)
  then
    raise exception 'Este punto ya tiene escaneos o novedades registradas. Borrarlo destruiría ese historial: desactívalo en su lugar.';
  end if;

  select * into v_service from services where id = v_point.service_id and company_id = v_company_id;

  delete from qr_codes where route_point_id = p_point_id;
  delete from route_points where id = p_point_id;

  -- Limpia el servicio/cliente que solo existían para este punto, si quedaron
  -- huérfanos y sin historial. Si algo más los referencia, se dejan intactos.
  if v_service.id is not null then
    begin
      delete from services where id = v_service.id
        and not exists (select 1 from route_points where service_id = v_service.id);
      delete from clients where id = v_service.client_id
        and not exists (select 1 from services where client_id = v_service.client_id);
    exception when foreign_key_violation then
      null;
    end;
  end if;

  perform _resync_open_sessions(v_point.route_id);
  perform log_audit('checkpoint.delete', 'route_points', p_point_id,
    jsonb_build_object('name', v_point.name));
end;
$function$;

-- ---------------------------------------------------------------------------
-- Permisos: solo usuarios autenticados (cada función valida el rol por dentro).
-- ---------------------------------------------------------------------------
revoke all on function public.create_checkpoint(uuid, text, integer, text) from public;
revoke all on function public.create_checkpoint(uuid, text, integer, text) from anon;
grant execute on function public.create_checkpoint(uuid, text, integer, text) to authenticated;

revoke all on function public.update_checkpoint(uuid, text, integer, boolean) from public;
revoke all on function public.update_checkpoint(uuid, text, integer, boolean) from anon;
grant execute on function public.update_checkpoint(uuid, text, integer, boolean) to authenticated;

revoke all on function public.set_checkpoint_active(uuid, boolean) from public;
revoke all on function public.set_checkpoint_active(uuid, boolean) from anon;
grant execute on function public.set_checkpoint_active(uuid, boolean) to authenticated;

revoke all on function public.regenerate_checkpoint_qr(uuid) from public;
revoke all on function public.regenerate_checkpoint_qr(uuid) from anon;
grant execute on function public.regenerate_checkpoint_qr(uuid) to authenticated;

revoke all on function public.delete_checkpoint(uuid) from public;
revoke all on function public.delete_checkpoint(uuid) from anon;
grant execute on function public.delete_checkpoint(uuid) to authenticated;
