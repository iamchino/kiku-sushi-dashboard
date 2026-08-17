-- ============================================================================
-- El rol admin deja de ver "Analíticas"
--   Se quita el recurso `analiticas` de la matriz de permisos del rol admin.
--   (Si hace falta devolvérselo, se hace desde Personal → Permisos.)
-- ============================================================================

delete from public.rol_permisos
 where rol = 'admin' and recurso = 'analiticas';

notify pgrst, 'reload schema';
