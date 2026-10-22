-- ============================================================
-- Migración: fichaje confirmado + corrección de una salida fantasma
--
-- El problema (turnos cortados a mitad de la noche):
--   La pantalla /fichar?ficha=TOKEN fichaba sola apenas se abría y recién
--   limpiaba el token de la URL cuando la RPC respondía (después de esperar
--   el GPS). Si el empleado bloqueaba el celu en ese momento, Chrome guardaba
--   la pestaña CON el token y, al reabrirla horas después, volvía a fichar
--   sin que nadie lo notara. Resultado típico:
--       18:05 entrada (QR) · 20:18 SALIDA fantasma · 00:18 el escaneo real
--       de salida queda como ENTRADA → turno cortado y una entrada huérfana.
--
-- Qué cambia en fichar():
--   · p_tipo_esperado: la pantalla ahora pide confirmar "Registrar ENTRADA /
--     SALIDA" y manda lo que el empleado confirmó. Si no coincide con lo que
--     corresponde (otra pestaña fichó en el medio), se rechaza.
--   · p_corregir_salida: si la última marca es una SALIDA por QR de hace
--     menos de 10 h que cierra una entrada, el empleado puede decir "esa
--     salida fue un error, estoy terminando ahora": la salida se MUEVE a
--     ahora (no se crea otra marca) y queda anotado en `nota`.
--   · Sin los parámetros nuevos se comporta igual que antes (compatibilidad
--     con pantallas viejas abiertas).
-- ============================================================

drop function if exists public.fichar(text, double precision, double precision, double precision);

create or replace function public.fichar(
  p_token           text,
  p_lat             double precision default null,
  p_lng             double precision default null,
  p_precision_m     double precision default null,
  p_tipo_esperado   text             default null,
  p_corregir_salida boolean          default false
)
returns table (fichaje_id uuid, tipo text, ts timestamptz, mensaje text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp        public.empleados%rowtype;
  v_punto      public.puntos_fichaje%rowtype;
  v_last       public.fichajes%rowtype;
  v_prev       public.fichajes%rowtype;
  v_tipo       text;
  v_fichaje_id uuid;
  v_ts         timestamptz;
  v_dist_m     double precision;
  v_tolerancia double precision;
  v_abandonada boolean := false;
begin
  if p_tipo_esperado is not null and p_tipo_esperado not in ('entrada', 'salida') then
    raise exception 'Tipo de fichaje inválido: %', p_tipo_esperado;
  end if;

  -- 1) empleado activo vinculado al usuario logueado
  select * into v_emp
  from public.empleados
  where user_id = auth.uid() and activo
  limit 1;
  if not found then
    raise exception 'Tu usuario no está vinculado a un empleado activo. Avisale al encargado.';
  end if;

  -- 2) validar el QR (punto de fichaje activo)
  select * into v_punto
  from public.puntos_fichaje
  where token = p_token and activo
  limit 1;
  if not found then
    raise exception 'QR inválido o inactivo. Escaneá el QR oficial del local.';
  end if;

  -- 3) geocerca: si el punto tiene ubicación, hay que estar dentro del radio.
  --    Tolerancia extra = precisión del GPS reportada, tope 60 m.
  if v_punto.lat is not null and v_punto.lng is not null then
    if p_lat is null or p_lng is null then
      raise exception 'Necesitamos tu ubicación para fichar. Activá el GPS y dale permiso al navegador.';
    end if;

    v_dist_m := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat - v_punto.lat) / 2), 2) +
      cos(radians(v_punto.lat)) * cos(radians(p_lat)) *
      power(sin(radians(p_lng - v_punto.lng) / 2), 2)
    ));
    v_tolerancia := v_punto.radio_m + least(coalesce(p_precision_m, 0), 60);

    if v_dist_m > v_tolerancia then
      raise exception 'Estás a ~% m del local (máx. % m). Tenés que fichar desde el local.',
        round(v_dist_m)::int, v_punto.radio_m;
    end if;
  end if;

  -- 4) última marca del empleado (sin mirar el día calendario: un turno que
  --    cruza la medianoche sigue siendo el mismo turno). Se bloquea la fila
  --    del empleado para que dos escaneos simultáneos no se pisen.
  perform 1 from public.empleados where id = v_emp.id for update;

  select * into v_last
  from public.fichajes f
  where f.empleado_id = v_emp.id
  order by f.ts desc, f.created_at desc
  limit 1;

  -- 5) anti doble-scan (60 s)
  if v_last.id is not null and now() - v_last.ts < interval '60 seconds' then
    raise exception 'Ya fichaste hace instantes. Esperá un momento.';
  end if;

  -- 6a) corrección: "la salida anterior fue un error, estoy saliendo ahora"
  if p_corregir_salida then
    if v_last.id is null or v_last.tipo <> 'salida' or v_last.origen <> 'qr'
       or now() - v_last.ts > interval '10 hours' then
      raise exception 'No hay una salida reciente para corregir. Avisale al encargado.';
    end if;

    select * into v_prev
    from public.fichajes f
    where f.empleado_id = v_emp.id
      and (f.ts, f.created_at) < (v_last.ts, v_last.created_at)
    order by f.ts desc, f.created_at desc
    limit 1;

    if v_prev.id is null or v_prev.tipo <> 'entrada'
       or now() - v_prev.ts > interval '16 hours' then
      raise exception 'Esa salida no cierra un turno de hoy. Avisale al encargado para corregirla.';
    end if;

    update public.fichajes f
       set ts             = now(),
           punto_id       = v_punto.id,
           lat            = p_lat,
           lng            = p_lng,
           precision_m    = p_precision_m,
           distancia_m    = case when v_dist_m is null then null else round(v_dist_m)::int end,
           registrado_por = auth.uid(),
           nota           = concat_ws(' · ', nullif(f.nota, ''),
                              'Salida corrida por el empleado (estaba a las ' ||
                              to_char(v_last.ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') || ')')
     where f.id = v_last.id
     returning f.id, f.ts into v_fichaje_id, v_ts;

    fichaje_id := v_fichaje_id;
    tipo       := 'salida';
    ts         := v_ts;
    mensaje    := 'Salida corregida: tu turno ahora termina a las ' ||
                  to_char(v_ts at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI');
    return next;
    return;
  end if;

  -- 6b) alternar entrada/salida, salvo turno abandonado
  if v_last.id is null or v_last.tipo = 'salida' then
    v_tipo := 'entrada';
  elsif now() - v_last.ts > interval '16 hours' then
    -- Entrada de hace más de 16 h: se olvidaron de fichar la salida. Este
    -- escaneo es una entrada nueva, no la salida de aquel turno.
    v_tipo       := 'entrada';
    v_abandonada := true;
  else
    v_tipo := 'salida';
  end if;

  -- 6c) lo que confirmó el empleado tiene que coincidir con lo que corresponde
  if p_tipo_esperado is not null and p_tipo_esperado <> v_tipo then
    raise exception 'Tu fichaje cambió mientras confirmabas: ahora corresponde registrar %. Revisá la pantalla y volvé a escanear.',
      upper(v_tipo);
  end if;

  -- 7) registrar (siempre a nombre del usuario logueado)
  insert into public.fichajes
    (empleado_id, tipo, ts, punto_id, origen, lat, lng, precision_m, distancia_m, registrado_por)
  values
    (v_emp.id, v_tipo, now(), v_punto.id, 'qr', p_lat, p_lng, p_precision_m,
     case when v_dist_m is null then null else round(v_dist_m)::int end,
     auth.uid())
  returning id, fichajes.ts into v_fichaje_id, v_ts;

  fichaje_id := v_fichaje_id;
  tipo       := v_tipo;
  ts         := v_ts;
  mensaje    := case
    when v_abandonada then
      'Entrada registrada. Ojo: quedó una entrada del ' ||
      to_char(v_last.ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') ||
      ' sin salida. Avisale al encargado para que la corrija.'
    when v_tipo = 'entrada' then 'Entrada registrada'
    else 'Salida registrada'
  end;
  return next;
end;
$$;

comment on function public.fichar(text, double precision, double precision, double precision, text, boolean) is
  'Registra entrada/salida por QR con geocerca. Alterna según la ÚLTIMA marca (no según el día calendario). Entrada de más de 16 h = turno abandonado. p_tipo_esperado: lo que el empleado confirmó en pantalla (si no coincide, error). p_corregir_salida: mueve a ahora una salida por QR de las últimas 10 h que cierra una entrada (salida fantasma).';

revoke all on function public.fichar(text, double precision, double precision, double precision, text, boolean) from public, anon;
grant execute on function public.fichar(text, double precision, double precision, double precision, text, boolean) to authenticated;

notify pgrst, 'reload schema';
