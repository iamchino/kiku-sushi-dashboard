-- ============================================================
-- Migración: agregar fecha de pago a proveedores
-- Add-only — no toca datos ni columnas existentes
-- ============================================================

alter table public.proveedores
  add column if not exists fecha_pago date;

comment on column public.proveedores.fecha_pago is
  'Fecha del próximo pago al proveedor (selector de calendario)';
