# Verificación antes de seguir con la fase 3

Tres capas, de la más barata a la más cara. Si alguna falla, no sigas: la
fase 3 construye encima.

---

## 1. La base — 2 minutos

Pegá `supabase/SQL_EDITOR_VERIFICACION.sql` en Supabase → SQL Editor y dale Run.
Solo lee, no modifica nada. Devuelve 15 filas con ✅, ⚠️ o ❌.

**Tienen que dar todas ✅.** Los ⚠️ son informativos:

- *"Usuarios con rol en app_metadata"* en ⚠️ significa que alguien quedó sin rol
  y por lo tanto es `cocina`. Arreglalo desde Personal → Usuarios.
- *"Matriz sembrada con los valores esperados"* en ⚠️ es normal **si ya editaste
  permisos desde la UI**. Si nunca los tocaste, debería dar ✅.

Cualquier ❌ es un problema real. Los más graves:

| Chequeo en ❌ | Qué significa |
|---|---|
| `current_app_role() no lee user_metadata` | La escalada de privilegios sigue abierta: cualquier empleado puede hacerse admin |
| `Ninguna policy lee user_metadata` | Ídem, por otra vía. La columna "detalle" te dice qué tablas |
| `Hay al menos un rol que administra permisos` | Nadie puede editar la matriz salvo el email de emergencia |
| `tiene_permiso() es SECURITY DEFINER` | La fase 4 va a entrar en recursión |

---

## 2. El código — 1 minuto

En la carpeta del repo:

```bash
npm ci                      # solo la primera vez
npm run verificar:permisos
```

Tienen que salir las dos líneas con ✓ (369 chequeos). Compara la matriz y la
lógica nueva contra el comportamiento anterior, recurso por recurso y rol por
rol. Cualquier diferencia sale con código 1 y te dice exactamente cuál.

---

## 3. El sistema andando — 15 minutos

Esto es lo que ningún test automático cubre. Entrá con **un usuario de cada
rol** (podés usar una ventana de incógnito para no perder tu sesión) y andá
tildando:

### admin (`kikusushirosario@` o `soffirobr@`)

- [ ] Entra y cae en Inicio
- [ ] El menú tiene: Inicio, Operaciones, Órdenes, Mesas, Reservas, Platos, Menú
      & Carta, Producción, Inventario, Recetas, Analíticas, Caja y ARCA,
      Clientes, Notificaciones, Proveedores, Configuración, Fichar, Mis horas
- [ ] **NO** ve Finanzas ni Personal
- [ ] Abre Caja y ve los turnos
- [ ] Abre Configuración y ve los 4 tabs
- [ ] Abre Mesas y desde ahí entra a la configuración del salón

### finanzas (`finanzas@kikusushi.com.ar`)

- [ ] Sigue viendo **Finanzas y Personal** ← el más importante de todos
- [ ] Finanzas: los 5 tabs con datos (Resumen, Cajas diarias, Egresos, Sueldos,
      Proveedores). Ninguno vacío
- [ ] Personal → Usuarios: la lista carga y el chip de rol es clickeable
- [ ] Conserva el resto del sistema (es admin): Caja, Configuración, Mesas

### cocina (`fran@` o `marce@`)

- [ ] Cae en Operaciones
- [ ] Ve Operaciones, Órdenes, Menú & Carta, Producción, Inventario, Recetas,
      Fichar, Mis horas
- [ ] **NO** ve Caja, Analíticas, Mesas, Clientes, Configuración, Proveedores
- [ ] En el celular: la barra inferior tiene Inicio y Produccion
- [ ] Escribir `/caja` en la barra de direcciones lo rebota a Operaciones

### mozo (`mozos@`)

- [ ] Cae en Mesas
- [ ] Ve Mesas, Platos, Inventario, **Configuración** (nuevo en el menú), Fichar,
      Mis horas
- [ ] Abre una mesa, le carga algo y la cobra
- [ ] En Configuración solo ve el tab de Impresoras
- [ ] Puede corregir la IP de la impresora y le dice "guardado para todos los equipos"
- [ ] En el celular: la barra inferior tiene Mesas, Platos, Stock, Impresora

### empleado (`facu@` o `vani@`)

- [ ] Entra y va directo a Fichar, sin menú lateral
- [ ] Escanea el QR y le toma la entrada
- [ ] Ve Mis horas
- [ ] Escribir `/mesas` lo devuelve a Fichar

### La prueba que más importa

- [ ] **No aparece la barra amarilla** que dice "No se pudieron leer los permisos
      configurados" en ningún usuario.

Si aparece, el front está funcionando con las reglas viejas del código y la
matriz no se está leyendo. Todo va a *parecer* normal, pero la fase 3 no va a
tener ningún efecto. Mirá la consola del navegador: hay un `console.error` con
el motivo.

---

## Si algo sale mal

El orden de reversa, de menos a más drástico:

1. **Solo el front anda raro** → revertí el deploy en Vercel al anterior. La base
   queda como está; las migraciones no rompen nada por sí solas.
2. **Un rol perdió acceso** → Personal → Usuarios, revisá su rol. Casi siempre es
   que quedó sin `app_metadata.role` y cayó a `cocina`.
3. **Nadie puede editar permisos** → entrá como `finanzas@kikusushi.com.ar`. Esa
   cuenta tiene acceso hardcodeado en SQL y no se puede romper desde la UI.
4. **Algo de la base** → `git revert` del merge correspondiente y volvé a correr
   las migraciones anteriores. Todas son idempotentes.
