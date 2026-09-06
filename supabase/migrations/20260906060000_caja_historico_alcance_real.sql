-- ============================================================
-- Migración: corregir la descripción de `caja_historico`
--
-- La migración 20260906040000 lo definió gobernando tres cosas, incluido el
-- panel Historial de cierres. Ese tercer punto se revirtió: el historial de
-- cierres es la TRAZABILIDAD del arqueo —quién cerró, con cuánta diferencia,
-- qué se reabrió y por qué— y el encargado tiene que poder consultarlo por
-- cualquier cosa. No es la foto del negocio.
--
-- El recurso queda gobernando solo lo que efectivamente es información
-- acumulada del negocio:
--   1) el selector de rango de fechas (Hoy / 7 días / 30 días / custom),
--   2) la banda de totales de facturación (Vendido, Facturado, NC, Neto).
--
-- Solo cambia el texto que se lee en Personal → Permisos. No toca la matriz:
-- quien lo tenga tildado o destildado sigue igual.
-- ============================================================

begin;

update public.recursos
   set descripcion = 'El rango de fechas y los totales de facturación acumulados '
                     '(Vendido, Facturado, Notas de crédito, Neto). Vive dentro de '
                     'Caja y facturación. Sin esto se ve y se opera solo el día de '
                     'hoy. El historial de cierres NO depende de este permiso: es '
                     'la trazabilidad del arqueo y se ve siempre.'
 where id = 'caja_historico';

commit;

notify pgrst, 'reload schema';
