-- ============================================================================
-- 0009_security_hardening.sql
-- Corrige hallazgos del advisor de seguridad de Supabase.
-- ============================================================================

alter function set_updated_at() set search_path = public;
alter function haversine_meters(double precision, double precision, double precision, double precision) set search_path = public;

revoke execute on function current_company_id() from anon;
revoke execute on function current_user_role() from anon;
revoke execute on function is_super_admin() from anon;
revoke execute on function is_company_admin() from anon;
revoke execute on function is_admin_or_supervisor() from anon;
revoke execute on function has_client_access(uuid) from anon;
revoke execute on function log_audit(text, text, uuid, jsonb) from anon;
revoke execute on function register_checkpoint_scan(uuid, uuid, uuid, timestamptz, double precision, double precision, double precision, boolean) from anon;
revoke execute on function finish_route_session(uuid) from anon;
revoke execute on function create_incident(uuid, uuid, uuid, uuid, incident_type, text, incident_priority, double precision, double precision, timestamptz, boolean) from anon;
revoke execute on function sweep_operational_alerts() from anon;
revoke execute on function prevent_self_privilege_escalation() from anon;
revoke execute on function prevent_self_privilege_escalation() from authenticated;
revoke execute on function handle_new_auth_user() from anon;
revoke execute on function handle_new_auth_user() from authenticated;
revoke execute on function sweep_operational_alerts() from authenticated;

-- NOTA (aceptado, no corregible): el advisor marca `public.spatial_ref_sys`
-- (tabla de metadatos de PostGIS con las definiciones de sistemas de
-- referencia espacial) sin RLS. Es propiedad de la extensión PostGIS —
-- Postgres rechaza `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` con
-- "must be owner of table" incluso para el rol admin del proyecto. Es una
-- tabla de solo lectura, sin datos de clientes ni de tenants, poblada por
-- la extensión misma; el riesgo real es nulo. Aceptado y documentado en
-- ADR 0002 en vez de forzado con permisos de superusuario que Supabase
-- gestionado no expone.
--
-- NOTA (aceptado): el advisor marca `postgis` como instalado en el schema
-- `public`. Mover extensiones de schema en un proyecto ya inicializado
-- requiere recrear objetos dependientes (route_points/services usan tipos
-- base, no tipos de PostGIS todavía) y no aporta beneficio de seguridad
-- real en este caso porque no se están usando los tipos `geography`/`geometry`
-- de PostGIS en producción (el cálculo de distancia usa Haversine puro).
-- Documentado para revisión en Fase 2 si se migra a tipos `geography`.
