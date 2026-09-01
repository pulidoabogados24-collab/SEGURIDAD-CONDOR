-- ============================================================================
-- 0019_fix_scan_result_precedence_bug.sql
-- Bug encontrado al reprobar el caso QA "QR inválido" inmediatamente
-- después de 0018: el check "too_fast" (menos de 5s desde el último
-- escaneo de la MISMA sesión) se evaluaba de forma incondicional y
-- sobrescribía v_result aunque ya estuviera en 'invalid_qr' (o cualquier
-- otra anomalía ya detectada). Como route_point_id solo puede ser NULL
-- cuando result = 'invalid_qr' (constraint de 0018), un QR inexistente
-- escaneado dentro de los 5s del escaneo anterior producía result='too_fast'
-- con route_point_id NULL, violando el constraint con un error 400 sin
-- manejar — el mismo síntoma que 0018 buscaba eliminar.
--
-- Causa raíz más profunda: la función nunca tuvo una precedencia explícita
-- entre las distintas anomalías; cada check de "if v_result = 'ok' then"
-- protegía las anomalías tempranas de ser sobrescritas por las
-- posteriores, EXCEPTO el check de too_fast, que no tenía esa guarda.
--
-- Corrección: el check too_fast ahora solo aplica si no se detectó ya
-- ninguna otra anomalía (v_result = 'ok'), igual que los demás. Un QR
-- inválido sigue siendo la anomalía de mayor prioridad — no tiene sentido
-- reportar "demasiado rápido" sobre un QR que ni siquiera es válido.
-- ============================================================================

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

  -- CORRECCIÓN: este check ya no es incondicional. Solo se evalúa si no
  -- hay ya una anomalía detectada, igual que out_of_sequence y
  -- location_mismatch arriba. Un QR inválido u otra anomalía ya detectada
  -- tiene prioridad de reporte sobre "demasiado rápido".
  if v_result = 'ok' then
    select * into v_last_scan from checkpoint_scans
      where route_session_id = p_route_session_id
      order by sequence_expected desc limit 1;
    if found then
      v_seconds_since_last := extract(epoch from (p_scanned_at - v_last_scan.scanned_at));
      if v_seconds_since_last < 5 then
        v_result := 'too_fast';
      end if;
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
