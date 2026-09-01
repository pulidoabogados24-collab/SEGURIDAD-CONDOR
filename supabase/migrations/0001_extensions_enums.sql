-- ============================================================================
-- 0001_extensions_enums.sql
-- Extensiones y tipos enumerados base de ControlGuard
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "postgis";    -- distancia geográfica precisa

-- Roles de plataforma
create type app_role as enum (
  'super_admin',   -- dueño del SaaS, ve todas las empresas
  'admin',         -- administrador de una empresa de seguridad
  'supervisor',    -- supervisa vigilantes/rondas de su empresa
  'guard',         -- vigilante, interfaz móvil
  'client'         -- portal de cliente (barrio/conjunto/empresa contratante)
);

-- Estado general de suscripción SaaS
create type subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'suspended'
);

-- Estado de una ronda programada
create type route_session_status as enum (
  'scheduled', 'in_progress', 'completed', 'incomplete', 'missed', 'canceled'
);

-- Resultado de un escaneo de punto de control
create type scan_result as enum (
  'ok',                 -- correcto: secuencia, tiempo y ubicación válidos
  'out_of_sequence',    -- se escaneó fuera del orden esperado
  'location_mismatch',  -- fuera del radio GPS permitido
  'duplicate',          -- QR/evento ya registrado (posible reintento o abuso)
  'invalid_qr',         -- QR no reconocido, inactivo o de otra empresa
  'too_fast'            -- intervalo sospechosamente corto desde el punto anterior
);

-- Prioridad de novedades / incidentes
create type incident_priority as enum ('low', 'medium', 'high', 'critical');

-- Tipos de novedad predefinidos (además de 'other' con texto libre)
create type incident_type as enum (
  'suspicious_person', 'open_door', 'damage', 'lighting_failure',
  'suspicious_vehicle', 'unauthorized_access', 'disturbance',
  'emergency', 'physical_damage', 'other'
);

-- Severidad / tipo de alerta automática
create type alert_type as enum (
  'route_delayed', 'checkpoint_skipped', 'guard_inactive',
  'suspicious_location', 'critical_incident', 'route_incomplete',
  'qr_anomaly'
);

create type alert_status as enum ('open', 'acknowledged', 'resolved', 'dismissed');

-- Estado de un turno de vigilante
create type shift_status as enum ('scheduled', 'active', 'completed', 'no_show');

comment on type app_role is 'Roles de acceso: super_admin (SaaS), admin/supervisor/guard (empresa), client (portal cliente)';
