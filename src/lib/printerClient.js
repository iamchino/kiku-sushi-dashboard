/**
 * Cliente WebSocket para GG EZ Print.
 *
 * GG EZ Print expone wss://<IP_LAN>:8443/ws y acepta dos mensajes JSON:
 *   - { action: "list" } -> responde { type: "printer_list", printers: [...] }
 *   - { action: "print", data: { printer_name, type, content, font_size, paper_width } }
 *       -> responde { status: "success" } o { status: "error", message: "..." }
 *
 * Mantenemos una unica conexion abierta (singleton por host). Las llamadas
 * encolan promesas que se resuelven con la primera respuesta valida del server.
 * Si el WebSocket no se puede abrir, las llamadas rechazan rapidamente para
 * que el caller pueda hacer fallback a window.print().
 */

import { getPrinterConfig } from './printerStore'

const CONNECT_TIMEOUT_MS = 4000
const REQUEST_TIMEOUT_MS = 8000
const RECONNECT_DELAY_MS = 5000

class PrinterClient {
  constructor() {
    this.host = null            // 'IP:8443'
    this.ws = null              // WebSocket actual o null
    this.connecting = null      // Promise en vuelo si estamos abriendo conexion
    this.queue = []             // [{ id, resolve, reject, match, timeoutId }]
    this.nextId = 1
    this.lastError = null
    this.listeners = new Set()  // suscriptores al estado de conexion
  }

  /** Subscribirse al estado del cliente. cb({ connected, host, error }). */
  subscribe(cb) {
    this.listeners.add(cb)
    cb(this.state())
    return () => this.listeners.delete(cb)
  }

  state() {
    return {
      connected: !!this.ws && this.ws.readyState === WebSocket.OPEN,
      host: this.host,
      error: this.lastError,
    }
  }

  notify() {
    const snap = this.state()
    this.listeners.forEach(cb => {
      try { cb(snap) } catch (err) { console.warn('[printerClient] listener error', err) }
    })
  }

  buildUrl(host) {
    if (!host) return null
    const clean = String(host).trim()
      .replace(/^wss?:\/\//i, '')
      .replace(/\/+$/, '')
    if (!clean) return null
    // Si no especifica puerto, asumimos 8443.
    const hasPort = /:\d+$/.test(clean)
    return `wss://${hasPort ? clean : clean + ':8443'}/ws`
  }

  /** Asegura conexion al host indicado. Devuelve el WebSocket abierto. */
  async ensureConnected(host) {
    if (!host) throw new Error('GG EZ Print: server_host no configurado')

    // Cambio de host: cerramos lo anterior.
    if (this.ws && this.host !== host) {
      try { this.ws.close() } catch { /* ignore */ }
      this.ws = null
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) return this.ws
    if (this.connecting) return this.connecting

    const url = this.buildUrl(host)
    if (!url) throw new Error('GG EZ Print: host invalido')

    this.host = host

    this.connecting = new Promise((resolve, reject) => {
      let settled = false
      const ws = new WebSocket(url)
      this.ws = ws

      const timeoutId = setTimeout(() => {
        if (settled) return
        settled = true
        try { ws.close() } catch { /* ignore */ }
        this.lastError = `Timeout conectando a ${host}`
        this.notify()
        reject(new Error(this.lastError))
      }, CONNECT_TIMEOUT_MS)

      ws.onopen = () => {
        if (settled) return
        settled = true
        clearTimeout(timeoutId)
        this.lastError = null
        this.notify()
        resolve(ws)
      }

      ws.onmessage = (event) => this.handleMessage(event.data)

      ws.onerror = (event) => {
        // El navegador no expone detalle, solo el evento.
        this.lastError = `Error WebSocket en ${host} (cert no instalado o servicio caido)`
        if (!settled) {
          settled = true
          clearTimeout(timeoutId)
          reject(new Error(this.lastError))
        }
        this.notify()
      }

      ws.onclose = () => {
        if (this.ws === ws) this.ws = null
        this.notify()
        // Rechazamos cualquier request en vuelo: caller hara fallback.
        this.flushPending(new Error('Conexion cerrada'))
      }
    }).finally(() => {
      this.connecting = null
    })

    return this.connecting
  }

  handleMessage(raw) {
    let msg
    try { msg = JSON.parse(raw) } catch { return }

    // El server responde con { type: "printer_list" } o { status: "success"/"error" }.
    // Como no hay correlation id, asociamos al primer pending que matchee.
    const idx = this.queue.findIndex(item => item.match(msg))
    if (idx === -1) return
    const item = this.queue.splice(idx, 1)[0]
    clearTimeout(item.timeoutId)
    if (msg.status === 'error') {
      item.reject(new Error(msg.message || 'Error en impresora'))
    } else {
      item.resolve(msg)
    }
  }

  flushPending(err) {
    const pending = this.queue.splice(0)
    pending.forEach(item => {
      clearTimeout(item.timeoutId)
      item.reject(err)
    })
  }

  send(payload, match) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('GG EZ Print: socket no conectado'))
        return
      }
      const id = this.nextId++
      const timeoutId = setTimeout(() => {
        const idx = this.queue.findIndex(item => item.id === id)
        if (idx !== -1) {
          this.queue.splice(idx, 1)
          reject(new Error('GG EZ Print: timeout esperando respuesta'))
        }
      }, REQUEST_TIMEOUT_MS)

      this.queue.push({ id, resolve, reject, match, timeoutId })
      try {
        this.ws.send(JSON.stringify(payload))
      } catch (err) {
        const idx = this.queue.findIndex(item => item.id === id)
        if (idx !== -1) this.queue.splice(idx, 1)
        clearTimeout(timeoutId)
        reject(err)
      }
    })
  }

  /** Lista impresoras detectadas por el servicio. */
  async listPrinters(hostOverride) {
    const cfg = getPrinterConfig()
    const host = hostOverride || cfg.server_host
    await this.ensureConnected(host)
    const res = await this.send(
      { action: 'list' },
      msg => msg.type === 'printer_list' && Array.isArray(msg.printers)
    )
    return res.printers || []
  }

  /**
   * Envia un trabajo de impresion.
   * @param {Object} job
   * @param {string} job.printerName - Nombre Windows de la impresora o IP de red.
   * @param {'USB'|'Network'} job.type
   * @param {string} job.content - Texto plano del ticket (ESC/POS lo agrega el server).
   * @param {number} [job.fontSize=1]
   * @param {number} [job.paperWidth=58]
   * @param {string} [job.hostOverride] - Permite testear contra otra IP.
   */
  async print({ printerName, type, content, fontSize, paperWidth, hostOverride }) {
    const cfg = getPrinterConfig()
    const host = hostOverride || cfg.server_host
    if (!printerName) throw new Error('GG EZ Print: falta printer_name')

    await this.ensureConnected(host)

    return this.send(
      {
        action: 'print',
        data: {
          printer_name: printerName,
          type: type || 'USB',
          content: String(content || ''),
          font_size: Number(fontSize || cfg.font_size || 1),
          paper_width: Number(paperWidth || cfg.paper_width || 58),
        },
      },
      msg => msg.status === 'success' || msg.status === 'error'
    )
  }

  disconnect() {
    if (this.ws) {
      try { this.ws.close() } catch { /* ignore */ }
      this.ws = null
    }
    this.flushPending(new Error('Desconectado manualmente'))
  }
}

export const printerClient = new PrinterClient()

/** Devuelve { name, type } segun el tipo de ticket o null si falta config. */
export function getPrinterFor(kind) {
  const cfg = getPrinterConfig()
  switch (kind) {
    case 'comanda':
      return cfg.printer_comanda_name
        ? { name: cfg.printer_comanda_name, type: cfg.printer_comanda_type || 'USB' }
        : null
    case 'ticket':
    case 'customer':
      return cfg.printer_ticket_name
        ? { name: cfg.printer_ticket_name, type: cfg.printer_ticket_type || 'USB' }
        : null
    case 'fiscal':
      return cfg.printer_fiscal_name
        ? { name: cfg.printer_fiscal_name, type: cfg.printer_fiscal_type || 'USB' }
        : null
    default:
      return null
  }
}

/** True si hay servidor configurado + impresora asignada para ese tipo. */
export function canPrintRemote(kind) {
  const cfg = getPrinterConfig()
  return !!(cfg.server_host && getPrinterFor(kind))
}
