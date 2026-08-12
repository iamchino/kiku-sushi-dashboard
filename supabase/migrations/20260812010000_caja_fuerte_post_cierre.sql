-- ============================================================================
-- Caja fuerte: retiro POST-CIERRE
--
--   El flujo real del local: se cuenta la plata, SE CIERRA la caja, y recién
--   ahí se levanta el efectivo y va a la caja fuerte. Pero retirar_a_caja_fuerte
--   exigía turno ABIERTO y mandaba a usar "ajuste" — que no queda vinculado a
--   ningún turno. Y el arrastre de la apertura descuenta solo los depósitos
--   VINCULADOS al último turno cerrado. Resultado: la plata salía física, el
--   sistema la seguía arrastrando, y la apertura sugería montos fantasma que
--   crecían día a día ("dice que tengo que tener un millón y pico").
--
--   Fix: sin turno abierto, el retiro sale del efectivo contado del ÚLTIMO
--   CIERRE. Se crea SOLO el depósito en caja fuerte, vinculado a ese turno
--   (no se toca caja_movimientos: el arqueo de un turno cerrado ya quedó
--   contado). El arrastre — "contado del último cierre menos depósitos
--   posteriores de ese turno" — lo descuenta solo.
--
--   Con guarda: no se puede retirar más que lo que el cierre dejó menos lo ya
--   depositado. Plata que no vino de la caja va por depósito externo (ajuste).
-- ============================================================================

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
begin
  if not (public.tiene_permiso('caja_fuerte', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para operar la caja fuerte.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a cero.';
  end if;

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

    return jsonb_build_object(
      'modo', 'turno_abierto',
      'turno_id', v_turno_id,
      'movimiento_caja_id', v_mov_id,
      'deposito_id', v_dep_id,
      'saldo', public.saldo_caja_fuerte()
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

  return jsonb_build_object(
    'modo', 'post_cierre',
    'turno_id', v_cerrado_id,
    'deposito_id', v_dep_id,
    'saldo', public.saldo_caja_fuerte()
  );
end $$;

comment on function public.retirar_a_caja_fuerte(numeric, text) is
  'Retiro de efectivo de la caja a la caja fuerte. Con turno abierto descuenta '
  'el arqueo (movimiento tipo retiro). Sin turno abierto sale del efectivo del '
  'último cierre (depósito vinculado, con guarda de disponible): la próxima '
  'apertura deja de arrastrarlo.';

notify pgrst, 'reload schema';
