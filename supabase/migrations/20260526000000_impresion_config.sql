-- Kiku Sushi - Configuracion central de impresoras (GG EZ Print bridge).
-- Una fila global con defaults; cada equipo puede overridear en localStorage.
-- Ejecutar desde Supabase SQL Editor.

create table if not exists public.impresion_config (
  id uuid primary key default gen_random_uuid(),

  -- Host del servidor GG EZ Print en la LAN. Ej: "192.168.0.42:8443"
  -- Si esta vacio, la app cae a window.print() (fallback).
  server_host text,

  -- Impresora de comanda interna (cocina).
  printer_comanda_name text,
  printer_comanda_type text default 'USB'
    check (printer_comanda_type in ('USB', 'Network')),

  -- Impresora de ticket no fiscal (cliente).
  printer_ticket_name text,
  printer_ticket_type text default 'USB'
    check (printer_ticket_type in ('USB', 'Network')),

  -- Impresora de ticket fiscal (factura B).
  printer_fiscal_name text,
  printer_fiscal_type text default 'USB'
    check (printer_fiscal_type in ('USB', 'Network')),

  -- Tamano de fuente base 1=normal, 2=doble, 3=triple.
  font_size integer not null default 1
    check (font_size in (1, 2, 3)),

  -- Ancho del papel en mm. 58 para XP-58, 80 para mas grandes.
  paper_width integer not null default 58
    check (paper_width in (58, 80)),

  -- Caracteres por linea segun papel + fuente. Override manual si hace falta.
  chars_per_line integer not null default 32,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger para mantener updated_at.
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'impresion_config_set_updated_at'
  ) then
    create trigger impresion_config_set_updated_at
      before update on public.impresion_config
      for each row execute function public.set_updated_at();
  end if;
exception when undefined_function then
  -- Si set_updated_at no existe en este entorno, lo creamos inline.
  create or replace function public.set_updated_at()
  returns trigger language plpgsql as $func$
  begin
    new.updated_at := now();
    return new;
  end;
  $func$;
  create trigger impresion_config_set_updated_at
    before update on public.impresion_config
    for each row execute function public.set_updated_at();
end;
$$;

-- RLS: lectura libre para usuarios autenticados, escritura solo admin.
alter table public.impresion_config enable row level security;

drop policy if exists impresion_config_select on public.impresion_config;
create policy impresion_config_select on public.impresion_config
  for select using (auth.role() = 'authenticated');

drop policy if exists impresion_config_modify on public.impresion_config;
create policy impresion_config_modify on public.impresion_config
  for all using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Una fila default si no hay ninguna, para que el front siempre tenga algo.
insert into public.impresion_config (
  server_host, font_size, paper_width, chars_per_line
)
select null, 1, 58, 32
where not exists (select 1 from public.impresion_config);
