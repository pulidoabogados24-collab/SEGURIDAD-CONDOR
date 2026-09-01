-- ============================================================================
-- 0004_operations_events.sql
-- Sesiones de ronda, escaneos, novedades, evidencia, minuta digital,
-- alertas, notificaciones, auditoría, uso/telemetría SaaS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ROUTE_SESSIONS: una ejecución concreta de una ronda por un vigilante
-- ---------------------------------------------------------------------------
create table route_sessions (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  route_id            uuid not null references routes(id) on delete cascade,
  service_id          uuid not null references services(id) on delete cascade,
  guard_id            uuid not null references guards(id) on delete cascade,
  shift_id            uuid references shifts(id) on delete set null,
  client_session_id   uuid not null,                -- generado en el cliente, permite idempotencia offline
  scheduled_at        timestamptz not null,
  started_at          timestamptz,
  finished_at         timestamptz,
  status              route_session_status not null default 'scheduled',
  expected_points     integer not null,             -- snapshot del total de puntos al iniciar
  completed_points    integer not null default 0,
  compliance_pct      numeric(5,2),                 -- calculado al finalizar/cerrar
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (client_session_id)
);

create index idx_route_sessions_company on route_sessions (company_id);
create index idx_route_sessions_guard on route_sessions (guard_id, scheduled_at);
create index idx_route_sessions_service_date on route_sessions (service_id, scheduled_at);
create index idx_route_sessions_status on route_sessions (company_id, status);

-- ---------------------------------------------------------------------------
-- CHECKPOINT_SCANS: cada paso de un vigilante por un punto de control.
-- client_event_id es la clave de idempotencia offline: el mismo evento
-- reenviado dos veces (reintento de sync) nunca se duplica.
-- ---------------------------------------------------------------------------
create table checkpoint_scans (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  route_session_id    uuid not null references route_sessions(id) on delete cascade,
  route_point_id      uuid not null references route_points(id) on delete cascade,
  guard_id            uuid not null references guards(id) on delete cascade,
  qr_code_id          uuid references qr_codes(id) on delete set null,
  client_event_id     uuid not null,                -- UUID generado offline en el dispositivo
  scanned_at          timestamptz not null,          -- hora del dispositivo al escanear
  received_at         timestamptz not null default now(), -- hora del servidor al sincronizar
  sequence_expected   integer not null,
  latitude            double precision,
  longitude           double precision,
  gps_accuracy_meters double precision,
  distance_to_point_meters double precision,        -- calculado en servidor
  result              scan_result not null default 'ok',
  was_offline         boolean not null default false, -- true si se registró y sincronizó después
  created_at          timestamptz not null default now(),
  unique (client_event_id)
);

create index idx_checkpoint_scans_session on checkpoint_scans (route_session_id);
create index idx_checkpoint_scans_company on checkpoint_scans (company_id);
create index idx_checkpoint_scans_guard on checkpoint_scans (guard_id, scanned_at);
create index idx_checkpoint_scans_result on checkpoint_scans (company_id, result);

-- ---------------------------------------------------------------------------
-- INCIDENTS: novedades / incidentes registrados por el vigilante
-- ---------------------------------------------------------------------------
create table incidents (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  service_id          uuid not null references services(id) on delete cascade,
  route_session_id    uuid references route_sessions(id) on delete set null,
  route_point_id      uuid references route_points(id) on delete set null,
  guard_id            uuid not null references guards(id) on delete cascade,
  client_event_id     uuid not null,                -- idempotencia offline
  incident_type       incident_type not null,
  description         text not null,
  priority            incident_priority not null default 'low',
  latitude            double precision,
  longitude           double precision,
  occurred_at         timestamptz not null,
  received_at         timestamptz not null default now(),
  was_offline         boolean not null default false,
  status              text not null default 'open' check (status in ('open','reviewed','closed')),
  reviewed_by         uuid references user_profiles(id) on delete set null,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  unique (client_event_id)
);

create index idx_incidents_company on incidents (company_id);
create index idx_incidents_service on incidents (service_id, occurred_at);
create index idx_incidents_priority on incidents (company_id, priority, status);

-- ---------------------------------------------------------------------------
-- EVIDENCE: fotografías asociadas a un escaneo o a una novedad.
-- Nunca se borran ni modifican una vez subidas (append-only + auditoría).
-- ---------------------------------------------------------------------------
create table evidence (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  checkpoint_scan_id  uuid references checkpoint_scans(id) on delete cascade,
  incident_id         uuid references incidents(id) on delete cascade,
  daily_log_id        uuid,  -- FK agregada tras crear daily_logs
  uploaded_by         uuid not null references user_profiles(id),
  storage_path        text not null,     -- ruta en Supabase Storage (bucket privado)
  mime_type           text not null default 'image/jpeg',
  size_bytes          integer,
  taken_at            timestamptz not null,
  latitude            double precision,
  longitude           double precision,
  created_at          timestamptz not null default now(),
  constraint chk_evidence_parent check (
    (checkpoint_scan_id is not null)::int +
    (incident_id is not null)::int +
    (daily_log_id is not null)::int = 1
  )
);

create index idx_evidence_company on evidence (company_id);
create index idx_evidence_scan on evidence (checkpoint_scan_id);
create index idx_evidence_incident on evidence (incident_id);

-- ---------------------------------------------------------------------------
-- DAILY_LOGS: minuta digital (entrega/recibo de turno)
-- ---------------------------------------------------------------------------
create table daily_logs (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  service_id          uuid not null references services(id) on delete cascade,
  shift_id            uuid references shifts(id) on delete set null,
  guard_id            uuid not null references guards(id) on delete cascade,
  log_type            text not null check (log_type in ('handover','receipt')), -- entrega | recibo
  post_condition      text,               -- estado del puesto
  items_received      jsonb not null default '[]'::jsonb, -- [{"item":"radio","qty":1,"ok":true}]
  observations        text,
  signed_by_name      text not null,      -- confirmación digital (nombre)
  signed_at           timestamptz not null default now(),
  client_event_id     uuid not null,
  created_at          timestamptz not null default now(),
  unique (client_event_id)
);

alter table evidence add constraint fk_evidence_daily_log foreign key (daily_log_id) references daily_logs(id) on delete cascade;

create index idx_daily_logs_service on daily_logs (service_id, signed_at);
create index idx_daily_logs_company on daily_logs (company_id);

-- ---------------------------------------------------------------------------
-- ALERTS: alertas automáticas generadas por el motor de cumplimiento
-- ---------------------------------------------------------------------------
create table alerts (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  service_id          uuid references services(id) on delete cascade,
  guard_id            uuid references guards(id) on delete set null,
  route_session_id    uuid references route_sessions(id) on delete set null,
  incident_id         uuid references incidents(id) on delete set null,
  alert_type          alert_type not null,
  severity            incident_priority not null default 'medium',
  message             text not null,
  status              alert_status not null default 'open',
  acknowledged_by     uuid references user_profiles(id) on delete set null,
  acknowledged_at     timestamptz,
  resolved_at         timestamptz,
  created_at          timestamptz not null default now()
);

create index idx_alerts_company_status on alerts (company_id, status);
create index idx_alerts_service on alerts (service_id);
create index idx_alerts_created on alerts (company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS: cola de envío (arquitectura preparada para WhatsApp/SMS/Email/Push)
-- ---------------------------------------------------------------------------
create table notifications (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  alert_id            uuid references alerts(id) on delete cascade,
  channel             text not null check (channel in ('in_app','whatsapp','email','sms','push')),
  recipient_user_id   uuid references user_profiles(id) on delete set null,
  recipient_address   text,             -- teléfono/email si aplica (fase 2)
  payload             jsonb not null default '{}'::jsonb,
  status              text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  sent_at             timestamptz,
  error               text,
  created_at          timestamptz not null default now()
);

create index idx_notifications_company on notifications (company_id, status);

-- ---------------------------------------------------------------------------
-- AUDIT_LOGS: auditoría de acciones importantes (append-only)
-- ---------------------------------------------------------------------------
create table audit_logs (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid references companies(id) on delete cascade, -- null = acción a nivel plataforma
  actor_user_id       uuid references user_profiles(id) on delete set null,
  action              text not null,           -- 'checkpoint.scan' | 'qr.invalidate' | 'guard.create' ...
  entity_type         text not null,
  entity_id           uuid,
  metadata            jsonb not null default '{}'::jsonb,
  ip_address          text,
  created_at          timestamptz not null default now()
);

create index idx_audit_logs_company on audit_logs (company_id, created_at desc);
create index idx_audit_logs_entity on audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- USAGE: telemetría de uso por empresa para el panel super_admin y límites de plan
-- ---------------------------------------------------------------------------
create table usage_daily (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  usage_date          date not null default current_date,
  active_guards       integer not null default 0,
  routes_scheduled    integer not null default 0,
  routes_completed    integer not null default 0,
  scans_count         integer not null default 0,
  incidents_count     integer not null default 0,
  storage_bytes       bigint not null default 0,
  created_at          timestamptz not null default now(),
  unique (company_id, usage_date)
);

create index idx_usage_daily_company on usage_daily (company_id, usage_date desc);

create trigger trg_route_sessions_updated_at before update on route_sessions for each row execute function set_updated_at();
