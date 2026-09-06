-- ============================================================
-- Migración: el ROL manda. Se va la lista blanca por email de is_finanzas_user()
--
-- EL PROBLEMA
-- --------------------------------------------------------------------------
-- `finanzas@kikusushi.com.ar` entraba a Finanzas por DOS vías: la lista blanca
-- de emails y el rol. Como ya tenía acceso por el email, su rol se usaba para
-- otra cosa (admin), y eso lo dejaba trabado:
--
--   · el chip decía "Admin" y no había forma de cambiarlo,
--   · la Edge Function lo rechazaba a propósito, porque pasarlo a rol
--     'finanzas' le sacaba is_admin() (caja, stock, configuración) sin poder
--     revertirlo, ya que nadie puede cambiarse el rol a sí mismo.
--
-- Un email hardcodeado en tres archivos distintos no es una regla de negocio,
-- es una excepción que se volvió estructura.
--
-- LA REGLA NUEVA
-- --------------------------------------------------------------------------
-- El rol es la única fuente de verdad. is_finanzas_user() deja de mirar el
-- email y pasa a mirar solamente app_metadata.role.
--
-- POR QUÉ 'admin' TAMBIÉN CUENTA ACÁ
-- --------------------------------------------------------------------------
-- No es para que los admin vean la página Finanzas — eso lo sigue decidiendo la
-- matriz de permisos, y el front mantiene esa sección exclusiva del rol
-- 'finanzas' (canAccessFinanzas en src/context/role.js).
--
-- Es por dos razones concretas:
--
--   1) TRANSICIÓN. En el momento de correr esta migración, finanzas@ todavía
--      tiene rol 'admin'. Si la función mirara sólo 'finanzas', ese usuario
--      perdería el acceso en el acto y la Edge Function admin-usuarios lo
--      rechazaría — quedándose sin forma de cambiarse el rol. Se trabaría
--      exactamente igual que antes, pero peor.
--
--   2) COHERENCIA. Las policies de empleados y egresos cuelgan de esta función
--      desde 20260628010000, que reemplazó a la política "empleados admin
--      manage". Desde entonces un admin no whitelisteado no podía tocar el
--      legajo, aunque el dashboard le muestre todo. Admin como superconjunto
--      arregla eso.
--
-- Queda MÁS permisiva que el front, que es la dirección segura: si algo no
-- cuadra, la persona no ve la pantalla; nunca al revés (ver la pantalla vacía).
--
-- QUÉ NO TOCA
-- --------------------------------------------------------------------------
-- `es_admin_permisos_de_emergencia()` sigue con el email hardcodeado, a
-- propósito. Es la llave debajo del felpudo: como la matriz de permisos vive en
-- la base y no en el código, un error de configuración no se arregla con un
-- deploy. Esa cuenta siempre tiene que poder entrar a destrabarla. Es una
-- cuenta concreta, no un rol que se reparte.
-- ============================================================

begin;

create or replace function public.is_finanzas_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('finanzas', 'admin')
$$;

comment on function public.is_finanzas_user() is
  'True si el rol del usuario es finanzas o admin. Sin listas blancas por email: '
  'el rol es la unica fuente de verdad. Gobierna las RLS de empleados/egresos y '
  'quien puede administrar logins via la Edge Function admin-usuarios. El front '
  'mantiene la PAGINA Finanzas exclusiva del rol finanzas (canAccessFinanzas en '
  'src/context/role.js): esta funcion es a proposito mas permisiva, porque la '
  'direccion segura de una divergencia es que sobre acceso en la base y falte en '
  'la pantalla, nunca al reves.';

commit;

notify pgrst, 'reload schema';
