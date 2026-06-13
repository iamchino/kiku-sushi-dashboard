-- ════════════════════════════════════════════════════════════════════════════
-- FIX: la vista pagos_arqueo en producción NO expone caja_turno_id.
--
-- En la base de producción quedó la versión vieja de la vista (la de
-- 20260528000000_pagos.sql, sin caja_turno_id). Por eso el front considera
-- TODOS los pagos como "sin turno" (pago.caja_turno_id llega undefined),
-- aunque el botón "Asignar" actualice la tabla pagos correctamente.
--
-- Ejecutar en Supabase → SQL Editor. Es idéntica a la vista de
-- 20260530000000_caja_arqueo.sql (solo re-aplica esa definición).
-- ════════════════════════════════════════════════════════════════════════════

create or replace view public.pagos_arqueo as
select
  p.id,
  p.medio_pago,
  p.numero_operacion,
  p.monto,
  p.notas,
  p.created_at,
  p.usuario_id,
  ped.id as pedido_id,
  ped.mesa as pedido_mesa,
  ped.canal as pedido_canal,
  ped.total as pedido_total,
  c.id as comprobante_id,
  c.letra as comprobante_letra,
  c.tipo_cbte as comprobante_tipo,
  c.punto_venta as comprobante_pv,
  c.numero as comprobante_numero,
  c.cae as comprobante_cae,
  c.importe_total as comprobante_importe,
  p.caja_turno_id
from public.pagos p
join public.pedidos ped on ped.id = p.pedido_id
left join public.comprobantes_fiscales c on c.id = p.comprobante_id;

grant select on public.pagos_arqueo to authenticated;

notify pgrst, 'reload schema';
