// ────────────────────────────────────────────────────────────────────────────
// Edge function: push-pedidos
//
// Recibe el Database Webhook de Supabase sobre la tabla `pedidos` y manda
// notificaciones push (FCM HTTP v1) a los dispositivos registrados en
// `device_tokens`, incluso con la app cerrada.
//
//   INSERT en pedidos            → notifica a rol "cocina" (+admin)
//   UPDATE estado → 'listo'      → notifica a rol "mozo"   (+admin)
//
// Secrets requeridos (Dashboard → Edge Functions → push-pedidos → Secrets):
//   FCM_SERVICE_ACCOUNT  → JSON completo de la service account de Firebase
//                          (Project settings → Service accounts → Generate key)
//
// Deploy:  supabase functions deploy push-pedidos --no-verify-jwt
// Webhook: Dashboard → Database → Webhooks → tabla pedidos, eventos
//          INSERT y UPDATE → HTTP POST a esta función.
// ────────────────────────────────────────────────────────────────────────────
import { createClient } from "npm:@supabase/supabase-js@2";

type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
};

// ── FCM HTTP v1: OAuth2 con la service account ───────────────────────────────
async function getAccessToken(sa: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unsigned = `${enc(header)}.${enc(claims)}`;

  const pem = sa.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${unsigned}.${sigB64}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`OAuth FCM fallo: ${JSON.stringify(json)}`);
  return json.access_token as string;
}

async function sendPush(
  projectId: string,
  accessToken: string,
  token: string,
  title: string,
  body: string,
) {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          android: {
            priority: "HIGH",
            notification: { sound: "default", channel_id: "pedidos" },
          },
        },
      }),
    },
  );
  // 404/400 → token vencido o desinstalado: lo limpiamos.
  return res.status;
}

Deno.serve(async (req) => {
  try {
    const payload = (await req.json()) as WebhookPayload;
    if (payload.table !== "pedidos") {
      return new Response("ignored", { status: 200 });
    }

    const record = payload.record ?? {};
    const old = payload.old_record ?? {};

    let targetRoles: string[] = [];
    let title = "";
    let body = "";
    const mesa = record["mesa"];
    const canal = record["canal"];

    if (payload.type === "INSERT") {
      targetRoles = ["cocina", "admin"];
      title = "🔥 Nuevo pedido";
      body = mesa ? `Mesa ${mesa} hizo un pedido` : `Pedido nuevo (${canal ?? "mostrador"})`;
    } else if (
      payload.type === "UPDATE" &&
      record["estado"] === "listo" &&
      old["estado"] !== "listo"
    ) {
      targetRoles = ["mozo", "admin"];
      title = "🍣 Pedido listo";
      body = mesa ? `Mesa ${mesa}: platos listos para servir` : "Pedido listo para entregar";
    } else {
      return new Response("no-op", { status: 200 });
    }

    const sa = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT") ?? "{}");
    if (!sa.client_email) {
      return new Response("FCM_SERVICE_ACCOUNT no configurado", { status: 500 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tokens } = await supabase
      .from("device_tokens")
      .select("token, role")
      .in("role", targetRoles);

    if (!tokens?.length) return new Response("sin dispositivos", { status: 200 });

    const accessToken = await getAccessToken(sa);
    const stale: string[] = [];

    await Promise.all(
      tokens.map(async ({ token }) => {
        const status = await sendPush(sa.project_id, accessToken, token, title, body);
        if (status === 404 || status === 400) stale.push(token);
      }),
    );

    if (stale.length) {
      await supabase.from("device_tokens").delete().in("token", stale);
    }

    return new Response(`enviadas: ${tokens.length - stale.length}`, { status: 200 });
  } catch (e) {
    console.error("[push-pedidos]", e);
    return new Response(`error: ${e instanceof Error ? e.message : e}`, { status: 500 });
  }
});
