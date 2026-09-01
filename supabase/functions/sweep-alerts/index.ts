// ============================================================================
// sweep-alerts
// Job periodico invocado por pg_cron + pg_net cada 5 minutos (ver migracion
// 0021_schedule_sweep_alerts_cron.sql). Ejecuta con service_role porque
// sweep_operational_alerts() no tiene grant a 'authenticated' ni 'anon' (es
// exclusivamente de sistema).
//
// Autenticacion: verify_jwt=true en el despliegue de esta funcion, asi que
// la puerta de entrada de Supabase ya exige un JWT valido en Authorization
// antes de que este codigo se ejecute -- no se necesita un secreto custom
// (CRON_SECRET) que no hay forma de configurar via las herramientas MCP
// disponibles en este entorno. El llamador (pg_net) usa la anon key del
// proyecto como Bearer token, que es un JWT valido reconocido por el
// gateway pero de bajo privilegio; la accion realmente privilegiada (correr
// sweep_operational_alerts) ocurre aqui adentro usando
// SUPABASE_SERVICE_ROLE_KEY, que Supabase inyecta automaticamente en el
// entorno de cada funcion desplegada -- nunca se expone al llamador.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (_req: Request) => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await admin.rpc("sweep_operational_alerts");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ alerts_created: data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
