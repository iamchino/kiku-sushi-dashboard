// ────────────────────────────────────────────────────────────────────────────
// Edge function: admin-usuarios
//
// Permite al usuario de FINANZAS administrar los logins del sistema desde la
// página Personal del dashboard (sin entrar al panel de Supabase):
//
//   { action: "listar" }                                → lista usuarios (id, email, rol, vínculo)
//   { action: "crear",    email, password, role? }      → crea usuario (rol default: 'empleado')
//   { action: "eliminar", user_id }                     → elimina usuario (y desvincula empleados)
//   { action: "rol",      user_id, role }               → cambia el rol y cierra sus sesiones
//   { action: "password", user_id, password }           → resetea la contraseña
//   { action: "cerrar_sesiones_rol", rol }              → cierra las sesiones de todo un rol
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

// CORS inline (sin depender de ../_shared) para poder pegar esta función
// tal cual en el editor del Dashboard de Supabase si no se usa la CLI.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ ok: false, error: message }, status);
}

// 'finanzas': acceso a Finanzas + Personal + fichaje propio, sin la operación
// del restaurante. Habilita las RLS vía is_finanzas_user() (que lee
// app_metadata.role, escrito solo con la service key desde acá).
const VALID_ROLES = ["empleado", "mozo", "cocina", "finanzas", "admin"];

// Emails con acceso a Finanzas por lista blanca histórica. Espeja
// is_finanzas_user() en la BD y FINANZAS_EMAILS en src/context/role.js.
const PROTEGIDOS = ["finanzas@kikusushi.com.ar"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Método no permitido", 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── 1) Autenticación + autorización (solo Finanzas) ────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return errorResponse("No autenticado", 401);

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // getUser(jwt): dentro de una Edge Function hay que pasar el token explícito
  // (el cliente no tiene sesión propia; el header solo aplica a PostgREST/RPC).
  const { data: userData, error: userErr } = await caller.auth.getUser(jwt);
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
      // Paginado: con perPage fijo, a partir del usuario 201 la lista quedaba
      // truncada sin ninguna señal.
      const todos: Awaited<ReturnType<typeof admin.auth.admin.listUsers>>["data"]["users"] = [];
      for (let page = 1; page <= 20; page++) {
        const { data: d, error: e } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (e) throw e;
        todos.push(...(d?.users ?? []));
        if ((d?.users ?? []).length < 200) break;
      }
      const data = { users: todos };

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
        // Default 'cocina', igual que DEFAULT_ROLE en src/context/role.js.
        // Antes decía "admin": mostraba como admin a usuarios que en realidad
        // eran cocina, y ahora que el chip de rol es editable ese valor se
        // podía guardar tal cual y elevar a alguien sin querer.
        role: (u.app_metadata as Record<string, unknown>)?.role ?? "cocina",
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

    // ── rol ───────────────────────────────────────────────────────────────
    // Cambia el rol de un usuario YA existente. Sin esto el rol solo se podía
    // fijar al crear el login, y no había forma de asignarle 'finanzas' a
    // alguien que ya tenía usuario.
    if (action === "rol") {
      const userId = String(body.user_id ?? "");
      const role = String(body.role ?? "");
      if (!userId) return errorResponse("Falta user_id");
      if (!VALID_ROLES.includes(role)) return errorResponse(`Rol inválido: ${role}`);

      // No cambiarse el rol a uno mismo: si Finanzas se auto-degrada pierde el
      // acceso a esta misma función y queda sin forma de revertirlo.
      if (userId === callerId) {
        return errorResponse("No podés cambiar tu propio rol. Pedíselo a otro usuario de Finanzas.");
      }

      const { data: target, error: getErr } = await admin.auth.admin.getUserById(userId);
      if (getErr) throw getErr;

      const emailTarget = (target?.user?.email ?? "").toLowerCase();
      // El usuario histórico de Finanzas es admin + whitelist de email. Si lo
      // pasáramos a rol 'finanzas' perdería is_admin() (y con eso caja, stock,
      // configuración) sin poder revertirlo solo, porque no puede cambiarse el
      // rol a sí mismo. Solo se le permite quedar en 'admin'.
      if (PROTEGIDOS.includes(emailTarget) && role !== "admin") {
        return errorResponse(
          "El usuario histórico de Finanzas tiene que seguir siendo admin: ya accede a Finanzas por email.",
        );
      }

      // Merge: preservamos el resto de app_metadata (provider, providers, etc.).
      const metaActual = (target?.user?.app_metadata ?? {}) as Record<string, unknown>;
      const { error } = await admin.auth.admin.updateUserById(userId, {
        app_metadata: { ...metaActual, role },
      });
      if (error) throw error;

      // El rol viaja dentro del JWT, así que hay que invalidar la sesión para
      // que el cambio tenga efecto. Va por RPC: auth.admin.signOut() recibe el
      // JWT del usuario, no su id, así que pasarle el uuid no cerraba nada.
      const { error: outErr } = await caller.rpc("cerrar_sesiones_de_usuario", { p_user_id: userId });
      if (outErr) {
        return jsonResponse({
          ok: true,
          user: { id: userId, email: emailTarget, role },
          warning: `Rol cambiado, pero no se pudieron cerrar sus sesiones (${outErr.message}). El rol nuevo le aplica cuando expire su token.`,
        });
      }
      return jsonResponse({ ok: true, user: { id: userId, email: emailTarget, role } });
    }

    // ── cerrar_sesiones_rol ───────────────────────────────────────────────
    // Los permisos viajan en el JWT, así que un cambio en la matriz no le
    // aplica a quien ya está logueado hasta que expire su token (~1 h). Para
    // una REVOCACIÓN eso es inaceptable: la persona sigue entrando a algo que
    // ya no debería ver. Cerrando las sesiones del rol, el cambio es inmediato.
    if (action === "cerrar_sesiones_rol") {
      const rol = String(body.rol ?? "");
      if (!rol) return errorResponse("Falta rol");

      // Va por RPC, no por auth.admin.signOut(): esa API recibe el JWT del
      // usuario, NO su id. Pasarle un uuid mandaba `Bearer <uuid>`, GoTrue
      // devolvía 401 y no se cerraba nada — decía que sí y no hacía nada.
      // El RPC borra de auth.sessions y valida puede_administrar_permisos(),
      // que es el permiso correcto: is_finanzas_user() alcanza a cualquiera
      // con rol finanzas y esto puede dejar al local entero afuera.
      const { data, error } = await caller.rpc("cerrar_sesiones_de_rol", { p_rol: rol });
      if (error) return errorResponse(error.message, 403);

      return jsonResponse({ ok: true, rol, cerradas: Number(data ?? 0) });
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
