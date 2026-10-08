/**
 * SolicitudesPanel — Lista de solicitudes de repuesto (Fase 6).
 *
 * Dialog simple: tabla de solicitudes con estado y avance pendiente→aprobada→entregada.
 *
 * Además lista las ALTAS DE CÓDIGO de la ficha A3C (`tipo: 'alta_codigo'`): otro ciclo (pendiente →
 * creada | rechazada) con «Registrar SAP creado» y «Rechazar» en la misma tarjeta. No llevan stock ni
 * Aprobar/Entregar, y `onAvanzar` nunca se llama con una alta (no se descuenta bodega).
 */
import { Fragment, useState, useMemo } from 'react'
import { Loader2, ClipboardList, ArrowRight, Check } from 'lucide-react'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui'
import {
  ESTADO_SIGUIENTE,
  esAlta,
  type AltaCodigo,
  type OrigenSap,
  type SolicitudItem,
  type SolicitudRepuesto,
  type SolicitudEstado,
} from '@/hooks/repuestos/useSolicitudes'
import { duracionLegible } from '@/hooks/repuestos/trazaDeSolicitud'
import { avisoDeStock, type StockDeSolicitud } from '@/hooks/repuestos/solicitudDeRepuesto'
import { nombreVisible, type NombreVisible } from '@/utils/repuestos/nombreVisible'
import { AltaAcciones, AltaContenido, AltaEstado, FormRechazar, FormRegistrarSap, type ModoAlta, type SapEnMaestro } from './AltasEnPanel'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  solicitudes: SolicitudItem[]
  loading: boolean
  onAvanzar: (id: string, estado: SolicitudEstado) => Promise<void>
  /**
   * Bodega registra el SAP que creó para un alta de código (actualiza el maestro y marca la alta como creada).
   * `onRegistrarSap` y `onRechazarAlta` van juntos y solo para técnicos+ (firestore.rules): sin ellos el panel
   * muestra las altas sin acciones, en vez de ofrecer botones que terminan en «permission-denied».
   */
  onRegistrarSap?: (alta: AltaCodigo, sap: string, origen: OrigenSap) => Promise<void>
  /** Bodega rechaza un alta de código con motivo. */
  onRechazarAlta?: (alta: AltaCodigo, motivo: string) => Promise<void>
  /** ¿Ese SAP ya es un repuesto del maestro? (para avisar antes de guardar un número repetido). */
  buscarSap?: (sap: string) => Promise<SapEnMaestro | null>
  /** Stock de bodega por SAP: quien aprueba o entrega tiene que ver si hay antes de apretar. */
  stockDe?: (codigoSAP: string) => StockDeSolicitud | undefined
  /**
   * Título para MOSTRAR: la solicitud solo guarda `textoBreve`; el nombre común se resuelve
   * contra el catálogo por SAP. Sin esto se muestra el texto guardado.
   */
  nombreDe?: (codigoSAP: string, textoBreve: string) => NombreVisible
}

const ESTADO_META: Record<SolicitudEstado, { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-500/[0.15] text-ink-warn' },
  aprobada: { label: 'Aprobada', cls: 'bg-primary/[0.15] text-brand-ink' },
  entregada: { label: 'Entregada', cls: 'bg-emerald-500/[0.15] text-ink-ok' },
}

const ACCION_LABEL: Record<Exclude<SolicitudEstado, 'entregada'>, string> = {
  pendiente: 'Aprobar',
  aprobada: 'Entregar',
}

function fmtDate(d: Date): string {
  try {
    return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

/**
 * Quién dio el último paso y, al entregar, cuánto tardó desde que se pidió. Las solicitudes
 * anteriores a la traza no dicen nada: no se inventa una fecha.
 */
function trazaVisible(s: SolicitudRepuesto): string | null {
  if (s.estado === 'entregada' && s.entregadaPor) {
    const tardo = duracionLegible(s.createdAt, s.entregadaAt)
    return `por ${s.entregadaPor}${tardo ? ` · en ${tardo}` : ''}`
  }
  if (s.estado === 'aprobada' && s.aprobadaPor) {
    return `por ${s.aprobadaPor}${s.aprobadaAt ? ` · ${fmtDate(s.aprobadaAt)}` : ''}`
  }
  return null
}

/** Stock de bodega mientras falta aprobar o entregar: después ya no dice nada de esta solicitud. */
function LineaDeStock({ s, stockDe, className = '' }: { s: SolicitudRepuesto; stockDe?: (sap: string) => StockDeSolicitud | undefined; className?: string }) {
  if (!stockDe) return null
  const aviso = avisoDeStock(stockDe(s.codigoSAP), s.cantidad)
  const alerta = aviso.nivel === 'sin-stock' || aviso.nivel === 'insuficiente'
  return <div className={['text-caption', alerta ? 'font-medium text-ink-warn' : 'text-muted-foreground', className].join(' ')}>{aviso.texto}</div>
}

type Filtro = 'all' | SolicitudEstado | 'altas'

export function SolicitudesPanel({ open, onOpenChange, solicitudes, loading, onAvanzar, onRegistrarSap, onRechazarAlta, buscarSap, stockDe, nombreDe }: Props) {
  const nv = (s: SolicitudRepuesto): NombreVisible =>
    nombreDe ? nombreDe(s.codigoSAP, s.textoBreve) : nombreVisible({ textoBreve: s.textoBreve })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('all')
  /** La alta con un bloque abierto («Registrar SAP creado» o «Rechazar»): una a la vez. */
  const [abierta, setAbierta] = useState<{ id: string; modo: ModoAlta } | null>(null)

  // «Todas» y «Pendientes» incluyen las altas (quien entra a Pendientes ve todo lo que debe resolver);
  // «Aprobadas» y «Entregadas» no las tocan: sus estados son otros.
  const counts = useMemo(() => ({
    all: solicitudes.length,
    pendiente: solicitudes.filter((s) => s.estado === 'pendiente').length,
    aprobada: solicitudes.filter((s) => s.estado === 'aprobada').length,
    entregada: solicitudes.filter((s) => s.estado === 'entregada').length,
    altas: solicitudes.filter(esAlta).length,
  }), [solicitudes])

  const visibles = useMemo(
    () => (filtro === 'all' ? solicitudes : filtro === 'altas' ? solicitudes.filter(esAlta) : solicitudes.filter((s) => s.estado === filtro)),
    [solicitudes, filtro],
  )

  const CHIPS: { key: Filtro; label: string }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'pendiente', label: 'Pendientes' },
    { key: 'aprobada', label: 'Aprobadas' },
    { key: 'entregada', label: 'Entregadas' },
  ]

  const avanzar = async (s: SolicitudRepuesto) => {
    const next = ESTADO_SIGUIENTE[s.estado]
    if (!next) return
    setBusyId(s.id)
    try { await onAvanzar(s.id, next) } finally { setBusyId(null) }
  }

  /** Los dos bloques en línea de una alta (se abren dentro de su tarjeta o bajo su fila). */
  const bloqueAlta = (a: AltaCodigo) =>
    abierta?.id === a.id && abierta.modo === 'sap' ? (
      <FormRegistrarSap
        a={a}
        buscarSap={buscarSap}
        onCancelar={() => setAbierta(null)}
        onGuardar={async (sap, origen) => { await onRegistrarSap?.(a, sap, origen); setAbierta(null) }}
      />
    ) : abierta?.id === a.id && abierta.modo === 'rechazo' ? (
      <FormRechazar
        a={a}
        onCancelar={() => setAbierta(null)}
        onRechazar={async (motivo) => { await onRechazarAlta?.(a, motivo); setAbierta(null) }}
      />
    ) : null
  const puedeResolver = !!onRegistrarSap && !!onRechazarAlta
  const modoDe = (a: AltaCodigo) => (abierta?.id === a.id ? abierta.modo : null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> Solicitudes de repuesto
            <Badge variant="secondary" className="tabular-nums">{solicitudes.length}</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Filtro por estado */}
        {!loading && solicitudes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {(counts.altas > 0 ? [...CHIPS, { key: 'altas' as Filtro, label: 'Altas de código' }] : CHIPS).map((c) => (
              <Fragment key={c.key}>
                {c.key === 'altas' && <span className="mx-0.5 h-5 w-px self-center bg-border" aria-hidden />}
                <button
                  onClick={() => setFiltro(c.key)}
                  className={[
                    'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                    filtro === c.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70',
                  ].join(' ')}
                >
                  {c.label} <span className="tabular-nums opacity-70">({counts[c.key]})</span>
                </button>
              </Fragment>
            ))}
          </div>
        )}

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Cargando…
          </div>
        ) : solicitudes.length === 0 ? (
          <div className="rounded-card border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Aún no hay solicitudes. Usa “+ Solicitar repuesto”.
          </div>
        ) : visibles.length === 0 ? (
          <div className="rounded-card border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No hay solicitudes en este estado.
          </div>
        ) : (
          <>
            {/*
              Teléfono: tarjetas. La tabla medía 433 px en 306 px de diálogo a 375: la columna Estado
              quedaba cortada y el botón Aprobar/Entregar FUERA de la pantalla, sin nada que indicara
              que había que deslizar hacia el lado (medido el 15-09).
            */}
            <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-card border border-border sm:hidden">
              {visibles.map((s) => {
                if (esAlta(s)) {
                  return (
                    <li key={s.id} className="space-y-1.5 px-3 py-3" data-testid={`alta-${s.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <AltaContenido a={s} />
                        <span className="shrink-0 text-base font-semibold tabular-nums text-foreground" aria-label={`Cantidad ${s.cantidad}`}>×{s.cantidad}</span>
                      </div>
                      <AltaEstado a={s} />
                      {puedeResolver && <AltaAcciones a={s} modo={modoDe(s)} onModo={(m) => setAbierta(m ? { id: s.id, modo: m } : null)} ocupada={false} />}
                      {puedeResolver && bloqueAlta(s)}
                    </li>
                  )
                }
                const meta = ESTADO_META[s.estado]
                const next = ESTADO_SIGUIENTE[s.estado]
                const traza = trazaVisible(s)
                return (
                  <li key={s.id} className="space-y-1.5 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{nv(s).titulo}</div>
                        {nv(s).oficial && <div className="text-footnote text-muted-foreground">{nv(s).oficial}</div>}
                        <div className="font-mono text-caption text-muted-foreground">SAP {s.codigoSAP} · {fmtDate(s.createdAt)}</div>
                      </div>
                      <span className="shrink-0 text-base font-semibold tabular-nums text-foreground" aria-label={`Cantidad ${s.cantidad}`}>×{s.cantidad}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
                      <span>{s.solicitadoPorNombre || '—'}</span>
                      <span className={['inline-block rounded-ctl px-1.5 py-0.5 font-medium', meta.cls].join(' ')}>{meta.label}</span>
                      {traza && <span>{traza}</span>}
                    </div>
                    {s.observaciones && <div className="text-caption italic text-muted-foreground">{s.observaciones}</div>}
                    {next && <LineaDeStock s={s} stockDe={stockDe} />}
                    {next && (
                      <Button variant="outline" className="min-h-[44px] w-full gap-1.5" disabled={busyId === s.id} onClick={() => avanzar(s)}>
                        {busyId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                        {ACCION_LABEL[s.estado as Exclude<SolicitudEstado, 'entregada'>]}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>

            <div className="hidden max-h-[60vh] overflow-y-auto rounded-card border border-border sm:block">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-border bg-muted text-left">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Repuesto</th>
                    <th className="px-3 py-2 font-semibold">Cant.</th>
                    <th className="px-3 py-2 font-semibold">Solicitante</th>
                    <th className="px-3 py-2 font-semibold">Estado</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibles.map((s) => {
                    if (esAlta(s)) {
                      const bloque = puedeResolver ? bloqueAlta(s) : null
                      return (
                        <Fragment key={s.id}>
                          <tr className="align-top" data-testid={`alta-fila-${s.id}`}>
                            <td className="px-3 py-2"><AltaContenido a={s} /></td>
                            <td className="px-3 py-2 tabular-nums">{s.cantidad}</td>
                            <td className="px-3 py-2 text-muted-foreground">{s.solicitadoPorNombre || '—'}</td>
                            <td className="px-3 py-2"><AltaEstado a={s} conSolicitante={false} /></td>
                            <td className="px-3 py-2 text-right">
                              {s.estado === 'pendiente' && puedeResolver ? (
                                <span className="inline-flex flex-wrap justify-end gap-1.5">
                                  <Button size="sm" variant="outline" aria-expanded={modoDe(s) === 'sap'} onClick={() => setAbierta(modoDe(s) === 'sap' ? null : { id: s.id, modo: 'sap' })}>Registrar SAP</Button>
                                  <Button size="sm" variant="outline" className="text-ink-crit" aria-expanded={modoDe(s) === 'rechazo'} onClick={() => setAbierta(modoDe(s) === 'rechazo' ? null : { id: s.id, modo: 'rechazo' })}>Rechazar</Button>
                                </span>
                              ) : s.estado === 'creada' ? (
                                <span className="inline-flex items-center gap-1 text-caption text-ink-ok"><Check className="h-3.5 w-3.5" /> Lista</span>
                              ) : null}
                            </td>
                          </tr>
                          {bloque && <tr className="bg-background"><td colSpan={5} className="px-3 pb-3">{bloque}</td></tr>}
                        </Fragment>
                      )
                    }
                    const meta = ESTADO_META[s.estado]
                    const next = ESTADO_SIGUIENTE[s.estado]
                    const traza = trazaVisible(s)
                    return (
                      <tr key={s.id} className="align-top">
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{nv(s).titulo}</div>
                          {nv(s).oficial && <div className="text-footnote text-muted-foreground">{nv(s).oficial}</div>}
                          <div className="font-mono text-caption text-muted-foreground">SAP {s.codigoSAP} · {fmtDate(s.createdAt)}</div>
                          {s.observaciones && <div className="mt-0.5 text-caption italic text-muted-foreground">{s.observaciones}</div>}
                          {next && <LineaDeStock s={s} stockDe={stockDe} className="mt-0.5" />}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{s.cantidad}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.solicitadoPorNombre || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={['inline-block rounded-ctl px-1.5 py-0.5 text-caption font-medium', meta.cls].join(' ')}>{meta.label}</span>
                          {traza && <div className="mt-0.5 text-caption text-muted-foreground">{traza}</div>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {next ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              disabled={busyId === s.id}
                              onClick={() => avanzar(s)}
                            >
                              {busyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                              {ACCION_LABEL[s.estado as Exclude<SolicitudEstado, 'entregada'>]}
                            </Button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-caption text-ink-ok">
                              <Check className="h-3.5 w-3.5" /> Lista
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
