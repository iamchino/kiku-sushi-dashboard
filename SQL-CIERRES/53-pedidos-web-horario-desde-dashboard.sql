-- ════════════════════════════════════════════════════════════════════════════
-- 53 — Los pedidos online respetan los días del dashboard (y las aperturas
-- especiales). Idempotente. = migración 20261102000000.
--
-- BUG: el trigger `pedido_web_horario_check()` (31/05) tenía los días y el
-- horario escritos a mano: martes a sábado desde las 19:30. Nunca se enteró
-- de `reservas_dias.pedidos` (12/10, columna "Pedidos" de Configuración →
-- Reservas) ni de `aperturas_especiales` (takeaway temprano un día de
-- partido). Resultado: el dashboard prende el lunes, la web deja armar el
-- pedido, y al confirmar la base lo rechaza con "Estamos cerrados ahora.
-- Programá tu pedido (Mar–Jue 19:30–00:00, Vie–Sáb 19:30–01:00)".
--
-- Ahora el trigger lee lo mismo que la web:
--   · días: reservas_dias.pedidos (si la columna no existe: noche; sin filas:
--     martes a sábado como antes)
--   · apertura: 19:30, o la de aperturas_especiales para esa fecha y canal
--   · viernes y sábado siguen hasta la 01:00 (madrugada de sáb y dom)
--   · el mensaje de error se arma con los días reales
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.dias_pedidos_web()
returns int[]
language sql
stable
set search_path = ''
as $$
  -- Días (0=Dom..6=Sáb) en que se toman pedidos online. Prioridad: columna
  -- `pedidos`; si todas son null (columna recién creada) → `noche`; si no hay
  -- filas → martes a sábado.
  select case
    when not exists (select 1 from public.reservas_dias) then array[2,3,4,5,6]
    when exists (select 1 from public.reservas_dias where pedidos is not null)
      then coalesce((select array_agg(dow order by dow) from public.reservas_dias where pedidos), array[]::int[])
    else coalesce((select array_agg(dow order by dow) from public.reservas_dias where noche), array[2,3,4,5,6])
  end
$$;

revoke all on function public.dias_pedidos_web() from public;
grant execute on function public.dias_pedidos_web() to anon, authenticated, service_role;

create or replace function public.texto_dias_pedidos(p_dias int[])
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  nombres text[] := array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  orden   int[]  := array[1,2,3,4,5,6,0];
  d int; partes text[] := '{}'; tramo int[] := '{}';
  function_result text;
begin
  -- Agrupa días consecutivos (lunes→domingo) en "martes a jueves"; sueltos van solos.
  foreach d in array orden loop
    if d = any(p_dias) then
      tramo := tramo || d;
    elsif array_length(tramo, 1) > 0 then
      partes := partes || case when array_length(tramo, 1) >= 3
        then nombres[tramo[1] + 1] || ' a ' || nombres[tramo[array_length(tramo, 1)] + 1]
        else (select string_agg(nombres[x + 1], ', ') from unnest(tramo) x) end;
      tramo := '{}';
    end if;
  end loop;
  if array_length(tramo, 1) > 0 then
    partes := partes || case when array_length(tramo, 1) >= 3
      then nombres[tramo[1] + 1] || ' a ' || nombres[tramo[array_length(tramo, 1)] + 1]
      else (select string_agg(nombres[x + 1], ', ') from unnest(tramo) x) end;
  end if;
  if array_length(partes, 1) is null then return 'ningún día por ahora'; end if;
  if array_length(partes, 1) = 1 then return partes[1]; end if;
  function_result := array_to_string(partes[1:array_length(partes, 1) - 1], ', ') || ' y ' || partes[array_length(partes, 1)];
  return function_result;
end $$;

create or replace function public.pedido_web_horario_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ahora    timestamp := (now() at time zone 'America/Argentina/Buenos_Aires');
  v_target   timestamp;
  v_dow      int;
  v_t        time;
  v_abierto  boolean;
  v_dias     int[];
  v_apertura time := time '19:30';
  v_esp      int;
  v_texto    text;
begin
  if new.origen = 'web' and coalesce(new.canal, '') in ('delivery', 'takeaway') then

    if new.programado_para is null then
      v_target := v_ahora;
    else
      if new.programado_para < now() + interval '30 minutes' then
        raise exception 'Programá con al menos 30 minutos de anticipación.';
      end if;
      if new.programado_para > now() + interval '3 days' then
        raise exception 'Solo se puede programar hasta 3 días de anticipación.';
      end if;
      v_target := (new.programado_para at time zone 'America/Argentina/Buenos_Aires');
    end if;

    v_dow  := extract(dow from v_target)::int;   -- 0=Dom .. 6=Sáb
    v_t    := v_target::time;
    v_dias := public.dias_pedidos_web();

    -- Apertura especial para esa fecha y canal (ej. takeaway desde las 13:00
    -- un día de partido). Mismo criterio que la web.
    select a.apertura_min into v_esp
      from public.aperturas_especiales a
     where a.activo and a.fecha = v_target::date
       and (a.canal = 'ambos' or a.canal = new.canal)
     order by a.apertura_min limit 1;
    if v_esp is not null then
      v_apertura := make_time(v_esp / 60, v_esp % 60, 0);
    end if;

    v_abierto :=
         (v_dow = any(v_dias) and v_t >= v_apertura)
      or (v_dow in (6, 0) and v_t <= time '01:00'
          and ((v_dow - 1 + 7) % 7) = any(v_dias));   -- madrugada: vale si la noche anterior tomaba pedidos

    if not v_abierto then
      v_texto := public.texto_dias_pedidos(v_dias);
      if new.programado_para is null then
        raise exception 'Estamos cerrados ahora. Programá tu pedido: tomamos pedidos % desde las %.',
          v_texto, to_char(v_apertura, 'HH24:MI');
      else
        raise exception 'Ese horario está fuera de atención: tomamos pedidos % desde las %.',
          v_texto, to_char(v_apertura, 'HH24:MI');
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_pedido_web_horario on public.pedidos;
create trigger trg_pedido_web_horario
  before insert on public.pedidos
  for each row execute function public.pedido_web_horario_check();

comment on function public.pedido_web_horario_check() is
  'Valida día/hora de los pedidos web contra reservas_dias.pedidos y aperturas_especiales (lo mismo que ve la web). Antes tenía martes a sábado escrito a mano.';

-- Verificación: días en que hoy se toman pedidos online
select public.dias_pedidos_web() as dias_pedidos, public.texto_dias_pedidos(public.dias_pedidos_web()) as texto;
