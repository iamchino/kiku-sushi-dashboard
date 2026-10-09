-- ════════════════════════════════════════════════════════════════════════════
-- COLA DE IMPRESIÓN — los celulares imprimen a través de la PC del local
--
-- Un celular que no llega a Comandera Print (IP, wifi, certificado) deja el
-- ticket acá. El dashboard de la PC, que sí está conectado a la impresora,
-- está suscripto por realtime: muestra un aviso grande con "Imprimir" (o
-- imprime solo, si esa PC tiene activada la opción) y marca el resultado.
-- El celular ve el estado de su ticket hasta que sale.
--
-- Estados: pendiente → imprimiendo → impreso | error | descartado.
-- Un ticket que lleva más de 60 s en "imprimiendo" vuelve a tomarse como
-- pendiente (la PC se cerró a mitad de camino). Los de más de 15 minutos se
-- consideran vencidos y no se ofrecen (evita una ráfaga de comandas viejas
-- cuando la PC vuelve).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.cola_impresion (
  id                uuid primary key default gen_random_uuid(),
  creado_at         timestamptz not null default now(),
  tipo              text not null check (tipo in ('comanda', 'ticket', 'fiscal')),
  titulo            text not null default '',
  printer_name      text not null,
  printer_type      text not null default 'USB',
  contenido         text not null,
  font_size         int  not null default 1,
  paper_width       int  not null default 58,
  qr_code_data      text,
  estado            text not null default 'pendiente'
                    check (estado in ('pendiente', 'imprimiendo', 'impreso', 'error', 'descartado')),
  error             text,
  tomado_at         timestamptz,
  resuelto_at       timestamptz,
  creado_por        uuid not null default auth.uid(),
  creado_por_nombre text not null default '',
  resuelto_por      uuid
);

comment on table public.cola_impresion is
  'Tickets que un dispositivo sin acceso a la impresora deja para que la PC del local los imprima.';

create index if not exists cola_impresion_pendientes_idx
  on public.cola_impresion (creado_at desc)
  where estado in ('pendiente', 'imprimiendo');

-- ── Limpieza: al insertar, se borran los de más de 7 días ───────────────────
create or replace function public.cola_impresion_limpiar()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  delete from public.cola_impresion where creado_at < now() - interval '7 days';
  return null; -- trigger por sentencia: el valor no se usa
end
$$;
revoke execute on function public.cola_impresion_limpiar() from public, anon, authenticated;

drop trigger if exists trg_cola_impresion_limpiar on public.cola_impresion;
create trigger trg_cola_impresion_limpiar
  before insert on public.cola_impresion
  for each statement execute function public.cola_impresion_limpiar();

-- ── Permisos ────────────────────────────────────────────────────────────────
alter table public.cola_impresion enable row level security;
revoke all on public.cola_impresion from public, anon;
grant select, insert, update on public.cola_impresion to authenticated;

-- Cualquier usuario con rol puede dejar un ticket (a su nombre).
drop policy if exists cola_impresion_insert on public.cola_impresion;
create policy cola_impresion_insert on public.cola_impresion
  for insert to authenticated
  with check (public.current_app_role() is not null and creado_por = auth.uid());

-- Todos los dispositivos ven la cola (la PC tiene que ver los de los demás).
drop policy if exists cola_impresion_select on public.cola_impresion;
create policy cola_impresion_select on public.cola_impresion
  for select to authenticated
  using (public.current_app_role() is not null);

-- Resolver (imprimir, descartar, reintentar): cualquier usuario con rol.
drop policy if exists cola_impresion_update on public.cola_impresion;
create policy cola_impresion_update on public.cola_impresion
  for update to authenticated
  using (public.current_app_role() is not null)
  with check (public.current_app_role() is not null);

-- ── Realtime ────────────────────────────────────────────────────────────────
do $$
begin
  execute 'alter publication supabase_realtime add table public.cola_impresion';
exception
  when duplicate_object then null;
end
$$;

notify pgrst, 'reload schema';
