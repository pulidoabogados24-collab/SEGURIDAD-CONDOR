// ============================================================================
// admin-provision-user
// Crea un usuario (vigilante, supervisor, admin, cliente) con rol y empresa
// asignados de forma segura. Nunca se hace desde el frontend directamente:
// el frontend NO tiene el service_role key. Esta función sí lo usa (vive en
// el servidor de Supabase, no se expone al navegador).
//
// Reglas de autorización:
//  - super_admin puede crear admin/supervisor/guard/client en CUALQUIER empresa,
//    o crear un nuevo admin al dar de alta una empresa nueva.
//  - admin (de su propia empresa) solo puede crear supervisor/guard en su
//    propia empresa.
//  - Nadie más puede llamar esta función.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return json({ error: "Método no permitido." }, 405);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "No autenticado." }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: callerProfile, error: profileErr } = await admin
      .from("user_profiles")
      .select("id, role, company_id, is_active")
      .eq("id", userData.user.id)
      .single();

    if (profileErr || !callerProfile || !callerProfile.is_active) {
      return json({ error: "Perfil de usuario no encontrado o inactivo." }, 403);
    }

    const body = await req.json();
    const { email, password, full_name, phone, document_id, role, company_id, badge_code, default_service_id } = body;

    if (!email || !password || !full_name || !role) {
      return json({ error: "Faltan campos obligatorios (email, password, full_name, role)." }, 400);
    }

    const allowedRoles = ["admin", "supervisor", "guard", "client"];
    if (!allowedRoles.includes(role)) {
      return json({ error: "Rol inválido." }, 400);
    }

    let targetCompanyId: string | null = null;

    if (callerProfile.role === "super_admin") {
      if (role !== "admin" && !company_id) {
        return json({ error: "company_id es obligatorio para este rol." }, 400);
      }
      targetCompanyId = company_id ?? null;
    } else if (callerProfile.role === "admin") {
      if (!["supervisor", "guard"].includes(role)) {
        return json({ error: "Un administrador de empresa solo puede crear supervisores o vigilantes." }, 403);
      }
      targetCompanyId = callerProfile.company_id;
    } else {
      return json({ error: "No autorizado para crear usuarios." }, 403);
    }

    if (password.length < 8) {
      return json({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        provisioned_role: role,
        provisioned_company_id: targetCompanyId,
        full_name,
        phone: phone ?? null,
        document_id: document_id ?? null,
      },
    });

    if (createErr || !created?.user) {
      return json({ error: createErr?.message ?? "No se pudo crear el usuario." }, 400);
    }

    // Si es vigilante, crear también su fila operativa en `guards`.
    if (role === "guard") {
      const { error: guardErr } = await admin.from("guards").insert({
        id: created.user.id,
        company_id: targetCompanyId,
        badge_code: badge_code ?? null,
        default_service_id: default_service_id ?? null,
      });
      if (guardErr) {
        // Revertir creación del usuario si falla el registro operativo,
        // para no dejar usuarios "fantasma" sin fila en `guards`.
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: "Error creando el registro de vigilante: " + guardErr.message }, 400);
      }
    }

    await admin.from("audit_logs").insert({
      company_id: targetCompanyId,
      actor_user_id: callerProfile.id,
      action: "user.provision",
      entity_type: "user_profiles",
      entity_id: created.user.id,
      metadata: { role, email },
    });

    return json({ user_id: created.user.id, email, role }, 201);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
