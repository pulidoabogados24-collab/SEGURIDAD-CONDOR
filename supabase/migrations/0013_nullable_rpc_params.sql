-- ============================================================================
-- 0013_nullable_rpc_params.sql
-- Corrige las firmas de register_checkpoint_scan y create_incident para que
-- los parámetros que son legítimamente opcionales en el dominio (coordenadas
-- GPS cuando el dispositivo no las reporta; route_point_id/route_session_id
-- para una novedad que no está atada a un punto específico) acepten NULL de
-- forma explícita en la firma SQL.
--
-- Motivo: las columnas subyacentes (checkpoint_scans.latitude/longitude/
-- gps_accuracy_meters, incidents.route_session_id/route_point_id/latitude/
-- longitude) ya son NULLABLE y la lógica de negocio ya maneja NULL
-- correctamente (ver los checks "is not null" en 0007). Sin esta migración,
-- Postgres expone estos parámetros como NOT NULL/requeridos en la firma de
-- la función, lo que obliga al frontend a inventar valores sentinela (0,0)
-- que corromperían el cálculo de distancia anti-fraude. Con DEFAULT NULL
-- explícito, los tipos generados por Supabase marcan estos parámetros como
-- opcionales/nullable, que es el contrato real.
-- ============================================================================

drop function if exists register_checkpoint_scan(uuid, uuid, uuid, timestamptz, double precision, double precision, double precision, boolean);

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
  v_last_scan       checkpoint_scans;
  v_expected_seq    integer;
  v_distance        double precision;
  v_radius          integer;
  v_result          scan_result := 'ok';
  v_row             checkpoint_scans;
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
  if not found or v_qr.company_id <> v_company_id or v_qr.status <> 'active' then
    v_result := 'invalid_qr';
  end if;

  if v_result = 'ok' then
    select * into v_point from route_points where id = v_qr.route_point_id;
    if v_point.route_id <> v_session.route_id then
      v_result := 'invalid_qr';
    end if;
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
    v_company_id, p_route_session_id,
    coalesce(v_point.id, (select route_point_id from qr_codes where token = p_qr_token)),
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

-- NOTA: CREATE OR REPLACE con firma distinta (parámetros con DEFAULT
-- añadidos) hace que Supabase trate la función como nueva y le otorgue
-- EXECUTE directo a anon/authenticated automáticamente. Por eso además de
-- revocar de PUBLIC hay que revocar explícitamente de anon (ver 0014).
revoke execute on function register_checkpoint_scan(uuid, uuid, uuid, timestamptz, double precision, double precision, double precision, boolean) from public;
revoke execute on function register_checkpoint_scan(uuid, uuid, uuid, timestamptz, double precision, double precision, double precision, boolean) from anon;
grant execute on function register_checkpoint_scan(uuid, uuid, uuid, timestamptz, double precision, double precision, double precision, boolean) to authenticated;

drop function if exists create_incident(uuid, uuid, uuid, uuid, incident_type, text, incident_priority, double precision, double precision, timestamptz, boolean);

create or replace function create_incident(
  p_client_event_id uuid, p_service_id uuid,
  p_incident_type incident_type, p_description text, p_priority incident_priority,
  p_occurred_at timestamptz,
  p_route_session_id uuid default null, p_route_point_id uuid default null,
  p_latitude double precision default null, p_longitude double precision default null,
  p_was_offline boolean default false
) returns incidents
language plpgsql security definer set search_path = public as $$
declare
  v_row incidents;
  v_company_id uuid := current_company_id();
begin
  select * into v_row from incidents where client_event_id = p_client_event_id;
  if found then
    return v_row;
  end if;

  insert into incidents (
    company_id, service_id, route_session_id, route_point_id, guard_id, client_event_id,
    incident_type, description, priority, latitude, longitude, occurred_at, was_offline
  ) values (
    v_company_id, p_service_id, p_route_session_id, p_route_point_id, auth.uid(), p_client_event_id,
    p_incident_type, p_description, p_priority, p_latitude, p_longitude, p_occurred_at, p_was_offline
  ) returning * into v_row;

  if p_priority = 'critical' then
    insert into alerts (company_id, service_id, guard_id, incident_id, alert_type, severity, message)
    values (v_company_id, p_service_id, auth.uid(), v_row.id, 'critical_incident', 'critical',
      'Novedad crítica: ' || p_description);
  end if;

  perform log_audit('incident.create', 'incidents', v_row.id, jsonb_build_object('priority', p_priority));

  return v_row;
end;
$$;

revoke execute on function create_incident(uuid, uuid, incident_type, text, incident_priority, timestamptz, uuid, uuid, double precision, double precision, boolean) from public;
revoke execute on function create_incident(uuid, uuid, incident_type, text, incident_priority, timestamptz, uuid, uuid, double precision, double precision, boolean) from anon;
grant execute on function create_incident(uuid, uuid, incident_type, text, incident_priority, timestamptz, uuid, uuid, double precision, double precision, boolean) to authenticated;
