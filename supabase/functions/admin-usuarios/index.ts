// ────────────────────────────────────────────────────────────────────────────
// Edge function: admin-usuarios
//
// Permite al usuario de FINANZAS administrar los logins del sistema desde la
// página Personal del dashboard (sin entrar al panel de Supabase):
//
//   { action: "listar" }                                → lista usuarios (id, email, rol, vínculo)
//   { action: "crear",    email, password, role? }      → crea usuario (rol default: 'empleado')
//   { action: "eliminar", user_id }                     → elimina usuario (y desvincula empleados)
//   { action: "password", user_id, password }           → resetea la contraseña
//
// Seguridad:
//   * Requiere JWT válido (deploy SIN --no-verify-jwt).
//   * Además valida en la BD que el llamador sea el usuario de Finanzas
//     vía la RPC is_finanzas_user() (la lista de emails vive en UN lugar).
//   * No permite eliminarse a sí mismo ni tocar al usuario de Finanzas.
//
// Deploy:  supabase functions deploy admin-usuarios
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY las inyecta
//  Supabase automáticamente; no hay secrets que configurar.)
// ────────────────────────────────────────────────────────────────────────────
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

const VALID_ROLES = ["empleado", "mozo", "cocina", "admin"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Método no permitido", 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── 1) Autenticación + autorización (solo Finanzas) ────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData?.user) return errorResponse("No autenticado", 401);

  const { data: esFinanzas, error: finErr } = await caller.rpc("is_finanzas_user");
  if (finErr) return errorResponse(`Error validando permisos: ${finErr.message}`, 500);
  if (!esFinanzas) return errorResponse("Solo el usuario de Finanzas puede administrar usuarios", 403);

  const admin = createClient(url, serviceKey);

  // Emails intocables: el propio llamador (Finanzas) no se puede autodestruir.
  const callerId = userData.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido");
  }
  const action = String(body.action ?? "");

  try {
    // ── listar ────────────────────────────────────────────────────────────
    if (action === "listar") {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) throw error;

      // Vínculo usuario ↔ empleado para mostrar en la UI.
      const { data: empleados } = await admin
        .from("empleados")
        .select("id, nombre, apellido, user_id, activo")
        .not("user_id", "is", null);

      const vinculos = new Map(
        (empleados ?? []).map((e) => [
          e.user_id as string,
          { empleado_id: e.id, nombre: `${e.nombre} ${e.apellido ?? ""}`.trim(), activo: e.activo },
        ]),
      );

      const usuarios = (data?.users ?? []).map((u) => ({
        id: u.id,
        email: u.email,
        role: (u.app_metadata as Record<string, unknown>)?.role ?? "admin",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        empleado: vinculos.get(u.id) ?? null,
        es_yo: u.id === callerId,
      }));
      return jsonResponse({ ok: true, usuarios });
    }

    // ── crear ─────────────────────────────────────────────────────────────
    if (action === "crear") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const role = VALID_ROLES.includes(String(body.role)) ? String(body.role) : "empleado";

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errorResponse("Email inválido");
      if (password.length < 8) return errorResponse("La contraseña debe tener al menos 8 caracteres");

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role },
      });
      if (error) throw error;
      return jsonResponse({ ok: true, user: { id: data.user?.id, email, role } });
    }

    // ── eliminar ──────────────────────────────────────────────────────────
    if (action === "eliminar") {
      const userId = String(body.user_id ?? "");
      if (!userId) return errorResponse("Falta user_id");
      if (userId === callerId) return errorResponse("No podés eliminar tu propio usuario");

      const { data: target, error: getErr } = await admin.auth.admin.getUserById(userId);
      if (getErr) throw getErr;

      // Protección extra: nunca borrar un usuario habilitado para Finanzas.
      // (Misma lista que is_finanzas_user() en la BD y FINANZAS_EMAILS en el front.)
      const PROTEGIDOS = ["finanzas@kikusushi.com.ar"];
      const emailTarget = (target?.user?.email ?? "").toLowerCase();
      if (PROTEGIDOS.includes(emailTarget)) {
        return errorResponse("No se puede eliminar el usuario de Finanzas");
      }

      // Desvincular el empleado (si lo hay) antes de borrar el login.
      await admin.from("empleados").update({ user_id: null }).eq("user_id", userId);

      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    // ── password ──────────────────────────────────────────────────────────
    if (action === "password") {
      const userId = String(body.user_id ?? "");
      const password = String(body.password ?? "");
      if (!userId) return errorResponse("Falta user_id");
      if (password.length < 8) return errorResponse("La contraseña debe tener al menos 8 caracteres");

      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    return errorResponse(`Acción desconocida: ${action}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
