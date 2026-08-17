-- ============================================================================
-- 1) Frecuencia de pago "diario"
--    Empleados que cobran por día trabajado (ej. limpieza). No usa día de pago
--    fijo: se paga al final de cada jornada.
-- 2) El rol cocina deja de ver "Menú & Carta"
--    Se quita el recurso `menu` de la matriz de permisos del rol cocina.
--    (Si hace falta devolvérselo, se hace desde Personal → Permisos.)
-- ============================================================================

alter table public.empleados
  drop constraint if exists empleados_frecuencia_pago_check;

alter table public.empleados
  add constraint empleados_frecuencia_pago_check
  check (frecuencia_pago in ('mensual', 'quincenal', 'semanal', 'diario'));

comment on column public.empleados.frecuencia_pago is
  'mensual | quincenal | semanal | diario. Diario = se paga por día trabajado, sin día de pago fijo.';

delete from public.rol_permisos
 where rol_id = 'cocina' and recurso_id = 'menu';

notify pgrst, 'reload schema';
