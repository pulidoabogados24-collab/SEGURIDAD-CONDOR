-- ============================================================================
-- 0018_fix_invalid_qr_scan_bug.sql
-- BUG CRÍTICO encontrado en QA (caso obligatorio "rechazo de QR inválido"):
-- register_checkpoint_scan() fallaba con un error 400 sin manejar
-- ("null value in column route_point_id violates not-null constraint")
-- en vez de devolver limpiamente un resultado 'invalid_qr', cuando el QR
-- escaneado no existe en absoluto en la tabla qr_codes (no solo cuando
-- pertenece a otra empresa/ronda, que sí funcionaba).
--
-- Causa raíz: checkpoint_scans.route_point_id es NOT NULL, y cuando v_qr no
-- se encuentra, tanto v_point.id como el fallback
-- "(select route_point_id from qr_codes where token = p_qr_token)" son NULL
-- — no hay ningún punto que asociar al intento. Un escaneo con QR
-- inexistente es exactamente el tipo de evento que el motor anti-fraude
-- debe registrar (intento de fraude / dispositivo mal configurado), así
-- que la solución correcta es permitir route_point_id NULL para este caso
-- específico, no descartar el registro del intento.
--
-- Cambios:
--   1. checkpoint_scans.route_point_id pasa a NULLABLE (solo es NULL
--      cuando result = 'invalid_qr' y el QR no existe en absoluto; en todo
--      otro resultado sigue siendo NOT NULL en la práctica porque la
--      función siempre puede resolver el punto).
--   2. register_checkpoint_scan(): cuando v_qr no se encuentra, ya no se
--      intenta resolver route_point_id — se inserta NULL explícitamente y
--      se retorna el registro con result='invalid_qr' en vez de que la
--      inserción falle.
-- ============================================================================

alter table checkpoint_scans alter column route_point_id drop not null;

-- Verificación defensiva: sigue siendo NOT NULL para cualquier resultado
-- que no sea 'invalid_qr', a nivel de constraint declarativo (documenta la
-- intención sin bloquear el caso legítimo).
alter table checkpoint_scans drop constraint if exists chk_route_point_id_unless_invalid_qr;
alter table checkpoint_scans add constraint chk_route_point_id_unless_invalid_qr
  check (route_point_id is not null or result = 'invalid_qr');

create or replace function register_checkpoint_scan(
  p_client_event_id   uuid,
  p_route_session_id  uuid,
  p_qr_token          uuid,
  p_scanned_at        timestamptz,
  p_latitude          double precision default null,
  p_longitude         double precision default null,
  p_gps_accuracy      double precision default null,
  p_was_offline       boolean default false
) returns checkpoint_scans
language plpgsql security definer set search_path = public as $$
declare
  v_company_id      uuid := current_company_id();
  v_guard_id        uuid := auth.uid();
  v_session         route_sessions;
  v_qr              qr_codes;
  v_point           route_points;
  v_qr_found        boolean := true;
  v_last_scan       checkpoint_scans;
  v_expected_seq    integer;
  v_distance        double precision;
  v_radius          integer;
  v_result          scan_result := 'ok';
  v_row             checkpoint_scans;
  v_resolved_point_id uuid;
  v_seconds_since_last numeric;
begin
  select * into v_row from checkpoint_scans where client_event_id = p_client_event_id;
  if found then
    return v_row;
  end if;

  select * into v_session from route_sessions where id = p_route_session_id and company_id = v_company_id;
  if not found then
    raise exception 'Sesión de ronda no encontrada.';
  end if;
  if v_session.guard_id <> v_guard_id and not is_admin_or_supervisor() then
    raise exception 'No autorizado para registrar en esta ronda.';
  end if;

  select * into v_qr from qr_codes where token = p_qr_token;
  if not found then
    v_qr_found := false;
    v_result := 'invalid_qr';
  elsif v_qr.company_id <> v_company_id or v_qr.status <> 'active' then
    v_result := 'invalid_qr';
  end if;

  if v_result = 'ok' then
    select * into v_point from route_points where id = v_qr.route_point_id;
    if v_point.route_id <> v_session.route_id then
      v_result := 'invalid_qr'; -- QR de otra ronda/servicio
    end if;
  end if;

  -- Punto resuelto: si el QR existe (aunque sea inválido para esta ronda),
  -- igual sabemos a qué punto físico correspondía el intento y lo
  -- registramos para el rastro de auditoría anti-fraude. Solo queda NULL
  -- cuando el QR escaneado no existe en absoluto en el sistema.
  if v_qr_found then
    v_resolved_point_id := coalesce(v_point.id, v_qr.route_point_id);
  else
    v_resolved_point_id := null;
  end if;

  v_expected_seq := v_session.completed_points + 1;

  if v_result = 'ok' and v_point.sequence_order <> v_expected_seq then
    v_result := 'out_of_sequence';
  end if;

  if v_result = 'ok' and v_point.latitude is not null and p_latitude is not null then
    v_distance := haversine_meters(v_point.latitude, v_point.longitude, p_latitude, p_longitude);
    v_radius := coalesce(v_point.gps_radius_meters, (select gps_radius_meters from services where id = v_point.service_id), 60);
    if v_distance is not null and v_distance > (v_radius + least(coalesce(p_gps_accuracy, 0), 40)) then
      v_result := 'location_mismatch';
    end if;
  end if;

  select * into v_last_scan from checkpoint_scans
    where route_session_id = p_route_session_id
    order by sequence_expected desc limit 1;
  if found then
    v_seconds_since_last := extract(epoch from (p_scanned_at - v_last_scan.scanned_at));
    if v_seconds_since_last < 5 then
      v_result := 'too_fast';
    end if;
  end if;

  insert into checkpoint_scans (
    company_id, route_session_id, route_point_id, guard_id, qr_code_id,
    client_event_id, scanned_at, sequence_expected, latitude, longitude,
    gps_accuracy_meters, distance_to_point_meters, result, was_offline
  ) values (
    v_company_id, p_route_session_id, v_resolved_point_id,
    v_guard_id, v_qr.id, p_client_event_id, p_scanned_at, v_expected_seq,
    p_latitude, p_longitude, p_gps_accuracy, v_distance, v_result, p_was_offline
  ) returning * into v_row;

  if v_result = 'ok' then
    update route_sessions
      set completed_points = completed_points + 1,
          status = 'in_progress',
          started_at = coalesce(started_at, p_scanned_at)
      where id = p_route_session_id;
  end if;

  if v_result in ('location_mismatch', 'invalid_qr', 'too_fast', 'out_of_sequence', 'duplicate') then
    insert into alerts (company_id, service_id, guard_id, route_session_id, alert_type, severity, message)
    values (
      v_company_id, v_session.service_id, v_guard_id, p_route_session_id,
      case when v_result = 'location_mismatch' then 'suspicious_location'::alert_type else 'qr_anomaly'::alert_type end,
      case when v_result in ('location_mismatch','invalid_qr') then 'high' else 'medium' end,
      'Escaneo con anomalía: ' || v_result::text
    );
  end if;

  perform log_audit('checkpoint.scan', 'checkpoint_scans', v_row.id,
    jsonb_build_object('result', v_result, 'route_session_id', p_route_session_id));

  return v_row;
end;
$$;

revoke execute on function register_checkpoint_scan(uuid, uuid, uuid, timestamptz, double precision, double precision, double precision, boolean) from anon;
revoke execute on function register_checkpoint_scan(uuid, uuid, uuid, timestamptz, double precision, double precision, double precision, boolean) from public;
grant execute on function register_checkpoint_scan(uuid, uuid, uuid, timestamptz, double precision, double precision, double precision, boolean) to authenticated;
