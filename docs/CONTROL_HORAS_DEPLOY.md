# Control de Horas y Fichaje — Puesta en marcha

Módulo implementado según `GUIA_CONTROL_HORAS_Y_FICHAJE.md` con estas decisiones:

| Decisión | Valor |
|---|---|
| Administración | **Solo Finanzas** (`finanzas@kikusushi.com.ar`). También crea/elimina **usuarios** desde el dash. |
| Valor hora | Se reutiliza `empleados.sueldo_base` cuando `tipo_sueldo = 'hora'` (no se duplicó el campo). |
| Redondeo | Bloques de **30 min al más cercano**, por jornada (4h14m → 4h00m · 4h16m → 4h30m). |
| Liquidación | **Semanal, martes → lunes**, con estados **En curso → Pendiente → Pagada**. También **pago por día (jornal)**: un día pagado suelto se excluye automáticamente del cierre semanal. |
| Anti-fraude | Login + QR fijo + **geocerca de 100 m** (configurable por punto, 10–1000 m). |
| App | Solo enlace web (el QR codifica la URL del dominio donde corre el dash). |

## 1. Base de datos

Correr las migraciones en orden (SQL Editor de Supabase o `supabase db push`):

```
supabase/migrations/20260712000000_control_horas.sql
supabase/migrations/20260713000000_liquidacion_diaria.sql
```

Crea: `empleados.user_id`, `puntos_fichaje` (con un punto sembrado), `fichajes`,
`turnos` (sin UI todavía), `liquidaciones`, la vista `vista_jornadas` y las RPC
`fichar()`, `liquidacion_horas()`, `generar_liquidacion_semanal()`.

## 2. Edge Function (usuarios desde el dash)

```bash
supabase functions deploy admin-usuarios
```

Sin secrets extra (usa las variables que inyecta Supabase). **No** usar
`--no-verify-jwt`: la función exige JWT y además valida `is_finanzas_user()`.

## 3. Deploy del front

Deploy normal en Vercel. `vercel.json` ahora permite `geolocation=(self)`
(necesario para la geocerca). En la app Android no hace falta nada: el flujo es por URL.

## 4. Configuración inicial (una sola vez, como Finanzas)

1. **Personal → QR del local**: parado en el local, tocar **"Capturar ubicación"**
   (activa la geocerca; radio default 100 m). Luego **Imprimir** el QR y pegarlo.
2. **Personal → Usuarios**: crear el login de cada empleado (rol `empleado`)
   y **vincularlo** a su fila del legajo. Verificar en Finanzas → Sueldos que el
   empleado tenga `tipo_sueldo = 'hora'` y su valor hora en `sueldo_base`.
3. Probar con un empleado: escanear QR → Entrada; re-escanear → Salida;
   doble escaneo en <60 s → rechazado; escanear lejos del local → rechazado.

## 5. Ciclo semanal (martes → lunes)

1. La semana corriente se ve **En curso** en Personal → Liquidación (suma en vivo).
2. Al terminar (o cuando esté todo fichado): **"Cerrar semana"** → queda **Pendiente**.
   Re-cerrar recalcula las filas no pagadas (p. ej. tras corregir un fichaje).
3. **Pagar** por empleado → elige fecha y medio de pago → crea el **egreso** en
   Finanzas (categoría `sueldos`, período `YYYY-MM`) y la fila queda **Pagada**.
4. Jornadas sin salida no suman: se corrigen en Personal → Fichajes (quedan
   marcadas `manual` para auditoría).
5. **Pago por día (jornal):** botón "Pagar día" (o "Día" en la fila del
   empleado) → elegir día → muestra horas y total → confirmar. Crea el egreso
   (subtipo `jornal`) y ese día queda excluido del cierre semanal. Anular un
   jornal borra también su egreso y las horas vuelven a la semana. No se puede
   pagar un día que ya entró en una semana cerrada (eliminar ese cierre primero).

## Notas

- El **dueño/admin no ve** Personal ni Finanzas (privacidad de salarios intacta).
- El empleado solo ve `/fichar` y `/mis-horas` (incluida su semana y si está paga).
- Un mozo/cocina también puede fichar con su mismo login si se lo vincula a un empleado.
- Regenerar el token de un punto invalida el QR impreso (imprimir el nuevo).
- Los cortes de día usan hora **argentina** (turnos nocturnos cuentan en el día de entrada).
