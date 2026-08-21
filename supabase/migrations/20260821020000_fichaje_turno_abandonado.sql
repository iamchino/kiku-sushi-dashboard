-- ============================================================
-- Migración: fichaje — una entrada olvidada deja de arruinar la siguiente
--
-- El problema real (turnos que cruzan la medianoche):
--   1) El empleado entra a las 18:00 y sale a la 01:00 del día siguiente.
--   2) La pantalla de fichaje leía SOLO las marcas del día calendario, así
--      que pasada la medianoche le decía "Fuera" y "Hoy 0 m": el turno en
--      curso desaparecía de la vista.
--   3) Viendo que figuraba afuera, muchas veces no fichaban la salida.
--   4) Al día siguiente, al entrar a las 18:00, la última marca seguía
--      siendo aquella entrada → el sistema registraba SALIDA. Resultado:
--      una jornada de 24 h y toda la alternancia entrada/salida corrida.
--
-- El punto 2 se arregla en el front (la pantalla ahora muestra la jornada
-- en curso aunque haya empezado ayer). Acá se blinda la base:
--
--   Si la última marca es una ENTRADA de hace más de 16 horas, esa jornada
--   se considera ABANDONADA (nadie trabaja 16 h seguidas en el local) y el
--   nuevo fichaje se registra como ENTRADA, no como salida. La entrada
--   huérfana queda sin par: no suma horas y se ve como jornada abierta en
--   Personal → Fichajes, para que Finanzas le cargue la salida real.
--
-- 16 h es el mismo tope que ya usa el editor manual de jornadas.
-- ============================================================

create or replace function public.fichar(
  p_token       text,
  p_lat         double precision default null,
  p_lng         double precision default null,
  p_precision_m double precision default null
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
  v_tipo       text;
  v_fichaje_id uuid;
  v_ts         timestamptz;
  v_dist_m     double precision;
  v_tolerancia double precision;
  v_abandonada boolean := false;
begin
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
  --    cruza la medianoche sigue siendo el mismo turno)
  select * into v_last
  from public.fichajes
  where empleado_id = v_emp.id
  order by ts desc, created_at desc
  limit 1;

  -- 5) anti doble-scan (60 s)
  if v_last.id is not null and now() - v_last.ts < interval '60 seconds' then
    raise exception 'Ya fichaste hace instantes. Esperá un momento.';
  end if;

  -- 6) alternar entrada/salida, salvo turno abandonado
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

comment on function public.fichar(text, double precision, double precision, double precision) is
  'Registra entrada/salida por QR con geocerca. Alterna según la ÚLTIMA marca (no según el día calendario, para turnos que cruzan la medianoche). Si la última marca es una entrada de hace más de 16 h, se asume turno abandonado y el fichaje nuevo es una entrada.';

grant execute on function public.fichar(text, double precision, double precision, double precision) to authenticated;

notify pgrst, 'reload schema';
