-- ============================================================
-- Migración: recurso `caja_fuerte_agregar` — "Caja fuerte +"
--
-- QUÉ RESUELVE
-- --------------------------------------------------------------------------
-- Guardar plata en la caja fuerte y administrar la caja fuerte son dos cosas
-- distintas. El encargado deposita el excedente al cerrar el turno; no tiene
-- por qué ver el saldo, ni el historial, ni poder hacer correcciones.
--
-- Hasta ahora el botón de guardar dependía de `caja_fuerte · editar`, que es el
-- permiso de operarla entera. Este recurso separa solo la acción de sumar.
--
-- LO QUE HABÍA QUE ARREGLAR EN LA BASE
-- --------------------------------------------------------------------------
-- Dos cosas, y la segunda es la que rompía de verdad:
--
--   1) `retirar_a_caja_fuerte()` exigía `caja_fuerte · editar`. Con el permiso
--      nuevo solo, el botón aparecía y la RPC lo rechazaba.
--
--   2) La función termina armando su respuesta con
--
--          'saldo', public.saldo_caja_fuerte()
--
--      y ESA función lanza excepción si al que llama le falta
--      `caja_fuerte · ver`. O sea: el depósito se insertaba, y después
--      explotaba la última línea. Como todo corre en una transacción, el
--      depósito se perdía y el usuario veía un error de permisos sobre algo
--      que en realidad tenía permiso de hacer.
--
--      Ahora el saldo se incluye SOLO si quien llama puede verlo. Si no,
--      viaja null y la operación termina bien. El front ya contempla ese caso:
--      el botón de Arqueo nunca muestra el saldo.
--
-- El resto de la función queda idéntica: mismos dos modos (turno abierto y
-- post-cierre), misma guarda de disponible, mismos textos.
-- ============================================================

begin;

-- ─── 1. El recurso ──────────────────────────────────────────────────────────
insert into public.recursos (id, nombre, descripcion, ruta, grupo, sensible, orden) values
  ('caja_fuerte_agregar', 'Caja fuerte +',
   'Solo guardar plata en la caja fuerte, desde el botón de Arqueo y movimientos. No muestra el saldo, ni el historial, ni permite correcciones: para eso está el permiso "Caja fuerte" completo.',
   null, 'Dinero', true, 217)
on conflict (id) do update
  set nombre = excluded.nombre, descripcion = excluded.descripcion,
      grupo = excluded.grupo, sensible = excluded.sensible, orden = excluded.orden;

insert into public.rol_permisos (rol_id, recurso_id, ver, editar)
select r.rol, 'caja_fuerte_agregar', true, true
from (values ('admin'), ('finanzas')) as r(rol)
where exists (select 1 from public.roles where id = r.rol)
on conflict (rol_id, recurso_id) do nothing;

-- ─── 2. La RPC acepta el permiso nuevo y no exige ver el saldo ──────────────
create or replace function public.retirar_a_caja_fuerte(
  p_monto numeric,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno_id      uuid;
  v_mov_id        uuid;
  v_dep_id        uuid;
  v_cerrado_id    uuid;
  v_fecha         date;
  v_cierre_at     timestamptz;
  v_denominaciones jsonb;
  v_contado       numeric;
  v_ya_depositado numeric;
  v_ve_saldo      boolean;
  v_saldo         numeric;
begin
  -- Guardar plata alcanza con "Caja fuerte +"; no hace falta el permiso de
  -- operar la caja fuerte entera.
  if not (public.tiene_permiso('caja_fuerte', 'editar')
       or public.tiene_permiso('caja_fuerte_agregar', 'editar')
       or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para guardar plata en la caja fuerte.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a cero.';
  end if;

  -- El saldo se devuelve solo a quien puede verlo. Llamar a
  -- saldo_caja_fuerte() sin ese permiso lanza excepción y, dentro de esta
  -- transacción, se llevaría puesto el depósito recién insertado.
  v_ve_saldo := public.tiene_permiso('caja_fuerte', 'ver') or public.is_finanzas_user();

  select ct.id into v_turno_id
  from public.caja_turnos ct
  where ct.estado = 'abierto'
  order by ct.created_at desc
  limit 1;

  -- ── Con turno abierto: igual que siempre ─────────────────────────────────
  -- Movimiento de caja 'retiro' (el arqueo lo descuenta) + depósito, atómico.
  if v_turno_id is not null then
    insert into public.caja_movimientos (turno_id, tipo, medio_pago, monto, categoria, descripcion, usuario_id)
    values (v_turno_id, 'retiro', 'efectivo', p_monto, 'caja_fuerte',
            coalesce('Retiro a caja fuerte · ' || nullif(trim(p_notas), ''), 'Retiro a caja fuerte'),
            auth.uid())
    returning id into v_mov_id;

    insert into public.caja_fuerte_movimientos (tipo, monto, descripcion, turno_id, usuario_id)
    values ('deposito', p_monto,
            coalesce('Depósito desde caja · ' || nullif(trim(p_notas), ''), 'Depósito desde caja'),
            v_turno_id, auth.uid())
    returning id into v_dep_id;

    if v_ve_saldo then v_saldo := public.saldo_caja_fuerte(); end if;

    return jsonb_build_object(
      'modo', 'turno_abierto',
      'turno_id', v_turno_id,
      'movimiento_caja_id', v_mov_id,
      'deposito_id', v_dep_id,
      'saldo', v_saldo
    );
  end if;

  -- ── Sin turno abierto: retiro post-cierre ────────────────────────────────
  select ct.id, ct.business_date, ct.cierre_at, ct.denominaciones_cierre
    into v_cerrado_id, v_fecha, v_cierre_at, v_denominaciones
  from public.caja_turnos ct
  where ct.estado = 'cerrado'
  order by ct.cierre_at desc, ct.created_at desc
  limit 1;

  if not found then
    raise exception
      'No hay ningún turno de caja, ni abierto ni cerrado. Si tenés efectivo para guardar, registralo como depósito externo.';
  end if;

  v_contado := nullif(coalesce(
      v_denominaciones #>> '{medios,efectivo,contado}',
      v_denominaciones #>> '{medios,efectivo,esperado}'), '')::numeric;

  select coalesce(sum(m.monto), 0) into v_ya_depositado
  from public.caja_fuerte_movimientos m
  where m.turno_id = v_cerrado_id
    and m.tipo = 'deposito'
    and m.created_at > v_cierre_at;

  if v_contado is not null and p_monto > (v_contado - v_ya_depositado) then
    raise exception
      'El cierre del % dejó $ % en efectivo y ya se depositaron $ %: quedan $ % para retirar. Si esta plata NO vino de la caja, registrala como depósito externo.',
      v_fecha, v_contado, v_ya_depositado, v_contado - v_ya_depositado;
  end if;

  -- Solo el depósito, vinculado al turno cerrado. Sin movimiento de caja: el
  -- arqueo de ese turno ya quedó contado, y el arrastre de la próxima apertura
  -- descuenta los depósitos post-cierre vinculados.
  insert into public.caja_fuerte_movimientos (tipo, monto, descripcion, turno_id, usuario_id)
  values ('deposito', p_monto,
          coalesce('Depósito del cierre de caja · ' || nullif(trim(p_notas), ''), 'Depósito del cierre de caja'),
          v_cerrado_id, auth.uid())
  returning id into v_dep_id;

  if v_ve_saldo then v_saldo := public.saldo_caja_fuerte(); end if;

  return jsonb_build_object(
    'modo', 'post_cierre',
    'turno_id', v_cerrado_id,
    'deposito_id', v_dep_id,
    'saldo', v_saldo
  );
end $$;

comment on function public.retirar_a_caja_fuerte(numeric, text) is
  'Retiro de efectivo de la caja a la caja fuerte. Alcanza con caja_fuerte_agregar '
  '(editar) o con caja_fuerte (editar). Con turno abierto descuenta el arqueo '
  '(movimiento tipo retiro); sin turno abierto sale del efectivo del ultimo cierre '
  '(deposito vinculado, con guarda de disponible) y la proxima apertura deja de '
  'arrastrarlo. El saldo viaja en la respuesta solo si quien llama puede verlo.';

commit;

notify pgrst, 'reload schema';
