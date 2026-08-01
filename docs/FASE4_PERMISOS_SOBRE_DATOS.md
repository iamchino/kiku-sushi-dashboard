# Fase 4 — Los permisos pasan a gobernar los datos

Hasta acá los permisos mandaban sobre el **menú**. Las tablas seguían con
`is_admin()` / `is_operational_user()` / `is_mozo()`, así que darle "Caja" a
cocina mostraba la pantalla y la base rechazaba las consultas.

Esta fase cierra esa brecha. Es la más riesgosa de las cinco: toca las policies
de todas las tablas del sistema.

---

## Cómo aplicarla, en orden

### 1. El simulacro — obligatorio

```
supabase/SQL_EDITOR_SIMULACRO_FASE4.sql
```

Pegalo en el SQL Editor. Simula cada rol contra cada tabla, aplica los cambios,
vuelve a simular, muestra el diff y hace **ROLLBACK**. No aplica nada: se puede
correr en producción sin riesgo.

**Ese resultado es la fuente de verdad, no lo que dice este documento.** Yo lo
probé contra una réplica de tu base armada a mano, que es una aproximación.
El simulacro corriendo contra la base real te da el diff exacto.

Cómo leerlo:

- `(+) gana` → ese rol pasa a poder acceder. Es la matriz haciendo efecto.
- `(-) PIERDE` → deja de poder. **Revisá cada una.** Si una pantalla que ese rol
  usa depende de esa tabla, se va a romper.

### 2. Aplicar

Solo si el diff es el esperado:

```
supabase/SQL_EDITOR_FASE4.sql
```

Va todo en una transacción. Si algo falla, no se aplica nada.

### 3. Probar

Con un usuario de cada rol, el checklist de `VERIFICACION_ANTES_DE_FASE3.md`.
Sumale, porque son las que dependen de los datos:

- [ ] **mozo** abre una mesa, agrega un plato **con variante** y la cobra
- [ ] **mozo** corrige la IP de la impresora
- [ ] **cocina** ve las comandas y completa una tarea de producción
- [ ] **admin** abre Caja y ve los turnos; abre Menú y edita un precio
- [ ] **finanzas** ve los 5 tabs de Finanzas con datos
- [ ] **empleado** ficha con el QR

---

## Cómo funciona

El problema central: **una tabla la usan varios recursos.** `pedidos` la leen
Órdenes, Cocina, Platos, Analíticas, Mesas y Caja. Por eso el mapa es una tabla
(`recurso_tablas`) y no una columna, y el acceso se concede si el rol tiene
**alguno** de los recursos que la habilitan.

Además distingue quién solo lee de quién escribe: Analíticas lee `pedidos` pero
no tiene por qué modificarlos.

```
recurso_tablas(recurso_id, tabla, escribe)
puede_tabla(tabla, accion)  →  ¿algún recurso del rol habilita esta tabla?
```

Las policies se **generan recorriendo el mapa**, no se escriben a mano: dos por
tabla (lectura y escritura). Agregar una tabla al mapa la cubre sola, y no hay
forma de escribir mal un nombre.

### Un recurso nuevo: Configuración avanzada

El simulacro detectó un sobre-permiso que no era evidente: el mozo tiene la
sección Configuración para corregir la IP de la impresora, pero esa sección
también contiene los **costos de envío y los horarios de reservas**. Mientras
los permisos gobernaban solo el menú daba igual (la UI ya le muestra únicamente
el tab de Impresoras). Ahora que gobiernan los datos, le habría dado escritura
real sobre los precios del delivery.

Se partió en dos: `configuracion` queda con las impresoras, y `config_avanzada`
—un recurso sin pantalla propia— con el resto, solo para admin.

### Lo que NO se toca

- **Acceso propio** (`user_id = auth.uid()`): cada uno ve su fichaje, sus horas
  y su liquidación, sin importar el rol.
- **Anon**: la carta web sigue leyendo el menú, los especiales y los costos de
  envío. El alta de pedidos desde la web sigue igual.
- **service_role**: `arca_tokens` y la escritura de `webhook_config`.
- **Lecturas globales del dashboard**: `impresion_config` y `notificaciones` se
  leen desde el banner de impresora y la campanita, que se renderizan para
  cualquier rol. Si dependieran de una sección, un empleado que solo ficha
  vería errores. La **escritura** sí queda gobernada por la matriz.

---

## Cambios esperados (verificar contra tu simulacro)

Estos salieron de mi réplica. Los que más importan:

| Rol | Cambio | Por qué |
|---|---|---|
| mozo | **pierde** escritura sobre `menu_items`, `recetas`, `mozos` | No debería editar la carta ni el listado de mozos. Hoy podía |
| mozo | **gana** escritura sobre `comprobantes_fiscales` | Lo necesita para cobrar una mesa con factura |
| mozo | pierde lectura de `combos`, `especiales`, `produccion_*` | No usa esas pantallas |
| cocina | pierde escritura sobre `impresion_config` | Queda para mozo y admin, que son quienes la corrigen |
| cocina | gana lectura de `clientes` y `web_config` | Vienen de Órdenes y Menú, que sí tiene |
| admin | pierde escritura sobre `tipos_comprobante`, `webhook_config` | Son catálogos, no se editan desde la app |
| todos | ganan lectura de `puntos_fichaje` | Necesaria para validar el QR al fichar |

---

## Bugs que encontró el simulacro antes de que llegaran a producción

Vale dejarlos anotados, porque son el argumento de por qué existe:

1. **El loop se rompía a sí mismo.** Generaba las policies iterando un cursor
   sobre `recurso_tablas` y adentro hacía `ALTER TABLE` sobre esa misma tabla.
   Postgres lo rechaza con *"cannot ALTER TABLE because it is being used by
   active queries"*. La migración entera abortaba.
2. **El mozo perdía `menu_item_variantes`**, o sea que no podía agregar un plato
   con variante a una mesa. Faltaba en el mapa.
3. **El banner de impresora y la campanita** se rompían para empleado y
   finanzas, porque su lectura pasaba a depender de secciones que no tienen.
4. **El mozo ganaba escritura sobre los costos de delivery** (el caso de
   Configuración de arriba).

Ninguno era evidente leyendo el código.

---

## Pendientes después de esta fase

- `anon crear/leer pedidos` sigue con `using (true)`: cualquiera con la anon key
  puede leer todos los pedidos. Viene de la carta web y merece su propio PR.
- La columna `editar` de la matriz ahora **sí tiene efecto**, pero la pantalla
  de permisos sigue mostrando una sola casilla. Cuando quieras distinguir
  lectura de escritura por sección, hay que agregar la segunda columna en
  `PermisosSection.jsx` y pasar el detalle en `guardar_permisos_rol`.
- Las **vistas** (`v_mesas_estado`, `vista_jornadas`, `pagos_arqueo`) heredan
  las RLS de sus tablas base, así que quedan cubiertas. Pero conviene
  verificarlas en el checklist.
