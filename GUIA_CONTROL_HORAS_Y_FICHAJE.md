# Guía: Módulo de Control de Horas y Fichaje (Kiku Sushi)

> Documento de diseño e implementación para construir, dentro del dashboard actual, una sección que registre las horas de cada empleado (fichaje entrada/salida), las contabilice y permita liquidar el pago por hora — todo centralizado. Pensado para entregárselo a **Fable** (o a cualquier IA de desarrollo) y ejecutarlo por fases.
>
> Referencia que inspiró el pedido: **Anviz CrossChex Standard** (control de asistencia + acceso biométrico). Acá lo adaptamos a una versión **web, sin hardware**, apoyada en tu stack existente (React + Supabase).

---

## 1. Resumen ejecutivo

Vamos a construir un módulo de **control horario** con tres caras:

1. **Fichaje del empleado (QR fijo + login).** Cada empleado tiene su usuario. Al entrar y salir escanea un **QR fijo pegado en el local**; eso registra la marca a nombre de *su* sesión. El QR fijo obliga a estar físicamente en el local y el login evita que uno fiche por otro.
2. **Contabilización de horas.** Cada marca es un evento inmutable (`entrada`/`salida`). El sistema empareja marcas en jornadas y suma minutos por período.
3. **Liquidación por hora.** `horas del período × valor hora` = total a pagar. Ese total se registra como **egreso** en el módulo de Finanzas que ya existe (categoría `sueldos`), así queda todo centralizado y no duplicamos la contabilidad.

**Decisiones tomadas** (definen todo el diseño):

| Tema | Decisión |
|---|---|
| Método de fichaje | **Login individual + escaneo de un QR fijo** del local |
| Cálculo de pago | **Por hora trabajada** (valor hora × horas) |
| Alcance | **Solo horas para pagar** (sin control de acceso a puertas ni permisos nuevos) |
| Horarios | **Mixto**: turnos de referencia flexibles; se registran desvíos sin bloquear |

---

## 2. Qué es la app de referencia y cómo la adaptamos

**CrossChex Standard** es un software de escritorio de Anviz para asistencia y control de acceso con dispositivos biométricos (huella/rostro) conectados por TCP/IP. Sus cinco bloques son: *Personnel Management*, *Scheduling*, *Device Management*, *Data Management* y *Admin Setup*. Nosotros tomamos **el concepto** (registrar entradas/salidas, sumar horas, exportar reportes) pero **descartamos el hardware biométrico**: en su lugar el "dispositivo" es un **QR fijo** y la identidad la aporta el **login de Supabase**.

Mapeo directo de cada bloque de CrossChex a tu proyecto:

| CrossChex (referencia) | Cómo lo resolvemos en Kiku | Dónde vive |
|---|---|---|
| **Personnel Management** (legajo, datos, permisos) | Ya existe la tabla `empleados`. La extendemos con `user_id` (login) y `valor_hora`. | `supabase` + página **Personal** |
| **Scheduling** (turnos/shifts) | Tabla `turnos` de **referencia** (mixto): compara fichaje real vs. esperado y marca tardanza/ausencia, sin bloquear. | tabla `turnos` (fase opcional) |
| **Device Management** (dispositivos biométricos) | **QR fijo del local** = "punto de fichaje". Tabla `puntos_fichaje` con un token. Sin hardware. | tabla `puntos_fichaje` |
| **Data Management** (registros + reportes/export) | Tabla `fichajes` (log de marcas) + vista `vista_jornadas` (empareja y suma) + export CSV. | tablas + página **Personal** |
| **Admin Setup** (permisos multinivel) | Se reutiliza el sistema de roles/RLS actual (`is_admin()`, `is_finanzas_user()`) + un rol nuevo `empleado` mínimo. | `role.js` + RLS |

**Diferencia clave de filosofía:** CrossChex confía en el biométrico para probar "quién sos". Nosotros lo resolvemos con **login (quién sos) + QR fijo (dónde estás)**. Es más barato, no requiere comprar equipos y aprovecha que ya tenés autenticación y app Android (Capacitor).

---

## 3. Arquitectura de la solución

### 3.1 Los tres actores

- **Empleado** (rol nuevo `empleado`): entra con su usuario, ficha por QR, ve *sus* horas. No ve nada más del dashboard.
- **Encargado de pagos** (usuario de **Finanzas**, `is_finanzas_user()`): administra el legajo, corrige fichajes, define valor hora y turnos, y genera la liquidación → egreso. Es quien ya maneja `empleados`/`egresos` hoy.
- **Sistema**: empareja marcas en jornadas y calcula horas y montos.

> **Nota de permisos (importante).** Hoy la tabla `empleados` es **exclusiva de Finanzas** por RLS (ni el dueño la ve, por diseño — ver `20260628010000_finanzas_acceso.sql`). Para respetar esa privacidad, el módulo de horas administrativo también queda detrás de `is_finanzas_user()`. Los **empleados** solo pueden leer/crear **lo suyo**. Si más adelante querés que el dueño (admin) también gestione horas, se cambia en **un solo lugar** (las políticas RLS y el guard del front).

### 3.2 Flujo de fichaje (QR fijo)

```
[Empleado llega al local]
      │  abre la cámara del celu y escanea el QR pegado en la puerta
      ▼
El QR contiene:  https://TU-DOMINIO/fichar?ficha=TOKEN_DEL_LOCAL
      │
      ▼
[Se abre la web/app ya logueado] ──► /fichar lee ?ficha=TOKEN
      │                                    │
      │  ¿tiene sesión?  no ──► login ──► vuelve a /fichar
      ▼
Llama a la función  fichar(TOKEN)  en Supabase
      │
      ├─ valida que el usuario esté vinculado a un empleado activo
      ├─ valida que TOKEN sea un punto de fichaje activo
      ├─ evita doble-scan (< 60 s)
      ├─ decide entrada o salida según la última marca
      └─ inserta la marca (a nombre del empleado logueado)
      ▼
Muestra: "✓ Entrada registrada 18:03"  /  "✓ Salida registrada 00:12"
```

**Por qué este flujo:** el QR fijo codifica una **URL**, así el celular la abre con la cámara nativa (no hace falta librería de escaneo en v1). La marca se crea **siempre a nombre del usuario logueado**, no del QR — por eso nadie puede fichar por otro con solo tener la foto del QR. El QR fijo aporta la prueba de "estoy en el local".

### 3.3 Anti-fraude (buddy punching)

Buenas prácticas de la industria para fichaje por QR, aplicadas acá:

- **Identidad por sesión, no por código.** La marca se ata a `auth.uid()`. Un empleado no puede generar la marca de otro. (Base del diseño.)
- **QR fijo = presencia física.** Para fichar hay que estar frente al QR del local.
- **Bloqueo de doble-scan** (60 s) para evitar marcas dobles accidentales.
- **Registro de correcciones.** Toda edición manual guarda `registrado_por`; el encargado revisa marcas editadas por alguien distinto al dueño de la marca.
- **Opcionales para reforzar (fase futura):**
  - *Geocerca (geofence):* validar coordenadas del celu contra la ubicación del local antes de aceptar la marca.
  - *Token rotativo:* que el QR muestre un código que cambia cada X minutos (pantalla/tablet en la puerta) en vez de un adhesivo fijo, para que una foto vieja no sirva.
  - *Foto/selfie al fichar* como confirmación visual.

---

## 4. Modelo de datos (SQL para Supabase)

Todo es **add-only** (no toca datos existentes) y sigue tus convenciones: helpers `is_finanzas_user()` / `set_updated_at()`, RLS, e `notify pgrst` al final. Creá **una** migración nueva:

`supabase/migrations/20260712000000_control_horas.sql`

```sql
-- ============================================================
-- Migración: Control de Horas y Fichaje
--   * empleados      → +user_id (login) +valor_hora (pago por hora)
--   * puntos_fichaje → el/los QR fijos del local
--   * fichajes       → log inmutable de marcas (entrada/salida)
--   * turnos         → turnos de referencia (mixto, no bloqueante)
--   * vista_jornadas → empareja marcas y calcula minutos trabajados
--   * fichar()       → RPC que registra una marca de forma segura
--   * liquidacion_horas() → RPC que suma horas y pago por período
-- Add-only. RLS: Finanzas administra; el empleado solo ve/crea lo suyo.
-- ============================================================

-- ── 1) EMPLEADOS: vínculo con login + valor hora ─────────────────────────────
alter table public.empleados
  add column if not exists user_id    uuid references auth.users(id) on delete set null,
  add column if not exists valor_hora numeric(12,2) not null default 0 check (valor_hora >= 0);

create unique index if not exists empleados_user_id_uidx
  on public.empleados (user_id) where user_id is not null;

-- El empleado puede leer SOLO su propia ficha (nombre, valor_hora, etc.).
-- (La política "empleados finanzas manage" FOR ALL ya existe y se conserva.)
drop policy if exists "empleados self read" on public.empleados;
create policy "empleados self read"
  on public.empleados
  for select
  to authenticated
  using (user_id = auth.uid());

-- ── 2) PUNTOS DE FICHAJE (los QR fijos) ──────────────────────────────────────
create table if not exists public.puntos_fichaje (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,                 -- 'Puerta local', 'Cocina', etc.
  token      text not null unique,          -- lo que codifica el QR
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.puntos_fichaje enable row level security;

drop policy if exists "puntos finanzas manage" on public.puntos_fichaje;
create policy "puntos finanzas manage"
  on public.puntos_fichaje
  for all to authenticated
  using (public.is_finanzas_user())
  with check (public.is_finanzas_user());

-- Semilla: un punto por defecto. Reemplazá el token por uno propio y secreto.
insert into public.puntos_fichaje (nombre, token)
values ('Puerta local', encode(gen_random_bytes(12), 'hex'))
on conflict do nothing;

-- ── 3) FICHAJES (log inmutable de marcas) ────────────────────────────────────
create table if not exists public.fichajes (
  id             uuid primary key default gen_random_uuid(),
  empleado_id    uuid not null references public.empleados(id) on delete cascade,
  tipo           text not null check (tipo in ('entrada','salida')),
  ts             timestamptz not null default now(),
  punto_id       uuid references public.puntos_fichaje(id) on delete set null,
  origen         text not null default 'qr' check (origen in ('qr','manual','app')),
  nota           text,
  registrado_por uuid default auth.uid(),   -- quién creó/corrigió la marca
  created_at     timestamptz not null default now()
);

create index if not exists fichajes_empleado_ts_idx
  on public.fichajes (empleado_id, ts desc);

alter table public.fichajes enable row level security;

-- Finanzas administra todo (ver/crear/corregir/borrar).
drop policy if exists "fichajes finanzas manage" on public.fichajes;
create policy "fichajes finanzas manage"
  on public.fichajes
  for all to authenticated
  using (public.is_finanzas_user())
  with check (public.is_finanzas_user());

-- El empleado puede LEER solo sus propias marcas.
drop policy if exists "fichajes self read" on public.fichajes;
create policy "fichajes self read"
  on public.fichajes
  for select to authenticated
  using (empleado_id in (select id from public.empleados where user_id = auth.uid()));

-- ── 4) TURNOS de referencia (mixto, no bloqueante) ───────────────────────────
create table if not exists public.turnos (
  id          uuid primary key default gen_random_uuid(),
  empleado_id uuid references public.empleados(id) on delete cascade,
  dia_semana  smallint check (dia_semana between 0 and 6),  -- 0=domingo ... 6=sábado
  hora_inicio time not null,
  hora_fin    time not null,
  activo      boolean not null default true,
  nota        text,
  created_at  timestamptz not null default now()
);

alter table public.turnos enable row level security;

drop policy if exists "turnos finanzas manage" on public.turnos;
create policy "turnos finanzas manage"
  on public.turnos
  for all to authenticated
  using (public.is_finanzas_user())
  with check (public.is_finanzas_user());

drop policy if exists "turnos self read" on public.turnos;
create policy "turnos self read"
  on public.turnos
  for select to authenticated
  using (empleado_id in (select id from public.empleados where user_id = auth.uid()));

-- ── 5) VISTA_JORNADAS: empareja cada 'entrada' con la 'salida' siguiente ──────
create or replace view public.vista_jornadas as
with ordenados as (
  select
    empleado_id,
    tipo,
    ts,
    lead(tipo) over (partition by empleado_id order by ts) as sig_tipo,
    lead(ts)   over (partition by empleado_id order by ts) as sig_ts
  from public.fichajes
)
select
  empleado_id,
  ts     as entrada,
  sig_ts as salida,
  round(extract(epoch from (sig_ts - ts)) / 60.0)::int as minutos
from ordenados
where tipo = 'entrada' and sig_tipo = 'salida';

-- ── 6) fichar(token): registra una marca de forma segura ─────────────────────
create or replace function public.fichar(p_token text)
returns table (fichaje_id uuid, tipo text, ts timestamptz, mensaje text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp        public.empleados%rowtype;
  v_punto_id   uuid;
  v_last       public.fichajes%rowtype;
  v_tipo       text;
  v_fichaje_id uuid;
  v_ts         timestamptz;
begin
  -- 1) empleado activo vinculado al usuario logueado
  select * into v_emp
  from public.empleados
  where user_id = auth.uid() and activo
  limit 1;
  if not found then
    raise exception 'Tu usuario no está vinculado a un empleado activo.';
  end if;

  -- 2) validar el QR (punto de fichaje activo)
  select id into v_punto_id
  from public.puntos_fichaje
  where token = p_token and activo
  limit 1;
  if v_punto_id is null then
    raise exception 'QR inválido o inactivo.';
  end if;

  -- 3) última marca del empleado
  select * into v_last
  from public.fichajes
  where empleado_id = v_emp.id
  order by ts desc
  limit 1;

  -- 4) anti doble-scan (60 s)
  if v_last.id is not null and now() - v_last.ts < interval '60 seconds' then
    raise exception 'Ya fichaste hace instantes. Esperá un momento.';
  end if;

  -- 5) alternar entrada/salida
  if v_last.id is null or v_last.tipo = 'salida' then
    v_tipo := 'entrada';
  else
    v_tipo := 'salida';
  end if;

  -- 6) registrar
  insert into public.fichajes (empleado_id, tipo, ts, punto_id, origen, registrado_por)
  values (v_emp.id, v_tipo, now(), v_punto_id, 'qr', v_emp.user_id)
  returning id, ts into v_fichaje_id, v_ts;

  fichaje_id := v_fichaje_id;
  tipo       := v_tipo;
  ts         := v_ts;
  mensaje    := case when v_tipo = 'entrada' then 'Entrada registrada' else 'Salida registrada' end;
  return next;
end;
$$;

grant execute on function public.fichar(text) to authenticated;

-- ── 7) liquidacion_horas(desde, hasta): horas y pago por empleado ────────────
create or replace function public.liquidacion_horas(p_desde date, p_hasta date)
returns table (
  empleado_id uuid,
  nombre      text,
  minutos     int,
  horas       numeric,
  valor_hora  numeric,
  total       numeric
)
language sql
stable
as $$
  select
    e.id,
    trim(concat_ws(' ', e.nombre, e.apellido)),
    coalesce(sum(j.minutos), 0)::int                                as minutos,
    round(coalesce(sum(j.minutos), 0) / 60.0, 2)                    as horas,
    e.valor_hora,
    round(coalesce(sum(j.minutos), 0) / 60.0 * e.valor_hora, 2)     as total
  from public.empleados e
  left join public.vista_jornadas j
    on  j.empleado_id = e.id
    and j.salida is not null
    and j.entrada::date between p_desde and p_hasta
  where e.activo
  group by e.id, e.nombre, e.apellido, e.valor_hora
  order by e.nombre;
$$;

grant execute on function public.liquidacion_horas(date, date) to authenticated;

notify pgrst, 'reload schema';
```

**Por qué este modelo:**

- **Log de eventos inmutable** (`fichajes`) en lugar de guardar "sesiones" directamente. Es el estándar en asistencia: cada marca es auditable y las jornadas se *derivan* con `vista_jornadas`. Si alguien olvida marcar la salida, la jornada queda con `minutos` nulo → se detecta y se corrige.
- **`fichar()` con `security definer`** para poder insertar respetando la lógica (identidad, token, anti-doble) sin abrir la tabla a escritura libre.
- **`liquidacion_horas()`** es solo lectura (calcula). El pago se materializa como **egreso** desde el front, reutilizando Finanzas. No duplicamos la contabilidad.

---

## 5. Vincular empleados con sus logins

Cada empleado necesita un usuario con rol `empleado` y su fila de `empleados` apuntando a ese usuario.

**Opción simple (recomendada para arrancar), por empleado:**

1. En **Supabase → Authentication → Users → Add user**: email + contraseña.
2. En **App metadata** del usuario, poné: `{ "role": "empleado" }`.
3. En la página **Personal** del dashboard (o por SQL), seteá `empleados.user_id = <id del usuario>` y su `valor_hora`.

**Por SQL (ejemplo de vinculación):**

```sql
update public.empleados
set user_id = '<uuid-del-usuario-auth>', valor_hora = 3500
where id = '<uuid-del-empleado>';
```

> Más adelante se puede automatizar con una Edge Function que cree el usuario e inserte/actualice el empleado en un paso, pero para v1 alcanza con lo manual.

---

## 6. Frontend (React) — qué archivos tocar

### 6.1 Rol nuevo `empleado` — `src/context/role.js`

- Agregá `'empleado'` a `VALID_ROLES`.
- `getRoleFromUser`: ya lee `app_metadata.role`; con eso alcanza.
- Ruta por defecto del empleado: `/fichar`.
- Lista blanca (como el rol `mozo`):

```js
export const EMPLEADO_DEFAULT_ROUTE = '/fichar'
export const EMPLEADO_ALLOWED_ROUTES = new Set(['/fichar', '/mis-horas'])
```

- En `getDefaultRoute` y `canAccessRoute`, sumá el caso `empleado` (whitelist).

### 6.2 Rutas y layout — `src/App.jsx`

- Nuevas rutas: `/fichar`, `/mis-horas` (empleado) y `/personal` (Finanzas).
- Para el rol `empleado`, mostrá un **layout mínimo** (sin sidebar completo): una pantalla limpia con nombre, botón de fichaje y "Mis horas". Reutilizá el patrón de guard que ya tenés (`RoleGuard`).

### 6.3 Sidebar — `src/components/layout/Sidebar.jsx`

- Agregá el item **Personal** con `finanzasOnly: true` (aparece solo para el usuario de Finanzas, igual que el item Finanzas actual):

```js
{ to: '/personal', icon: Clock, label: 'Personal', finanzasOnly: true },
```

### 6.4 Hooks nuevos — `src/hooks/`

- `useFichaje.js` → `fichar(token)` (llama `supabase.rpc('fichar', { p_token: token })`), estado de hoy (dentro/fuera) y marcas del día.
- `useMisHoras.js` → lee `vista_jornadas` (self) del período actual: total de horas y estimado en $.
- `useHoras.js` (Finanzas) → `supabase.rpc('liquidacion_horas', { p_desde, p_hasta })` + CRUD de `fichajes` y `turnos`. Copiá el patrón de `useEmpleados.js` / `useEgresos.js`.

### 6.5 Páginas nuevas — `src/pages/`

- **`Fichar.jsx`** (empleado): lee `?ficha=TOKEN` de la URL; si hay token, llama `fichar()` y muestra el resultado (✓ Entrada/Salida + hora). Muestra estado actual y horas de hoy. (Opcional: botón "Escanear" con `html5-qrcode` si preferís escanear dentro de la app en vez de abrir la URL.)
- **`MisHoras.jsx`** (empleado): sus marcas del período + horas acumuladas + estimado a cobrar.
- **`Personal.jsx`** (Finanzas), con pestañas:
  - *Empleados*: legajo + `user_id` + `valor_hora` (extiende lo que ya hace `useEmpleados`).
  - *Fichajes*: log filtrable por empleado/fecha + corrección manual (crear/editar marca, queda `origen='manual'`).
  - *Turnos*: alta de turnos de referencia.
  - *Liquidación*: elegís período → tabla `liquidacion_horas` (horas y $ por empleado) → **"Registrar como egreso"**.

### 6.6 Liquidación → Egreso (centralización)

Desde la pestaña *Liquidación*, al confirmar, creás un egreso reutilizando `useEgresos.crearEgreso` con:

```js
{
  fecha: hoy,                       // YYYY-MM-DD
  categoria: 'sueldos',
  subtipo: 'sueldo',
  descripcion: `Sueldo ${nombre} · ${periodo}`,
  monto: total,                     // de liquidacion_horas
  empleado_id: empleadoId,
  periodo,                          // 'YYYY-MM'
  medio_pago: 'transferencia',      // o el que corresponda
  estado: 'pagado',
}
```

Así el pago de horas aparece automáticamente en Finanzas, sin cargar nada dos veces.

---

## 7. Generar el QR fijo del local

1. Tomá el `token` del punto de fichaje (el sembrado en la migración, o creá uno propio).
2. Armá la URL: `https://TU-DOMINIO/fichar?ficha=EL_TOKEN`.
3. Generá el QR de esa URL. Ya tenés la dependencia **`qrcode`** en el proyecto, así que se puede generar desde la misma página **Personal** (botón "Generar QR del local" que renderiza y permite imprimir).
4. Imprimí y pegá el QR en la entrada / zona de personal.

> Si en el futuro querés el token rotativo (anti-foto), mostrás el QR en una tablet en la puerta y regenerás el token cada X minutos.

---

## 8. Cálculo de horas — reglas y bordes

- **Horas del período** = suma de `minutos` de `vista_jornadas` con `entrada::date` dentro del rango, ÷ 60.
- **Total** = `horas × valor_hora` (redondeado a 2 decimales).
- **Redondeo:** por defecto minuto a minuto. Si querés redondear a bloques (ej. 15 min), se ajusta en `vista_jornadas` o en la RPC. Decisión a confirmar.
- **Olvidó marcar salida:** la jornada queda sin cerrar → no suma. Finanzas corrige en *Fichajes*. (Opcional futuro: un cron que cierre automáticamente jornadas abiertas > N horas.)
- **Jornada que cruza medianoche:** se cuenta en el día de la **entrada** (por eso agrupamos por `entrada::date`). Coherente para turnos de noche.
- **Turnos (mixto):** los `turnos` son solo referencia. Fase futura: comparar real vs esperado para mostrar tardanza/ausencia. No bloquean el fichaje.

---

## 9. Paso a paso de implementación (fases)

**Fase 0 — Preparación.** Rama nueva (`feat/control-horas`). Backup de la base (o probar primero en un proyecto Supabase de staging).

**Fase 1 — Base de datos.** Crear y correr la migración `20260712000000_control_horas.sql` (sección 4). Verificar en Supabase que existan tablas, vista, RPCs y políticas.

**Fase 2 — Logins de empleados.** Crear 1–2 usuarios de prueba con `app_metadata.role = 'empleado'`, vincular `empleados.user_id` y cargar `valor_hora` (sección 5).

**Fase 3 — Rol y navegación.** Sumar rol `empleado` en `role.js`, rutas y layout mínimo en `App.jsx`, item *Personal* en el `Sidebar` (sección 6.1–6.3).

**Fase 4 — Fichaje por QR.** Página `Fichar.jsx` + `useFichaje` + generar el QR del local (secciones 6.4–6.5, 7). Probar: escanear → entrada; volver a escanear → salida; doble-scan rechazado.

**Fase 5 — Mis Horas.** Página `MisHoras.jsx` + `useMisHoras` (el empleado ve sus horas).

**Fase 6 — Personal + Liquidación.** Página `Personal.jsx` con las 4 pestañas + handoff a egresos (secciones 6.5–6.6). Probar la liquidación de un período y su egreso.

**Fase 7 — Turnos (opcional).** ABM de turnos de referencia y comparación real vs esperado.

**Fase 8 — QA / validación.** Ver checklist (sección 11).

---

## 10. Prompts listos para Fable

Copiá/pegá cada uno cuando llegues a la fase. Todos asumen el repo actual (React + Vite + Supabase, roles en `src/context/role.js`, rutas en `src/App.jsx`).

**Prompt Fase 1 (BD):**
> En el repo del dashboard de Kiku (Supabase), creá la migración `supabase/migrations/20260712000000_control_horas.sql` con exactamente este contenido: [pegar el SQL de la sección 4]. Es add-only y usa los helpers existentes `is_finanzas_user()` y `set_updated_at()`. No modifiques otras migraciones. Al final dejá `notify pgrst, 'reload schema';`.

**Prompt Fase 3 (rol + rutas):**
> En `src/context/role.js` agregá el rol `empleado`: sumalo a `VALID_ROLES`, definí `EMPLEADO_DEFAULT_ROUTE='/fichar'` y `EMPLEADO_ALLOWED_ROUTES=Set(['/fichar','/mis-horas'])`, y contemplá el caso `empleado` en `getDefaultRoute` y `canAccessRoute` (lista blanca, igual que `mozo`). En `src/App.jsx` agregá las rutas `/fichar`, `/mis-horas` y `/personal`, y para el rol `empleado` renderizá un layout mínimo sin el Sidebar completo. En `src/components/layout/Sidebar.jsx` sumá el item `{ to:'/personal', label:'Personal', finanzasOnly:true }`.

**Prompt Fase 4 (fichaje QR):**
> Creá `src/hooks/useFichaje.js` que exponga `fichar(token)` llamando `supabase.rpc('fichar', { p_token: token })`, más el estado de hoy (dentro/fuera) leyendo `fichajes` del empleado. Creá `src/pages/Fichar.jsx`: al montar, lee `?ficha=TOKEN` de la URL; si hay token llama `fichar()` y muestra "✓ Entrada/Salida registrada HH:MM"; si no hay sesión, redirige a login y vuelve. Mostrá nombre del empleado, estado actual y horas de hoy. Usá el estilo/vars de tema del proyecto. Agregá en `Personal` un botón que genere con la lib `qrcode` el QR de `https://TU-DOMINIO/fichar?ficha=<token del punto de fichaje>` y permita imprimirlo.

**Prompt Fase 5 (mis horas):**
> Creá `src/hooks/useMisHoras.js` que lea la vista `vista_jornadas` (RLS self) del período actual y devuelva jornadas, total de horas y estimado ($ = horas × valor_hora del empleado). Creá `src/pages/MisHoras.jsx` que lo muestre de forma clara para el empleado.

**Prompt Fase 6 (personal + liquidación):**
> Creá `src/hooks/useHoras.js` (patrón de `useEgresos.js`) con: CRUD de `fichajes` y `turnos`, y `liquidacion(desde, hasta)` que llame `supabase.rpc('liquidacion_horas', {p_desde,p_hasta})`. Creá `src/pages/Personal.jsx` con pestañas Empleados (legajo + user_id + valor_hora), Fichajes (log filtrable + corrección manual con `origen='manual'`), Turnos (ABM) y Liquidación (selector de período → tabla de horas y $ por empleado → botón "Registrar como egreso" que use `useEgresos.crearEgreso` con categoria='sueldos', subtipo='sueldo', periodo 'YYYY-MM', empleado_id y monto=total). Gate por `is_finanzas_user()`.

---

## 11. Checklist de validación (QA)

- [ ] Empleado logueado escanea el QR → registra **entrada**; segundo escaneo → **salida**.
- [ ] Escaneo doble en < 60 s → rechazado con mensaje claro.
- [ ] Token de QR inválido/inactivo → rechazado.
- [ ] Usuario sin `empleado` vinculado → mensaje "no vinculado", sin crash.
- [ ] Un empleado **no** puede ver marcas ni horas de otro (RLS).
- [ ] El dueño (admin no-finanzas) **no** ve la sección Personal (respeta privacidad de salarios).
- [ ] `liquidacion_horas` de un período da horas y total correctos (probar con marcas conocidas).
- [ ] "Registrar como egreso" crea el egreso en Finanzas con los datos correctos.
- [ ] Jornada sin salida → no suma y se puede corregir en Fichajes.
- [ ] Turno de noche que cruza medianoche → se cuenta en el día de entrada.

---

## 12. Decisiones pendientes / a confirmar antes de construir

1. **¿Quién administra las horas?** Por defecto: el usuario de **Finanzas** (respeta que hoy los salarios están ocultos al dueño). Si querés que el **dueño/admin** también gestione, se amplía el guard y las políticas RLS.
2. **Redondeo de horas:** minuto a minuto (default) vs. bloques de 15 min.
3. **Período de liquidación:** mensual (`YYYY-MM`), quincenal o semanal.
4. **Refuerzo anti-fraude:** ¿alcanza con login + QR fijo, o querés geocerca / token rotativo / selfie más adelante?
5. **App Android:** el flujo por URL funciona igual en el navegador y en la app Capacitor. Confirmar el dominio final para armar el QR.

---

## 13. Resumen de lo que hay que crear/tocar

| Tipo | Archivo | Acción |
|---|---|---|
| Migración | `supabase/migrations/20260712000000_control_horas.sql` | **crear** (sección 4) |
| Rol/rutas | `src/context/role.js` | editar: rol `empleado` |
| Rutas/layout | `src/App.jsx` | editar: `/fichar`, `/mis-horas`, `/personal` |
| Navegación | `src/components/layout/Sidebar.jsx` | editar: item *Personal* |
| Hook | `src/hooks/useFichaje.js` | crear |
| Hook | `src/hooks/useMisHoras.js` | crear |
| Hook | `src/hooks/useHoras.js` | crear |
| Página | `src/pages/Fichar.jsx` | crear |
| Página | `src/pages/MisHoras.jsx` | crear |
| Página | `src/pages/Personal.jsx` | crear |

---

*Fuentes de referencia (fichaje por QR y anti buddy-punching): Buddy Punch, Jotform, allGeo, Hubstaff, ShiftFlow.*
