-- ============================================================
-- Empleados: tipo de sueldo (fijo | por hora) y frecuencia de pago.
--   * tipo_sueldo      → 'fijo' (mensual) o 'hora' (valor por hora)
--   * frecuencia_pago  → 'mensual' | 'quincenal' | 'semanal'
--   * dia_pago_semana  → 0=Domingo … 6=Sábado (solo cuando es 'semanal')
-- Add-only: no toca datos existentes. Las filas actuales quedan
-- como 'fijo' + 'mensual', conservando su dia_pago.
-- ============================================================

alter table public.empleados
  add column if not exists tipo_sueldo text not null default 'fijo'
    check (tipo_sueldo in ('fijo', 'hora'));

alter table public.empleados
  add column if not exists frecuencia_pago text not null default 'mensual'
    check (frecuencia_pago in ('mensual', 'quincenal', 'semanal'));

alter table public.empleados
  add column if not exists dia_pago_semana smallint
    check (dia_pago_semana is null or (dia_pago_semana >= 0 and dia_pago_semana <= 6));

comment on column public.empleados.tipo_sueldo is
  'fijo = sueldo mensual; hora = sueldo_base es el valor por hora';
comment on column public.empleados.frecuencia_pago is
  'mensual | quincenal | semanal';
comment on column public.empleados.dia_pago_semana is
  '0=Domingo … 6=Sábado. Solo se usa cuando frecuencia_pago = semanal';
