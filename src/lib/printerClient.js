/**
 * Cliente WebSocket para Comandera Print (mismo protocolo que GG EZ Print).
 *
 * El puente expone wss://<IP_LAN>:8443/ws y acepta dos mensajes JSON:
 *   - { action: "list" } -> responde { type: "printer_list", printers: [...] }
 *   - { action: "print", data: { printer_name, type, content, font_size, paper_width } }
 *       -> responde { status: "success" } o { status: "error", message: "..." }
 *
 * Mantenemos una unica conexion abierta (singleton por host). Las llamadas
 * encolan promesas que se resuelven con la primera respuesta valida del server.
 * Si la IP configurada no responde se prueba la propia PC (127.0.0.1). Si
 * tampoco, las llamadas rechazan rapidamente para que el caller pueda hacer
 * fallback a window.print().
 */

import { getPrinterConfig } from './printerStore'

const CONNECT_TIMEOUT_MS = 4000
const LIST_TIMEOUT_MS = 8000
// Imprimir puede tardar: el puente reintenta 2 veces contra el spooler de
// Windows (hasta ~2 s extra) y una térmica lenta demora unos segundos más. Con
// 8 s se daba por caído un trabajo que después salía igual → ticket doble
// (uno por la impresora y otro por el diálogo de Windows).
const PRINT_TIMEOUT_MS = 20000
// Conexión mantenida: si se corta (la PC durmió, el wifi parpadeó, cerraron y
// abrieron Comandera Print) se vuelve a conectar sola, con espera creciente.
const RECONNECT_MIN_MS = 3000
const RECONNECT_MAX_MS = 60000
// Cada tanto, si no hubo tráfico, se manda un "list" para comprobar que el
// socket sigue vivo de verdad (un wifi caído deja el socket "abierto" pero
// muerto, y recién se nota al imprimir).
const KEEPALIVE_MS = 60000
const PROBE_TIMEOUT_MS = 5000
// Si la IP configurada no responde, se prueba la propia PC (127.0.0.1). Sirve
// cuando el dashboard corre en la misma PC que Comandera Print y esa PC cambió
// de IP en la red. En un celular falla al instante, así que casi no demora.
const LOCAL_HOST = '127.0.0.1'
const LOCAL_CONNECT_TIMEOUT_MS = 1500
// Comandera Print corre en la PC del local y el dashboard de ESA PC es el único
// que le habla, siempre por la propia máquina: sin IP de red, sin certificado
// en los celulares. Los demás dispositivos dejan los tickets en la cola
// (colaImpresion.js) y esa PC los imprime.
export const HOST_PC = '127.0.0.1:8443'

/** Mensaje para humanos según cómo falló la conexión. */
export function explicarFalloConexion(host, motivo) {
  const h = String(host || '').trim()
  const conPuerto = /:\d+$/.test(h) ? h : `${h}:8443`
  if (motivo === 'timeout') {
    return `Comandera Print no responde en esta PC (${h}). Abrí ComanderaPrint.exe: tiene que quedar la ventana negra diciendo "Escuchando en…".`
  }
  return `Comandera Print está en ${h} pero el navegador no aceptó la conexión: falta instalar el certificado en ` +
    `esta PC (abrí https://${conPuerto} para probar) o Comandera Print está cerrado.`
}

class PrinterClient {
  constructor() {
    this.host = null            // host configurado ('IP:8443')
    this.hostReal = null        // host al que está conectado de verdad (puede ser 127.0.0.1)
    this.ws = null              // WebSocket actual o null
    this.connecting = null      // Promise en vuelo si estamos abriendo conexion
    this.queue = []             // [{ id, resolve, reject, match, timeoutId }]
    this.nextId = 1
    this.lastError = null
    this.listeners = new Set()  // suscriptores al estado de conexion
    this.mantenido = null       // host que hay que mantener conectado (null = no)
    this.reconnectTimer = null
    this.keepaliveTimer = null
    this.reconnectEspera = RECONNECT_MIN_MS
    this.ultimoTrafico = 0      // Date.now() del último mensaje recibido
    this.cierreManual = false
  }

  // ── Conexión mantenida ────────────────────────────────────────────────────

  /**
   * Mantiene la conexión con `host` abierta mientras el dashboard esté
   * cargado: conecta ya, reconecta sola si se corta y la verifica cada tanto.
   * Devuelve una función para dejar de mantenerla.
   */
  mantener(host) {
    const limpio = String(host || '').trim()
    if (!limpio) { this.dejarDeMantener(); return () => {} }
    if (this.mantenido === limpio) return () => this.dejarDeMantener()

    this.dejarDeMantener()
    this.mantenido = limpio
    this.reconnectEspera = RECONNECT_MIN_MS
    this.onVisible = () => { if (document.visibilityState === 'visible') this.reconectarAhora() }
    this.onOnline = () => this.reconectarAhora()
    document.addEventListener('visibilitychange', this.onVisible)
    window.addEventListener('online', this.onOnline)
    this.conectarSilencioso()
    return () => this.dejarDeMantener()
  }

  dejarDeMantener() {
    this.mantenido = null
    if (this.onVisible) document.removeEventListener('visibilitychange', this.onVisible)
    if (this.onOnline) window.removeEventListener('online', this.onOnline)
    this.onVisible = null
    this.onOnline = null
    clearTimeout(this.reconnectTimer); this.reconnectTimer = null
    clearInterval(this.keepaliveTimer); this.keepaliveTimer = null
  }

  async conectarSilencioso() {
    if (!this.mantenido) return
    try {
      await this.ensureConnected(this.mantenido)
      this.reconnectEspera = RECONNECT_MIN_MS
      this.programarKeepalive()
    } catch {
      this.programarReconexion()
    }
  }

  programarReconexion() {
    if (!this.mantenido || this.reconnectTimer) return
    const espera = this.reconnectEspera
    this.reconnectEspera = Math.min(RECONNECT_MAX_MS, espera * 2)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.conectarSilencioso()
    }, espera)
  }

  /** Al volver a la pestaña o recuperar red: sin esperar el backoff. */
  reconectarAhora() {
    if (!this.mantenido) return
    clearTimeout(this.reconnectTimer); this.reconnectTimer = null
    this.reconnectEspera = RECONNECT_MIN_MS
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Puede estar "abierto" pero muerto (la PC durmió): comprobar.
      this.sondear().catch(() => {})
      return
    }
    this.conectarSilencioso()
  }

  programarKeepalive() {
    clearInterval(this.keepaliveTimer)
    this.keepaliveTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      if (Date.now() - this.ultimoTrafico < KEEPALIVE_MS - 5000) return
      this.sondear().catch(() => {})
    }, KEEPALIVE_MS)
  }

  /**
   * Comprueba que el socket responde (un "list" corto). Si no, lo cierra para
   * que la reconexión lo levante de nuevo. Rechaza si está muerto.
   */
  async sondear() {
    try {
      await this.send(
        { action: 'list' },
        msg => msg.type === 'printer_list' && Array.isArray(msg.printers),
        PROBE_TIMEOUT_MS
      )
    } catch (err) {
      console.warn('[printerClient] el socket no responde, se reconecta:', err.message)
      this.cerrarSocket()
      throw err
    }
  }

  /** Cierra el socket actual sin tocar el "mantener". */
  cerrarSocket() {
    const ws = this.ws
    this.ws = null
    this.hostReal = null
    if (ws) { try { ws.close() } catch { /* ignore */ } }
    this.flushPending(new Error('Conexion cerrada'))
    this.notify()
    this.programarReconexion()
  }

  /** True si el error es del socket (no de la impresora): vale reintentar. */
  static esCaidaDeSocket(err) {
    const m = String(err?.message || '')
    return m.includes('socket no conectado') || m.includes('Conexion cerrada')
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
      hostReal: this.hostReal,
      // true = la IP configurada no anduvo y se conectó a la propia PC.
      viaLocal: !!this.ws && this.ws.readyState === WebSocket.OPEN && this.hostReal !== this.host,
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
    if (!host) throw new Error('Comandera Print: server_host no configurado')

    // Cambio de host: cerramos lo anterior.
    if (this.ws && this.host !== host) {
      try { this.ws.close() } catch { /* ignore */ }
      this.ws = null
      this.hostReal = null
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) return this.ws
    if (this.connecting) return this.connecting

    if (!this.buildUrl(host)) throw new Error('Comandera Print: host invalido')

    this.host = host

    this.connecting = (async () => {
      try {
        return await this.abrir(host, CONNECT_TIMEOUT_MS)
      } catch (err) {
        const local = this.hostLocal(host)
        if (!local) throw err
        // Plan B: la propia PC. Si tampoco anda, el error que se muestra es
        // el de la IP configurada, que es el que hay que corregir.
        try {
          const ws = await this.abrir(local, LOCAL_CONNECT_TIMEOUT_MS)
          console.warn(`[printerClient] ${host} no responde; conectado a la propia PC (${local})`)
          return ws
        } catch {
          this.lastError = err.message
          this.notify()
          throw err
        }
      }
    })().finally(() => {
      this.connecting = null
    })

    return this.connecting
  }

  /** '192.168.1.5:8443' -> '127.0.0.1:8443'; null si ya es la propia PC. */
  hostLocal(host) {
    const clean = String(host).trim().replace(/^wss?:\/\//i, '').replace(/\/+$/, '')
    const sinPuerto = clean.replace(/:\d+$/, '')
    if (sinPuerto === LOCAL_HOST || sinPuerto === 'localhost') return null
    const puerto = (clean.match(/:(\d+)$/) || [])[1] || '8443'
    return `${LOCAL_HOST}:${puerto}`
  }

  /** Abre un WebSocket a un host concreto. Resuelve con el socket abierto. */
  abrir(host, timeoutMs) {
    const url = this.buildUrl(host)
    return new Promise((resolve, reject) => {
      let settled = false
      const ws = new WebSocket(url)
      this.ws = ws
      this.hostReal = host

      const timeoutId = setTimeout(() => {
        if (settled) return
        settled = true
        try { ws.close() } catch { /* ignore */ }
        this.lastError = explicarFalloConexion(host, 'timeout')
        this.notify()
        reject(new Error(this.lastError))
      }, timeoutMs)

      ws.onopen = () => {
        if (settled) return
        settled = true
        clearTimeout(timeoutId)
        this.lastError = null
        this.ultimoTrafico = Date.now()
        this.notify()
        resolve(ws)
      }

      ws.onmessage = (event) => {
        this.ultimoTrafico = Date.now()
        this.handleMessage(event.data)
      }

      ws.onerror = () => {
        // El navegador no expone detalle, solo el evento.
        this.lastError = explicarFalloConexion(host, 'error')
        if (!settled) {
          settled = true
          clearTimeout(timeoutId)
          reject(new Error(this.lastError))
        }
        this.notify()
      }

      ws.onclose = () => {
        const eraElActual = this.ws === ws
        if (eraElActual) { this.ws = null; this.hostReal = null }
        this.notify()
        // Rechazamos cualquier request en vuelo: caller hara fallback.
        this.flushPending(new Error('Conexion cerrada'))
        // Se cortó una conexión que estaba andando: volver a levantarla.
        if (eraElActual && settled && !this.cierreManual) this.programarReconexion()
      }
    })
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

  send(payload, match, timeoutMs = LIST_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Comandera Print: socket no conectado'))
        return
      }
      const id = this.nextId++
      const timeoutId = setTimeout(() => {
        const idx = this.queue.findIndex(item => item.id === id)
        if (idx !== -1) {
          this.queue.splice(idx, 1)
          reject(new Error('Comandera Print: la PC recibió el pedido pero no respondió (¿impresora apagada o sin papel?)'))
        }
      }, timeoutMs)

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
  async listPrinters() {
    const host = HOST_PC
    await this.ensureConnected(host)
    const res = await this.send(
      { action: 'list' },
      msg => msg.type === 'printer_list' && Array.isArray(msg.printers),
      LIST_TIMEOUT_MS
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
   */
  async print({ printerName, type, content, fontSize, paperWidth, qrCodeData }) {
    const cfg = getPrinterConfig()
    const host = HOST_PC
    if (!printerName) throw new Error('Comandera Print: no hay impresora asignada para este tipo de ticket')

    const payload = {
      action: 'print',
      data: {
        printer_name: printerName,
        type: type || 'USB',
        content: String(content || ''),
        font_size: Number(fontSize || cfg.font_size || 1),
        paper_width: Number(paperWidth || cfg.paper_width || 58),
        ...(qrCodeData ? { qr_code_data: String(qrCodeData) } : {}),
      },
    }
    const esRespuesta = msg => msg.status === 'success' || msg.status === 'error'

    await this.ensureConnected(host)

    // Socket abierto pero sin tráfico hace rato: puede estar muerto (la PC
    // durmió, el wifi se cayó). Un sondeo corto antes de mandar el ticket
    // evita esperar 20 s para enterarse; si está muerto, se reconecta.
    if (Date.now() - this.ultimoTrafico > KEEPALIVE_MS) {
      try { await this.sondear() } catch { /* se reconecta abajo */ }
      await this.ensureConnected(host)
    }

    try {
      return await this.send(payload, esRespuesta, PRINT_TIMEOUT_MS)
    } catch (err) {
      // Se cortó el socket justo al mandar (no llegó a la PC): una vez más
      // con conexión nueva. Si fue timeout NO se reintenta: el ticket puede
      // estar saliendo igual y se duplicaría.
      if (!PrinterClient.esCaidaDeSocket(err)) throw err
      console.warn('[printerClient] se cortó al imprimir, se reconecta y reintenta:', err.message)
      this.cerrarSocket()
      await this.ensureConnected(host)
      return await this.send(payload, esRespuesta, PRINT_TIMEOUT_MS)
    }
  }

  disconnect() {
    this.cierreManual = true
    this.dejarDeMantener()
    if (this.ws) {
      try { this.ws.close() } catch { /* ignore */ }
      this.ws = null
      this.hostReal = null
    }
    this.flushPending(new Error('Desconectado manualmente'))
    this.cierreManual = false
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

/** True si hay impresora asignada para ese tipo (la PC del local la imprime). */
export function canPrintRemote(kind) {
  return !!getPrinterFor(kind)
}
