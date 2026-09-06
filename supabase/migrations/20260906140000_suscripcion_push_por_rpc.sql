-- ============================================================================
-- La suscripción push se guarda por RPC, no con un upsert desde el navegador
--
--   Dos problemas del diseño original, los dos por la misma causa: el endpoint
--   de Web Push identifica al NAVEGADOR, no a la persona.
--
--   1. Un equipo compartido quedaba trabado. Si en la tablet se activaron las
--      notificaciones con la sesión del mozo, la fila queda a nombre del mozo.
--      Cuando después entra cocina en el mismo navegador, el endpoint que
--      devuelve el navegador es EL MISMO, el upsert choca con esa fila y la
--      policy `auth.uid() = user_id` le prohíbe pisarla. Resultado: cocina no
--      se podía registrar nunca, y el error que veía era un genérico
--      "no se pudo guardar".
--
--   2. El rol lo mandaba el cliente. `role` viajaba en el insert desde el
--      navegador, así que cualquiera con la consola abierta podía registrarse
--      como 'admin' o 'cocina' y recibir avisos que no le corresponden.
--
--   Las dos se arreglan moviendo la escritura a una RPC security definer: el
--   usuario y el rol salen del JWT en el servidor, y tomar posesión de un
--   endpoint es legítimo porque solo lo conoce quien tiene ese navegador.
-- ============================================================================

create or replace function public.guardar_suscripcion_push(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Sin sesión';
  end if;

  insert into public.web_push_subs
    (endpoint, user_id, role, p256dh, auth, user_agent, updated_at)
  values
    (p_endpoint, auth.uid(), public.current_app_role(),
     p_p256dh, p_auth, left(p_user_agent, 300), now())
  on conflict (endpoint) do update
    -- Reasignación explícita: el que se registra ahora en este navegador pasa
    -- a ser el dueño del endpoint. Es lo correcto — los avisos tienen que ir
    -- al rol de la sesión que está abierta, no a la que estuvo antes.
    set user_id    = excluded.user_id,
        role       = excluded.role,
        p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        user_agent = excluded.user_agent,
        updated_at = now();
end $$;

revoke execute on function public.guardar_suscripcion_push(text, text, text, text) from public;
grant  execute on function public.guardar_suscripcion_push(text, text, text, text) to authenticated;

comment on function public.guardar_suscripcion_push(text, text, text, text) is
  'Registra el navegador actual para Web Push. El usuario y el rol salen del '
  'JWT, no del cliente. Si el endpoint ya existía, cambia de dueño: un equipo '
  'compartido entre mozo y cocina tiene que poder alternar.';

-- El cliente ya no escribe la tabla directo: que la RPC sea el único camino
-- evita que vuelva a colarse un rol elegido por el navegador.
revoke insert, update on public.web_push_subs from authenticated;
