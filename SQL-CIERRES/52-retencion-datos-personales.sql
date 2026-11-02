-- ════════════════════════════════════════════════════════════════════════════
-- 52 — RETENCIÓN DE DATOS PERSONALES (ISO 27701 / Ley 25.326): funciones +
-- programación. Idempotente. No borra nada al correrlo: crea la función
-- `aplicar_retencion()` y, si pg_cron está habilitado, la programa.
--
-- Plazos (decisión de negocio; cambiar acá si el local define otros):
--   · lista_espera         → se borra a los 90 días de la fecha pedida
--   · notificaciones       → se borran a los 180 días
--   · fichajes.lat/lng     → se anonimizan (null) a los 90 días (queda la hora)
--   · device_tokens / web_push_subs sin uso 180 días → se borran
--   · arca_request_log     → se borra a los 2 años (los comprobantes quedan:
--                            obligación fiscal 10 años)
--   · reservas             → a los 2 años se anonimiza teléfono/email/notas,
--                            queda la estadística (fecha, personas)
--   · clientes             → NO se tocan (son clientes activos); baja a pedido
--                            (derecho de supresión) con `borrar_cliente(id)`
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.aplicar_retencion()
returns table (tabla text, filas bigint)
language plpgsql security definer set search_path = ''
as $$
declare n bigint;
begin
  if not (public.is_admin() or public.is_finanzas_user() or current_user = 'postgres') then
    raise exception 'Solo admin/finanzas.';
  end if;

  delete from public.lista_espera where fecha < current_date - 90;
  get diagnostics n = row_count; tabla := 'lista_espera'; filas := n; return next;

  delete from public.notificaciones where created_at < now() - interval '180 days';
  get diagnostics n = row_count; tabla := 'notificaciones'; filas := n; return next;

  update public.fichajes set lat = null, lng = null, precision_m = null, distancia_m = null
   where ts < now() - interval '90 days' and (lat is not null or lng is not null);
  get diagnostics n = row_count; tabla := 'fichajes (gps anonimizado)'; filas := n; return next;

  delete from public.device_tokens where created_at < now() - interval '180 days';
  get diagnostics n = row_count; tabla := 'device_tokens'; filas := n; return next;

  delete from public.web_push_subs where coalesce(updated_at, created_at) < now() - interval '180 days';
  get diagnostics n = row_count; tabla := 'web_push_subs'; filas := n; return next;

  delete from public.arca_request_log where created_at < now() - interval '2 years';
  get diagnostics n = row_count; tabla := 'arca_request_log'; filas := n; return next;

  update public.reservas
     set cliente_telefono = null, cliente_email = null, notas = null,
         restricciones = null, accesibilidad = null,
         cliente_nombre = 'Anonimizado'
   where fecha < current_date - 730 and cliente_nombre <> 'Anonimizado';
  get diagnostics n = row_count; tabla := 'reservas (anonimizadas)'; filas := n; return next;
end $$;

revoke all on function public.aplicar_retencion() from public, anon;
grant execute on function public.aplicar_retencion() to authenticated, service_role;
comment on function public.aplicar_retencion() is
  'Aplica la política de retención de datos personales (docs/SEGURIDAD_HARDENING.md §Privacidad). Devuelve filas afectadas por tabla.';

-- Derecho de supresión (ARCO): borra/anonimiza todo lo de un cliente por
-- teléfono o email. Los comprobantes fiscales NO se tocan (obligación legal).
create or replace function public.borrar_datos_persona(p_telefono text default null, p_email text default null)
returns table (tabla text, filas bigint)
language plpgsql security definer set search_path = ''
as $$
declare n bigint; v_tel text := nullif(btrim(coalesce(p_telefono, '')), ''); v_mail text := lower(nullif(btrim(coalesce(p_email, '')), ''));
begin
  if not (public.is_admin() or public.is_finanzas_user()) then raise exception 'Solo admin/finanzas.'; end if;
  if v_tel is null and v_mail is null then raise exception 'Indicá teléfono o email.'; end if;

  update public.reservas set cliente_telefono = null, cliente_email = null, notas = null,
         restricciones = null, accesibilidad = null, cliente_nombre = 'Anonimizado'
   where (v_tel is not null and cliente_telefono = v_tel) or (v_mail is not null and lower(cliente_email) = v_mail);
  get diagnostics n = row_count; tabla := 'reservas'; filas := n; return next;

  delete from public.lista_espera
   where (v_tel is not null and cliente_telefono = v_tel) or (v_mail is not null and lower(cliente_email) = v_mail);
  get diagnostics n = row_count; tabla := 'lista_espera'; filas := n; return next;

  update public.pedidos set cliente_nombre = 'Anonimizado', cliente_telefono = null, cliente_direccion = null, notas = null
   where v_tel is not null and cliente_telefono = v_tel;
  get diagnostics n = row_count; tabla := 'pedidos'; filas := n; return next;

  delete from public.notificaciones
   where (v_tel is not null and metadata ->> 'cliente_telefono' = v_tel) or (v_mail is not null and lower(metadata ->> 'cliente_email') = v_mail);
  get diagnostics n = row_count; tabla := 'notificaciones'; filas := n; return next;

  delete from public.clientes
   where (v_tel is not null and telefono = v_tel) or (v_mail is not null and lower(email) = v_mail);
  get diagnostics n = row_count; tabla := 'clientes'; filas := n; return next;
end $$;

revoke all on function public.borrar_datos_persona(text, text) from public, anon;
grant execute on function public.borrar_datos_persona(text, text) to authenticated, service_role;

-- Programación mensual si pg_cron está habilitado (Supabase → Database →
-- Extensions → pg_cron). Si no está, correr a mano `select * from aplicar_retencion();`
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'retencion-datos-personales';
    perform cron.schedule('retencion-datos-personales', '0 5 1 * *', 'select public.aplicar_retencion();');
    raise notice 'Programado: día 1 de cada mes, 05:00 UTC';
  else
    raise notice 'pg_cron no está habilitado: correr aplicar_retencion() a mano o habilitar la extensión.';
  end if;
end $$;
