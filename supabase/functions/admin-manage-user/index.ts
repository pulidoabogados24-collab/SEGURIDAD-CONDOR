// ============================================================================
// admin-manage-user
// Gestiona usuarios YA existentes (vigilantes y supervisores): editar datos,
// desactivar/reactivar, restablecer contraseña y eliminar.
//
// Vive en el servidor porque varias de estas operaciones necesitan la clave
// service_role (cambiar contraseña, bloquear el acceso, borrar el usuario de
// auth), que jamás debe llegar al navegador. La autorización se decide AQUÍ,
// no en el panel: el panel solo esconde botones.
//
// Reglas:
//  - Un admin de empresa solo gestiona supervisores y vigilantes de SU empresa.
//  - super_admin puede gestionar los de cualquier empresa.
//  - Nadie puede gestionarse a sí mismo (evita auto-bloqueos).
//  - "Eliminar" solo funciona si la persona NO tiene historial. Con historial
//    se rechaza y se explica que debe desactivarse: borrar un vigilante con
//    rondas arrastraría sus escaneos, y ese historial es la prueba de que el
//    servicio se prestó.
//
// Acciones (body JSON { action, user_id, ... }):
//   update          full_name, phone, document_id, email, badge_code,
//                   default_service_id, route_ids[]
//   set_active      active: boolean
//   reset_password  new_password (mín. 8 caracteres)
//   delete
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MANAGEABLE_ROLES = ["guard", "supervisor"];
const BAN_FOREVER = "876000h"; // ~100 años: equivale a "bloqueado"

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "No autenticado." }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: caller } = await admin
      .from("user_profiles")
      .select("id, role, company_id, is_active")
      .eq("id", userData.user.id)
      .single();
    if (!caller || !caller.is_active) {
      return json({ error: "Perfil de usuario no encontrado o inactivo." }, 403);
    }
    if (!["admin", "super_admin"].includes(caller.role)) {
      return json({ error: "Solo un administrador puede gestionar usuarios." }, 403);
    }

    const body = await req.json();
    const action = String(body.action ?? "");
    const userId = String(body.user_id ?? "");
    if (!userId) return json({ error: "Falta user_id." }, 400);
    if (userId === caller.id) {
      return json({ error: "No puedes gestionar tu propia cuenta desde aquí." }, 400);
    }

    const { data: target } = await admin
      .from("user_profiles")
      .select("id, role, company_id, full_name, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!target) return json({ error: "Usuario no encontrado." }, 404);

    // Aislamiento entre empresas: se valida en el servidor, con la fila real.
    if (caller.role !== "super_admin" && target.company_id !== caller.company_id) {
      return json({ error: "Usuario no encontrado." }, 404);
    }
    if (!MANAGEABLE_ROLES.includes(target.role)) {
      return json({ error: "Solo se pueden gestionar vigilantes y supervisores." }, 403);
    }
    const companyId = target.company_id as string;

    // ----------------------------------------------------------------- update
    if (action === "update") {
      const patch: Record<string, unknown> = {};
      if (body.full_name !== undefined) {
        const name = String(body.full_name).trim();
        if (!name) return json({ error: "El nombre no puede estar vacío." }, 400);
        if (name.length > 120) return json({ error: "El nombre es demasiado largo." }, 400);
        patch.full_name = name;
      }
      if (body.phone !== undefined) {
        const phone = String(body.phone ?? "").trim();
        if (phone.length > 30) return json({ error: "El teléfono es demasiado largo." }, 400);
        patch.phone = phone || null;
      }
      if (body.document_id !== undefined) {
        const doc = String(body.document_id ?? "").trim();
        if (doc.length > 30) return json({ error: "El documento es demasiado largo." }, 400);
        patch.document_id = doc || null;
      }

      if (body.email !== undefined) {
        const email = String(body.email).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return json({ error: "El correo no es válido." }, 400);
        }
        const { error } = await admin.auth.admin.updateUserById(userId, {
          email,
          email_confirm: true,
        });
        if (error) return json({ error: "No se pudo cambiar el correo: " + error.message }, 400);
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await admin.from("user_profiles").update(patch).eq("id", userId);
        if (error) return json({ error: "No se pudo guardar: " + error.message }, 400);
      }

      if (target.role === "guard") {
        const gPatch: Record<string, unknown> = {};
        if (body.badge_code !== undefined) {
          const badge = String(body.badge_code ?? "").trim();
          if (badge.length > 30) return json({ error: "El código es demasiado largo." }, 400);
          gPatch.badge_code = badge || null;
        }
        if (body.default_service_id !== undefined) {
          const sid = body.default_service_id ? String(body.default_service_id) : null;
          if (sid) {
            const { data: svc } = await admin
              .from("services").select("id").eq("id", sid).eq("company_id", companyId).maybeSingle();
            if (!svc) return json({ error: "El servicio elegido no existe." }, 400);
          }
          gPatch.default_service_id = sid;
        }
        if (Object.keys(gPatch).length > 0) {
          const { error } = await admin.from("guards").update(gPatch).eq("id", userId);
          if (error) return json({ error: "No se pudo guardar: " + error.message }, 400);
        }

        // Rondas asignadas: se sincroniza el conjunto completo.
        if (Array.isArray(body.route_ids)) {
          const wanted: string[] = body.route_ids.map(String);
          if (wanted.length > 0) {
            const { data: valid } = await admin
              .from("routes").select("id").eq("company_id", companyId).in("id", wanted);
            if ((valid ?? []).length !== new Set(wanted).size) {
              return json({ error: "Alguna ronda elegida no existe." }, 400);
            }
          }
          const { data: current } = await admin
            .from("route_guards").select("route_id").eq("guard_id", userId);
          const have = new Set((current ?? []).map((r) => r.route_id as string));
          const toAdd = wanted.filter((id) => !have.has(id));
          const toRemove = [...have].filter((id) => !wanted.includes(id));
          if (toAdd.length > 0) {
            const { error } = await admin.from("route_guards").insert(
              toAdd.map((route_id) => ({ route_id, guard_id: userId, company_id: companyId })),
            );
            if (error) return json({ error: "No se pudo asignar la ronda: " + error.message }, 400);
          }
          if (toRemove.length > 0) {
            await admin.from("route_guards").delete().eq("guard_id", userId).in("route_id", toRemove);
          }
        }
      }

      await audit(admin, companyId, caller.id, "user.update", userId, { fields: Object.keys(body) });
      return json({ ok: true });
    }

    // ------------------------------------------------------------- set_active
    if (action === "set_active") {
      if (typeof body.active !== "boolean") return json({ error: "Falta el estado (active)." }, 400);
      const active: boolean = body.active;

      // 1) Bloquear/desbloquear el acceso real (no solo la bandera visual).
      const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: active ? "none" : BAN_FOREVER,
      });
      if (banErr) return json({ error: "No se pudo cambiar el acceso: " + banErr.message }, 400);

      // 2) Banderas de la aplicación.
      await admin.from("user_profiles").update({ is_active: active }).eq("id", userId);
      if (target.role === "guard") {
        await admin.from("guards").update({ is_active: active }).eq("id", userId);

        if (!active) {
          // Rondas del día que nunca arrancaron: se cancelan para que no
          // disparen alertas falsas de "ronda no iniciada".
          await admin.from("route_sessions")
            .update({ status: "canceled" })
            .eq("guard_id", userId).eq("status", "scheduled");

          // Una ronda a medias se cierra como incompleta, con su avance real.
          const { data: open } = await admin
            .from("route_sessions")
            .select("id, expected_points, completed_points")
            .eq("guard_id", userId).eq("status", "in_progress");
          for (const s of open ?? []) {
            const pct = s.expected_points > 0
              ? Math.round((s.completed_points / s.expected_points) * 1000) / 10
              : null;
            await admin.from("route_sessions").update({
              status: "incomplete",
              finished_at: new Date().toISOString(),
              compliance_pct: pct,
            }).eq("id", s.id);
          }
        } else {
          // Reactivado: se restauran las rondas de hoy en adelante que se
          // habían cancelado sin llegar a empezar.
          const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
          await admin.from("route_sessions")
            .update({ status: "scheduled" })
            .eq("guard_id", userId).eq("status", "canceled")
            .is("started_at", null).gte("scheduled_at", since);
        }
      }

      await audit(admin, companyId, caller.id, active ? "user.activate" : "user.deactivate", userId, {});
      return json({ ok: true, active });
    }

    // --------------------------------------------------------- reset_password
    if (action === "reset_password") {
      const pw = String(body.new_password ?? "");
      if (pw.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
      const { error } = await admin.auth.admin.updateUserById(userId, { password: pw });
      if (error) return json({ error: "No se pudo cambiar la contraseña: " + error.message }, 400);
      await audit(admin, companyId, caller.id, "user.reset_password", userId, {});
      return json({ ok: true });
    }

    // ----------------------------------------------------------------- delete
    if (action === "delete") {
      const blockers = await historyOf(admin, userId, target.role);
      if (blockers.length > 0) {
        return json({
          error:
            "No se puede eliminar: " + target.full_name + " ya tiene historial (" +
            blockers.join(", ") +
            "). Borrarlo destruiría ese registro. Desactívalo en su lugar: deja de poder entrar " +
            "y no se le asignan más rondas, pero su historial se conserva.",
          code: "has_history",
        }, 409);
      }

      await audit(admin, companyId, caller.id, "user.delete", userId, { name: target.full_name });
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        return json({
          error: "No se pudo eliminar (probablemente tiene registros asociados). Desactívalo en su lugar.",
          code: "delete_failed",
        }, 409);
      }
      return json({ ok: true });
    }

    return json({ error: "Acción no reconocida." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

// Qué historial tiene la persona. Si la lista no está vacía, no se borra.
// deno-lint-ignore no-explicit-any
async function historyOf(admin: any, userId: string, role: string): Promise<string[]> {
  const out: string[] = [];
  const count = async (table: string, col: string, extra?: (q: any) => any) => {
    let q = admin.from(table).select("id", { count: "exact", head: true }).eq(col, userId);
    if (extra) q = extra(q);
    const { count: n } = await q;
    return n ?? 0;
  };

  if (role === "guard") {
    const scans = await count("checkpoint_scans", "guard_id");
    if (scans) out.push(`${scans} escaneos`);
    const incidents = await count("incidents", "guard_id");
    if (incidents) out.push(`${incidents} novedades`);
    const logs = await count("daily_logs", "guard_id");
    if (logs) out.push(`${logs} minutas`);
    const alerts = await count("alerts", "guard_id");
    if (alerts) out.push(`${alerts} alertas`);
    const locs = await count("guard_locations", "guard_id");
    if (locs) out.push("recorridos de ubicación");
    const shifts = await count("shifts", "guard_id");
    if (shifts) out.push(`${shifts} turnos`);
    const sessions = await count("route_sessions", "guard_id", (q) =>
      q.not("status", "in", "(scheduled,canceled)"));
    if (sessions) out.push(`${sessions} rondas realizadas o vencidas`);
  } else {
    const reviewed = await count("incidents", "reviewed_by");
    if (reviewed) out.push(`${reviewed} novedades revisadas`);
    const acked = await count("alerts", "acknowledged_by");
    if (acked) out.push(`${acked} alertas atendidas`);
  }
  const audits = await count("audit_logs", "actor_user_id");
  if (audits) out.push(`${audits} acciones registradas`);
  return out;
}

// deno-lint-ignore no-explicit-any
async function audit(admin: any, companyId: string, actor: string, action: string, entityId: string, metadata: unknown) {
  await admin.from("audit_logs").insert({
    company_id: companyId,
    actor_user_id: actor,
    action,
    entity_type: "user_profiles",
    entity_id: entityId,
    metadata,
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
