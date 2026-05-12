-- Kiku Sushi hardening foundation
-- Run this before enabling table-level RLS policies.
--
-- Goal:
-- 1. Move operational roles out of user_metadata, which users can edit.
-- 2. Expose small helpers for policies to read app_metadata.role.

update auth.users
set raw_app_meta_data = jsonb_set(
  coalesce(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  to_jsonb(raw_user_meta_data->>'role'),
  true
)
where raw_user_meta_data ? 'role'
  and coalesce(raw_app_meta_data->>'role', '') = '';

create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), 'cocina')
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'admin'
$$;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_admin() to authenticated;

comment on function public.current_app_role() is
  'Returns the authenticated user role from JWT app_metadata.role. Defaults to cocina.';

comment on function public.is_admin() is
  'Convenience helper for RLS policies that should only allow admin users.';
