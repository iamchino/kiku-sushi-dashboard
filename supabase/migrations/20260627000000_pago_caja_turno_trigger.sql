-- Kiku Sushi — Asignación de turno a los pagos del lado del servidor.
--
-- Problema que resuelve:
--   El front (useFacturacion.registrarPago) leía el turno abierto en el momento
--   del cobro y, sólo si lo encontraba, ligaba el pago vía caja_turno_id. Si en
--   ese instante el cliente no veía un turno abierto (desfase de realtime, otra
--   pestaña/dispositivo, o el turno recién cerrado), el pago quedaba con
--   caja_turno_id = null y el pedido aparecía "sin turno".
--
-- Solución:
--   Un trigger BEFORE INSERT en `pagos` que, cuando el pago llega SIN turno,
--   lo completa con el turno vigente calculado en la base (fuente de verdad
--   única, sin depender del timing del cliente). Prefiere el turno 'abierto'
--   (que es único por el índice parcial) y, si no hay, cae al 'reabierto' más
--   reciente. Si no existe ningún turno vigente, deja el pago sin turno (se
--   resuelve luego con la herramienta de adjudicación de pagos sueltos).
--
--   SECURITY DEFINER: el cobro lo puede hacer un usuario no-admin (p. ej. mozo),
--   que bajo RLS no puede leer caja_turnos. La función corre con privilegios del
--   owner para poder consultar el turno vigente sin abrir esa tabla a todos.

create or replace function public.set_caja_turno_on_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Respetamos un turno asignado explícitamente desde el cliente.
  if new.caja_turno_id is not null then
    return new;
  end if;

  select t.id
    into new.caja_turno_id
  from public.caja_turnos t
  where t.estado in ('abierto', 'reabierto')
  order by
    case t.estado when 'abierto' then 0 else 1 end,  -- 'abierto' tiene prioridad
    t.apertura_at desc                               -- ante empate, el más reciente
  limit 1;

  return new;
end;
$$;

drop trigger if exists trg_set_caja_turno_on_pago on public.pagos;
create trigger trg_set_caja_turno_on_pago
  before insert on public.pagos
  for each row
  execute function public.set_caja_turno_on_pago();

comment on function public.set_caja_turno_on_pago() is
  'Completa pagos.caja_turno_id con el turno de caja vigente (abierto > reabierto) cuando el pago se inserta sin turno. Evita pedidos "sin turno" por desfase de timing o multi-dispositivo.';

notify pgrst, 'reload schema';
