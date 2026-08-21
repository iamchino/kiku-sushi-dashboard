import { supabase } from './supabase'

// Postgres NO da error cuando RLS bloquea un DELETE: simplemente no borra
// ninguna fila y Supabase devuelve éxito. El resultado era que el botón de
// borrar "andaba" (el diálogo se cerraba) y la fila seguía ahí, sin ningún
// mensaje. Pedimos las filas borradas para poder distinguir los dos casos.
export async function borrarFila(tabla, id, queEs = 'el registro') {
  const { data, error } = await supabase.from(tabla).delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error(
      `No se pudo borrar ${queEs}: tu usuario no tiene permiso para eliminar en ${tabla}. ` +
      'Pedile a un admin que te habilite la edición de esa sección.',
    )
  }
  return data[0]
}
