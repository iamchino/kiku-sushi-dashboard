// ────────────────────────────────────────────────────────────────────────────
// Edge function: push-web
//
// Manda Web Push (RFC 8291 / aes128gcm + VAPID RFC 8292) a los navegadores
// suscritos en `web_push_subs`. A diferencia de `push-pedidos` (que es FCM para
// la app Android), esto llega a Chrome en el celular AUNQUE el navegador esté
// cerrado y el teléfono bloqueado — que es como lo usan cocina y los mozos.
//
//   INSERT en pedidos           → notifica a rol "cocina" (+admin)  🔥 Nuevo pedido
//   UPDATE estado → 'listo'     → notifica a rol "mozo"   (+admin)  🍣 Listo para servir
//
// Secrets requeridos (Dashboard → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY   → misma clave que VITE_VAPID_PUBLIC_KEY del front
//   VAPID_PRIVATE_KEY  → la privada (32 bytes base64url)
//   VAPID_SUBJECT      → "mailto:tu@mail.com" (opcional, default abajo)
//
// Deploy:  supabase functions deploy push-web --no-verify-jwt
// Webhook: Dashboard → Database → Webhooks → tabla pedidos, eventos
//          INSERT y UPDATE → HTTP POST a esta función.
// ────────────────────────────────────────────────────────────────────────────
import { createClient } from "npm:@supabase/supabase-js@2";

type WebhookPayload = {
  // INSERT/UPDATE/DELETE vienen del trigger sobre `pedidos`.
  // ITEM_LISTO lo manda marcar_item_listo() cuando una estación termina un
  // plato y el resto del pedido sigue en curso.
  type: "INSERT" | "UPDATE" | "DELETE" | "ITEM_LISTO" | "ITEMS_AGREGADOS";
  table: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
};

type Sub = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

// ── base64url helpers ───────────────────────────────────────────────────────
function b64uToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function bytesToB64u(b: Uint8Array): string {
  let bin = "";
  for (const byte of b) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

// ── VAPID: JWT ES256 firmado con la clave privada ───────────────────────────
async function vapidHeader(endpoint: string, pub: string, priv: string, subject: string) {
  const aud = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: "JWT", alg: "ES256" };
  const claims = { aud, exp: now + 12 * 3600, sub: subject };

  const enc = (o: unknown) => bytesToB64u(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc(header)}.${enc(claims)}`;

  // La privada VAPID es el escalar d (32 bytes). WebCrypto no importa EC en
  // crudo, así que reconstruimos el JWK usando x/y de la clave pública.
  const pubBytes = b64uToBytes(pub); // 0x04 || x(32) || y(32)
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: priv,
    x: bytesToB64u(pubBytes.slice(1, 33)),
    y: bytesToB64u(pubBytes.slice(33, 65)),
    ext: true,
  };
  const key = await crypto.subtle.importKey(
    "jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  // ECDSA en WebCrypto devuelve r||s crudo, que es justo lo que pide ES256.
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${bytesToB64u(new Uint8Array(sig))}`;
  return `vapid t=${jwt}, k=${pub}`;
}

// ── HKDF-SHA256 ─────────────────────────────────────────────────────────────
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8,
  );
  return new Uint8Array(bits);
}

// ── Cifrado aes128gcm del payload (RFC 8291) ────────────────────────────────
async function encryptPayload(sub: Sub, payload: string) {
  const uaPublic = b64uToBytes(sub.p256dh);   // 65 bytes
  const authSecret = b64uToBytes(sub.auth);   // 16 bytes

  // Par efímero del servidor.
  const eph = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"],
  ) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));

  const uaKey = await crypto.subtle.importKey(
    "raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256),
  );

  const te = new TextEncoder();
  const ikm = await hkdf(
    authSecret,
    shared,
    concat(te.encode("WebPush: info\0"), uaPublic, asPublic),
    32,
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // 0x02 = delimitador de padding del último (y único) record.
  const plaintext = concat(te.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, plaintext),
  );

  // Cabecera aes128gcm: salt(16) | rs(4) | idlen(1) | as_public(65) | ciphertext
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

async function sendOne(sub: Sub, payload: string, pub: string, priv: string, subject: string) {
  const body = await encryptPayload(sub, payload);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(sub.endpoint, pub, priv, subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "300",
      Urgency: "high",
    },
    body,
  });
  return res.status;
}

// ── Handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const payload = (await req.json()) as WebhookPayload;
    if (payload.table !== "pedidos" && payload.table !== "pedido_items") {
      return new Response("ignored", { status: 200 });
    }

    const record = payload.record ?? {};
    const old = payload.old_record ?? {};
    const mesa = record["mesa"];
    const canal = record["canal"];
    const shortId = String(record["id"] ?? "").slice(-4).toUpperCase();

    let targetRoles: string[] = [];
    let title = "";
    let body = "";
    let url = "/";

    if (payload.type === "ITEMS_AGREGADOS") {
      // El mozo sumó platos a una mesa que ya estaba en cocina. Va a cocina,
      // no al mozo: es una tarjeta nueva que alguien tiene que tomar.
      targetRoles = ["cocina", "admin"];
      title = "➕ Se agregó a un pedido";
      body = `${mesa ? `Mesa ${mesa}` : `Pedido #${shortId}`}: ${record["detalle"] ?? "platos nuevos"}`;
      url = "/cocina";
    } else if (payload.type === "ITEM_LISTO") {
      // Un plato salió y el pedido todavía no está completo: el mozo puede
      // adelantarlo en vez de esperar a que termine la otra estación.
      const nombre = record["nombre"] ?? "Un plato";
      const cantidad = record["cantidad"] ?? 1;
      const restantes = Number(record["restantes"] ?? 0);
      targetRoles = ["mozo", "admin"];
      title = "🍱 Podés adelantar un plato";
      body = `${mesa ? `Mesa ${mesa}` : `Pedido #${shortId}`}: ${cantidad}× ${nombre}`
        + (restantes > 0 ? ` · faltan ${restantes}` : "");
      url = "/platos";
    } else if (payload.type === "INSERT") {
      targetRoles = ["cocina", "admin"];
      title = "🔥 Nuevo pedido";
      body = mesa ? `Mesa ${mesa} hizo un pedido` : `Pedido #${shortId} (${canal ?? "mostrador"})`;
      url = "/operaciones";
    } else if (
      payload.type === "UPDATE" &&
      record["estado"] === "listo" &&
      old["estado"] !== "listo"
    ) {
      targetRoles = ["mozo", "admin"];
      title = "🍣 Listo para servir";
      body = mesa ? `Mesa ${mesa}: platos listos` : `Pedido #${shortId} listo para entregar`;
      url = "/platos";
    } else {
      return new Response("no-op", { status: 200 });
    }

    const pub = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const priv = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:kiku@kikusushi.com";
    if (!pub || !priv) {
      return new Response("Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY", { status: 500 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: subs } = await supabase
      .from("web_push_subs")
      .select("endpoint, p256dh, auth")
      .in("role", targetRoles);

    if (!subs?.length) return new Response("sin suscripciones", { status: 200 });

    const notifPayload = JSON.stringify({
      title,
      body,
      url,
      // Un tag por pedido reemplaza la notificación anterior del mismo pedido.
      // Los avisos por ítem llevan su propio tag: si no, el segundo plato
      // listo borraría al primero de la pantalla del mozo.
      tag: payload.table === "pedido_items"
        ? `${payload.type}-${record["pedido_id"]}-${Date.now()}`
        : `pedido-${record["id"] ?? Date.now()}`,
    });

    const stale: string[] = [];
    await Promise.all(subs.map(async (s) => {
      try {
        const status = await sendOne(s as Sub, notifPayload, pub, priv, subject);
        // 404/410 = suscripción muerta (desinstalada o permiso revocado).
        if (status === 404 || status === 410) stale.push(s.endpoint);
        else if (status >= 400) console.warn("[push-web]", status, s.endpoint);
      } catch (e) {
        console.warn("[push-web] error enviando:", e);
      }
    }));

    if (stale.length) {
      await supabase.from("web_push_subs").delete().in("endpoint", stale);
    }

    return new Response(`enviadas: ${subs.length - stale.length}`, { status: 200 });
  } catch (e) {
    console.error("[push-web]", e);
    return new Response(`error: ${e instanceof Error ? e.message : e}`, { status: 500 });
  }
});
