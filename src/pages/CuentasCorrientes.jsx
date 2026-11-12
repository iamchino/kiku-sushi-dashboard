import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  AlertTriangle, CalendarClock, FileText, Handshake, Loader2, Pencil, Plus, Power, RefreshCw, Trash2,
} from 'lucide-react'
import { usePermisos } from '../context/usePermisos'
import { useCuentasCorrientes } from '../hooks/useCuentasCorrientes'
import { conSaldoCorrido, estadoCuenta, fechaCorta, porcentajeConsumido } from '../lib/cuentasCorrientes'
import { COND_IVA_RECEPTOR_LABEL, fechaHoyAR } from '../lib/fiscal'
import { formatMoney } from '../lib/printing'
import CuentaCorrienteModal from '../components/cuentas/CuentaCorrienteModal'
import MovimientoCuentaModal from '../components/cuentas/MovimientoCuentaModal'
import ConfirmDelete from '../components/finanzas/ConfirmDelete'

// Dinero → Cuentas corrientes.
//
// Canjes y consumos a cuenta: cada cuenta tiene un monto acordado y se va
// gastando con los consumos. Los consumos entran solos cuando una mesa o un
// pedido se cobra con el medio "Cuenta corriente"; acá además se pueden cargar
// a mano (lo que venía del cuaderno, o algo que no pasó por una mesa).

const money = (n) => `${Number(n) < 0 ? '-' : ''}$${formatMoney(Math.abs(Number(n || 0)))}`

function Cifra({ label, value, color = 'var(--text-primary)' }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold" style={{ color }}>{value}</p>
    </div>
  )
}

function Barra({ cuenta }) {
  const pct = porcentajeConsumido(cuenta)
  const excedida = Number(cuenta.saldo || 0) < -1
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--bg-input)' }}
      role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
      aria-label={`Consumido ${Math.round(pct)} %`}>
      <div className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: excedida ? 'var(--bad)' : pct >= 85 ? 'var(--warn)' : 'var(--ok)' }} />
    </div>
  )
}

function Estado({ estado }) {
  if (!estado.label) return null
  return (
    <span className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ color: estado.color, border: `1px solid ${estado.color}`, background: 'var(--bg-card)' }}>
      {estado.label}
    </span>
  )
}

function TarjetaCuenta({ cuenta, activa, hoy, onClick }) {
  const estado = estadoCuenta(cuenta, hoy)
  return (
    <button type="button" onClick={onClick} aria-pressed={activa}
      className="w-full rounded-xl p-4 text-left transition-colors"
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${activa ? 'var(--accent-border)' : 'var(--border-card)'}`,
        boxShadow: activa ? '0 0 0 1px var(--accent-border)' : 'var(--shadow-card)',
        opacity: cuenta.activa ? 1 : 0.65,
      }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{cuenta.nombre}</p>
          <p className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {cuenta.vigencia_hasta ? `Hasta el ${fechaCorta(cuenta.vigencia_hasta)}` : 'Sin vencimiento'}
            {' · '}{cuenta.movimientos} {cuenta.movimientos === 1 ? 'consumo' : 'consumos'}
          </p>
        </div>
        <Estado estado={estado} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Cifra label="Acordado" value={money(cuenta.monto_acordado)} />
        <Cifra label="Consumido" value={money(cuenta.consumido)} color="var(--text-secondary)" />
        <Cifra label="Saldo" value={money(cuenta.saldo)} color={cuenta.saldo < -1 ? 'var(--bad)' : 'var(--ok)'} />
      </div>
      <div className="mt-3"><Barra cuenta={cuenta} /></div>
    </button>
  )
}

function Aviso({ tono = 'bad', children }) {
  return (
    <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
      style={{ background: `var(--${tono}-soft)`, border: `1px solid var(--${tono})`, color: `var(--${tono})` }}>
      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  )
}

export default function CuentasCorrientesPage() {
  const { puede, puedeEditar, rutaPorDefecto } = usePermisos()
  const editable = puedeEditar('cuentas_corrientes')
  const {
    cuentas, loading, error, faltaMigracion, recargar, cargarMovimientos,
    guardarCuenta, cambiarActiva, borrarCuenta, guardarMovimiento, borrarMovimiento,
  } = useCuentasCorrientes()

  const [verInactivas, setVerInactivas] = useState(false)
  const [seleccion, setSeleccion] = useState(null)
  const [movimientos, setMovimientos] = useState([])
  const [movsEstado, setMovsEstado] = useState({ loading: false, error: null })
  const [version, setVersion] = useState(0)          // fuerza recarga de movimientos
  const [modalCuenta, setModalCuenta] = useState(null)   // { cuenta | null }
  const [modalMov, setModalMov] = useState(null)         // { movimiento | null }
  const [aBorrar, setABorrar] = useState(null)           // { tipo, item }
  const [aviso, setAviso] = useState(null)
  const hoy = fechaHoyAR()

  const hayInactivas = cuentas.some(c => !c.activa)
  const visibles = useMemo(
    () => cuentas.filter(c => verInactivas || c.activa),
    [cuentas, verInactivas],
  )
  const cuentaSel = visibles.find(c => c.id === seleccion) || visibles[0] || null
  const cuentaSelId = cuentaSel?.id || null

  useEffect(() => {
    if (!cuentaSelId) return undefined
    let vivo = true
    Promise.resolve()
      .then(() => { if (vivo) setMovsEstado({ loading: true, error: null }) })
      .then(() => cargarMovimientos(cuentaSelId))
      .then(rows => { if (vivo) { setMovimientos(rows); setMovsEstado({ loading: false, error: null }) } })
      .catch(err => { if (vivo) { setMovimientos([]); setMovsEstado({ loading: false, error: err.message }) } })
    return () => { vivo = false }
  }, [cuentaSelId, version, cargarMovimientos])

  const filas = useMemo(
    () => (cuentaSel ? conSaldoCorrido(movimientos.filter(m => m.cuenta_id === cuentaSel.id), cuentaSel.monto_acordado) : []),
    [movimientos, cuentaSel],
  )

  const totales = useMemo(() => {
    const activas = cuentas.filter(c => c.activa)
    // Disponible = lo que todavía se puede consumir: sin las vencidas.
    const vigentes = activas.filter(c => estadoCuenta(c, hoy).id !== 'vencida')
    return {
      cantidad: activas.length,
      acordado: activas.reduce((a, c) => a + c.monto_acordado, 0),
      consumido: activas.reduce((a, c) => a + c.consumido, 0),
      saldo: vigentes.reduce((a, c) => a + c.saldo, 0),
    }
  }, [cuentas, hoy])

  // Quien no tiene la sección no la ve aunque escriba la URL a mano.
  if (!puede('cuentas_corrientes')) return <Navigate to={rutaPorDefecto()} replace />

  const refrescar = () => setVersion(v => v + 1)

  const onGuardarCuenta = async (form, id) => {
    const nuevoId = await guardarCuenta(form, id)
    if (!id) setSeleccion(nuevoId)
    if (form.activa === false) setVerInactivas(true)
    setAviso(null)
  }
  const onGuardarMovimiento = async (cuentaId, form, id) => {
    await guardarMovimiento(cuentaId, form, id)
    refrescar()
  }
  const onCambiarActiva = async (cuenta) => {
    setAviso(null)
    try {
      await cambiarActiva(cuenta.id, !cuenta.activa)
      if (cuenta.activa) setVerInactivas(true)
    } catch (err) {
      setAviso(err.message)
    }
  }

  const btnSec = { border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto w-full">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Cuentas corrientes</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Canjes y consumos a cuenta: cuánto se acordó, cuánto se consumió y cuánto queda.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { recargar(); refrescar() }} title="Actualizar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg" style={btnSec} aria-label="Actualizar">
            <RefreshCw size={14} />
          </button>
          {editable && !faltaMigracion && (
            <button type="button" onClick={() => setModalCuenta({ cuenta: null })}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold btn-cta"
              style={{ background: 'var(--cta)', color: 'var(--cta-text)' }}>
              <Plus size={15} /> Nueva cuenta
            </button>
          )}
        </div>
      </div>

      {faltaMigracion && (
        <Aviso tono="warn">
          Falta correr el SQL 54 (cuentas corrientes) en Supabase. Hasta entonces esta sección no tiene dónde guardar.
        </Aviso>
      )}
      {error && !faltaMigracion && <Aviso>{error}</Aviso>}
      {aviso && <Aviso>{aviso}</Aviso>}

      {loading ? (
        <div className="flex h-56 items-center justify-center">
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-lift)' }} />
        </div>
      ) : cuentas.length === 0 && !faltaMigracion && !error ? (
        <div className="rounded-xl py-14 px-6 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)' }}>
          <Handshake size={32} className="mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Todavía no hay cuentas corrientes</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5" style={{ color: 'var(--text-muted)' }}>
            Creá una por cada canje (una revista, un proveedor, un influencer) con el monto acordado.
            Después, al cobrar una mesa o un pedido, elegís “Cuenta corriente” y el consumo se descuenta solo.
          </p>
          {editable && (
            <button type="button" onClick={() => setModalCuenta({ cuenta: null })}
              className="mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold btn-cta"
              style={{ background: 'var(--cta)', color: 'var(--cta-text)' }}>
              <Plus size={15} /> Crear la primera cuenta
            </button>
          )}
        </div>
      ) : cuentas.length > 0 && (
        <>
          <section className="grid grid-cols-2 gap-3 rounded-xl p-4 sm:grid-cols-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
            <Cifra label="Cuentas activas" value={totales.cantidad} />
            <Cifra label="Acordado" value={money(totales.acordado)} />
            <Cifra label="Consumido" value={money(totales.consumido)} color="var(--text-secondary)" />
            <Cifra label="Saldo disponible" value={money(totales.saldo)} color={totales.saldo < -1 ? 'var(--bad)' : 'var(--ok)'} />
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-start">
            {/* Lista de cuentas */}
            <section className="space-y-3">
              {hayInactivas && (
                <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={verInactivas} onChange={e => setVerInactivas(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[var(--accent)]" />
                  Mostrar también las inactivas
                </label>
              )}
              {visibles.length === 0 && (
                <p className="rounded-xl px-4 py-6 text-center text-xs" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', color: 'var(--text-muted)' }}>
                  No hay cuentas activas. Tildá “Mostrar también las inactivas” para verlas.
                </p>
              )}
              {visibles.map(c => (
                <TarjetaCuenta key={c.id} cuenta={c} hoy={hoy} activa={cuentaSel?.id === c.id}
                  onClick={() => setSeleccion(c.id)} />
              ))}
            </section>

            {/* Detalle de la cuenta elegida */}
            {cuentaSel && (
              <section className="min-w-0 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-card)', boxShadow: 'var(--shadow-card)' }}>
                <header className="space-y-3 p-4" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{cuentaSel.nombre}</h2>
                        <Estado estado={estadoCuenta(cuentaSel, hoy)} />
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock size={12} />
                          {cuentaSel.vigencia_desde || cuentaSel.vigencia_hasta
                            ? `${cuentaSel.vigencia_desde ? `Desde ${fechaCorta(cuentaSel.vigencia_desde)}` : ''}${cuentaSel.vigencia_desde && cuentaSel.vigencia_hasta ? ' · ' : ''}${cuentaSel.vigencia_hasta ? `Hasta ${fechaCorta(cuentaSel.vigencia_hasta)}` : ''}`
                            : 'Sin vencimiento'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <FileText size={12} />
                          {cuentaSel.cuit
                            ? `${cuentaSel.razon_social || ''} · CUIT ${cuentaSel.cuit}${cuentaSel.condicion_iva ? ` · ${COND_IVA_RECEPTOR_LABEL[Number(cuentaSel.condicion_iva)] || ''}` : ''}`
                            : 'Sin datos fiscales (no se le puede precargar Factura A)'}
                        </span>
                      </p>
                    </div>
                    {editable && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setModalCuenta({ cuenta: cuentaSel })}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold" style={btnSec}>
                          <Pencil size={13} /> Editar
                        </button>
                        <button type="button" onClick={() => onCambiarActiva(cuentaSel)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold" style={btnSec}>
                          <Power size={13} /> {cuentaSel.activa ? 'Desactivar' : 'Activar'}
                        </button>
                        {cuentaSel.movimientos === 0 && (
                          <button type="button" onClick={() => setABorrar({ tipo: 'cuenta', item: cuentaSel })}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
                            style={{ ...btnSec, color: 'var(--bad)' }}>
                            <Trash2 size={13} /> Borrar
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <Cifra label="Acordado" value={money(cuentaSel.monto_acordado)} />
                    <Cifra label="Consumido" value={money(cuentaSel.consumido)} color="var(--text-secondary)" />
                    <Cifra label="Saldo" value={money(cuentaSel.saldo)} color={cuentaSel.saldo < -1 ? 'var(--bad)' : 'var(--ok)'} />
                  </div>
                  <Barra cuenta={cuentaSel} />

                  {cuentaSel.notas && (
                    <p className="whitespace-pre-wrap rounded-lg px-3 py-2 text-xs leading-5"
                      style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
                      {cuentaSel.notas}
                    </p>
                  )}
                </header>

                <div className="p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                      Consumos ({filas.length})
                    </p>
                    {editable && (
                      <button type="button" onClick={() => setModalMov({ movimiento: null })}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold btn-cta"
                        style={{ background: 'var(--cta)', color: 'var(--cta-text)' }}>
                        <Plus size={13} /> Agregar consumo
                      </button>
                    )}
                  </div>

                  {movsEstado.error && <Aviso>{movsEstado.error}</Aviso>}

                  {movsEstado.loading && filas.length === 0 ? (
                    <div className="flex h-24 items-center justify-center">
                      <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-lift)' }} />
                    </div>
                  ) : filas.length === 0 ? (
                    <p className="rounded-lg px-3 py-6 text-center text-xs leading-5" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>
                      Sin consumos todavía. Se cargan solos al cobrar una mesa o un pedido con “Cuenta corriente”;
                      lo anterior (el cuaderno) se agrega con “Agregar consumo”.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-xs">
                        <thead>
                          <tr className="text-left text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                            <th className="py-2 pr-3 font-semibold">Fecha</th>
                            <th className="py-2 pr-3 font-semibold">Detalle</th>
                            <th className="py-2 pr-3 font-semibold">Nro. operación</th>
                            <th className="py-2 pr-3 text-right font-semibold">Monto</th>
                            <th className="py-2 pr-3 text-right font-semibold">Saldo</th>
                            {editable && <th className="py-2 font-semibold"><span className="sr-only">Acciones</span></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {filas.map(m => {
                            const devolucion = Number(m.monto) < 0
                            const deCobro = Boolean(m.pago_id)
                            return (
                              <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                                <td className="whitespace-nowrap py-2.5 pr-3" style={{ color: 'var(--text-secondary)' }}>{fechaCorta(m.fecha)}</td>
                                <td className="py-2.5 pr-3">
                                  <p style={{ color: 'var(--text-primary)' }}>{m.detalle || (devolucion ? 'Devolución a favor' : 'Consumo')}</p>
                                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    {deCobro ? 'Cobro en caja' : 'Cargado a mano'}{devolucion ? ' · devolución' : ''}
                                  </p>
                                </td>
                                <td className="whitespace-nowrap py-2.5 pr-3" style={{ color: 'var(--text-secondary)' }}>{m.numero_operacion || '—'}</td>
                                <td className="whitespace-nowrap py-2.5 pr-3 text-right font-semibold"
                                  style={{ color: devolucion ? 'var(--ok)' : 'var(--text-primary)' }}>
                                  {devolucion ? '+' : '-'}${formatMoney(Math.abs(Number(m.monto)))}
                                </td>
                                <td className="whitespace-nowrap py-2.5 pr-3 text-right font-bold"
                                  style={{ color: m.saldo_despues < -1 ? 'var(--bad)' : 'var(--text-primary)' }}>
                                  {money(m.saldo_despues)}
                                </td>
                                {editable && (
                                  <td className="whitespace-nowrap py-2.5 text-right">
                                    {deCobro ? (
                                      <span className="text-[10px]" style={{ color: 'var(--text-xmuted)' }} title="Viene de un cobro: se corrige re-cobrando el pedido desde Caja.">
                                        desde Caja
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1">
                                        <button type="button" onClick={() => setModalMov({ movimiento: m })}
                                          aria-label="Editar consumo" title="Editar"
                                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg" style={btnSec}>
                                          <Pencil size={12} />
                                        </button>
                                        <button type="button" onClick={() => setABorrar({ tipo: 'movimiento', item: m })}
                                          aria-label="Borrar consumo" title="Borrar"
                                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg"
                                          style={{ ...btnSec, color: 'var(--bad)' }}>
                                          <Trash2 size={12} />
                                        </button>
                                      </span>
                                    )}
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </>
      )}

      {modalCuenta && (
        <CuentaCorrienteModal cuenta={modalCuenta.cuenta} onClose={() => setModalCuenta(null)} onGuardar={onGuardarCuenta} />
      )}
      {modalMov && cuentaSel && (
        <MovimientoCuentaModal cuenta={cuentaSel} movimiento={modalMov.movimiento}
          onClose={() => setModalMov(null)} onGuardar={onGuardarMovimiento} />
      )}
      {aBorrar && (
        <ConfirmDelete
          titulo={aBorrar.tipo === 'cuenta' ? 'Borrar cuenta' : 'Borrar consumo'}
          mensaje={aBorrar.tipo === 'cuenta'
            ? `Se borra la cuenta "${aBorrar.item.nombre}". No tiene consumos cargados.`
            : `Se borra el consumo de $${formatMoney(Math.abs(Number(aBorrar.item.monto)))} del ${fechaCorta(aBorrar.item.fecha)} y el saldo vuelve a subir.`}
          onClose={() => setABorrar(null)}
          onConfirm={async () => {
            if (aBorrar.tipo === 'cuenta') await borrarCuenta(aBorrar.item.id)
            else { await borrarMovimiento(aBorrar.item.id); refrescar() }
          }}
        />
      )}
    </div>
  )
}
