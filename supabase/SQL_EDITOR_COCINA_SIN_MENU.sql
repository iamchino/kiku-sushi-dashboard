-- ════════════════════════════════════════════════════════════════════════════
-- COCINA SIN MENÚ & CARTA — pegar completo en el SQL Editor de Supabase
--
-- Le saca al rol cocina la sección Menú & Carta (pantalla + edición de la
-- carta). Cocina sigue viendo los platos en Órdenes/Operaciones/KDS.
-- Es reversible desde Personal → Permisos (tildar Menú & Carta en cocina).
-- ════════════════════════════════════════════════════════════════════════════

delete from public.rol_permisos
 where rol_id = 'cocina' and recurso_id = 'menu';

notify pgrst, 'reload schema';

-- Verificación: qué le queda a cocina. NO debe aparecer 'menu'.
select rp.recurso_id, r.nombre, rp.ver, rp.editar
from public.rol_permisos rp
join public.recursos r on r.id = rp.recurso_id
where rp.rol_id = 'cocina'
order by r.orden;
