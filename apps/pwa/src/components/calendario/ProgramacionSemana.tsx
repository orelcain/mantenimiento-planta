import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pin, PinOff, RotateCcw, TriangleAlert } from 'lucide-react'
import { ListGroup, Pill } from '@/components/piel'
import { cn } from '@/lib/utils'
import {
  MOTIVO_TEXTO,
  ajustarAPaso,
  asignacionesDe,
  veredictoDe,
  type Anclaje,
  type Asignacion,
  type MotivoNoCabe,
  type Programacion,
} from '@/services/ruedaProgramacion'
import { BandaTurnos, RejillaHoras } from './EjeDelDia'
import {
  DIAS_CORTOS,
  DIAS_SEMANA,
  HORAS_EJE,
  esCorteDeTurno,
  MINUTOS_POR_SLOT,
  SLOTS_POR_DIA,
  slotAHora,
  slotsAHorasMinutos,
  type Condicion,
  type MaquinaRueda,
} from '@/services/ruedaVentanas'

/**
 * El plan puesto en horas concretas, y editable arrastrando.
 *
 * La propuesta automática ordena el trabajo, pero el que conoce la planta sabe
 * cosas que el algoritmo no: que el cambio de cuchillos conviene antes del
 * lavado, que a tal hora está el eléctrico. Por eso los bloques se mueven a
 * mano, y lo movido se respeta en los recálculos siguientes.
 *
 * Un movimiento inválido NO se aplica a medias: se valida corriendo el mismo
 * motor que dibuja el plan, así la comprobación nunca puede divergir de lo que
 * se ve. Si no cabe, el bloque vuelve a su sitio y se dice por qué.
 */

/**
 * Dos pasos distintos y no uno: el arrastre es un gesto impreciso —con el dedo,
 * un píxel de la franja son casi cinco minutos— así que salta de 15 en 15. El
 * ajuste al tramo exacto se hace con los botones y las flechas, que no dependen
 * de la puntería.
 */
const PASO_ARRASTRE = 3 // 15 min
const PASO_FINO = 1 // 5 min

const COLOR_CONDICION: Record<Condicion, string> = {
  limpia: 'bg-cat-2-tint',
  colacion: 'bg-cat-3-tint',
  marcha: 'bg-cat-4-tint',
  agua: 'bg-destructive', // nunca se programa; está por completitud del tipo
}

const TEXTO_CONDICION: Record<Condicion, string> = {
  limpia: 'con la máquina libre',
  colacion: 'en la línea parada',
  marcha: 'con la máquina corriendo',
  agua: 'con agua encima',
}

interface Arrastre {
  tareaId: string
  ocurrencia: number
  largo: number
  /** Tramo del bloque por donde se agarró, para que no salte al centro. */
  offset: number
  dia: number
  inicio: number
}

export interface ProgramacionSemanaProps {
  /** Ya calculada por el padre: el veredicto y el detalle salen del mismo cálculo. */
  prog: Programacion
  maquinas: MaquinaRueda[]
  anclajes: Anclaje[]
  /** Devuelve false si el destino no servía, para poder avisar. */
  onMover: (destino: Anclaje) => { ok: boolean; motivo: MotivoNoCabe | null }
  onSoltarAnclaje: (tareaId: string, ocurrencia: number) => void
  onRestablecer: () => void
}

export function ProgramacionSemana({
  prog,
  maquinas,
  anclajes,
  onMover,
  onSoltarAnclaje,
  onRestablecer,
}: ProgramacionSemanaProps) {
  const [diaAbierto, setDiaAbierto] = useState<number | null>(null)
  const [arrastre, setArrastre] = useState<Arrastre | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const contenedorRef = useRef<HTMLDivElement | null>(null)

  const nombrePorId = useMemo(() => new Map(maquinas.map((m) => [m.id, m.nombre])), [maquinas])
  const { pedidas } = veredictoDe(prog)

  /** Día y tramo bajo el puntero, respetando dónde se agarró el bloque. */
  const destinoDesdePunto = useCallback(
    (x: number, y: number, a: Arrastre): { dia: number; inicio: number } | null => {
      const el = document.elementFromPoint(x, y)?.closest('[data-fila-dia]') as HTMLElement | null
      if (!el) return null
      const dia = Number(el.dataset.filaDia)
      const r = el.getBoundingClientRect()
      if (!r.width) return null
      const tramo = Math.round(((x - r.left) / r.width) * SLOTS_POR_DIA) - a.offset
      return { dia, inicio: ajustarAPaso(tramo, PASO_ARRASTRE, a.largo) }
    },
    [],
  )

  useEffect(() => {
    if (!arrastre) return
    const mover = (e: PointerEvent) => {
      const d = destinoDesdePunto(e.clientX, e.clientY, arrastre)
      if (d) setArrastre((prev) => (prev ? { ...prev, ...d } : prev))
    }
    const soltar = () => {
      setArrastre((prev) => {
        if (prev) {
          const r = onMover({
            tareaId: prev.tareaId,
            ocurrencia: prev.ocurrencia,
            dia: prev.dia,
            inicio: prev.inicio,
          })
          setAviso(
            r.ok
              ? null
              : `No cabe en ${DIAS_CORTOS[prev.dia]} ${slotAHora(prev.inicio)}. ${
                  r.motivo ? MOTIVO_TEXTO[r.motivo] : ''
                }`,
          )
        }
        return null
      })
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', soltar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', soltar)
    }
  }, [arrastre, destinoDesdePunto, onMover])

  // El aviso se va solo: es un mensaje de resultado, no un estado que atender.
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 5000)
    return () => clearTimeout(t)
  }, [aviso])

  const empezarArrastre = (e: React.PointerEvent, a: Asignacion) => {
    e.preventDefault()
    e.stopPropagation()
    const fila = (e.currentTarget as HTMLElement).closest('[data-fila-dia]') as HTMLElement | null
    const r = fila?.getBoundingClientRect()
    const offset = r?.width
      ? Math.round(((e.clientX - r.left) / r.width) * SLOTS_POR_DIA) - a.inicio
      : 0
    setArrastre({
      tareaId: a.tareaId,
      ocurrencia: a.ocurrencia,
      largo: a.largo,
      offset: Math.min(Math.max(offset, 0), a.largo - 1),
      dia: a.dia,
      inicio: a.inicio,
    })
  }

  const mover = (a: Asignacion, deltaTramos: number) => {
    const inicio = Math.min(Math.max(a.inicio + deltaTramos, 0), SLOTS_POR_DIA - a.largo)
    if (inicio === a.inicio) return
    const r = onMover({ tareaId: a.tareaId, ocurrencia: a.ocurrencia, dia: a.dia, inicio })
    setAviso(r.ok ? null : `No cabe a las ${slotAHora(inicio)}. ${r.motivo ? MOTIVO_TEXTO[r.motivo] : ''}`)
  }

  if (pedidas === 0) {
    return (
      <ListGroup title="Programación propuesta">
        <div className="px-4 py-5 text-footnote text-muted-foreground">
          No hay tareas activas que programar.
        </div>
      </ListGroup>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {prog.noAsignadas.length > 0 && (
        <ListGroup
          title="Lo que no entra"
          footer="«Sin ventana» se negocia con Producción; «sin gente» se resuelve con dotación. No son el mismo problema."
        >
          {agrupaFallos(prog.noAsignadas).map((f) => (
            <div key={`${f.tareaId}-${f.motivo}`} className="flex items-start gap-3 px-4 py-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="flex flex-col gap-0.5">
                <p className="text-headline text-foreground">
                  {f.nombre}
                  {f.veces > 1 && (
                    <span className="ml-1.5 font-mono text-footnote tabular-nums text-muted-foreground">
                      ×{f.veces}
                    </span>
                  )}
                </p>
                <p className="text-footnote text-muted-foreground">{MOTIVO_TEXTO[f.motivo]}</p>
              </div>
            </div>
          ))}
        </ListGroup>
      )}

      <ListGroup
        title="La semana, hora por hora"
        action={
          anclajes.length > 0 ? (
            <button
              onClick={onRestablecer}
              className="flex items-center gap-1.5 text-[0.8rem] font-medium text-primary"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Volver al automático
            </button>
          ) : undefined
        }
        footer="Arrastra un bloque para cambiarlo de hora o de día. Lo que muevas se respeta al recalcular."
      >
        <div className="flex flex-col gap-2 p-4" ref={contenedorRef}>
          {aviso && (
            <p
              role="status"
              className="rounded-ctl bg-destructive/10 px-3 py-2 text-footnote text-destructive"
            >
              {aviso}
            </p>
          )}

          {arrastre && (
            <p role="status" className="font-mono text-footnote tabular-nums text-foreground">
              {DIAS_CORTOS[arrastre.dia]} {slotAHora(arrastre.inicio)}–
              {slotAHora(arrastre.inicio + arrastre.largo)}
            </p>
          )}

          <div className="overflow-x-auto">
            <div className="flex min-w-[32rem] flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className="w-10 shrink-0" />
                <div className="flex min-w-0 flex-1">
                  {HORAS_EJE.map((h) => (
                    <span
                      key={h}
                      className={cn(
                        'flex-1 font-mono text-caption tabular-nums',
                        esCorteDeTurno(h) ? 'font-semibold text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {String(h).padStart(2, '0')}
                    </span>
                  ))}
                </div>
                <span className="w-16 shrink-0" />
              </div>
              <BandaTurnos anchoEtiqueta="w-10" anchoCifra="w-16" />

              {DIAS_CORTOS.map((d, i) => {
                const delDia = asignacionesDe(prog, i)
                const minutos = delDia.reduce((a, x) => a + x.largo, 0)
                return (
                  <div key={d} className="flex items-center gap-3">
                    <button
                      onClick={() => setDiaAbierto((v) => (v === i ? null : i))}
                      aria-expanded={diaAbierto === i}
                      className={cn(
                        'w-10 shrink-0 py-2 text-left text-footnote focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        diaAbierto === i ? 'font-semibold text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {d}
                    </button>

                    <div
                      data-fila-dia={i}
                      className={cn(
                        'relative h-8 min-w-0 flex-1 overflow-hidden rounded-ctl bg-muted/30',
                        arrastre?.dia === i && 'ring-1 ring-inset ring-primary',
                      )}
                    >
                      <RejillaHoras />

                      {/* Silueta del destino mientras se arrastra */}
                      {arrastre?.dia === i && (
                        <div
                          className="pointer-events-none absolute inset-y-1 rounded-[4px] border-2 border-dashed border-primary"
                          style={{
                            left: `${(arrastre.inicio * 100) / SLOTS_POR_DIA}%`,
                            width: `${(arrastre.largo * 100) / SLOTS_POR_DIA}%`,
                          }}
                        />
                      )}

                      {delDia.map((a, k) => {
                        const arrastrando =
                          arrastre?.tareaId === a.tareaId && arrastre.ocurrencia === a.ocurrencia
                        return (
                          <div
                            key={`${a.tareaId}-${a.ocurrencia}-${k}`}
                            onPointerDown={(e) => empezarArrastre(e, a)}
                            role="button"
                            tabIndex={0}
                            aria-label={`${a.nombre}, ${DIAS_SEMANA[a.dia]} ${slotAHora(a.inicio)}. Flechas para mover.`}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowLeft') {
                                e.preventDefault()
                                mover(a, -PASO_FINO)
                              } else if (e.key === 'ArrowRight') {
                                e.preventDefault()
                                mover(a, PASO_FINO)
                              }
                            }}
                            className={cn(
                              'absolute inset-y-1 flex cursor-grab touch-none items-center overflow-hidden rounded-[4px] px-1',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground',
                              COLOR_CONDICION[a.condicion],
                              arrastrando && 'opacity-40',
                              a.anclada && 'ring-1 ring-inset ring-foreground/40',
                            )}
                            style={{
                              left: `${(a.inicio * 100) / SLOTS_POR_DIA}%`,
                              width: `${(a.largo * 100) / SLOTS_POR_DIA}%`,
                            }}
                            title={`${a.nombre} · ${slotAHora(a.inicio)}–${slotAHora(a.inicio + a.largo)}`}
                          >
                            {a.anclada && (
                              <Pin className="mr-0.5 h-2.5 w-2.5 shrink-0 text-background" />
                            )}
                            <span className="truncate text-[10px] font-semibold leading-none text-background">
                              {a.nombre}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    <span className="w-16 shrink-0 text-right font-mono text-caption tabular-nums text-muted-foreground">
                      {minutos > 0 ? slotsAHorasMinutos(minutos) : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          <Leyenda />

          {diaAbierto !== null && (
            <DetalleDia
              dia={diaAbierto}
              asignaciones={asignacionesDe(prog, diaAbierto)}
              nombrePorId={nombrePorId}
              onMover={mover}
              onSoltarAnclaje={onSoltarAnclaje}
            />
          )}
        </div>
      </ListGroup>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */

function DetalleDia({
  dia,
  asignaciones,
  nombrePorId,
  onMover,
  onSoltarAnclaje,
}: {
  dia: number
  asignaciones: Asignacion[]
  nombrePorId: Map<string, string>
  onMover: (a: Asignacion, delta: number) => void
  onSoltarAnclaje: (tareaId: string, ocurrencia: number) => void
}) {
  const btn =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-ctl border border-border text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
  return (
    <div className="flex flex-col gap-2 rounded-card bg-muted/30 p-3">
      <p className="text-caption text-muted-foreground">{DIAS_SEMANA[dia]}</p>
      {asignaciones.length === 0 ? (
        <p className="text-footnote text-muted-foreground">Sin trabajo programado este día.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {asignaciones.map((a, k) => (
            <li
              key={`${a.tareaId}-${a.ocurrencia}-${k}`}
              className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5"
            >
              {/* Ajuste fino de 15 min: la misma edición que el arrastre, pero
                  alcanzable con teclado y sin pulso fino. */}
              <span className="flex items-center gap-1">
                <button
                  className={btn}
                  onClick={() => onMover(a, -PASO_FINO)}
                  aria-label={`Adelantar ${a.nombre} ${MINUTOS_POR_SLOT} minutos`}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  className={btn}
                  onClick={() => onMover(a, PASO_FINO)}
                  aria-label={`Atrasar ${a.nombre} ${MINUTOS_POR_SLOT} minutos`}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </span>

              <span className="font-mono text-footnote tabular-nums text-foreground">
                {slotAHora(a.inicio)}–{slotAHora(a.inicio + a.largo)}
              </span>
              <span className="text-footnote text-foreground">{a.nombre}</span>
              {a.maquinaId && <Pill tone="neutral">{nombrePorId.get(a.maquinaId) ?? a.maquinaId}</Pill>}
              <span className="text-caption text-muted-foreground">
                {a.personas} {a.personas === 1 ? 'persona' : 'personas'} ·{' '}
                {TEXTO_CONDICION[a.condicion]}
              </span>

              {a.anclada && (
                <button
                  onClick={() => onSoltarAnclaje(a.tareaId, a.ocurrencia)}
                  className="ml-auto flex items-center gap-1 text-caption text-primary"
                >
                  <PinOff className="h-3 w-3" />
                  Soltar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Leyenda() {
  const items: Array<[Condicion, string]> = [
    ['limpia', 'Máquina libre'],
    ['colacion', 'Línea parada'],
    ['marcha', 'Máquina corriendo'],
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1">
      {items.map(([c, label]) => (
        <span key={c} className="flex items-center gap-1.5 text-footnote text-muted-foreground">
          <span className={cn('h-3 w-3 rounded-[3px]', COLOR_CONDICION[c])} />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1.5 text-footnote text-muted-foreground">
        <Pin className="h-3 w-3" />
        Movida a mano
      </span>
      <span className="text-caption text-muted-foreground">
        Arrastrar salta de 15 en 15 min · las flechas y los botones mueven de{' '}
        {MINUTOS_POR_SLOT} en {MINUTOS_POR_SLOT} · nunca se programa sobre higiene
      </span>
    </div>
  )
}

/** Agrupa las ejecuciones fallidas por tarea y motivo, para no repetir seis líneas iguales. */
function agrupaFallos(noAsignadas: Array<{ tareaId: string; nombre: string; motivo: MotivoNoCabe }>) {
  const mapa = new Map<string, { tareaId: string; nombre: string; motivo: MotivoNoCabe; veces: number }>()
  for (const n of noAsignadas) {
    const clave = `${n.tareaId}-${n.motivo}`
    const previo = mapa.get(clave)
    if (previo) previo.veces++
    else mapa.set(clave, { tareaId: n.tareaId, nombre: n.nombre, motivo: n.motivo, veces: 1 })
  }
  return [...mapa.values()]
}
