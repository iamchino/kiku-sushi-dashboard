import { supabase } from './supabase'

const ROLES_FALLBACK = ['admin', 'finanzas']

/** Roles que exigen segundo factor. Los define la base (private.config.mfa_roles). */
export async function rolesConMfa() {
  const { data, error } = await supabase.rpc('mfa_roles')
  if (error || !Array.isArray(data)) return ROLES_FALLBACK
  return data
}
