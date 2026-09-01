-- ============================================================================
-- 0010_revoke_public_execute.sql
-- Postgres otorga EXECUTE a PUBLIC por defecto al crear una función.
-- El REVOKE anterior (0009) solo quitó el grant directo a 'anon'/'authenticated',
-- pero ambos heredaban acceso vía PUBLIC. Se corrige revocando de PUBLIC y
-- re-otorgando explícitamente solo a los roles que sí deben poder ejecutar.
-- Verificado con has_function_privilege() tras aplicar: anon/public = false
-- en todas, authenticated = true solo en las de uso normal de la app.
-- ============================================================================

revoke execute on function current_company_id() from public;
revoke execute on function current_user_role() from public;
revoke execute on function is_super_admin() from public;
revoke execute on function is_company_admin() from public;
revoke execute on function is_admin_or_supervisor() from public;
revoke execute on function has_client_access(uuid) from public;
revoke execute on function log_audit(text, text, uuid, jsonb) from public;
revoke execute on function register_checkpoint_scan(uuid, uuid, uuid, timestamptz, double precision, double precision, double precision, boolean) from public;
revoke execute on function finish_route_session(uuid) from public;
revoke execute on function create_incident(uuid, uuid, uuid, uuid, incident_type, text, incident_priority, double precision, double precision, timestamptz, boolean) from public;
revoke execute on function sweep_operational_alerts() from public;
revoke execute on function prevent_self_privilege_escalation() from public;
revoke execute on function handle_new_auth_user() from public;
revoke execute on function set_updated_at() from public;
revoke execute on function haversine_meters(double precision, double precision, double precision, double precision) from public;

grant execute on function current_company_id() to authenticated;
grant execute on function current_user_role() to authenticated;
grant execute on function is_super_admin() to authenticated;
grant execute on function is_company_admin() to authenticated;
grant execute on function is_admin_or_supervisor() to authenticated;
grant execute on function has_client_access(uuid) to authenticated;
grant execute on function log_audit(text, text, uuid, jsonb) to authenticated;
grant execute on function register_checkpoint_scan(uuid, uuid, uuid, timestamptz, double precision, double precision, double precision, boolean) to authenticated;
grant execute on function finish_route_session(uuid) to authenticated;
grant execute on function create_incident(uuid, uuid, uuid, uuid, incident_type, text, incident_priority, double precision, double precision, timestamptz, boolean) to authenticated;
grant execute on function haversine_meters(double precision, double precision, double precision, double precision) to authenticated;

-- sweep_operational_alerts, prevent_self_privilege_escalation, handle_new_auth_user,
-- set_updated_at son de uso exclusivo del sistema (triggers o service_role vía
-- Edge Function con cron) y no reciben grant a 'authenticated' ni 'anon'.
-- Los triggers siguen funcionando: se ejecutan con los privilegios del rol
-- que definió la función (SECURITY DEFINER) o del owner de la tabla, no
-- requieren que el rol que dispara el UPDATE/INSERT tenga EXECUTE directo.
