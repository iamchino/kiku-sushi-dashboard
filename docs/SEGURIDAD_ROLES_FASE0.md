# Fase 0 — Cimientos de seguridad de roles

Previo al sistema de permisos configurable desde la UI. Esta fase **no cambia
qué ve cada rol**: solo cierra tres puertas que hoy están abiertas.

## Qué arregla

| # | Problema | Impacto real hoy | Arreglo |
|---|---|---|---|
| 1 | `current_app_role()` acepta `user_metadata.role` | **Cualquier usuario logueado puede auto-asignarse `admin`** desde la consola del navegador con `supabase.auth.updateUser({ data: { role: 'admin' } })`, y quedarse con caja, stock, facturación y configuración | El rol se lee solo de `app_metadata`, que escribe únicamente la service key |
| 2 | `public.mozos` sin RLS habilitado | La tabla queda legible y escribible por cualquiera con la anon key, que viaja en el bundle del front | `enable row level security` + policy para roles operativos |
| 3 | `impresion_config` se escribe con `auth.role() = 'authenticated'` | Cualquier login, incluido un empleado que solo ficha, puede cambiar la IP de la impresora | Escritura para roles operativos (el mozo la sigue pudiendo corregir desde el celular); lectura sin cambios |

De paso, las policies de `pagos` y `proveedores` que leían el JWT inline pasan a
usar los helpers, así no vuelven a quedar desincronizadas.

## ⚠️ Antes de aplicar: verificación obligatoria

La migración **aborta a propósito** si encuentra usuarios cuyo rol vive solo en
`user_metadata`. Sin ese corte, esas personas pasarían a rol `cocina` de golpe.

Corré esto primero en Supabase → SQL Editor:

```sql
select
  email,
  raw_app_meta_data  ->> 'role' as app_role,   -- el bueno
  raw_user_meta_data ->> 'role' as user_role   -- el editable por el usuario
from auth.users
order by email;
```

Interpretación:

- **`app_role` con valor** → todo bien, no hay que hacer nada.
- **`app_role` vacío y `user_role` vacío** → queda como `cocina`. Si esa persona
  necesita otro rol, asignáselo desde Personal → Usuarios.
- **`app_role` vacío y `user_role` con valor** → **frena la migración**, salvo
  que `user_role` sea `cocina`: ese es el default, así que esa persona queda
  exactamente igual y no hace falta tocar nada.

Para el último caso, pensá bien antes de copiar el rol. Que alguien tenga
`user_metadata.role = 'admin'` puede significar dos cosas muy distintas: que se
lo pusieron legítimamente hace tiempo, o que se lo puso solo. Si no lo
reconocés, no se lo copies — dejá que caiga a `cocina` y asignale después el rol
que corresponda desde la UI.

Para los que sí confirmes:

```sql
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                           || jsonb_build_object('role', 'EL_ROL_QUE_CORRESPONDE')
 where email = 'alguien@kikusushi.com.ar';
```

Y volvé a correr la migración.

## Aplicar

```bash
supabase db push
```

O pegando `supabase/migrations/20260802000000_seguridad_roles_fase0.sql` en el
SQL Editor. Es idempotente: se puede correr de nuevo sin efectos secundarios.

Después, deploy del front (Vercel) para que `getRoleFromUser()` quede con la
misma regla que la base.

## Verificación posterior

Probá con un usuario de cada rol que siga entrando donde entraba:

- [ ] **admin** — entra a Caja, Configuración, Proveedores, Stock
- [ ] **cocina** — entra a Operaciones y Producción; sigue sin ver Caja ni Analíticas
- [ ] **mozo** — abre y cobra una mesa; puede corregir la IP de impresora desde Configuración
- [ ] **empleado** — ficha con el QR y ve Mis horas; **no** puede tocar la impresora
- [ ] **finanzas** — entra a Finanzas y Personal

Si alguien quedó afuera, casi seguro es que su rol no estaba en `app_metadata`.
Se resuelve desde Personal → Usuarios, tocando el chip de rol.

## Nota sobre el JWT

El rol viaja dentro del token, así que un cambio de rol o de permisos no le
aplica a alguien ya logueado hasta que su token se refresque (~1 hora). La
acción de cambiar rol en Personal → Usuarios ya le cierra las sesiones para que
tome efecto en el momento.

## Lo que esta fase NO hace

Sigue pendiente para las fases siguientes:

- La policy global `"admin full access"` (`20260615030000`) le da a `admin`
  acceso a todas las tablas que existían al 15/06/2026, por fuera de cualquier
  permiso. Hay que quitarla para que el rol admin también sea configurable.
- `pedidos` y `pedido_items` aceptan `INSERT`/`SELECT` anónimo con `using (true)`
  (viene de la carta web). Conviene acotarlo.
- `reservas`, `notificaciones` y `lista_espera` son accesibles por cualquier
  usuario autenticado, sin distinción de rol.

## Ojo con los scripts viejos

`current_app_role()` estaba definida con el fallback inseguro en tres archivos
que la documentación invita a re-pegar en el SQL Editor ante problemas
(`SQL_EDITOR_FACTURACION_COMPLETA.sql` y las migraciones `20260615020000` /
`20260615030000`). Los tres usan `create or replace`, así que re-correrlos
habría deshecho este arreglo en silencio. Ya quedaron corregidos.

Lo mismo con `20260612_proveedores.sql`, que tiene las 4 policies viejas de
`proveedores` leyendo `user_metadata`: quedó con un aviso arriba. Si alguna vez
lo re-pegás, corré después la migración de esta fase.

Regla general para el futuro: **ninguna policy ni función debería volver a leer
`user_metadata`.** Buscalo con `grep -rn user_metadata supabase/`.
