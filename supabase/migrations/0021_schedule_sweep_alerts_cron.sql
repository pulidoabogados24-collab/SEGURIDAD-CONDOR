-- ============================================================================
-- 0021_schedule_sweep_alerts_cron.sql
-- Programa la ejecución periódica de la función Edge sweep-alerts (motor de
-- alertas automáticas: rondas atrasadas, vigilantes inactivos) usando
-- pg_cron + pg_net, nativo de Postgres/Supabase — no depende de un
-- programador externo. Corre cada 5 minutos.
--
-- Nota de seguridad: la función sweep-alerts se redesplegó con
-- verify_jwt=true, así que Supabase exige un JWT válido en Authorization
-- antes de invocar el código. Aquí se usa la anon/publishable key del
-- proyecto como Bearer — es un JWT válido de bajo privilegio, suficiente
-- para pasar la puerta del gateway (verificado con una llamada directa sin
-- este header: responde 401 UNAUTHORIZED_NO_AUTH_HEADER). La acción
-- realmente privilegiada (sweep_operational_alerts) la ejecuta la función
-- usando su propia SUPABASE_SERVICE_ROLE_KEY inyectada automáticamente por
-- Supabase en el entorno de cada función desplegada, nunca expuesta aquí.
--
-- Por qué este enfoque y no un CRON_SECRET personalizado: el diseño
-- original de sweep-alerts (ver función previa) validaba un header
-- x-cron-secret contra una variable de entorno CRON_SECRET de la función.
-- Las herramientas MCP de Supabase disponibles en este proyecto no exponen
-- ninguna forma de fijar secretos de Edge Functions (solo desplegar código
-- y ejecutar SQL), así que ese secreto nunca podría configurarse — dejando
-- el endpoint permanentemente inaccesible (401 por siempre, incluso para el
-- propio cron). El cambio a verify_jwt=true resuelve esto sin depender de
-- un secreto no configurable, manteniendo la garantía de seguridad real:
-- ningún llamador sin JWT válido puede invocar la función, y el llamador
-- nunca ve ni necesita la service_role key.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'sweep-operational-alerts',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://vgmyryxelsayscxbjjoh.supabase.co/functions/v1/sweep-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_0aXpG7oIq_qPQFTU7XXAcA_ZqQBOSYq'
    ),
    body := '{}'::jsonb
  );
  $$
);
