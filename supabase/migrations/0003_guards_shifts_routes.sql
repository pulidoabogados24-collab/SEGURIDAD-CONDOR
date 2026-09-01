-- ============================================================================
-- 0003_guards_shifts_routes.sql
-- Vigilantes, supervisores, turnos, rondas, puntos de control, QR
-- ============================================================================

-- ---------------------------------------------------------------------------
-- GUARDS: perfil operativo del vigilante (1:1 con user_profiles role='guard')
-- ---------------------------------------------------------------------------
create table guards (
  id                  uuid primary key references user_profiles(id) on delete cascade,
  company_id          uuid not null references companies(id) on delete cascade,
  badge_code          text,               -- código/carné interno
  default_service_id  uuid references services(id) on delete set null,
  hired_at            date,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

create index idx_guards_company on guards (company_id);
create index idx_guards_service on guards (default_service_id);

-- Supervisores pueden estar asignados a uno o varios servicios
create table supervisor_services (
  supervisor_id       uuid not null references user_profiles(id) on delete cascade,
  service_id          uuid not null references services(id) on delete cascade,
  company_id          uuid not null references companies(id) on delete cascade,
  primary key (supervisor_id, service_id)
);

create index idx_supervisor_services_company on supervisor_services (company_id);

-- ---------------------------------------------------------------------------
-- SHIFTS: turnos asignados a un vigilante en un servicio
-- ---------------------------------------------------------------------------
create table shifts (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  service_id          uuid not null references services(id) on delete cascade,
  guard_id            uuid not null references guards(id) on delete cascade,
  shift_date          date not null,
  start_time          time not null,
  end_time            time not null,          -- puede ser < start_time (turno nocturno cruza medianoche)
  status              shift_status not null default 'scheduled',
  checked_in_at       timestamptz,
  checked_out_at      timestamptz,
  created_at          timestamptz not null default now()
);

create index idx_shifts_company on shifts (company_id);
create index idx_shifts_guard_date on shifts (guard_id, shift_date);
create index idx_shifts_service_date on shifts (service_id, shift_date);

-- ---------------------------------------------------------------------------
-- ROUTES: plantilla de ronda configurable (ej. "Ronda Nocturna 01")
-- ---------------------------------------------------------------------------
create table routes (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  service_id          uuid not null references services(id) on delete cascade,
  name                text not null,
  scheduled_time      time not null,              -- hora prevista de inicio
  expected_duration_minutes integer not null default 60,
  tolerance_minutes   integer not null default 15, -- tolerancia antes de marcar "atrasada"
  days_of_week        smallint[] not null default '{0,1,2,3,4,5,6}', -- 0=domingo..6=sábado
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_routes_service on routes (service_id);
create index idx_routes_company on routes (company_id);

-- Vigilantes asignados a una ronda (puede ser más de uno, rotativo)
create table route_guards (
  route_id            uuid not null references routes(id) on delete cascade,
  guard_id            uuid not null references guards(id) on delete cascade,
  company_id          uuid not null references companies(id) on delete cascade,
  primary key (route_id, guard_id)
);

-- ---------------------------------------------------------------------------
-- ROUTE_POINTS: puntos de control de una ronda, en orden
-- ---------------------------------------------------------------------------
create table route_points (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  route_id            uuid not null references routes(id) on delete cascade,
  service_id          uuid not null references services(id) on delete cascade,
  name                text not null,               -- "Portería principal"
  sequence_order      integer not null,             -- 1..N orden esperado
  latitude            double precision,
  longitude           double precision,
  gps_radius_meters   integer,                      -- override de services.gps_radius_meters si se necesita
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (route_id, sequence_order)
);

create index idx_route_points_route on route_points (route_id, sequence_order);
create index idx_route_points_company on route_points (company_id);

-- ---------------------------------------------------------------------------
-- QR_CODES: un QR único por punto de control. El QR solo contiene un
-- identificador seguro (token), nunca datos sensibles.
-- ---------------------------------------------------------------------------
create table qr_codes (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  route_point_id      uuid not null references route_points(id) on delete cascade,
  token               uuid not null default gen_random_uuid(), -- lo que se codifica en el QR
  version             integer not null default 1,              -- se incrementa al regenerar
  status              text not null default 'active' check (status in ('active','invalidated','replaced')),
  created_at          timestamptz not null default now(),
  invalidated_at      timestamptz,
  invalidated_reason  text,
  unique (token)
);

create index idx_qr_codes_route_point on qr_codes (route_point_id);
create index idx_qr_codes_company on qr_codes (company_id);
create unique index uq_qr_codes_active_per_point on qr_codes (route_point_id) where status = 'active';

create trigger trg_routes_updated_at before update on routes for each row execute function set_updated_at();
