-- ════════════════════════════════════════════════════════════════════════════
-- 58 — Pedidos que no se facturan: marca con motivo. Idempotente.
-- = migración 20261116000000. Agrega una tabla chica y dos funciones; no
-- modifica `pedidos` ni ningún dato existente. Sin este SQL, Caja no ofrece el
-- botón "No se factura" y todo lo demás funciona igual.
-- Conviene correrlo de día, antes del servicio: la tabla nueva apunta a
-- `pedidos` y crear ese vínculo la toma un instante.
-- ════════════════════════════════════════════════════════════════════════════
--
-- "Pendientes de facturación" mezclaba dos cosas: lo que todavía hay que
-- facturar y lo que se decidió no facturar (un canje, una invitación, un
-- consumo interno). Con la marca, lo segundo pasa a una lista aparte y
-- Pendientes muestra solo lo que falta de verdad.
--
-- La marca NO cambia ningún total: el pedido sigue contando como vendido y como
-- no facturado en Caja, en Finanzas y en el Excel. Tampoco impide facturarlo
-- después: si se factura, la factura manda y la marca deja de mirarse.
--
--   pedidos_sin_factura            una fila por pedido marcado: motivo, quién y
--                                  cuándo. Solo lectura por la API.
--   pedido_marcar_sin_factura()    pone (o corrige) la marca. Pide motivo.
--   pedido_desmarcar_sin_factura() la saca: el pedido vuelve a Pendientes.
--
-- Permisos: marcar y desmarcar = Caja con edición (o Finanzas). Ver = quien ve
-- Caja o Finanzas.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.pedidos_sin_factura (
  pedido_id       uuid primary key references public.pedidos(id) on delete cascade,
  motivo          text not null,
  usuario_id      uuid default auth.uid(),
  usuario_nombre  text,
  created_at      timestamptz not null default now(),
  constraint pedidos_sin_factura_motivo_check check (char_length(btrim(motivo)) between 3 and 200)
);

comment on table public.pedidos_sin_factura is
  'Pedidos marcados como "no se factura", con el motivo y quién lo marcó. No cambia totales: solo los saca de Pendientes de facturación. Se escribe por pedido_marcar_sin_factura() / pedido_desmarcar_sin_factura().';

insert into public.recurso_tablas (recurso_id, tabla, escribe) values
  ('caja',     'pedidos_sin_factura', false),
  ('finanzas', 'pedidos_sin_factura', false)
on conflict do nothing;

alter table public.pedidos_sin_factura enable row level security;

drop policy if exists "pedidos_sin_factura lectura" on public.pedidos_sin_factura;
create policy "pedidos_sin_factura lectura" on public.pedidos_sin_factura for select to authenticated
  using ((select public.puede_tabla('pedidos_sin_factura', 'ver')));

revoke all on public.pedidos_sin_factura from anon, public;
revoke all on public.pedidos_sin_factura from authenticated;
grant select on public.pedidos_sin_factura to authenticated;
grant all on public.pedidos_sin_factura to service_role;

-- ── Marcar ──────────────────────────────────────────────────────────────────
create or replace function public.pedido_marcar_sin_factura(p_pedido_id uuid, p_motivo text)
returns public.pedidos_sin_factura
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_nombre text;
  v_email  text;
  v_fila   public.pedidos_sin_factura;
begin
  if not (public.tiene_permiso('caja', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para marcar pedidos como "no se factura".';
  end if;
  if p_pedido_id is null or not exists (select 1 from public.pedidos p where p.id = p_pedido_id) then
    raise exception 'No se encontró el pedido.';
  end if;
  if char_length(v_motivo) < 3 then
    raise exception 'Escribí el motivo (por qué no se factura).';
  end if;
  if char_length(v_motivo) > 200 then
    raise exception 'El motivo es muy largo (máximo 200 letras).';
  end if;
  if exists (select 1 from public.comprobantes_fiscales c
              where c.pedido_id = p_pedido_id and c.estado = 'autorizado' and c.tipo_cbte in (1, 6, 11)) then
    raise exception 'Ese pedido ya tiene una factura vigente.';
  end if;

  -- Quién: el nombre del empleado vinculado al usuario o, si no tiene, lo que
  -- va antes de la arroba de su mail.
  select nullif(btrim(e.nombre || ' ' || coalesce(e.apellido, '')), '')
    into v_nombre
    from public.empleados e
   where e.user_id = auth.uid()
   order by e.activo desc, e.created_at
   limit 1;
  if v_nombre is null then
    begin
      v_email := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
    exception when others then
      v_email := null;
    end;
    v_nombre := nullif(split_part(coalesce(v_email, ''), '@', 1), '');
  end if;

  insert into public.pedidos_sin_factura (pedido_id, motivo, usuario_id, usuario_nombre)
  values (p_pedido_id, v_motivo, auth.uid(), v_nombre)
  on conflict (pedido_id) do update
    set motivo = excluded.motivo,
        usuario_id = excluded.usuario_id,
        usuario_nombre = excluded.usuario_nombre,
        created_at = now()
  returning * into v_fila;
  return v_fila;
end
$$;

comment on function public.pedido_marcar_sin_factura(uuid, text) is
  'Marca un pedido como "no se factura" con un motivo (o corrige el motivo). No cambia totales. Rechaza pedidos con factura vigente.';

revoke all on function public.pedido_marcar_sin_factura(uuid, text) from public, anon;
grant execute on function public.pedido_marcar_sin_factura(uuid, text) to authenticated, service_role;

-- ── Desmarcar ───────────────────────────────────────────────────────────────
create or replace function public.pedido_desmarcar_sin_factura(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.tiene_permiso('caja', 'editar') or public.is_finanzas_user()) then
    raise exception 'No tenés permiso para sacar la marca "no se factura".';
  end if;
  delete from public.pedidos_sin_factura where pedido_id = p_pedido_id;
end
$$;

comment on function public.pedido_desmarcar_sin_factura(uuid) is
  'Saca la marca "no se factura": el pedido vuelve a Pendientes de facturación.';

revoke all on function public.pedido_desmarcar_sin_factura(uuid) from public, anon;
grant execute on function public.pedido_desmarcar_sin_factura(uuid) to authenticated, service_role;

-- ── Verificación ────────────────────────────────────────────────────────────
-- Tiene que devolver: t | 2
select to_regclass('public.pedidos_sin_factura') is not null as tabla_creada,
       (select count(*) from pg_proc
         where pronamespace = 'public'::regnamespace
           and proname in ('pedido_marcar_sin_factura', 'pedido_desmarcar_sin_factura')) as funciones;
