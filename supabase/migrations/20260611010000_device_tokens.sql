-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Tokens de dispositivos para notificaciones push (FCM)
-- ════════════════════════════════════════════════════════════════════════════
-- La app Android registra acá su token de Firebase Cloud Messaging.
-- La edge function push-pedidos los usa para mandar notificaciones
-- aunque la app esté cerrada.

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android',
  role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_tokens_user_idx on public.device_tokens (user_id);
create index if not exists device_tokens_role_idx on public.device_tokens (role);

alter table public.device_tokens enable row level security;

-- Cada usuario gestiona sus propios tokens.
drop policy if exists "device_tokens own rows" on public.device_tokens;
create policy "device_tokens own rows"
  on public.device_tokens
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.device_tokens is
  'Tokens FCM de la app movil Kiku Sushi, por usuario y rol, para push notifications.';

notify pgrst, 'reload schema';
