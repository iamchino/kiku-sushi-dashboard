import { create } from 'zustand'
import { supabase } from './supabase'

/**
 * Configuracion de impresoras (GG EZ Print bridge).
 *
 * Persistencia hibrida:
 *  - Supabase tabla `impresion_config` guarda los defaults del negocio.
 *  - localStorage clave `kiku.printer.override` permite a cada equipo
 *    sobrescribir cualquier campo sin afectar a las demas cajas.
 *
 * Al leer hacemos: { ...remote, ...override } y devolvemos el resultado.
 * Al escribir podemos elegir explicitamente `target: 'remote' | 'local'`.
 */

const LOCAL_KEY = 'kiku.printer.override'

const DEFAULT_CONFIG = {
  server_host: '',
  printer_comanda_name: '',
  printer_comanda_type: 'USB',
  printer_ticket_name: '',
  printer_ticket_type: 'USB',
  printer_fiscal_name: '',
  printer_fiscal_type: 'USB',
  font_size: 1,
  paper_width: 58,
  chars_per_line: 32,
}

const ALLOWED_KEYS = Object.keys(DEFAULT_CONFIG)

function readLocalOverride() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(([key, value]) => ALLOWED_KEYS.includes(key) && value != null && value !== '')
    )
  } catch {
    return {}
  }
}

function writeLocalOverride(override) {
  if (typeof window === 'undefined') return
  try {
    const clean = Object.fromEntries(
      Object.entries(override || {}).filter(([key, value]) => ALLOWED_KEYS.includes(key) && value != null && value !== '')
    )
    if (Object.keys(clean).length === 0) {
      window.localStorage.removeItem(LOCAL_KEY)
    } else {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(clean))
    }
  } catch (err) {
    console.warn('[printerStore] No se pudo guardar override local:', err)
  }
}

function mergeConfig(remote, override) {
  return { ...DEFAULT_CONFIG, ...(remote || {}), ...(override || {}) }
}

export const usePrinterStore = create((set, get) => ({
  loading: true,
  loaded: false,
  remoteId: null,
  remote: { ...DEFAULT_CONFIG },
  override: {},
  config: { ...DEFAULT_CONFIG },
  error: null,

  async load() {
    set({ loading: true, error: null })

    const override = readLocalOverride()

    const { data, error } = await supabase
      .from('impresion_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      // Tabla aun no migrada: arrancamos solo con override local + defaults.
      set({
        loading: false,
        loaded: true,
        error: error.message,
        remote: { ...DEFAULT_CONFIG },
        remoteId: null,
        override,
        config: mergeConfig(null, override),
      })
      return
    }

    const remote = data
      ? Object.fromEntries(
          ALLOWED_KEYS.map(key => [key, data[key] != null ? data[key] : DEFAULT_CONFIG[key]])
        )
      : { ...DEFAULT_CONFIG }

    set({
      loading: false,
      loaded: true,
      remoteId: data?.id || null,
      remote,
      override,
      config: mergeConfig(remote, override),
    })
  },

  /**
   * Guarda valores en el destino indicado.
   *  - target: 'remote' actualiza Supabase (afecta a todos los equipos sin override).
   *  - target: 'local'  actualiza solo este equipo (override en localStorage).
   */
  async save(partial, { target = 'remote' } = {}) {
    const cleaned = Object.fromEntries(
      Object.entries(partial || {}).filter(([key]) => ALLOWED_KEYS.includes(key))
    )

    if (target === 'local') {
      const nextOverride = { ...get().override, ...cleaned }
      writeLocalOverride(nextOverride)
      set(state => ({
        override: nextOverride,
        config: mergeConfig(state.remote, nextOverride),
      }))
      return
    }

    // target === 'remote'
    const state = get()
    const next = { ...state.remote, ...cleaned }

    if (state.remoteId) {
      const { error } = await supabase
        .from('impresion_config')
        .update({ ...cleaned, updated_at: new Date().toISOString() })
        .eq('id', state.remoteId)

      if (error) {
        set({ error: error.message })
        throw error
      }
    } else {
      const { data, error } = await supabase
        .from('impresion_config')
        .insert(next)
        .select()
        .single()

      if (error) {
        set({ error: error.message })
        throw error
      }
      set({ remoteId: data.id })
    }

    set(s => ({
      remote: next,
      config: mergeConfig(next, s.override),
    }))
  },

  /** Limpia el override local (vuelve a usar lo de Supabase). */
  clearOverride() {
    writeLocalOverride({})
    set(state => ({
      override: {},
      config: mergeConfig(state.remote, {}),
    }))
  },
}))

/** Atajo: lee la config actual sincronicamente desde el store. */
export function getPrinterConfig() {
  return usePrinterStore.getState().config
}
