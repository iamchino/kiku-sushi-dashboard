-- 35 · Desactivar el 2FA obligatorio (vuelve al comportamiento de la capa 1).
-- Admin y finanzas entran solo con contrasena, como antes. No borra nada:
-- el panel de accesos y el boton de reset siguen; el QR deja de aparecer.
-- Para volver a activarlo algun dia: update private.config set valor = 'admin,finanzas' where clave = 'mfa_roles';

update private.config set valor = '', updated_at = now() where clave = 'mfa_roles';

-- current_app_role() igual que en la capa 1 (sin exigir aal2).
create or replace function public.current_app_role()
returns text
language sql
stable
set search_path to ''
as $$
  select case
    when auth.uid() is null then null
    else coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), 'cocina')
  end
$$;

comment on function public.current_app_role() is
  'Rol del usuario autenticado, leido de app_metadata. NULL sin sesion. Default cocina solo para usuarios logueados sin rol. (2FA obligatorio desactivado el 08/10.)';

-- mfa_roles() devuelve lista vacia: el dashboard no pide ni muestra el QR.
create or replace function public.mfa_roles()
returns text[]
language sql
stable
security definer
set search_path to 'private', 'pg_temp'
as $$
  select coalesce(
    (select case when btrim(valor) = '' then array[]::text[]
                 else string_to_array(regexp_replace(valor, '\s', '', 'g'), ',') end
       from private.config where clave = 'mfa_roles'),
    array[]::text[]
  )
$$;

notify pgrst, 'reload schema';

-- Verificacion (esperado: {} y tu rol normal)
select public.mfa_roles() as roles_con_2fa;
