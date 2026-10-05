-- Habilita Realtime (antes la publicación estaba vacía y ninguna pantalla se
-- actualizaba sola) y añade start_route_session para marcar la ronda «en curso»
-- en el instante en que el vigilante pulsa «Iniciar ronda».
alter publication supabase_realtime add table public.checkpoint_scans, public.route_sessions, public.alerts, public.guard_locations, public.incidents;

create or replace function public.start_route_session(p_route_session_id uuid)
returns route_sessions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid := current_company_id();
  v_session route_sessions;
begin
  select * into v_session from route_sessions
   where id = p_route_session_id and company_id = v_company_id;
  if not found then
    raise exception 'Sesión de ronda no encontrada.';
  end if;
  if v_session.guard_id <> auth.uid() and not is_admin_or_supervisor() then
    raise exception 'No autorizado para iniciar esta ronda.';
  end if;

  if v_session.status = 'in_progress' then
    return v_session;
  end if;
  if v_session.status <> 'scheduled' then
    raise exception 'Esta ronda ya no se puede iniciar (estado: %).', v_session.status;
  end if;

  update route_sessions
     set status = 'in_progress',
         started_at = coalesce(started_at, now())
   where id = p_route_session_id
   returning * into v_session;

  perform log_audit('route_session.start', 'route_sessions', p_route_session_id, '{}'::jsonb);
  return v_session;
end;
$function$;

revoke all on function public.start_route_session(uuid) from public;
revoke all on function public.start_route_session(uuid) from anon;
grant execute on function public.start_route_session(uuid) to authenticated;
