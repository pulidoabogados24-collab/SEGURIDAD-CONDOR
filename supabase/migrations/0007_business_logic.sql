-- ============================================================================
-- 0007_business_logic.sql
-- Lógica de negocio crítica en el servidor:
--   - registrar auditoría
--   - registrar un escaneo de punto de control con detección de anomalías
--   - calcular cumplimiento de una ronda al finalizar
--   - cerrar rondas vencidas y generar alertas (job periódico)
-- Todo en SECURITY DEFINER: el frontend nunca decide si un escaneo es válido.
-- ============================================================================

create or replace function log_audit(
  p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (current_company_id(), auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata);
end;
$$;

-- Distancia Haversine en metros entre dos coordenadas (evita depender de PostGIS
-- para el cálculo simple; si PostGIS está disponible se usa geography más abajo).
create or replace function haversine_meters(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  ))
  where lat1 is not null and lon1 is not null and lat2 is not null and lon2 is not null;
$$;

-- ---------------------------------------------------------------------------
-- register_checkpoint_scan: función principal que el cliente (vigilante) llama
-- (directo o vía sync) para registrar el paso por un punto. Aplica TODAS las
-- validaciones anti-fraude en servidor.
-- ---------------------------------------------------------------------------
create or replace function register_checkpoint_scan(
  p_client_event_id   uuid,
  p_route_session_id  uuid,
  p_qr_token          uuid,
  p_scanned_at        timestamptz,
  p_latitude          double precision,
  p_longitude         double precision,
  p_gps_accuracy      double precision,
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
  -- Idempotencia: si ya existe este client_event_id, devolverlo tal cual (sin duplicar)
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

  -- Validar QR: debe existir, pertenecer a la misma empresa y estar activo
  select * into v_qr from qr_codes where token = p_qr_token;
  if not found or v_qr.company_id <> v_company_id or v_qr.status <> 'active' then
    v_result := 'invalid_qr';
  end if;

  if v_result = 'ok' then
    select * into v_point from route_points where id = v_qr.route_point_id;
    if v_point.route_id <> v_session.route_id then
      v_result := 'invalid_qr'; -- QR de otra ronda/servicio
    end if;
  end if;

  -- Secuencia esperada = completados + 1
  v_expected_seq := v_session.completed_points + 1;

  if v_result = 'ok' and v_point.sequence_order <> v_expected_seq then
    v_result := 'out_of_sequence';
  end if;

  -- Distancia GPS (si el punto y el dispositivo reportan coordenadas)
  if v_result = 'ok' and v_point.latitude is not null and p_latitude is not null then
    v_distance := haversine_meters(v_point.latitude, v_point.longitude, p_latitude, p_longitude);
    v_radius := coalesce(v_point.gps_radius_meters, (select gps_radius_meters from services where id = v_point.service_id), 60);
    -- Tolerancia adicional por la precisión reportada del GPS: no penalizar
    -- imprecisión normal del dispositivo (hasta 40m de margen extra).
    if v_distance is not null and v_distance > (v_radius + least(coalesce(p_gps_accuracy, 0), 40)) then
      v_result := 'location_mismatch';
    end if;
  end if;

  -- Anti-fraude: escaneo demasiado rápido desde el punto anterior de la misma sesión
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

  -- Solo avanza la ronda si el escaneo fue válido u obedece secuencia correcta
  if v_result = 'ok' then
    update route_sessions
      set completed_points = completed_points + 1,
          status = 'in_progress',
          started_at = coalesce(started_at, p_scanned_at)
      where id = p_route_session_id;
  end if;

  -- Generar alerta si la ubicación es sospechosa o el QR es inválido
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

-- ---------------------------------------------------------------------------
-- finish_route_session: calcula cumplimiento, marca estado final y genera
-- alerta si quedó incompleta.
-- ---------------------------------------------------------------------------
create or replace function finish_route_session(p_route_session_id uuid) returns route_sessions
language plpgsql security definer set search_path = public as $$
declare
  v_session route_sessions;
  v_pct numeric(5,2);
  v_status route_session_status;
begin
  select * into v_session from route_sessions where id = p_route_session_id and company_id = current_company_id();
  if not found then
    raise exception 'Sesión no encontrada.';
  end if;
  if v_session.guard_id <> auth.uid() and not is_admin_or_supervisor() then
    raise exception 'No autorizado.';
  end if;

  v_pct := case when v_session.expected_points > 0
    then round(100.0 * v_session.completed_points / v_session.expected_points, 2)
    else 0 end;

  v_status := case when v_session.completed_points >= v_session.expected_points then 'completed' else 'incomplete' end;

  update route_sessions
    set finished_at = now(), status = v_status, compliance_pct = v_pct
    where id = p_route_session_id
    returning * into v_session;

  if v_status = 'incomplete' then
    insert into alerts (company_id, service_id, guard_id, route_session_id, alert_type, severity, message)
    values (v_session.company_id, v_session.service_id, v_session.guard_id, v_session.id,
      'route_incomplete', 'high',
      format('Ronda finalizada incompleta: %s de %s puntos (%s%%)', v_session.completed_points, v_session.expected_points, v_pct));
  end if;

  perform log_audit('route_session.finish', 'route_sessions', v_session.id,
    jsonb_build_object('status', v_status, 'compliance_pct', v_pct));

  return v_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_incident: registra una novedad y, si es crítica, dispara alerta
-- inmediata visible al supervisor.
-- ---------------------------------------------------------------------------
create or replace function create_incident(
  p_client_event_id uuid, p_service_id uuid, p_route_session_id uuid, p_route_point_id uuid,
  p_incident_type incident_type, p_description text, p_priority incident_priority,
  p_latitude double precision, p_longitude double precision, p_occurred_at timestamptz,
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

-- ---------------------------------------------------------------------------
-- sweep_operational_alerts: job periódico (llamado por Edge Function con cron)
-- Detecta rondas atrasadas (no iniciadas dentro de tolerancia) y vigilantes
-- sin actividad. Idempotente: no duplica alertas abiertas del mismo tipo.
-- ---------------------------------------------------------------------------
create or replace function sweep_operational_alerts() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  r record;
begin
  -- Rondas que debían iniciar hace más de su tolerancia y no tienen sesión iniciada
  for r in
    select rs.id as session_id, rs.company_id, rs.service_id, rs.guard_id, rt.tolerance_minutes, rs.scheduled_at
    from route_sessions rs
    join routes rt on rt.id = rs.route_id
    where rs.status = 'scheduled'
      and rs.scheduled_at + (rt.tolerance_minutes || ' minutes')::interval < now()
      and not exists (
        select 1 from alerts a
        where a.route_session_id = rs.id and a.alert_type = 'route_delayed' and a.status = 'open'
      )
  loop
    insert into alerts (company_id, service_id, guard_id, route_session_id, alert_type, severity, message)
    values (r.company_id, r.service_id, r.guard_id, r.session_id, 'route_delayed', 'high',
      'La ronda no ha iniciado y superó el tiempo de tolerancia.');
    v_count := v_count + 1;
  end loop;

  -- Vigilantes activos sin ningún escaneo/evento en más de 45 minutos durante una ronda en curso
  for r in
    select rs.id as session_id, rs.company_id, rs.service_id, rs.guard_id,
           greatest(rs.started_at, coalesce((select max(scanned_at) from checkpoint_scans where route_session_id = rs.id), rs.started_at)) as last_activity
    from route_sessions rs
    where rs.status = 'in_progress'
      and greatest(rs.started_at, coalesce((select max(scanned_at) from checkpoint_scans where route_session_id = rs.id), rs.started_at)) < now() - interval '45 minutes'
      and not exists (
        select 1 from alerts a
        where a.route_session_id = rs.id and a.alert_type = 'guard_inactive' and a.status = 'open'
      )
  loop
    insert into alerts (company_id, service_id, guard_id, route_session_id, alert_type, severity, message)
    values (r.company_id, r.service_id, r.guard_id, r.session_id, 'guard_inactive', 'medium',
      'El vigilante no registra actividad hace más de 45 minutos.');
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
