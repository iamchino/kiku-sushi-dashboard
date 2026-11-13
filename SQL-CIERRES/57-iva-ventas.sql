-- ════════════════════════════════════════════════════════════════════════════
-- 57 — IVA de las ventas: resumen por fecha de emisión. Idempotente.
-- = migración 20261115000000. No cambia ni agrega datos: solo crea una
-- función de lectura. Sin este SQL, Finanzas → Resumen no muestra el recuadro
-- del IVA; Caja y el Excel lo muestran igual.
-- ════════════════════════════════════════════════════════════════════════════
--
-- Cada factura y nota de crédito ya guarda su neto, su IVA y su total (los
-- mismos importes que se mandan a ARCA). Faltaba verlos SUMADOS para saber
-- cuánto de lo facturado es IVA (va a ARCA) y cuánto queda en el negocio.
--
-- Caja lo calcula con los pedidos que ya tiene en pantalla. Finanzas no puede:
-- el rol de finanzas no lee comprobantes_fiscales, y un mes o un año de
-- facturas pasa las 1000 filas que devuelve la API. Por eso se suma acá.
--
-- iva_ventas_resumen(desde, hasta): una fila por letra (A / B / C) y clase
-- (factura / nota_credito / nota_debito) de los comprobantes EMITIDOS en esas
-- fechas (las dos inclusive), con cantidad, neto, IVA y total en positivo.
-- El que llama resta las notas de crédito.
--   · Facturas y notas de débito: cuentan 'autorizado' y 'anulado' (la anulada
--     lo está por una nota de crédito, que es la que resta).
--   · Notas de crédito: solo 'autorizado'.
--   · Un comprobante A o B sin el desglose guardado (neto e IVA en cero con
--     total mayor a cero) se calcula con la alícuota configurada y se cuenta
--     en `estimados`.
--
-- Permisos: quien ve Finanzas o quien ya puede leer los comprobantes (Caja).
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.iva_ventas_resumen(p_desde date, p_hasta date)
returns table (
  letra     text,
  clase     text,
  cantidad  integer,
  neto      numeric,
  iva       numeric,
  total     numeric,
  estimados integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with permiso as (
    select (public.tiene_permiso('finanzas', 'ver') or public.is_finanzas_user()
            or public.puede_tabla('comprobantes_fiscales', 'ver')) as ok
  ),
  alic as (
    select coalesce((select fc.alicuota_iva from public.facturacion_config fc
                      order by fc.created_at limit 1), 21) as valor
  ),
  comp as (
    select c.letra,
           case when c.tipo_cbte in (3, 8, 13) then 'nota_credito'
                when c.tipo_cbte in (2, 7, 12) then 'nota_debito'
                else 'factura' end as clase,
           coalesce(c.importe_total, 0) as total,
           coalesce(c.importe_neto, 0)  as neto,
           coalesce(c.importe_iva, 0)   as iva,
           (coalesce(c.importe_total, 0) > 0 and coalesce(c.importe_neto, 0) = 0
              and coalesce(c.importe_iva, 0) = 0 and c.letra <> 'C') as sin_desglose
      from public.comprobantes_fiscales c
      cross join permiso p
     where p.ok
       and p_desde is not null and p_hasta is not null
       and c.fecha_emision >= p_desde and c.fecha_emision <= p_hasta
       and (
         (c.tipo_cbte in (3, 8, 13) and c.estado = 'autorizado')
         or (c.tipo_cbte in (1, 6, 11, 2, 7, 12) and c.estado in ('autorizado', 'anulado'))
       )
  )
  select c.letra, c.clase,
         count(*)::integer,
         round(sum(case when c.sin_desglose then round(c.total / (1 + a.valor / 100), 2)
                        -- Comprobante C sin desglose: no lleva IVA, todo es neto.
                        when c.letra = 'C' and c.neto = 0 and c.iva = 0 then c.total
                        else c.neto end), 2),
         round(sum(case when c.sin_desglose then c.total - round(c.total / (1 + a.valor / 100), 2) else c.iva end), 2),
         round(sum(c.total), 2),
         (count(*) filter (where c.sin_desglose))::integer
    from comp c
    cross join alic a
   group by c.letra, c.clase
   order by c.letra, c.clase
$$;

comment on function public.iva_ventas_resumen(date, date) is
  'IVA de las ventas por fecha de emisión: una fila por letra y clase (factura / nota_credito / nota_debito) con cantidad, neto, IVA y total en positivo. Solo lectura. Lo usa Finanzas → Resumen.';

revoke all on function public.iva_ventas_resumen(date, date) from public, anon;
grant execute on function public.iva_ventas_resumen(date, date) to authenticated, service_role;

-- ── Verificación ────────────────────────────────────────────────────────────
-- Tiene que devolver: t
select exists (select 1 from pg_proc
                where pronamespace = 'public'::regnamespace
                  and proname = 'iva_ventas_resumen') as funcion_creada;
