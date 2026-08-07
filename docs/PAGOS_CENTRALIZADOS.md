# Pagos centralizados en Caja

Todos los egresos del negocio —sueldos, proveedores, servicios, lo que sea—
se registran desde un único lugar: **Caja y facturación → Pagos**. Disponible
con la caja abierta o cerrada. Finanzas deja de crear egresos y pasa a
**ver + corregir**.

## Cómo se conectan las secciones

Un pago **es** un egreso: misma tabla (`egresos`), sin duplicados ni
sincronización. Por eso:

- **Finanzas** lo ve al instante en Egresos / Sueldos / Proveedores, con un
  chip "Caja" cuando salió de un turno abierto.
- **Caja**: si al pagar hay un turno abierto, el egreso queda vinculado
  (`egresos.caja_turno_id`). Si además es **en efectivo y está pagado**, se
  crea un movimiento de caja (`caja_movimientos`, tipo `egreso`) apuntando al
  pago → **el arqueo lo descuenta automáticamente**.
- **Personal → Liquidación** paga por el mismo RPC central: un sueldo pagado
  en efectivo con la caja abierta también descuenta del arqueo.

Reglas, tal como las muestra el modal antes de guardar:

| Situación | Efecto |
|---|---|
| Turno abierto + efectivo + pagado | Sale de la caja, el arqueo lo descuenta |
| Turno abierto + transferencia/tarjeta | Se vincula al turno, no toca el efectivo |
| Caja cerrada | Se registra igual, sin turno |
| Estado pendiente (cta. por pagar) | Nunca toca la caja |

## El alta es atómica

`registrar_pago()` crea el egreso y el movimiento de caja en una sola
transacción: o se crea todo o no se crea nada. Nunca queda un egreso sin su
movimiento ni un movimiento huérfano.

## Permisos

Recurso nuevo **`pagos`** (sensible: la lista incluye montos de sueldos).
Arranca en **admin y finanzas**; se otorga o quita desde Personal → Permisos.
Decisión consciente: al centralizar, quien opere Pagos (p. ej. el dueño) ve
los pagos de sueldos — antes eran exclusivos de Finanzas.

El selector de empleados para sueldos usa el RPC `empleados_para_pagos()`, que
devuelve **solo id y nombre**: no abre la tabla `empleados` (donde vive
`sueldo_base`) a quien tenga el permiso.

## Para aplicar

1. `supabase/SQL_EDITOR_PAGOS.sql` en el SQL Editor (idempotente).
2. Deploy del front (branch `feat/pagos-centralizados`).

Funciona con o sin la fase 4 aplicada: las policies del permiso `pagos` son
independientes y conviven con las dos generaciones.

## La caja fuerte

El circuito del efectivo completo:

```
venta en efectivo → CAJA (turno) → retiro al cierre → CAJA FUERTE → pagos
```

- **Al cerrar el turno**: pestaña Caja fuerte → "Retirar de la caja". Sale del
  efectivo del turno (el arqueo lo descuenta como movimiento `retiro`) y se
  deposita en la caja fuerte. Atómico, las dos puntas vinculadas.
- **Si no se retira**: el efectivo queda en el cajón, y la próxima apertura
  precarga el fondo inicial con el efectivo CONTADO del último cierre (menos
  depósitos posteriores). Editable si el conteo real difiere.
- **Pagar desde la caja fuerte**: en el modal de Pagos, cuando el medio es
  efectivo aparece "¿De dónde sale el efectivo?" — caja abierta, caja fuerte, u
  otro. Caja fuerte descuenta de su saldo sin tocar el arqueo del turno.
- **Ajustes**: conteo real distinto al saldo, depósitos con la caja ya cerrada,
  correcciones. Siempre con motivo.
- La tabla `caja_fuerte_movimientos` **no acepta escrituras directas**: todo
  pasa por RPCs atómicos. Permiso `caja_fuerte` (admin y finanzas al arrancar).

## Limitaciones conocidas

- **Marcar pagada una cuenta pendiente** (desde Finanzas, editándola) no crea
  el movimiento de caja: el descuento de arqueo solo ocurre en el alta. Si una
  cuenta por pagar se paga después en efectivo de la caja, conviene registrarla
  como pago nuevo desde Caja → Pagos (y borrar la pendiente, o dejarla como
  histórico).
- Un usuario con `pagos` pero sin acceso a `empleados` (p. ej. admin) ve los
  pagos de sueldo con su descripción y monto, pero la columna de empleado
  vinculado puede venir vacía — es la RLS de `empleados` protegiendo el legajo.
- Anular un pago en efectivo ya hecho borra el egreso desde Finanzas, pero el
  movimiento de caja vinculado queda (con su `egreso_id` en null). Si el turno
  sigue abierto, corregilo con un movimiento de ajuste desde Arqueo.
