-- Lo mínimo de Supabase que el esquema de Kiku necesita para cargarse en un
-- Postgres pelado: roles, auth.uid()/role()/jwt() leyendo los claims de la
-- sesión, auth.users y un net.http_post que no hace nada.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists net;
create or replace function auth.jwt() returns jsonb language sql stable
  as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
create or replace function auth.role() returns text language sql stable
  as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 1000)
  returns bigint language sql as $$ select 1::bigint $$;
create table if not exists auth.audit_log_entries (id uuid, payload json, created_at timestamptz, ip_address text);
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz
);
grant usage on schema auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
