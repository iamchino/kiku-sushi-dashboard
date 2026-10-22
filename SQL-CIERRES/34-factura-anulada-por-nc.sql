-- ════════════════════════════════════════════════════════════════════════════
-- Una factura anulada por nota de crédito pasa a estado 'anulado'.
--
-- El índice comprobantes_fiscales_pedido_factura_uid admite UNA factura
-- autorizada por pedido. El dashboard permitía volver a facturar después de
-- anular con NC (06/10), pero la factura vieja seguía 'autorizado': ARCA
-- autorizaba la nueva (CAE real) y el insert fallaba por el índice. Cada
-- reintento emitía otra factura en ARCA sin guardarla.
--
-- Arreglo: cuando las NC autorizadas cubren el total de una factura, la
-- factura pasa a 'anulado' (trigger). El índice solo mira 'autorizado', así
-- que la siguiente factura entra. Se corrigen también las ya anuladas.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.marcar_factura_anulada_por_nc()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_factura   public.comprobantes_fiscales%rowtype;
  v_creditado numeric;
begin
  -- Solo notas de crédito autorizadas.
  if new.estado <> 'autorizado' or new.tipo_cbte not in (3, 8, 13) then
    return new;
  end if;

  -- Factura a la que pertenece: por vínculo, o la única factura del pedido.
  if new.cbte_asociado_id is not null then
    select * into v_factura from public.comprobantes_fiscales where id = new.cbte_asociado_id;
  else
    select * into v_factura
    from public.comprobantes_fiscales
    where pedido_id = new.pedido_id
      and estado in ('autorizado', 'anulado')
      and tipo_cbte in (1, 6, 11)
    order by created_at desc
    limit 1;
  end if;
  if v_factura.id is null or v_factura.estado <> 'autorizado' then
    return new;
  end if;

  select coalesce(sum(importe_total), 0) into v_creditado
  from public.comprobantes_fiscales
  where estado = 'autorizado'
    and tipo_cbte in (3, 8, 13)
    and (cbte_asociado_id = v_factura.id
         or (cbte_asociado_id is null and pedido_id = v_factura.pedido_id));

  if v_creditado >= v_factura.importe_total - 0.01 then
    update public.comprobantes_fiscales
       set estado = 'anulado',
           error_mensaje = coalesce(error_mensaje, '') ||
             case when coalesce(error_mensaje, '') = '' then '' else ' · ' end ||
             'Anulada por NC ' || lpad(new.punto_venta::text, 5, '0') || '-' || lpad(new.numero::text, 8, '0')
     where id = v_factura.id;
  end if;

  return new;
end $$;

drop trigger if exists trg_factura_anulada_por_nc on public.comprobantes_fiscales;
create trigger trg_factura_anulada_por_nc
  after insert or update of estado on public.comprobantes_fiscales
  for each row execute function public.marcar_factura_anulada_por_nc();

-- Facturas ya anuladas por NC antes de este cambio.
with creditos as (
  select f.id,
         f.importe_total,
         coalesce(sum(nc.importe_total), 0) as creditado
  from public.comprobantes_fiscales f
  join public.comprobantes_fiscales nc
    on nc.estado = 'autorizado' and nc.tipo_cbte in (3, 8, 13)
   and (nc.cbte_asociado_id = f.id or (nc.cbte_asociado_id is null and nc.pedido_id = f.pedido_id))
  where f.estado = 'autorizado' and f.tipo_cbte in (1, 6, 11)
  group by f.id, f.importe_total
)
update public.comprobantes_fiscales f
   set estado = 'anulado',
       error_mensaje = coalesce(f.error_mensaje, '') ||
         case when coalesce(f.error_mensaje, '') = '' then '' else ' · ' end ||
         'Anulada por nota de crédito'
  from creditos c
 where c.id = f.id and c.creditado >= c.importe_total - 0.01;

notify pgrst, 'reload schema';
