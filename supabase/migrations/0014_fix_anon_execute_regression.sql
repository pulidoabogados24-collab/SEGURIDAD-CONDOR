-- ============================================================================
-- 0014_fix_anon_execute_regression.sql
-- La migración 0013 recreó register_checkpoint_scan y create_incident con
-- CREATE OR REPLACE cambiando la firma (parámetros con DEFAULT, reordenados).
-- Postgres/Supabase trató esto como una función nueva y otorgó por defecto
-- EXECUTE directo a anon/authenticated sobre la función nueva expuesta en el
-- esquema public (grant directo, no solo vía PUBLIC), revirtiendo
-- silenciosamente el hardening de la migración 0010 para estas dos
-- funciones específicas. Verificado con has_function_privilege():
-- anon_can_exec había vuelto a true para ambas.
--
-- Corrección: revocar EXECUTE explícitamente de anon (y de PUBLIC por
-- completitud) en ambas funciones, dejando solo authenticated con acceso,
-- igual que el resto de funciones sensibles del sistema. Verificado de
-- nuevo tras aplicar: anon = false, authenticated = true, public = false
-- en ambas funciones.
--
-- Lección para futuras migraciones: cualquier CREATE OR REPLACE que cambie
-- la firma de una función sensible debe ir seguido SIEMPRE de un REVOKE
-- FROM PUBLIC + REVOKE FROM anon explícito, no asumir que los grants
-- anteriores persisten.
-- ============================================================================

revoke execute on function register_checkpoint_scan(uuid, uuid, uuid, timestamptz, double precision, double precision, double precision, boolean) from anon;
revoke execute on function register_checkpoint_scan(uuid, uuid, uuid, timestamptz, double precision, double precision, double precision, boolean) from public;
grant execute on function register_checkpoint_scan(uuid, uuid, uuid, timestamptz, double precision, double precision, double precision, boolean) to authenticated;

revoke execute on function create_incident(uuid, uuid, incident_type, text, incident_priority, timestamptz, uuid, uuid, double precision, double precision, boolean) from anon;
revoke execute on function create_incident(uuid, uuid, incident_type, text, incident_priority, timestamptz, uuid, uuid, double precision, double precision, boolean) from public;
grant execute on function create_incident(uuid, uuid, incident_type, text, incident_priority, timestamptz, uuid, uuid, double precision, double precision, boolean) to authenticated;
