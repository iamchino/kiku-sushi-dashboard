-- ============================================================
-- Migración: pagos por TRANSFERENCIA salen de la cuenta bancaria
--
-- Hasta ahora un pago por transferencia no descontaba de ningún lado: se
-- registraba el egreso y listo. La plata sale de la cuenta del negocio, así
-- que tiene que verse en el arqueo — pero NO en la caja fuerte (que es
-- efectivo físico), sino restando del ESPERADO EN TRANSFERENCIAS del turno.
--
-- Nuevo origen `banco`:
--   · Solo válido para medio_pago = 'transferencia' y estado = 'pagado'.
--   · Deja el egreso marcado con pagado_desde = 'banco'.
--   · Con turno abierto, crea un movimiento de caja tipo egreso con
--     medio_pago = 'transferencia': el esperado de transferencias baja y el
--     cierre del turno cuadra contra el resumen del banco.
--   · Sin turno abierto queda registrado igual, sin movimiento (no hay
--     arqueo al que imputarlo).
--
-- Además: `web_config.banco_cuenta` guarda el nombre de la cuenta para
-- mostrarlo en el formulario (white-label: cada instalación pone la suya).
-- ============================================================

-- ── 1) Nombre de la cuenta bancaria del negocio ─────────────────────────────
alter table public.web_config
  add column if not exists banco_cuenta text;

comment on column public.web_config.banco_cuenta is
  'Nombre de la cuenta bancaria desde la que salen las transferencias del negocio (ej: "Kiku SAS — Galicia"). Solo etiqueta para pantalla.';

-- Para la instalación de Kiku. En una instancia nueva se completa desde
-- Configuración → Negocio.
update public.web_config
   set banco_cuenta = 'Kiku SAS — Galicia'
 where id = 1
   and coalesce(banco_cuenta, '') = '';

-- ── 2) egresos.pagado_desde acepta 'banco' ──────────────────────────────────
alter table public.egresos
  drop constraint if exists egresos_pagado_desde_check;

alter table public.egresos
  add constraint egresos_pagado_desde_check
  check (pagado_desde is null or pagado_desde in ('caja', 'caja_fuerte', 'banco'));

comment on column public.egresos.pagado_desde is
  'De dónde salió la plata: caja (efectivo del turno abierto, descuenta arqueo), caja_fuerte (efectivo guardado) o banco (transferencia desde la cuenta del negocio, descuenta el esperado en transferencias del turno). Null si no se registró origen.';

-- ── 3) registrar_pago: suma el origen 'banco' ───────────────────────────────
create or replace function public.registrar_pago(
  p_categoria    text,
  p_descripcion  text,
  p_monto        numeric,
  p_medio_pago   text default 'efectivo',
  p_estado       text default 'pagado',
  p_fecha        date default current_date,
  p_proveedor_id uuid default null,
  p_empleado_id  uuid default null,
  p_subtipo      text default null,
  p_periodo      text default null,
  p_vencimiento  date default null,
  p_comprobante  text default null,
  p_notas        text default null,
  p_origen       text default 'auto'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno_id      uuid;
  v_egreso_id     uuid;
  v_mov_id        uuid;
  v_cf_id         uuid;
  v_origen        text;
  v_es_cash       boolean;
  v_es_pagado     boolean;
  v_turno_egreso  uuid;
begin
  if not (public.tiene_permiso('pagos', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para registrar pagos.';
  end if;
  if coalesce(trim(p_descripcion), '') = '' then
    raise exception 'Falta la descripción del pago.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a cero.';
  end if;
  if p_estado not in ('pagado', 'pendiente') then
    raise exception 'Estado inválido: %', p_estado;
  end if;
  if p_categoria = 'sueldos' and p_empleado_id is null then
    raise exception 'Un pago de sueldos necesita el empleado.';
  end if;
  if p_origen not in ('auto', 'caja', 'caja_fuerte', 'banco', 'ninguno') then
    raise exception 'Origen inválido: %', p_origen;
  end if;

  select ct.id into v_turno_id
  from public.caja_turnos ct
  where ct.estado = 'abierto'
  order by ct.created_at desc
  limit 1;

  v_es_pagado := (p_estado = 'pagado');
  v_es_cash   := (v_es_pagado and p_medio_pago = 'efectivo');

  -- Resolver el origen de la plata
  if not v_es_pagado then
    v_origen := null;                    -- pendiente: todavía no salió nada
  elsif p_origen = 'banco' then
    if p_medio_pago <> 'transferencia' then
      raise exception 'El origen "banco" es solo para pagos por transferencia.';
    end if;
    v_origen := 'banco';
  elsif not v_es_cash then
    v_origen := null;                    -- tarjetas/cheque: no descuentan efectivo
  elsif p_origen = 'caja_fuerte' then
    v_origen := 'caja_fuerte';
  elsif p_origen = 'caja' then
    if v_turno_id is null then
      raise exception 'No hay un turno de caja abierto: elegí caja fuerte u otro origen.';
    end if;
    v_origen := 'caja';
  elsif p_origen = 'auto' and v_turno_id is not null then
    v_origen := 'caja';
  else
    v_origen := null;                    -- 'ninguno', o auto sin turno
  end if;

  -- El egreso se vincula al turno cuando la plata sale de la caja del día o
  -- del banco con el turno abierto (en ambos casos mueve el arqueo).
  v_turno_egreso := case
    when v_origen = 'caja' then v_turno_id
    when v_origen = 'banco' then v_turno_id
    else null
  end;

  insert into public.egresos (
    fecha, categoria, subtipo, descripcion, monto, medio_pago, estado,
    vencimiento, periodo, proveedor_id, empleado_id, comprobante_nro, notas,
    caja_turno_id, pagado_desde, usuario_id
  ) values (
    coalesce(p_fecha, current_date), p_categoria, p_subtipo, trim(p_descripcion),
    p_monto, p_medio_pago, p_estado,
    p_vencimiento, p_periodo, p_proveedor_id, p_empleado_id, p_comprobante, p_notas,
    v_turno_egreso, v_origen, auth.uid()
  )
  returning id into v_egreso_id;

  if v_origen = 'caja' then
    insert into public.caja_movimientos (
      turno_id, tipo, medio_pago, monto, categoria, descripcion, egreso_id, usuario_id
    ) values (
      v_turno_id, 'egreso', 'efectivo', p_monto, p_categoria,
      'Pago: ' || trim(p_descripcion), v_egreso_id, auth.uid()
    )
    returning id into v_mov_id;

  elsif v_origen = 'banco' and v_turno_id is not null then
    -- Egreso en transferencias: baja el esperado de ese medio, no el efectivo.
    insert into public.caja_movimientos (
      turno_id, tipo, medio_pago, monto, categoria, descripcion, egreso_id, usuario_id
    ) values (
      v_turno_id, 'egreso', 'transferencia', p_monto, p_categoria,
      'Pago por transferencia: ' || trim(p_descripcion), v_egreso_id, auth.uid()
    )
    returning id into v_mov_id;

  elsif v_origen = 'caja_fuerte' then
    insert into public.caja_fuerte_movimientos (tipo, monto, descripcion, egreso_id, usuario_id)
    values ('egreso', p_monto, 'Pago: ' || trim(p_descripcion), v_egreso_id, auth.uid())
    returning id into v_cf_id;
  end if;

  return jsonb_build_object(
    'egreso_id', v_egreso_id,
    'origen', v_origen,
    'caja_turno_id', v_turno_egreso,
    'movimiento_id', v_mov_id,
    'caja_fuerte_movimiento_id', v_cf_id,
    'descuenta_arqueo', v_mov_id is not null
  );
end $$;

comment on function public.registrar_pago(text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text) is
  'Alta centralizada de egresos. p_origen: auto | caja | caja_fuerte | banco | ninguno. Caja descuenta el efectivo del arqueo; caja fuerte descuenta su saldo; banco (solo transferencias) descuenta el esperado en transferencias del turno abierto. Todo o nada.';

revoke all on function public.registrar_pago(text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text) from public;
grant execute on function public.registrar_pago(text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text) to authenticated;
grant execute on function public.registrar_pago(text, text, numeric, text, text, date, uuid, uuid, text, text, date, text, text, text) to service_role;

notify pgrst, 'reload schema';
