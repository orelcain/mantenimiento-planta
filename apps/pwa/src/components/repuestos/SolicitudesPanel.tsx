/**
 * SolicitudesPanel — Lista de solicitudes de repuesto (Fase 6).
 *
 * Dialog simple: tabla de solicitudes con estado y avance pendiente→aprobada→entregada.
 */
import { useState, useMemo } from 'react'
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
  type SolicitudRepuesto,
  type SolicitudEstado,
} from '@/hooks/repuestos/useSolicitudes'
import { duracionLegible } from '@/hooks/repuestos/trazaDeSolicitud'
import { avisoDeStock, type StockDeSolicitud } from '@/hooks/repuestos/solicitudDeRepuesto'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  solicitudes: SolicitudRepuesto[]
  loading: boolean
  onAvanzar: (id: string, estado: SolicitudEstado) => Promise<void>
  /** Stock de bodega por SAP: quien aprueba o entrega tiene que ver si hay antes de apretar. */
  stockDe?: (codigoSAP: string) => StockDeSolicitud | undefined
}

const ESTADO_META: Record<SolicitudEstado, { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-500/[0.15] text-ink-warn' },
  aprobada: { label: 'Aprobada', cls: 'bg-primary/[0.15] text-primary' },
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

type Filtro = 'all' | SolicitudEstado

export function SolicitudesPanel({ open, onOpenChange, solicitudes, loading, onAvanzar, stockDe }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('all')

  const counts = useMemo(() => ({
    all: solicitudes.length,
    pendiente: solicitudes.filter((s) => s.estado === 'pendiente').length,
    aprobada: solicitudes.filter((s) => s.estado === 'aprobada').length,
    entregada: solicitudes.filter((s) => s.estado === 'entregada').length,
  }), [solicitudes])

  const visibles = useMemo(
    () => (filtro === 'all' ? solicitudes : solicitudes.filter((s) => s.estado === filtro)),
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
            {CHIPS.map((c) => (
              <button
                key={c.key}
                onClick={() => setFiltro(c.key)}
                className={[
                  'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  filtro === c.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70',
                ].join(' ')}
              >
                {c.label} <span className="tabular-nums opacity-70">({counts[c.key]})</span>
              </button>
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
                const meta = ESTADO_META[s.estado]
                const next = ESTADO_SIGUIENTE[s.estado]
                const traza = trazaVisible(s)
                return (
                  <li key={s.id} className="space-y-1.5 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{s.textoBreve || '(sin nombre)'}</div>
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
                    const meta = ESTADO_META[s.estado]
                    const next = ESTADO_SIGUIENTE[s.estado]
                    const traza = trazaVisible(s)
                    return (
                      <tr key={s.id} className="align-top">
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{s.textoBreve || '(sin nombre)'}</div>
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
