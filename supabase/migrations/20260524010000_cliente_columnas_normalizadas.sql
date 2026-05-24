-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Normalización de datos de cliente en pedidos
-- ════════════════════════════════════════════════════════════════════════════
--
-- Contexto: el sitio público (kiku-reservations-main / Pedidos.tsx) hoy mete
-- nombre, teléfono y dirección del cliente concatenados como texto en la
-- columna `notas` del pedido, con el formato:
--
--   "Cliente: X | Tel: Y | Dirección: Z | Notas: notasExtra"
--
-- o, para retiro en local:
--
--   "Cliente: X | Tel: Y | Retiro en local | Notas: notasExtra"
--
-- Esto bloquea reportes, CRM, búsquedas por teléfono y la facturación
-- electrónica. Esta migración:
--
--   1) Agrega columnas dedicadas: cliente_nombre, cliente_telefono,
--      cliente_direccion (todas TEXT, nullable).
--   2) Backfilea desde `notas` sólo cuando el patrón coincide, y SIN
--      modificar `notas` original (preservación de datos). Una migración
--      futura podrá limpiar `notas` una vez verificado.
--   3) Crea un índice por teléfono (CRM / búsqueda).
--
-- Es idempotente: re-correrla no duplica trabajo (el UPDATE filtra por
-- cliente_nombre IS NULL).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Columnas nuevas ────────────────────────────────────────────────────
alter table public.pedidos
  add column if not exists cliente_nombre    text,
  add column if not exists cliente_telefono  text,
  add column if not exists cliente_direccion text;

comment on column public.pedidos.cliente_nombre    is 'Nombre del cliente que hizo el pedido. Llenado por la web pública y por el dashboard.';
comment on column public.pedidos.cliente_telefono  is 'Teléfono de contacto del cliente. Útil para CRM y para la facturación electrónica.';
comment on column public.pedidos.cliente_direccion is 'Dirección de entrega cuando el canal es delivery. NULL para retiro en local.';

-- ─── 2. Parser tolerante del formato legacy de notas ───────────────────────
-- Devuelve un record con los tres campos extraídos del string viejo.
-- Si el input no coincide con el patrón, devuelve los tres NULL.
create or replace function public.kiku_parse_notas_legacy(p_notas text)
returns table (
  cliente_nombre    text,
  cliente_telefono  text,
  cliente_direccion text
)
language plpgsql
immutable
as $$
declare
  v_nombre text;
  v_tel    text;
  v_dir    text;
begin
  if p_notas is null or btrim(p_notas) = '' then
    return query select null::text, null::text, null::text;
    return;
  end if;

  -- "Cliente: X" — captura hasta el siguiente " | " o el final.
  v_nombre := substring(p_notas from 'Cliente:\s*([^|]+?)(?:\s*\||$)');
  v_tel    := substring(p_notas from 'Tel:\s*([^|]+?)(?:\s*\||$)');
  v_dir    := substring(p_notas from 'Dirección:\s*([^|]+?)(?:\s*\||$)');

  -- Trim defensivo
  v_nombre := nullif(btrim(coalesce(v_nombre, '')), '');
  v_tel    := nullif(btrim(coalesce(v_tel, '')),    '');
  v_dir    := nullif(btrim(coalesce(v_dir, '')),    '');

  return query select v_nombre, v_tel, v_dir;
end;
$$;

comment on function public.kiku_parse_notas_legacy(text) is
  'Extrae cliente_nombre/telefono/direccion del formato viejo "Cliente: ... | Tel: ... | Dirección: ... | Notas: ...". Devuelve NULL en cada campo no encontrado.';

-- ─── 3. Backfill (solo donde cliente_nombre aún está vacío) ────────────────
with parsed as (
  select p.id,
         x.cliente_nombre    as ext_nombre,
         x.cliente_telefono  as ext_tel,
         x.cliente_direccion as ext_dir
    from public.pedidos p
    cross join lateral public.kiku_parse_notas_legacy(p.notas) as x
   where p.cliente_nombre is null
     and p.notas is not null
     and p.notas like 'Cliente:%'
)
update public.pedidos as p
   set cliente_nombre    = parsed.ext_nombre,
       cliente_telefono  = parsed.ext_tel,
       cliente_direccion = parsed.ext_dir
  from parsed
 where parsed.id = p.id
   and (parsed.ext_nombre is not null
        or parsed.ext_tel is not null
        or parsed.ext_dir is not null);

-- ─── 4. Índices útiles para CRM/búsqueda ───────────────────────────────────
create index if not exists idx_pedidos_cliente_telefono
  on public.pedidos(cliente_telefono)
  where cliente_telefono is not null;

create index if not exists idx_pedidos_cliente_nombre
  on public.pedidos(lower(cliente_nombre))
  where cliente_nombre is not null;

-- ─── 5. Recargar schema cache de PostgREST ─────────────────────────────────
notify pgrst, 'reload schema';

-- ─── 6. TODO futuro (no se ejecuta acá) ────────────────────────────────────
-- Cuando se confirme que la web y el dashboard usan las columnas nuevas,
-- agregar otra migración que:
--   a) Reemplace `notas` por sólo el contenido posterior a "Notas: " en los
--      pedidos legacy que tengan el patrón viejo.
--   b) Extienda la RPC crear_pedido_con_items() para aceptar
--      p_cliente_nombre/telefono/direccion y poblarlos directamente.
