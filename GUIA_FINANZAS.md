# Sección Finanzas — guía

Nueva sección **Finanzas** (`/finanzas`), **exclusiva del usuario `finanzas@kikusushi.com.ar`**.
Ningún otro usuario la ve — ni siquiera el dueño (`kikusushirosario@gmail.com`).
El resto del dashboard queda exactamente igual para todos.

## Modelo de acceso (importante)

- `finanzas@kikusushi.com.ar` → **acceso absoluto**: todo el dashboard **+ Finanzas**.
- `kikusushirosario@gmail.com` (dueño) → todo el dashboard **menos Finanzas**.
- cocina / mozo → sin cambios.

El truco: **ambos** (finanzas y dueño) son rol `admin` en la base, así el usuario de
finanzas tiene acceso total al resto del sistema. Lo que distingue a Finanzas es el
**email**, no el rol:

- En el frontend, la pestaña y la ruta `/finanzas` solo aparecen para los emails de
  `FINANZAS_EMAILS` (en `src/context/role.js`).
- En la base, las tablas `egresos` y `empleados` tienen RLS por email
  (`is_finanzas_user()`), así que aunque otro admin entrara por API, no puede leerlas.

Para sumar o cambiar quién accede, editá **los dos lugares**: el set `FINANZAS_EMAILS`
en `src/context/role.js` y la función `is_finanzas_user()` en la migración
`20260628010000_finanzas_acceso.sql`.

## Qué incluye

Página con selector **Día / Mes / Año** (flechas para navegar) y 5 pestañas:
Resumen (ingresos, egresos, resultado, margen) · Cajas diarias · Egresos · Proveedores
(cuentas por pagar) · Sueldos (legajo + pagos).

Ingresos = cobros de la tabla `pagos`. Egresos = tabla `egresos` (solo `pagado` impacta
el resultado; `pendiente` = cuentas por pagar). Sueldos = tabla `empleados` + egresos de
categoría `sueldos`.

## Paso 1 — Aplicar migraciones

```bash
supabase db push
```

Aplica las dos migraciones nuevas:
`20260628000000_finanzas.sql` (crea las tablas) y
`20260628010000_finanzas_acceso.sql` (acceso por email).
Alternativa: pegar ambos `.sql` en el **SQL Editor** de Supabase, en ese orden.

## Paso 2 — Crear el usuario `finanzas@kikusushi.com.ar`

Si el login da **"credenciales incorrectas"**, casi siempre es porque el usuario no
quedó creado, o quedó sin confirmar. Verificá primero en el **SQL Editor**:

```sql
select id, email, email_confirmed_at, raw_app_meta_data
from auth.users
where email ilike 'finanzas@kikusushi.com.ar';
```

- **No devuelve filas** → el usuario no existe. Crealo en
  **Authentication → Users → Add user**: email `finanzas@kikusushi.com.ar`, una
  contraseña, y **marcá "Auto Confirm User"**.
- **`email_confirmed_at` está vacío** → falta confirmar. Volvé a crearlo con Auto
  Confirm, o confirmalo:

```sql
update auth.users set email_confirmed_at = now()
where email ilike 'finanzas@kikusushi.com.ar' and email_confirmed_at is null;
```

- **Existe y está confirmado pero igual falla** → es la contraseña. Reseteala desde
  Authentication → Users → (el usuario) → **Reset password** / **Update password**.

> El `@kikusushi.com.ar` debe ir idéntico (sin espacios, en minúscula).

## Paso 3 — Darle rol admin (acceso al resto del sistema)

El usuario de finanzas necesita rol `admin` para ver el resto del dashboard. En el
**SQL Editor**:

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email ilike 'finanzas@kikusushi.com.ar';
```

Después, **cerrar sesión e iniciar de nuevo** para que el token tome el rol.

Listo: `finanzas@kikusushi.com.ar` ve todo + Finanzas; `kikusushirosario@gmail.com` ve
todo menos Finanzas.

## Para seguir ajustando (ideas v2)

Gráfico ingresos vs. egresos · flujo de caja proyectado con vencimientos · % food cost ·
exportar a Excel/PDF para el contador · egresos recurrentes automáticos.
