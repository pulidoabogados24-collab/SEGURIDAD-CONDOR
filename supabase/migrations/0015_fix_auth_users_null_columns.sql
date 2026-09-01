-- ============================================================================
-- 0015_fix_auth_users_null_columns.sql
-- BUG CRÍTICO: el login estaba completamente roto para todos los usuarios
-- demo sembrados en 0012_seed_super_admin_and_demo.sql.
--
-- Causa raíz: esa migración insertó filas directamente en auth.users (no a
-- través de la API de GoTrue/signup, porque no había forma de exponer el
-- flujo de registro público en este proyecto). Varias columnas de texto que
-- GoTrue usa internamente para flujos de cambio de email/teléfono
-- (email_change, email_change_token_new, etc.) son NULLABLE a nivel de
-- Postgres, pero el código Go de GoTrue las escanea hacia campos string no
-- punteros. Un NULL ahí produce:
--   "error finding user: sql: Scan error on column index 8,
--    name \"email_change\": converting NULL to string is unsupported"
-- con HTTP 500 "Database error querying schema" en CUALQUIER intento de
-- login (password grant) para esos usuarios. Verificado directamente
-- contra /auth/v1/token?grant_type=password y confirmado en los logs de
-- auth_logs del proyecto.
--
-- Corrección: normalizar a '' (cadena vacía, el valor que GoTrue espera y
-- usa él mismo tras un signup normal) todas las columnas de texto
-- relacionadas con estos flujos que estén en NULL. Y para que este bug no
-- pueda reaparecer si en el futuro se siembran más usuarios directamente
-- (branches de prueba, restauración de demo, etc.), se aplica sobre TODA la
-- tabla auth.users, no solo sobre los usuarios demo actuales.
-- ============================================================================

update auth.users set
  email_change = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  reauthentication_token = coalesce(reauthentication_token, ''),
  email_change_confirm_status = coalesce(email_change_confirm_status, 0)
where
  email_change is null
  or email_change_token_new is null
  or email_change_token_current is null
  or phone_change is null
  or phone_change_token is null
  or confirmation_token is null
  or recovery_token is null
  or reauthentication_token is null
  or email_change_confirm_status is null;
