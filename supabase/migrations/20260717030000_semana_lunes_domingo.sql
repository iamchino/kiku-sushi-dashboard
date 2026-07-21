-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — La semana de liquidación pasa de martes→lunes a lunes→domingo
-- ════════════════════════════════════════════════════════════════════════════
--
-- El único lugar del SQL donde vive la definición de "semana de pago" es
-- generar_liquidacion_semanal(): normalizaba la fecha al MARTES de esa semana.
-- Ahora normaliza al LUNES (date_trunc('week') ya devuelve el lunes ISO), y el
-- fin pasa a ser el domingo. El local no trabaja el domingo, pero el corte de
-- la semana ahora es lunes→domingo como pidió Finanzas.
--
-- El resto de la cadena no necesita cambios:
--   • liquidacion_horas(p_desde, p_hasta) recibe el rango del cliente → agnóstico.
--   • generar_liquidacion_dia() es por día suelto → agnóstico.
--   • La app (lib/horas.js) calcula la misma semana lunes→domingo del lado del
--     front, así que los rangos que manda coinciden con este cierre.
--
-- Compatibilidad hacia atrás:
--   Las liquidaciones YA guardadas conservan su semana_inicio con el corte viejo
--   (un martes). No se tocan: sus pagos y egresos en Finanzas siguen intactos.
--   El cambio rige para los cierres nuevos. Una semana histórica puede mostrarse
--   con el corte anterior, nada más.
--
-- Idempotente: create or replace. Correr después de 20260713000000.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.generar_liquidacion_semanal(p_fecha date)
returns setof public.liquidaciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inicio date;
  v_fin    date;
begin
  if not public.is_finanzas_user() then
    raise exception 'Solo el usuario de Finanzas puede generar liquidaciones.';
  end if;

  -- Lunes de esa semana (date_trunc('week') devuelve el lunes ISO) → domingo.
  v_inicio := date_trunc('week', p_fecha::timestamp)::date;
  v_fin    := v_inicio + 6;   -- domingo

  return query
  insert into public.liquidaciones as l
    (empleado_id, tipo, semana_inicio, semana_fin, minutos, horas, valor_hora, total, estado)
  select
    lh.empleado_id, 'semana', v_inicio, v_fin, lh.minutos, lh.horas, lh.valor_hora, lh.total, 'pendiente'
  from public.liquidacion_horas(v_inicio, v_fin) lh
  where lh.tipo_sueldo = 'hora' and lh.minutos > 0
  on conflict (empleado_id, tipo, semana_inicio) do update
    set minutos    = excluded.minutos,
        horas      = excluded.horas,
        valor_hora = excluded.valor_hora,
        total      = excluded.total,
        semana_fin = excluded.semana_fin
    where l.estado <> 'pagado'
  returning l.*;
end;
$$;

grant execute on function public.generar_liquidacion_semanal(date) to authenticated;

notify pgrst, 'reload schema';
