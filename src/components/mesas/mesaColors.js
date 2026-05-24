/**
 * Paleta de estados de mesa alineada con el dashboard.
 * Usa CSS variables (var(--accent)…) cuando el color depende del tema.
 * Mantiene amarillo/naranja para urgencia operativa (igual que el KDS),
 * pero las mesas "libres" y "ocupadas" se diferencian sólo con tonos
 * del accent — sin verdes ni azules.
 */
export const ESTADO_MESA_CONFIG = {
  libre: {
    label: 'Libre',
    bg:        'var(--bg-card)',
    bgSoft:    'var(--bg-card)',
    border:    'var(--border)',
    borderHi:  'var(--accent-border)',
    text:      'var(--text-muted)',
    textLight: 'var(--text-muted)',
    isLibre:   true,
  },
  ocupada: {
    label: 'Ocupada',
    bg:        'var(--accent-soft)',
    bgSoft:    'var(--accent-soft)',
    border:    'var(--accent-border)',
    borderHi:  'var(--accent-lift)',
    text:      'var(--accent-lift)',
    textLight: 'var(--accent-lift)',
  },
  en_cocina: {
    label: 'En cocina',
    bg:        '#3a2a14',
    bgSoft:    'rgba(249,115,22,0.12)',
    border:    'rgba(249,115,22,0.35)',
    borderHi:  '#f97316',
    text:      '#fdba74',
    textLight: '#fed7aa',
  },
  lista_para_cobrar: {
    label: 'Por cobrar',
    bg:        '#3a3215',
    bgSoft:    'rgba(250,204,21,0.15)',
    border:    'rgba(250,204,21,0.4)',
    borderHi:  '#facc15',
    text:      '#fde68a',
    textLight: '#fef3c7',
  },
  cobrada: {
    label: 'Facturada',
    bg:        'var(--accent)',
    bgSoft:    'var(--accent-soft)',
    border:    'var(--accent-deep)',
    borderHi:  'var(--accent-lift)',
    text:      '#ffffff',
    textLight: '#ffffff',
  },
  inactiva: {
    label: 'Inactiva',
    bg:        'var(--bg-input)',
    bgSoft:    'var(--bg-input)',
    border:    'var(--border)',
    borderHi:  'var(--border)',
    text:      'var(--text-xmuted)',
    textLight: 'var(--text-xmuted)',
  },
}

export function getEstadoConfig(estado) {
  return ESTADO_MESA_CONFIG[estado] || ESTADO_MESA_CONFIG.libre
}
