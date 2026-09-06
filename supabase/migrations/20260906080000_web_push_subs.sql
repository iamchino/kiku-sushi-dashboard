-- ────────────────────────────────────────────────────────────────────────────
-- Web Push (navegador) — suscripciones por dispositivo.
--
-- Cocina y mozos usan Chrome en el celular, no la app nativa. Para que la
-- notificación llegue con Chrome cerrado / el celu bloqueado hace falta una
-- suscripción Web Push (RFC 8291) por dispositivo. Esta tabla las guarda y la
-- edge function `push-web` las usa para mandar los avisos.
--
-- Es el espejo web de `device_tokens` (que es FCM para la app Android).
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.web_push_subs (
  endpoint    text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists web_push_subs_role_idx on public.web_push_subs (role);
create index if not exists web_push_subs_user_idx on public.web_push_subs (user_id);

alter table public.web_push_subs enable row level security;

-- Cada usuario administra únicamente sus propias suscripciones. La edge
-- function usa la service_role key, que salta RLS.
drop policy if exists "web_push_subs_select_own" on public.web_push_subs;
create policy "web_push_subs_select_own" on public.web_push_subs
  for select using (auth.uid() = user_id);

drop policy if exists "web_push_subs_insert_own" on public.web_push_subs;
create policy "web_push_subs_insert_own" on public.web_push_subs
  for insert with check (auth.uid() = user_id);

drop policy if exists "web_push_subs_update_own" on public.web_push_subs;
create policy "web_push_subs_update_own" on public.web_push_subs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "web_push_subs_delete_own" on public.web_push_subs;
create policy "web_push_subs_delete_own" on public.web_push_subs
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.web_push_subs to authenticated;

comment on table public.web_push_subs is
  'Suscripciones Web Push del dashboard (Chrome/Android). Las consume la edge function push-web.';
