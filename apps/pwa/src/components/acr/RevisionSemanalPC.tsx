/**
 * «Revisión semanal» en PC: lo acumulado a la izquierda y, a la derecha, cada falla con sus
 * acciones. Solo dibuja: la lista y el guardado viven en `RevisionSemanalSheet`.
 * Mockup aprobado (opción B): https://claude.ai/artifact/XFpR5xVsPnxyYu59i7rT1b
 */
import { Sheet } from '@/components/piel'
import { partesEquipo } from '@/components/acr/acrExpedienteTextos'
import { resumenFuerza } from '@/services/acr/acrLogica'
import { ETIQUETA_FUERZA, type Acr, type AccionAcr, type FuerzaAccion } from '@/services/acr/acr.types'
import {
  accionesPorEquipo,
  detencionAnalizada,
  estadoDeAccion,
  fechaCorta,
  gruposPorFalla,
  resumenCumplimiento,
  type EstadoRevision,
} from '@/services/acr/revisionSemanal'
import { fechaLocal } from '@/services/bitacora/turnoMantencion'
import { cn } from '@/lib/utils'

const FILA = 'grid grid-cols-[minmax(0,1fr)_124px_62px_88px_180px] items-center gap-x-3'
const FILA_LECTURA = 'grid grid-cols-[minmax(0,1fr)_124px_62px_88px_80px] items-center gap-x-3'
const DATO = 'flex min-h-[28px] items-center justify-between gap-3 border-t border-border text-subhead tabular-nums'
const CAP = 'mb-1.5 text-footnote text-muted-foreground'
const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
const FUERZAS = ['debil', 'media', 'fuerte'] as const
const COLOR_FUERZA: Record<FuerzaAccion, string> = { debil: 'bg-fill-critical', media: 'bg-fill-warning', fuerte: 'bg-fill-ok' }
const ESTADO: Record<EstadoRevision, { texto: string; color: string }> = {
  hecha: { texto: 'Hecha', color: 'bg-fill-ok' },
  vencida: { texto: 'Vencida', color: 'bg-fill-critical' },
  pendiente: { texto: 'Pendiente', color: 'bg-muted-foreground' },
}

const Punto = ({ color }: { color: string }) => <span className={cn('mr-1.5 inline-block size-[7px] rounded-full align-[1px]', color)} aria-hidden />
const nombreEquipo = (equipo: string) => {
  const { tipo, nombre } = partesEquipo(equipo)
  return tipo ? `${tipo} ${nombre}` : nombre
}

export interface RevisionSemanalPCProps {
  open: boolean
  onClose: () => void
  acrs: Acr[]
  periodo: string
  puedeEditar: boolean
  onCambiarFuerza: (acrId: string, accionId: string, fuerza: FuerzaAccion) => void
}

function SelectorFuerza({ accion, onCambiar }: { accion: AccionAcr; onCambiar: (f: FuerzaAccion) => void }) {
  return (
    <div role="group" aria-label={`Fuerza de la acción: ${accion.texto}`} className="grid grid-cols-3 overflow-hidden rounded-ctl border border-border">
      {FUERZAS.map((f, i) => (
        <button
          key={f}
          type="button"
          aria-pressed={accion.fuerza === f}
          onClick={() => { if (accion.fuerza !== f) onCambiar(f) }}
          className={cn('h-[30px] text-subhead', FOCO, i > 0 && 'border-l border-border', accion.fuerza === f ? 'bg-muted-foreground/15 text-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          {ETIQUETA_FUERZA[f]}
        </button>
      ))}
    </div>
  )
}

export function RevisionSemanalPC({ open, onClose, acrs, periodo, puedeEditar, onCambiarFuerza }: RevisionSemanalPCProps) {
  const hoy = fechaLocal(new Date())
  const grupos = gruposPorFalla(acrs)
  const acciones = grupos.flatMap((g) => g.acciones)
  const fuerza = resumenFuerza(acciones)
  const cumple = resumenCumplimiento(acciones, hoy)
  const equipos = accionesPorEquipo(grupos)
  const minutos = detencionAnalizada(grupos)
  const columnas = puedeEditar ? FILA : FILA_LECTURA
  const conteo = fuerza.acciones === 1 ? '1 acción' : `${fuerza.acciones} acciones`
  let primera = true

  return (
    <Sheet open={open} onClose={onClose} presentacionPC="libre" title="Revisión semanal">
      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col gap-[22px] overflow-y-auto border-r border-border bg-background px-5 py-6">
          <div>
            <p className={CAP}>Fuerza de las acciones</p>
            {FUERZAS.map((f) => (
              <div key={f} className={DATO}><span><Punto color={COLOR_FUERZA[f]} />{ETIQUETA_FUERZA[f]}</span><span>{fuerza[f]}</span></div>
            ))}
            <div className={cn(DATO, 'font-semibold')}><span>Total</span><span>{fuerza.acciones}</span></div>
          </div>
          <div>
            <p className={CAP}>Cumplimiento</p>
            <div className={DATO}><span>Hechas</span><span>{cumple.hechas}</span></div>
            <div className={DATO}><span>Pendientes</span><span>{cumple.pendientes}</span></div>
            <div className={DATO}><span><Punto color="bg-fill-critical" />Vencidas</span><span>{cumple.vencidas}</span></div>
            <div className={DATO}><span>Sin responsable</span><span>{cumple.sinResponsable}</span></div>
          </div>
          {equipos.length > 0 && (
            <div>
              <p className={CAP}>Por equipo</p>
              {equipos.map((e) => <div key={e.equipo} className={DATO}><span className="truncate">{nombreEquipo(e.equipo)}</span><span>{e.n}</span></div>)}
              <div className={cn(DATO, 'font-semibold')}><span>Total</span><span>{fuerza.acciones}</span></div>
            </div>
          )}
          <div>
            <p className={CAP}>Origen</p>
            <div className={DATO}><span>Análisis de causa raíz</span><span>{grupos.length}</span></div>
            <div className={DATO}><span>Detención analizada</span><span>{minutos} min</span></div>
          </div>
          <p className="mt-auto text-footnote text-muted-foreground">
            {puedeEditar ? 'Elige la fuerza para cambiarla. Se guarda al elegir.' : 'Solo lectura: la fuerza la cambia un supervisor.'}
          </p>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col">
          <header className="flex items-start justify-between gap-5 px-7 pb-3.5 pt-5">
            <div className="min-w-0">
              <h2 className="text-title2 font-semibold">
                {fuerza.fuertePct == null ? 'Sin acciones en el período' : `${Math.round(fuerza.fuertePct)} % de las acciones son fuertes`}
              </h2>
              <p className="text-footnote tabular-nums text-muted-foreground">
                {`${periodo} · ${conteo} en ${grupos.length} análisis`}
              </p>
            </div>
            <button type="button" onClick={onClose} className={cn('min-h-[30px] shrink-0 rounded-ctl text-subhead text-muted-foreground hover:text-foreground', FOCO)}>Cerrar</button>
          </header>

          <div data-tutorial="t-revision" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 pb-3.5">
            {grupos.length === 0 ? (
              <p className="border-t border-border py-3 text-subhead text-muted-foreground">No hay ACR con acciones en este período.</p>
            ) : (
              <>
                <div className={cn(columnas, 'sticky top-0 z-[1] min-h-[26px] bg-card text-footnote text-muted-foreground')}>
                  <span>Falla y acciones, primero las que tienen débiles</span><span>Responsable</span><span>Plazo</span><span>Estado</span><span>Fuerza</span>
                </div>
                {grupos.map(({ acr, acciones: filas }) => {
                  const detalle = [acr.equipo, acr.minutosDetencion != null ? `${acr.minutosDetencion} min` : '', fechaCorta(acr.fechaTurno)].filter(Boolean).join(' · ')
                  return (
                    <section key={acr.id} aria-label={acr.definicion}>
                      <div className="flex items-baseline justify-between gap-3 border-t border-border pb-[7px] pt-3.5">
                        <h3 className="min-w-0 text-subhead font-semibold">{acr.definicion}</h3>
                        <span className="shrink-0 text-footnote tabular-nums text-muted-foreground">{detalle}</span>
                      </div>
                      {filas.map((accion) => {
                        const estado = ESTADO[estadoDeAccion(accion, hoy)]
                        const tutorial = primera ? 't-rev-fila' : undefined
                        primera = false
                        return (
                          <div key={accion.id} data-tutorial={tutorial} className={cn(columnas, 'min-h-[40px] border-t border-border py-[3px] text-subhead tabular-nums')}>
                            <span className="min-w-0">{accion.texto}</span>
                            <span className={cn('truncate', !accion.responsable.trim() && 'text-muted-foreground')}>{accion.responsable.trim() || 'Sin asignar'}</span>
                            <span className="text-muted-foreground">{fechaCorta(accion.fechaLimite)}</span>
                            <span><Punto color={estado.color} />{estado.texto}</span>
                            {puedeEditar ? (
                              <SelectorFuerza accion={accion} onCambiar={(f) => onCambiarFuerza(acr.id, accion.id, f)} />
                            ) : (
                              <span><Punto color={COLOR_FUERZA[accion.fuerza]} />{ETIQUETA_FUERZA[accion.fuerza]}</span>
                            )}
                          </div>
                        )
                      })}
                    </section>
                  )
                })}
              </>
            )}
          </div>
        </section>
      </div>
    </Sheet>
  )
}
