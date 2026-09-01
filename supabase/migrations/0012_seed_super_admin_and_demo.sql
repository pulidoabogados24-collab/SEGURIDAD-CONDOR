-- ============================================================================
-- 0012_seed_super_admin_and_demo.sql
-- Crea:
--   1. El super_admin de la plataforma
--   2. La empresa demo "Seguridad Integral Demo" con 2 servicios (clientes),
--      1 admin, 1 supervisor, 3 vigilantes, 1 usuario de portal cliente,
--      rutas con puntos y QR, sesiones de ronda con escaneos históricos,
--      novedades, alertas, minuta digital y uso diario.
--
-- Los usuarios se insertan directamente en auth.users (patrón estándar de
-- seed sin Admin API disponible) con crypt() de pgcrypto para el hash
-- bcrypt, y raw_app_meta_data.provisioned_role para que el trigger
-- handle_new_auth_user() cree automáticamente user_profiles.
-- Contraseña de TODOS los usuarios demo: Demo2026!
-- ============================================================================

do $$
declare
  v_super_admin_id      uuid := gen_random_uuid();
  v_company_id          uuid := gen_random_uuid();
  v_admin_id            uuid := gen_random_uuid();
  v_supervisor_id       uuid := gen_random_uuid();
  v_guard1_id           uuid := gen_random_uuid(); -- Carlos Rodríguez
  v_guard2_id           uuid := gen_random_uuid(); -- Andrés Martínez
  v_guard3_id           uuid := gen_random_uuid(); -- Juan David
  v_client_portal_user  uuid := gen_random_uuid(); -- usuario del portal cliente
  v_client1_id          uuid := gen_random_uuid();  -- registro "cliente" (dueño de El Porvenir)
  v_client2_id          uuid := gen_random_uuid();  -- registro "cliente" (dueño de Los Cedros)
  v_service1_id         uuid := gen_random_uuid();  -- Barrio El Porvenir
  v_service2_id         uuid := gen_random_uuid();  -- Conjunto Los Cedros
  v_route1_id           uuid := gen_random_uuid();
  v_route2_id           uuid := gen_random_uuid();
  v_plan_profesional_id uuid;
  v_hashed_pw           text := crypt('Demo2026!', gen_salt('bf'));

  v_point_names         text[] := array['Portería principal','Parque central','Torre 1','Torre 2','Zona comercial','Parqueadero','Salida posterior'];
  v_route1_point_ids    uuid[] := array[]::uuid[];
  v_route2_point_ids    uuid[] := array[]::uuid[];
  v_point_id            uuid;
  v_qr_token            uuid;
  v_session_id          uuid;
  v_client_evt          uuid;
  v_scan_time           timestamptz;
  v_day                 integer;
  v_i                   integer;
begin
  select id into v_plan_profesional_id from plans where code = 'profesional';

  -- -------------------------------------------------------------------------
  -- 1) SUPER ADMIN
  -- -------------------------------------------------------------------------
  -- NOTA IMPORTANTE: al insertar directamente en auth.users (no vía la API
  -- de signup de GoTrue), hay que fijar explícitamente TODAS las columnas de
  -- texto que GoTrue usa para flujos de cambio de email/teléfono/reautenticación
  -- (email_change, email_change_token_new, email_change_token_current,
  -- phone_change, phone_change_token, reauthentication_token) a '' y
  -- email_change_confirm_status a 0. Son NULLABLE en Postgres pero el
  -- driver Go de GoTrue las escanea a campos string no punteros: un NULL
  -- ahí rompe CUALQUIER login futuro de ese usuario con
  -- "Database error querying schema" (bug real encontrado y corregido en
  -- la migración 0015 — ver ese archivo para el diagnóstico completo).
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token, email_change_confirm_status
  ) values (
    v_super_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'superadmin@controlguard.demo', v_hashed_pw, now(),
    jsonb_build_object('provisioned_role','super_admin','full_name','Super Admin ControlGuard'),
    '{}'::jsonb, now(), now(), '', '',
    '', '', '', '', '', '', 0
  );

  -- -------------------------------------------------------------------------
  -- 2) EMPRESA DEMO + SUSCRIPCIÓN
  -- -------------------------------------------------------------------------
  insert into companies (id, name, legal_name, nit, contact_email, contact_phone, city, is_demo)
  values (v_company_id, 'Seguridad Integral Demo', 'Seguridad Integral Demo S.A.S.', '900123456-7',
          'contacto@seguridadintegraldemo.com', '3001234567', 'Bogotá', true);

  insert into subscriptions (company_id, plan_id, status)
  values (v_company_id, v_plan_profesional_id, 'active');

  -- -------------------------------------------------------------------------
  -- 3) USUARIOS DE LA EMPRESA DEMO
  -- -------------------------------------------------------------------------
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token, email_change_confirm_status
  ) values
    (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin@seguridadintegraldemo.com', v_hashed_pw, now(),
     jsonb_build_object('provisioned_role','admin','provisioned_company_id', v_company_id::text, 'full_name','María Fernanda Gómez'),
     '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', '', 0),
    (v_supervisor_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'supervisor@seguridadintegraldemo.com', v_hashed_pw, now(),
     jsonb_build_object('provisioned_role','supervisor','provisioned_company_id', v_company_id::text, 'full_name','Luis Torres'),
     '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', '', 0),
    (v_guard1_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'carlos.rodriguez@seguridadintegraldemo.com', v_hashed_pw, now(),
     jsonb_build_object('provisioned_role','guard','provisioned_company_id', v_company_id::text, 'full_name','Carlos Rodríguez'),
     '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', '', 0),
    (v_guard2_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'andres.martinez@seguridadintegraldemo.com', v_hashed_pw, now(),
     jsonb_build_object('provisioned_role','guard','provisioned_company_id', v_company_id::text, 'full_name','Andrés Martínez'),
     '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', '', 0),
    (v_guard3_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'juan.david@seguridadintegraldemo.com', v_hashed_pw, now(),
     jsonb_build_object('provisioned_role','guard','provisioned_company_id', v_company_id::text, 'full_name','Juan David'),
     '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', '', 0),
    (v_client_portal_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'cliente@elporvenir.demo', v_hashed_pw, now(),
     jsonb_build_object('provisioned_role','client','provisioned_company_id', v_company_id::text, 'full_name','Administración El Porvenir'),
     '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', '', 0);

  insert into guards (id, company_id, badge_code, hired_at) values
    (v_guard1_id, v_company_id, 'VIG-001', current_date - interval '400 days'),
    (v_guard2_id, v_company_id, 'VIG-002', current_date - interval '250 days'),
    (v_guard3_id, v_company_id, 'VIG-003', current_date - interval '90 days');

  -- -------------------------------------------------------------------------
  -- 4) CLIENTES (contratantes) Y SERVICIOS
  -- -------------------------------------------------------------------------
  insert into clients (id, company_id, name, contact_name, contact_email, contact_phone) values
    (v_client1_id, v_company_id, 'Junta de Acción Comunal El Porvenir', 'Rosa Jiménez', 'junta@elporvenir.demo', '3011112222'),
    (v_client2_id, v_company_id, 'Conjunto Residencial Los Cedros P.H.', 'Fernando Ruiz', 'admin@loscedros.demo', '3022223333');

  insert into client_users (user_id, client_id) values (v_client_portal_user, v_client1_id);

  insert into services (id, company_id, client_id, name, service_type, city, latitude, longitude, gps_radius_meters) values
    (v_service1_id, v_company_id, v_client1_id, 'Barrio El Porvenir', 'neighborhood', 'Bogotá', 4.678000, -74.055000, 60),
    (v_service2_id, v_company_id, v_client2_id, 'Conjunto Los Cedros', 'condo', 'Bogotá', 4.702000, -74.041000, 50);

  now();
  update guards set default_service_id = v_service1_id where id in (v_guard1_id, v_guard3_id);
  update guards set default_service_id = v_service2_id where id = v_guard2_id;

  insert into supervisor_services (supervisor_id, service_id, company_id) values
    (v_supervisor_id, v_service1_id, v_company_id),
    (v_supervisor_id, v_service2_id, v_company_id);

  insert into posts (company_id, service_id, name) values
    (v_company_id, v_service1_id, 'Portería Norte'),
    (v_company_id, v_service1_id, 'Portería Sur'),
    (v_company_id, v_service2_id, 'Portería Principal');

  -- -------------------------------------------------------------------------
  -- 5) RONDAS (routes) + PUNTOS + QR — Ronda Nocturna 01 en El Porvenir (7 pts)
  -- -------------------------------------------------------------------------
  insert into routes (id, company_id, service_id, name, scheduled_time, expected_duration_minutes, tolerance_minutes)
  values (v_route1_id, v_company_id, v_service1_id, 'Ronda Nocturna 01', '22:00', 60, 15);

  insert into route_guards (route_id, guard_id, company_id) values (v_route1_id, v_guard1_id, v_company_id);

  for v_i in 1..7 loop
    v_point_id := gen_random_uuid();
    v_route1_point_ids := array_append(v_route1_point_ids, v_point_id);
    insert into route_points (id, company_id, route_id, service_id, name, sequence_order, latitude, longitude)
    values (v_point_id, v_company_id, v_route1_id, v_service1_id, v_point_names[v_i], v_i,
            4.678000 + (v_i * 0.0007), -74.055000 + (v_i * 0.0005));
    v_qr_token := gen_random_uuid();
    insert into qr_codes (company_id, route_point_id, token) values (v_company_id, v_point_id, v_qr_token);
  end loop;

  -- Ronda 02 en Los Cedros (5 puntos)
  insert into routes (id, company_id, service_id, name, scheduled_time, expected_duration_minutes, tolerance_minutes)
  values (v_route2_id, v_company_id, v_service2_id, 'Ronda Diurna 01', '14:00', 45, 10);

  insert into route_guards (route_id, guard_id, company_id) values (v_route2_id, v_guard2_id, v_company_id);

  for v_i in 1..5 loop
    v_point_id := gen_random_uuid();
    v_route2_point_ids := array_append(v_route2_point_ids, v_point_id);
    insert into route_points (id, company_id, route_id, service_id, name, sequence_order, latitude, longitude)
    values (v_point_id, v_company_id, v_route2_id, v_service2_id, v_point_names[v_i], v_i,
            4.702000 + (v_i * 0.0006), -74.041000 + (v_i * 0.0004));
    v_qr_token := gen_random_uuid();
    insert into qr_codes (company_id, route_point_id, token) values (v_company_id, v_point_id, v_qr_token);
  end loop;

  -- -------------------------------------------------------------------------
  -- 6) HISTORIAL: 5 días de rondas nocturnas completas en El Porvenir (Carlos)
  -- -------------------------------------------------------------------------
  for v_day in 1..5 loop
    v_session_id := gen_random_uuid();
    v_client_evt := gen_random_uuid();
    insert into route_sessions (
      id, company_id, route_id, service_id, guard_id, client_session_id,
      scheduled_at, started_at, finished_at, status, expected_points, completed_points, compliance_pct
    ) values (
      v_session_id, v_company_id, v_route1_id, v_service1_id, v_guard1_id, v_client_evt,
      (current_date - v_day) + time '22:00', (current_date - v_day) + time '22:01',
      (current_date - v_day) + time '22:52', 'completed', 7, 7, 100.00
    );

    v_scan_time := (current_date - v_day) + time '22:01';
    for v_i in 1..7 loop
      insert into checkpoint_scans (
        company_id, route_session_id, route_point_id, guard_id, client_event_id,
        scanned_at, sequence_expected, latitude, longitude, gps_accuracy_meters,
        distance_to_point_meters, result
      ) values (
        v_company_id, v_session_id, v_route1_point_ids[v_i], v_guard1_id, gen_random_uuid(),
        v_scan_time, v_i, 4.678000 + (v_i * 0.0007), -74.055000 + (v_i * 0.0005), 12, 4, 'ok'
      );
      v_scan_time := v_scan_time + interval '7 minutes';
    end loop;
  end loop;

  -- Una ronda de HOY incompleta (para demostrar alerta de incumplimiento) — Juan David
  v_session_id := gen_random_uuid();
  insert into route_sessions (
    id, company_id, route_id, service_id, guard_id, client_session_id,
    scheduled_at, started_at, status, expected_points, completed_points, compliance_pct
  ) values (
    v_session_id, v_company_id, v_route1_id, v_service1_id, v_guard3_id, gen_random_uuid(),
    current_date + time '22:00', current_date + time '22:03', 'in_progress', 7, 3, null
  );
  v_scan_time := current_date + time '22:03';
  for v_i in 1..3 loop
    insert into checkpoint_scans (
      company_id, route_session_id, route_point_id, guard_id, client_event_id,
      scanned_at, sequence_expected, latitude, longitude, gps_accuracy_meters,
      distance_to_point_meters, result
    ) values (
      v_company_id, v_session_id, v_route1_point_ids[v_i], v_guard3_id, gen_random_uuid(),
      v_scan_time, v_i, 4.678000 + (v_i * 0.0007), -74.055000 + (v_i * 0.0005), 15, 6, 'ok'
    );
    v_scan_time := v_scan_time + interval '6 minutes';
  end loop;

  -- Sesión programada para HOY en Los Cedros (Andrés) aún no iniciada
  insert into route_sessions (
    company_id, route_id, service_id, guard_id, client_session_id,
    scheduled_at, status, expected_points, completed_points
  ) values (
    v_company_id, v_route2_id, v_service2_id, v_guard2_id, gen_random_uuid(),
    current_date + time '14:00', 'scheduled', 5, 0
  );

  -- -------------------------------------------------------------------------
  -- 7) NOVEDADES / INCIDENTES
  -- -------------------------------------------------------------------------
  insert into incidents (company_id, service_id, guard_id, client_event_id, incident_type, description, priority, occurred_at, status)
  values
    (v_company_id, v_service1_id, v_guard1_id, gen_random_uuid(), 'lighting_failure',
     'Poste de luz apagado cerca a la zona comercial, sector oscuro.', 'medium', now() - interval '1 day', 'open'),
    (v_company_id, v_service1_id, v_guard1_id, gen_random_uuid(), 'suspicious_vehicle',
     'Vehículo desconocido estacionado por más de 2 horas frente a la torre 2.', 'high', now() - interval '2 days', 'reviewed'),
    (v_company_id, v_service2_id, v_guard2_id, gen_random_uuid(), 'open_door',
     'Puerta de acceso peatonal quedó sin seguro tras el horario de cierre.', 'medium', now() - interval '3 hours', 'open');

  -- Novedad crítica de HOY -> dispara alerta automática (vía create_incident lo haría
  -- la app; aquí se inserta directo y se crea la alerta manualmente para el seed)
  insert into incidents (company_id, service_id, guard_id, client_event_id, incident_type, description, priority, occurred_at, status)
  values (v_company_id, v_service1_id, v_guard3_id, gen_random_uuid(), 'unauthorized_access',
          'Persona intentó ingresar por la salida posterior sin autorización.', 'critical', now() - interval '20 minutes', 'open')
  returning id into v_client_evt;

  insert into alerts (company_id, service_id, guard_id, incident_id, alert_type, severity, message)
  values (v_company_id, v_service1_id, v_guard3_id, v_client_evt, 'critical_incident', 'critical',
          'Novedad crítica: intento de acceso no autorizado en Barrio El Porvenir.');

  -- Alerta de ronda incompleta de hoy (Juan David)
  insert into alerts (company_id, service_id, guard_id, route_session_id, alert_type, severity, message)
  select v_company_id, v_service1_id, v_guard3_id, id, 'route_incomplete', 'medium',
         'Ronda en curso con posible atraso frente al tiempo esperado.'
  from route_sessions where guard_id = v_guard3_id and status = 'in_progress' limit 1;

  -- -------------------------------------------------------------------------
  -- 8) MINUTA DIGITAL de ejemplo
  -- -------------------------------------------------------------------------
  insert into daily_logs (company_id, service_id, guard_id, log_type, post_condition, items_received, observations, signed_by_name, client_event_id)
  values (v_company_id, v_service1_id, v_guard1_id, 'handover', 'Puesto en condiciones normales, sin novedades estructurales.',
          '[{"item":"radio","qty":1,"ok":true},{"item":"linterna","qty":1,"ok":true},{"item":"llavero de acceso","qty":1,"ok":true}]'::jsonb,
          'Turno tranquilo, se realizaron las 7 rondas programadas.', 'Carlos Rodríguez', gen_random_uuid());

  -- -------------------------------------------------------------------------
  -- 9) USO DIARIO (para panel super_admin)
  -- -------------------------------------------------------------------------
  insert into usage_daily (company_id, usage_date, active_guards, routes_scheduled, routes_completed, scans_count, incidents_count)
  values (v_company_id, current_date, 3, 3, 1, 84, 4)
  on conflict (company_id, usage_date) do nothing;

end $$;
