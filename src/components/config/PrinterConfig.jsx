import { useEffect, useState, useMemo } from 'react'
import {
  Printer, Plug, RefreshCw, Save, Loader2,
  CheckCircle2, AlertTriangle, FileText, Receipt, ScrollText,
} from 'lucide-react'
import { usePrinterStore } from '../../lib/printerStore'
import { printerClient } from '../../lib/printerClient'
import { printComanda, printCustomerTicket, printFiscalTicket } from '../../lib/printing'

const TICKET_KINDS = [
  {
    key: 'comanda',
    nameField: 'printer_comanda_name',
    typeField: 'printer_comanda_type',
    label: 'Comanda (cocina)',
    description: 'Comanda interna que va al lugar de preparacion.',
    Icon: ScrollText,
  },
  {
    key: 'ticket',
    nameField: 'printer_ticket_name',
    typeField: 'printer_ticket_type',
    label: 'Ticket cliente',
    description: 'Ticket no fiscal para entregar al cliente.',
    Icon: Receipt,
  },
  {
    key: 'fiscal',
    nameField: 'printer_fiscal_name',
    typeField: 'printer_fiscal_type',
    label: 'Factura B (fiscal)',
    description: 'Comprobante fiscal autorizado por ARCA.',
    Icon: FileText,
  },
]

const PAPER_OPTIONS = [
  { value: 58, label: '58 mm (XP-58)' },
  { value: 80, label: '80 mm' },
]
const FONT_OPTIONS = [
  { value: 1, label: 'Normal' },
  { value: 2, label: 'Doble' },
  { value: 3, label: 'Triple' },
]

const FIELD_STYLE = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
}

export default function PrinterConfig() {
  const { loading, config, override, load, save, clearOverride } = usePrinterStore()

  const [host, setHost] = useState('')
  const [target, setTarget] = useState('remote') // remote | local
  const [draft, setDraft] = useState({})
  const [printers, setPrinters] = useState([])
  const [discoverState, setDiscoverState] = useState('idle') // idle|loading|ok|error
  const [discoverError, setDiscoverError] = useState(null)
  const [saveState, setSaveState] = useState('idle') // idle|saving|ok|error
  const [saveError, setSaveError] = useState(null)
  const [testState, setTestState] = useState({})       // por kind

  // Cargar config al montar.
  useEffect(() => { load() }, [load])

  // Sincronizar draft con la config efectiva.
  useEffect(() => {
    setDraft({
      printer_comanda_name: config.printer_comanda_name || '',
      printer_comanda_type: config.printer_comanda_type || 'USB',
      printer_ticket_name:  config.printer_ticket_name || '',
      printer_ticket_type:  config.printer_ticket_type || 'USB',
      printer_fiscal_name:  config.printer_fiscal_name || '',
      printer_fiscal_type:  config.printer_fiscal_type || 'USB',
      font_size:      config.font_size || 1,
      paper_width:    config.paper_width || 58,
      chars_per_line: config.chars_per_line || 32,
    })
    setHost(config.server_host || '')
  }, [config.printer_comanda_name, config.printer_comanda_type,
      config.printer_ticket_name, config.printer_ticket_type,
      config.printer_fiscal_name, config.printer_fiscal_type,
      config.font_size, config.paper_width, config.chars_per_line, config.server_host])

  const hasLocalOverride = useMemo(() => Object.keys(override).length > 0, [override])

  const discoverPrinters = async () => {
    setDiscoverState('loading'); setDiscoverError(null)
    try {
      // Primero guardamos el host actual al destino elegido para que el cliente lo lea.
      await save({ server_host: host.trim() }, { target })
      const list = await printerClient.listPrinters(host.trim())
      setPrinters(list)
      setDiscoverState('ok')
    } catch (err) {
      setDiscoverState('error')
      setDiscoverError(err.message || 'No se pudo conectar')
    }
  }

  const handleSave = async () => {
    setSaveState('saving'); setSaveError(null)
    try {
      await save({ server_host: host.trim(), ...draft }, { target })
      setSaveState('ok')
      setTimeout(() => setSaveState('idle'), 1800)
    } catch (err) {
      setSaveState('error')
      setSaveError(err.message || 'Error al guardar')
    }
  }

  const testPrint = async (kind) => {
    setTestState(s => ({ ...s, [kind]: 'loading' }))
    // Guardar primero para que printing.js lea la config correcta.
    try {
      await save({ server_host: host.trim(), ...draft }, { target })
    } catch {
      // Si guardar falla seguimos igual: la impresion va a usar el draft de la sesion solo si lo guardamos en local.
    }

    const samplePedido = {
      id: 'PRUEBA1234',
      created_at: new Date().toISOString(),
      canal: 'salon',
      mesa: 1,
      personas: 2,
      cliente_nombre: 'Prueba de impresion',
      descuento_porcentaje: 0,
      total: 5500,
      pedido_items: [
        { nombre: 'Combo de prueba', cantidad: 1, precio_unitario: 5500, notas: 'Sin algas' },
      ],
      notas: 'Ticket de prueba enviado desde Configuracion',
    }

    try {
      if (kind === 'comanda') await printComanda(samplePedido)
      else if (kind === 'ticket') await printCustomerTicket(samplePedido, {})
      else if (kind === 'fiscal') await printFiscalTicket(samplePedido, {
        punto_venta: 1, numero: 1, cae: '00000000000000', fecha_emision: new Date().toISOString().slice(0, 10),
        importe_neto: 4545.45, importe_iva: 954.55, importe_total: 5500,
        receptor_nombre: 'Consumidor Final',
      }, {})
      setTestState(s => ({ ...s, [kind]: 'ok' }))
      setTimeout(() => setTestState(s => ({ ...s, [kind]: 'idle' })), 1800)
    } catch (err) {
      setTestState(s => ({ ...s, [kind]: 'error', [`${kind}_err`]: err.message }))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={16} className="animate-spin mr-2" />
        Cargando configuracion...
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Banner explicativo */}
      <div className="rounded-xl p-4 text-xs leading-relaxed" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
        <p className="mb-1">
          <strong style={{ color: 'var(--text-primary)' }}>GG EZ Print</strong> es el puente local que imprime
          directo en la impresora termica (XP-58, Epson, etc) sin abrir el dialogo del navegador.
        </p>
        <p>
          Asegurate de tenerlo corriendo en la PC de caja. La <em>Direccion</em> figura en el menu del icono
          (click derecho sobre el tray icon de impresora).
        </p>
      </div>

      {/* Destino del guardado */}
      <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Guardar cambios en
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <label className="flex-1 flex items-start gap-2 p-3 rounded-lg cursor-pointer" style={{ background: target === 'remote' ? 'var(--bg-hover)' : 'transparent', border: `1px solid ${target === 'remote' ? 'var(--accent)' : 'var(--border)'}` }}>
            <input type="radio" name="target" value="remote" checked={target === 'remote'} onChange={() => setTarget('remote')} className="mt-1" />
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Default del negocio (Supabase)</div>
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Sirve para todas las PCs que no tengan override local.</div>
            </div>
          </label>
          <label className="flex-1 flex items-start gap-2 p-3 rounded-lg cursor-pointer" style={{ background: target === 'local' ? 'var(--bg-hover)' : 'transparent', border: `1px solid ${target === 'local' ? 'var(--accent)' : 'var(--border)'}` }}>
            <input type="radio" name="target" value="local" checked={target === 'local'} onChange={() => setTarget('local')} className="mt-1" />
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Solo este equipo (localStorage)</div>
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Override que pisa el default sin afectar a otras cajas.</div>
            </div>
          </label>
        </div>
        {hasLocalOverride && (
          <div className="flex items-center justify-between text-[11px] pt-1" style={{ color: 'var(--text-muted)' }}>
            <span>Este equipo tiene override local activo en: {Object.keys(override).join(', ')}</span>
            <button type="button" onClick={clearOverride} className="px-2 py-1 rounded text-[11px]" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              Quitar override
            </button>
          </div>
        )}
      </div>

      {/* Servidor */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <Plug size={14} style={{ color: 'var(--accent)' }} />
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Servidor GG EZ Print
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={host}
            onChange={e => setHost(e.target.value)}
            placeholder="Ej: 192.168.0.42:8443"
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={FIELD_STYLE}
          />
          <button
            type="button"
            onClick={discoverPrinters}
            disabled={!host.trim() || discoverState === 'loading'}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
          >
            {discoverState === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Conectar y listar
          </button>
        </div>
        {discoverState === 'ok' && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: '#22c55e' }}>
            <CheckCircle2 size={13} /> Conectado. Se detectaron {printers.length} impresora(s).
          </div>
        )}
        {discoverState === 'error' && (
          <div className="flex items-start gap-1.5 text-xs" style={{ color: '#ef4444' }}>
            <AlertTriangle size={13} className="mt-0.5" />
            <span>
              No se pudo conectar: {discoverError}.
              Revisa que <code>gg-ez-print.exe</code> este corriendo y que hayas instalado el certificado CA desde el tray.
            </span>
          </div>
        )}
      </div>

      {/* Impresoras por tipo */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <Printer size={14} style={{ color: 'var(--accent)' }} />
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Impresoras por tipo de ticket
          </p>
        </div>

        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {TICKET_KINDS.map(({ key, nameField, typeField, label, description, Icon }) => {
            const testStatus = testState[key]
            return (
              <div key={key} className="p-4 space-y-2" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <Icon size={15} style={{ color: 'var(--text-secondary)' }} className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{description}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => testPrint(key)}
                    disabled={testStatus === 'loading'}
                    className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 disabled:opacity-50"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                    title="Imprimir ticket de prueba"
                  >
                    {testStatus === 'loading' && <Loader2 size={11} className="animate-spin" />}
                    {testStatus === 'ok' && <CheckCircle2 size={11} style={{ color: '#22c55e' }} />}
                    {testStatus === 'error' && <AlertTriangle size={11} style={{ color: '#ef4444' }} />}
                    Probar
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
                  {printers.length > 0 ? (
                    <select
                      value={draft[nameField] || ''}
                      onChange={e => setDraft(d => ({ ...d, [nameField]: e.target.value }))}
                      className="px-3 py-2 rounded-lg text-sm outline-none"
                      style={FIELD_STYLE}
                    >
                      <option value="">— Sin asignar —</option>
                      {printers.map(p => (
                        <option key={p.name} value={p.name}>{p.name} ({p.type})</option>
                      ))}
                      {/* Si el valor actual no esta en la lista detectada, lo mostramos igual */}
                      {draft[nameField] && !printers.find(p => p.name === draft[nameField]) && (
                        <option value={draft[nameField]}>{draft[nameField]} (no detectada)</option>
                      )}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={draft[nameField] || ''}
                      onChange={e => setDraft(d => ({ ...d, [nameField]: e.target.value }))}
                      placeholder="Nombre Windows o IP (ej: XP-58)"
                      className="px-3 py-2 rounded-lg text-sm outline-none"
                      style={FIELD_STYLE}
                    />
                  )}
                  <select
                    value={draft[typeField] || 'USB'}
                    onChange={e => setDraft(d => ({ ...d, [typeField]: e.target.value }))}
                    className="px-3 py-2 rounded-lg text-sm outline-none"
                    style={FIELD_STYLE}
                  >
                    <option value="USB">USB / Sistema</option>
                    <option value="Network">Red (IP)</option>
                  </select>
                </div>
                {testStatus === 'error' && (
                  <div className="text-[11px]" style={{ color: '#ef4444' }}>
                    {testState[`${key}_err`] || 'Error en impresion'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Ajustes de impresion */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Formato del papel
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-muted)' }}>Ancho papel</label>
            <select
              value={draft.paper_width || 58}
              onChange={e => setDraft(d => ({ ...d, paper_width: Number(e.target.value) }))}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={FIELD_STYLE}
            >
              {PAPER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-muted)' }}>Tamano de fuente</label>
            <select
              value={draft.font_size || 1}
              onChange={e => setDraft(d => ({ ...d, font_size: Number(e.target.value) }))}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={FIELD_STYLE}
            >
              {FONT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-muted)' }}>Caracteres por linea</label>
            <input
              type="number"
              min="20" max="64"
              value={draft.chars_per_line || 32}
              onChange={e => setDraft(d => ({ ...d, chars_per_line: Number(e.target.value) }))}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={FIELD_STYLE}
            />
          </div>
        </div>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          XP-58 a fuente normal: 32 columnas. A doble: 16. A triple: 10. Si el ticket se corta, bajar a 30.
        </p>
      </div>

      {/* Guardar */}
      <div className="flex items-center justify-end gap-2">
        {saveState === 'ok' && (
          <span className="flex items-center gap-1 text-xs" style={{ color: '#22c55e' }}>
            <CheckCircle2 size={13} /> Guardado
          </span>
        )}
        {saveState === 'error' && (
          <span className="flex items-center gap-1 text-xs" style={{ color: '#ef4444' }}>
            <AlertTriangle size={13} /> {saveError}
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saveState === 'saving'}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-deep))' }}
        >
          {saveState === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar configuracion
        </button>
      </div>
    </div>
  )
}
