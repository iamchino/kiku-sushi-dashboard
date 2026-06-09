-- Kiku Sushi - habilitar "nota de credito" como medio en movimientos de caja.
-- Permite registrar un movimiento manual cuando queda saldo a favor de algun egreso.

alter table public.caja_movimientos
  drop constraint if exists caja_movimientos_medio_pago_check;

alter table public.caja_movimientos
  add constraint caja_movimientos_medio_pago_check
  check (medio_pago in (
    'efectivo',
    'transferencia',
    'tarjeta_credito',
    'tarjeta_debito',
    'nota_credito',
    'otro'
  ));

notify pgrst, 'reload schema';
