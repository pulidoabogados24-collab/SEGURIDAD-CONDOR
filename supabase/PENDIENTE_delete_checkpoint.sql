-- PENDIENTE DE APLICAR en la base de datos en vivo (Supabase > SQL Editor > pegar y ejecutar).
-- Habilita el botón «Eliminar» de los puntos de control. Ya está incluida en 0030.
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

revoke all on function public.delete_checkpoint(uuid) from public;
revoke all on function public.delete_checkpoint(uuid) from anon;
grant execute on function public.delete_checkpoint(uuid) to authenticated;
