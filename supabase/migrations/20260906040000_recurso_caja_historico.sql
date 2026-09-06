-- ============================================================
-- Migración: recurso `caja_historico` — separar la foto del negocio de la
--            operación del turno
--
-- EL PROBLEMA
-- --------------------------------------------------------------------------
-- Caja y facturación es una sola pantalla que mezcla dos cosas muy distintas:
--
--   OPERAR EL TURNO           ver la foto del negocio
--   facturar pedidos          Vendido / Facturado / Neto de los últimos 30 días
--   cargar movimientos        el historial completo de cierres, con su export
--   cerrar la caja del día    el saldo de la caja fuerte
--
-- El encargado necesita la columna de la izquierda todos los días. La de la
-- derecha es información del dueño. Hasta ahora el permiso `caja` era todo o
-- nada: o le sacabas la pantalla entera —y entonces no podía trabajar— o veía
-- la facturación acumulada del mes.
--
-- LA GRANULARIDAD NUEVA
-- --------------------------------------------------------------------------
-- `caja_historico` (ver) gobierna las tres cosas que miran hacia atrás:
--
--   1) el selector de rango de fechas (Hoy / 7 días / 30 días / custom),
--   2) la banda de totales de facturación (Vendido, Facturado, NC, Neto),
--   3) el panel Historial de cierres, con su exportación a CSV.
--
-- Sin el permiso, la página queda fija en HOY y sin totales acumulados. Se
-- factura, se cargan pagos y movimientos, y se cierra el turno igual que antes.
--
-- El punto 1 no es decorativo: es la llave de los otros dos. Tapar los totales
-- dejando elegir "últimos 30 días" no esconde nada, solo lo mueve de lugar.
--
-- ALCANCE HONESTO
-- --------------------------------------------------------------------------
-- Esto es una restricción de PANTALLA, no de datos. Las policies de caja_turnos
-- siguen colgando del recurso `caja`, que el encargado necesita para operar el
-- turno abierto; no se puede partir por fila sin romperle el arrastre de la
-- apertura. Alcanza para que la información no esté a la vista de quien no le
-- corresponde, no para frenar a alguien que consulte la API a mano.
--
-- Para el saldo de la caja fuerte ya existe el recurso `caja_fuerte` desde
-- 20260808000000, y ese sí gatea las RPC en la base. Se destilda por separado.
--
-- Sigue el mismo patrón que caja_fuerte: recurso sin `ruta` (vive dentro de
-- otra pantalla), grupo Dinero, marcado como sensible.
-- ============================================================

begin;

insert into public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) values
  ('caja_historico', 'Caja · histórico y totales',
   'El rango de fechas, los totales de facturación acumulados y el historial de cierres pasados. Vive dentro de Caja y facturación. Sin esto se ve y se opera solo el día de hoy.',
   null, 'Dinero', true, 214)
on conflict (id) do update
  set nombre = excluded.nombre, descripcion = excluded.descripcion,
      grupo = excluded.grupo, sensible = excluded.sensible, orden = excluded.orden;

-- Solo finanzas. A admin se le da explícitamente NO: es justamente el rol del
-- encargado que carga los pagos y maneja los turnos, y el sentido de este
-- recurso es que vea el día en curso sin la acumulación del negocio.
-- Si algún día querés dárselo, se tilda desde Personal → Permisos.
insert into public.rol_permisos (rol_id, recurso_id, ver, editar)
select r.rol, 'caja_historico', r.ver, r.ver
from (values ('finanzas', true), ('admin', false)) as r(rol, ver)
where exists (select 1 from public.roles where id = r.rol)
on conflict (rol_id, recurso_id) do nothing;

commit;

notify pgrst, 'reload schema';
