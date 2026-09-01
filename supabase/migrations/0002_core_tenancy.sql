-- ============================================================================
-- 0002_core_tenancy.sql
-- Núcleo multi-tenant: planes, empresas, perfiles de usuario, clientes,
-- servicios (barrios/conjuntos/etc.), puestos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PLANS: catálogo de planes SaaS (gestionado por super_admin)
-- ---------------------------------------------------------------------------
create table plans (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique not null,             -- 'basico' | 'profesional' | 'empresa'
  name                text not null,
  price_cop_month     integer not null check (price_cop_month >= 0),
  max_services        integer not null,                  -- límite de servicios activos
  max_guards          integer not null,                  -- límite de vigilantes activos
  features            jsonb not null default '{}'::jsonb, -- {"gps":true,"photos":true,"alerts":true,...}
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

insert into plans (code, name, price_cop_month, max_services, max_guards, features) values
  ('basico',       'Plan Básico',       150000, 1,  5,  '{"qr":true,"routes":true,"incidents":true,"reports":true,"gps":false,"photos":false,"alerts":false,"daily_log":false,"client_portal":false,"api":false}'),
  ('profesional',  'Plan Profesional',  250000, 3,  20, '{"qr":true,"routes":true,"incidents":true,"reports":true,"gps":true,"photos":true,"alerts":true,"daily_log":true,"client_portal":false,"api":false}'),
  ('empresa',      'Plan Empresa',      400000, 999,999,'{"qr":true,"routes":true,"incidents":true,"reports":true,"gps":true,"photos":true,"alerts":true,"daily_log":true,"client_portal":true,"api":true,"analytics":true,"automations":true}');

-- ---------------------------------------------------------------------------
-- COMPANIES: empresas de seguridad (tenants)
-- ---------------------------------------------------------------------------
create table companies (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  legal_name          text,
  nit                 text,                              -- NIT colombiano
  contact_email       text,
  contact_phone       text,
  address             text,
  city                text,
  logo_url            text,
  timezone            text not null default 'America/Bogota',
  is_demo             boolean not null default false,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_companies_active on companies (is_active);

-- ---------------------------------------------------------------------------
-- SUBSCRIPTIONS: suscripción de cada empresa a un plan
-- ---------------------------------------------------------------------------
create table subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  plan_id             uuid not null references plans(id),
  status              subscription_status not null default 'trialing',
  current_period_start date not null default current_date,
  current_period_end   date not null default (current_date + interval '30 days'),
  trial_ends_at       timestamptz,
  external_provider   text,          -- 'wompi' | 'mercadopago' | 'stripe' | null (fase 2)
  external_ref        text,          -- id de la suscripción en el proveedor externo
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (company_id)  -- una suscripción activa por empresa en el MVP
);

create index idx_subscriptions_company on subscriptions (company_id);

-- ---------------------------------------------------------------------------
-- USER_PROFILES: extiende auth.users con rol y empresa
-- ---------------------------------------------------------------------------
create table user_profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  company_id          uuid references companies(id) on delete cascade, -- null solo para super_admin
  role                app_role not null,
  full_name           text not null,
  phone               text,
  document_id         text,          -- cédula del vigilante/usuario
  photo_url           text,
  is_active           boolean not null default true,
  last_seen_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint chk_super_admin_no_company
    check ( (role = 'super_admin' and company_id is null) or (role <> 'super_admin' and company_id is not null) )
);

create index idx_user_profiles_company on user_profiles (company_id);
create index idx_user_profiles_role on user_profiles (company_id, role);

-- ---------------------------------------------------------------------------
-- CLIENTS: cliente contratante (dueño del barrio/conjunto/empresa/bodega)
-- ---------------------------------------------------------------------------
create table clients (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  name                text not null,
  contact_name        text,
  contact_email       text,
  contact_phone       text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_clients_company on clients (company_id);

-- Usuarios del portal cliente pueden ver uno o más clientes (ej. una
-- administradora de propiedad horizontal que gestiona varios conjuntos)
create table client_users (
  user_id             uuid not null references user_profiles(id) on delete cascade,
  client_id           uuid not null references clients(id) on delete cascade,
  created_at          timestamptz not null default now(),
  primary key (user_id, client_id)
);

-- ---------------------------------------------------------------------------
-- SERVICES: el servicio contratado (barrio, conjunto, bodega, finca, etc.)
-- ---------------------------------------------------------------------------
create table services (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  client_id           uuid not null references clients(id) on delete restrict,
  name                text not null,                     -- "Barrio El Porvenir"
  service_type        text not null default 'other',     -- 'neighborhood'|'condo'|'company'|'warehouse'|'farm'|'mall'|'institution'|'other'
  address             text,
  city                text,
  latitude            double precision,
  longitude           double precision,
  gps_radius_meters   integer not null default 60,        -- radio permitido configurable
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_services_company on services (company_id);
create index idx_services_client on services (client_id);

-- ---------------------------------------------------------------------------
-- POSTS: puestos de vigilancia dentro de un servicio (ej. portería norte)
-- ---------------------------------------------------------------------------
create table posts (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  service_id          uuid not null references services(id) on delete cascade,
  name                text not null,
  description         text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

create index idx_posts_service on posts (service_id);

-- updated_at trigger genérico
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_companies_updated_at before update on companies for each row execute function set_updated_at();
create trigger trg_subscriptions_updated_at before update on subscriptions for each row execute function set_updated_at();
create trigger trg_user_profiles_updated_at before update on user_profiles for each row execute function set_updated_at();
create trigger trg_clients_updated_at before update on clients for each row execute function set_updated_at();
create trigger trg_services_updated_at before update on services for each row execute function set_updated_at();
