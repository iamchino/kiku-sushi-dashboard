-- ════════════════════════════════════════════════════════════════════════════
-- 61 — IVA de las compras (crédito fiscal). Idempotente. = migración 20261118010000.
--
-- Pedido de administración (18/11): al cargar la factura de un proveedor,
-- poder poner el IVA (21 %, 10,5 %…) para que el sistema vaya sumando el
-- crédito fiscal, al lado del IVA de las ventas (SQL 57).
--
--   A) egresos.iva_credito / iva_alicuota / factura_fecha: el IVA de la
--      factura, su alícuota y la fecha de la factura (el IVA cuenta en el mes
--      de la factura, no en el del pago).
--   B) egreso_guardar_iva(): pone, cambia o saca el IVA de un pago.
--   C) iva_compras_resumen(desde, hasta): lo suma la base, por fecha de la
--      factura, para Finanzas → Resumen.
--
-- No modifica ningún pago existente: los de antes quedan sin IVA cargado.
-- Sin este SQL el dashboard nuevo funciona igual: la sección "IVA de la
-- factura" y el recuadro "IVA de las compras" no aparecen. Conviene correrlo
-- de día, antes del servicio: agrega columnas a la tabla de pagos.
-- ════════════════════════════════════════════════════════════════════════════

-- ══ A) LAS COLUMNAS ═════════════════════════════════════════════════════════
alter table public.egresos add column if not exists iva_credito numeric(12,2);
alter table public.egresos add column if not exists iva_alicuota text;
alter table public.egresos add column if not exists factura_fecha date;

comment on column public.egresos.iva_credito is
  'IVA de la factura del proveedor (crédito fiscal). Null = no se cargó. Lo que no es IVA (neto y otros conceptos) es monto - iva_credito.';
comment on column public.egresos.iva_alicuota is
  'Alícuota del IVA de la factura: 21, 10.5, 27 o mixto (varias alícuotas, IVA cargado a mano).';
comment on column public.egresos.factura_fecha is
  'Fecha de la factura del proveedor: el IVA cuenta en ese mes. Se completa al cargar el IVA (por defecto, la fecha del pago).';

alter table public.egresos drop constraint if exists egresos_iva_alicuota_check;
alter table public.egresos add constraint egresos_iva_alicuota_check
  check (iva_alicuota is null or iva_alicuota in ('21', '10.5', '27', 'mixto'));
alter table public.egresos drop constraint if exists egresos_iva_credito_check;
alter table public.egresos add constraint egresos_iva_credito_check
  check (iva_credito is null or iva_credito >= 0);

create index if not exists egresos_factura_fecha_iva_idx
  on public.egresos (factura_fecha) where iva_credito is not null;

-- El IVA no puede ser más que el pago. Va como regla con mensaje propio
-- (no como check) para que, si alguien corrige el monto para abajo, el aviso
-- se entienda.
create or replace function public.egresos_iva_validar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if NEW.iva_credito is not null and NEW.iva_credito > NEW.monto then
    raise exception 'El IVA de la factura ($%) no puede ser mayor que el monto del pago ($%). Corregí el IVA o el monto.',
      NEW.iva_credito, NEW.monto;
  end if;
  if NEW.iva_credito is null then
    NEW.iva_alicuota := null;
    NEW.factura_fecha := null;
  end if;
  return NEW;
end
$$;

drop trigger if exists trg_egresos_iva_validar on public.egresos;
create trigger trg_egresos_iva_validar
  before insert or update of iva_credito, monto, iva_alicuota, factura_fecha on public.egresos
  for each row execute function public.egresos_iva_validar();

-- ══ B) PONER, CAMBIAR O SACAR EL IVA DE UN PAGO ═════════════════════════════
-- p_iva null saca el IVA (y la alícuota y la fecha de la factura).
create or replace function public.egreso_guardar_iva(
  p_egreso_id      uuid,
  p_iva            numeric,
  p_alicuota       text default null,
  p_factura_fecha  date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eg public.egresos;
begin
  if not (public.tiene_permiso('pagos', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para cargar el IVA de los pagos.';
  end if;
  select * into v_eg from public.egresos where id = p_egreso_id for update;
  if not found then
    raise exception 'No se encontró ese pago.';
  end if;
  if p_iva is not null then
    if v_eg.categoria = 'sueldos' then
      raise exception 'Un sueldo no lleva IVA.';
    end if;
    if p_iva < 0 then
      raise exception 'El IVA no puede ser negativo.';
    end if;
    if p_alicuota is not null and p_alicuota not in ('21', '10.5', '27', 'mixto') then
      raise exception 'Alícuota inválida: %', p_alicuota;
    end if;
    if p_factura_fecha is not null and p_factura_fecha > (now() at time zone 'America/Argentina/Buenos_Aires')::date then
      raise exception 'La fecha de la factura no puede ser futura.';
    end if;
  end if;

  update public.egresos set
    iva_credito   = case when p_iva is null then null else round(p_iva, 2) end,
    iva_alicuota  = case when p_iva is null then null else coalesce(p_alicuota, 'mixto') end,
    factura_fecha = case when p_iva is null then null else coalesce(p_factura_fecha, v_eg.factura_fecha, v_eg.fecha) end
  where id = p_egreso_id;

  return (select jsonb_build_object('egreso_id', e.id, 'iva_credito', e.iva_credito,
                                    'iva_alicuota', e.iva_alicuota, 'factura_fecha', e.factura_fecha)
            from public.egresos e where e.id = p_egreso_id);
end
$$;

-- ══ C) EL IVA DE LAS COMPRAS DE UN PERÍODO ══════════════════════════════════
-- Por fecha de la factura. Cuentan pagadas y pendientes (la factura ya está),
-- también las canceladas con canje. Las anuladas ya no existen.
create or replace function public.iva_compras_resumen(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not (public.tiene_permiso('pagos', 'ver') or public.tiene_permiso('finanzas', 'ver') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para ver el IVA de las compras.';
  end if;
  select jsonb_build_object(
           'facturas', count(*),
           'total', coalesce(sum(e.monto), 0),
           'iva', coalesce(sum(e.iva_credito), 0),
           'sin_iva', coalesce(sum(e.monto - e.iva_credito), 0),
           'por_alicuota', coalesce((
             select jsonb_object_agg(a.alicuota, jsonb_build_object('facturas', a.n, 'iva', a.iva, 'total', a.total))
               from (select coalesce(x.iva_alicuota, 'mixto') as alicuota, count(*) as n,
                            sum(x.iva_credito) as iva, sum(x.monto) as total
                       from public.egresos x
                      where x.iva_credito is not null
                        and x.factura_fecha between p_desde and p_hasta
                      group by 1) a), '{}'::jsonb))
    into v
    from public.egresos e
   where e.iva_credito is not null
     and e.factura_fecha between p_desde and p_hasta;
  return v;
end
$$;

revoke all on function public.egresos_iva_validar() from public, anon, authenticated;
revoke all on function public.egreso_guardar_iva(uuid, numeric, text, date) from public, anon;
revoke all on function public.iva_compras_resumen(date, date) from public, anon;
grant execute on function public.egreso_guardar_iva(uuid, numeric, text, date) to authenticated, service_role;
grant execute on function public.iva_compras_resumen(date, date) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
-- Tiene que devolver: 3 | t | 2
select (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'egresos'
           and column_name in ('iva_credito', 'iva_alicuota', 'factura_fecha')) as columnas,
       exists (select 1 from pg_trigger where tgname = 'trg_egresos_iva_validar' and not tgisinternal) as regla_del_iva,
       (select count(*) from pg_proc
         where pronamespace = 'public'::regnamespace
           and proname in ('egreso_guardar_iva', 'iva_compras_resumen')) as funciones;
