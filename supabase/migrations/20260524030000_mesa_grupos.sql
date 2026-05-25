-- ════════════════════════════════════════════════════════════════════════════
-- KIKU SUSHI — Agrupación visual de mesas
-- ════════════════════════════════════════════════════════════════════════════
--
-- Cuando dos (o más) mesas físicamente se juntan (típico: mesa 6 + mesa 7),
-- queremos que visualmente aparezcan como una sola mesa en el plano,
-- compartiendo el mismo pedido y estado. Esta migración agrega:
--
--   1. Columna `mesa_grupo_id` (FK self-ref) en la tabla `mesas`.
--      - NULL en la mesa LÍDER del grupo (la que tiene el pedido abierto).
--      - Apunta al líder en cada mesa MIEMBRO del grupo.
--   2. RPCs `agrupar_mesa(leader, member)` y `desagrupar_grupo(leader)`
--      con validaciones básicas.
--   3. RLS de UPDATE sobre mesa_grupo_id (heredada de las policies existentes
--      sobre mesas; no se agregan policies nuevas).
--
-- Importante sobre la vista `v_mesas_estado`:
--   Si tu vista usa `SELECT m.*` ya expone `mesa_grupo_id` automáticamente.
--   Si lista columnas a mano, regenerala incluyendo `m.mesa_grupo_id`.
--   Esta migración NO toca la vista para no asumir su definición exacta.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Columna
ALTER TABLE public.mesas
  ADD COLUMN IF NOT EXISTS mesa_grupo_id UUID
    REFERENCES public.mesas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mesas_mesa_grupo_id
  ON public.mesas(mesa_grupo_id);

COMMENT ON COLUMN public.mesas.mesa_grupo_id IS
  'Si está set, esta mesa es MIEMBRO de un grupo cuyo líder es la mesa apuntada. '
  'El líder tiene mesa_grupo_id = NULL. Al cerrar/cobrar el pedido del líder '
  'el frontend debe llamar a desagrupar_grupo(leader).';

-- 2) RPCs helpers (con validaciones)
CREATE OR REPLACE FUNCTION public.agrupar_mesa(
  p_leader_id UUID,
  p_member_id UUID
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_leader_id IS NULL OR p_member_id IS NULL THEN
    RAISE EXCEPTION 'leader y member son requeridos';
  END IF;

  IF p_leader_id = p_member_id THEN
    RAISE EXCEPTION 'Una mesa no puede agruparse consigo misma';
  END IF;

  -- El miembro no puede ser ya líder de otro grupo
  IF EXISTS (SELECT 1 FROM public.mesas WHERE mesa_grupo_id = p_member_id) THEN
    RAISE EXCEPTION 'La mesa miembro ya es líder de su propio grupo, desagrupala primero';
  END IF;

  -- El líder no puede ser él mismo miembro de otro grupo
  IF EXISTS (
    SELECT 1 FROM public.mesas
     WHERE id = p_leader_id AND mesa_grupo_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'La mesa líder ya pertenece a otro grupo';
  END IF;

  -- Las dos mesas deben pertenecer al mismo salón
  IF EXISTS (
    SELECT 1
      FROM public.mesas l
      JOIN public.mesas m ON m.id = p_member_id
     WHERE l.id = p_leader_id
       AND l.salon_id IS DISTINCT FROM m.salon_id
  ) THEN
    RAISE EXCEPTION 'Las mesas a agrupar deben estar en el mismo salón';
  END IF;

  UPDATE public.mesas
     SET mesa_grupo_id = p_leader_id,
         updated_at    = now()
   WHERE id = p_member_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.desagrupar_grupo(p_leader_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_leader_id IS NULL THEN
    RAISE EXCEPTION 'leader es requerido';
  END IF;

  UPDATE public.mesas
     SET mesa_grupo_id = NULL,
         updated_at    = now()
   WHERE mesa_grupo_id = p_leader_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.agrupar_mesa(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.desagrupar_grupo(UUID)   TO authenticated;
