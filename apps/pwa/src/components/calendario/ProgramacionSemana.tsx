import { useMemo, useState } from 'react'
import { ChevronDown, TriangleAlert } from 'lucide-react'
import { ListGroup, Pill } from '@/components/piel'
import { cn } from '@/lib/utils'
import {
  MOTIVO_TEXTO,
  asignacionesDe,
  veredictoDe,
  type Asignacion,
  type Programacion,
} from '@/services/ruedaProgramacion'
import {
  DIAS_CORTOS,
  DIAS_SEMANA,
  SLOTS_POR_DIA,
  slotAHora,
  slotsAHorasMinutos,
  type Condicion,
  type MaquinaRueda,
} from '@/services/ruedaVentanas'

/**
 * El plan puesto en horas concretas.
 *
 * Comparar totales dice si cabe; esto dice DÓNDE cabe, que es lo que se lleva a
 * la reunión. Y cuando algo no entra, importa el motivo: «no hay ventana» se
 * negocia con Producción, «no hay gente» se resuelve con dotación. Son dos
 * conversaciones distintas y por eso se muestran separadas.
 */

const HORAS_EJE = [0, 3, 6, 9, 12, 15, 18, 21]

const COLOR_CONDICION: Record<Condicion, string> = {
  limpia: 'bg-cat-2-tint',
  colacion: 'bg-cat-3-tint',
  marcha: 'bg-cat-4-tint',
  agua: 'bg-destructive', // no se programa nunca, está por completitud del tipo
}

const TEXTO_CONDICION: Record<Condicion, string> = {
  limpia: 'con la máquina libre',
  colacion: 'en la línea parada',
  marcha: 'con la máquina corriendo',
  agua: 'con agua encima',
}

export interface ProgramacionSemanaProps {
  /** Ya calculada por el padre: el veredicto y el detalle deben salir del mismo cálculo. */
  prog: Programacion
  maquinas: MaquinaRueda[]
}

export function ProgramacionSemana({ prog, maquinas }: ProgramacionSemanaProps) {
  const [diaAbierto, setDiaAbierto] = useState<number | null>(null)

  const nombrePorId = useMemo(() => new Map(maquinas.map((m) => [m.id, m.nombre])), [maquinas])

  const { pedidas } = veredictoDe(prog)

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
        <ListGroup title="Lo que no entra" footer="«Sin ventana» se negocia con Producción; «sin gente» se resuelve con dotación. No son el mismo problema.">
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
        footer="Cada bloque es una ejecución en su hora. Toca un día para leer el detalle."
      >
        <div className="flex flex-col gap-2 p-4">
          <div className="overflow-x-auto">
            <div className="min-w-[32rem] flex flex-col gap-2">
              {/* Eje */}
              <div className="flex items-center gap-3">
                <span className="w-10 shrink-0" />
                <div className="flex min-w-0 flex-1">
                  {HORAS_EJE.map((h) => (
                    <span
                      key={h}
                      className="flex-1 font-mono text-caption tabular-nums text-muted-foreground"
                    >
                      {String(h).padStart(2, '0')}
                    </span>
                  ))}
                </div>
                <span className="w-16 shrink-0" />
              </div>

              {DIAS_CORTOS.map((d, i) => {
                const delDia = asignacionesDe(prog, i)
                const minutos = delDia.reduce((a, x) => a + x.largo, 0)
                return (
                  <button
                    key={d}
                    onClick={() => setDiaAbierto((v) => (v === i ? null : i))}
                    aria-expanded={diaAbierto === i}
                    className="flex items-center gap-3 rounded-ctl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span
                      className={cn(
                        'w-10 shrink-0 text-footnote',
                        diaAbierto === i ? 'font-semibold text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {d}
                    </span>

                    <div className="relative h-7 min-w-0 flex-1 overflow-hidden rounded-ctl bg-muted/30">
                      <div className="pointer-events-none absolute inset-0 flex">
                        {HORAS_EJE.map((h) => (
                          <div
                            key={h}
                            className="h-full flex-1 border-l border-border/40 first:border-l-0"
                          />
                        ))}
                      </div>
                      {delDia.map((a, k) => (
                        <div
                          key={`${a.tareaId}-${a.ocurrencia}-${k}`}
                          className={cn(
                            'absolute inset-y-1 flex items-center overflow-hidden rounded-[4px] px-1',
                            COLOR_CONDICION[a.condicion],
                          )}
                          style={{
                            left: `${(a.inicio * 100) / SLOTS_POR_DIA}%`,
                            width: `${(a.largo * 100) / SLOTS_POR_DIA}%`,
                          }}
                          title={`${a.nombre} · ${slotAHora(a.inicio)}–${slotAHora(a.inicio + a.largo)}`}
                        >
                          <span className="truncate text-[10px] font-semibold leading-none text-background">
                            {a.nombre}
                          </span>
                        </div>
                      ))}
                    </div>

                    <span className="w-16 shrink-0 text-right font-mono text-caption tabular-nums text-muted-foreground">
                      {minutos > 0 ? slotsAHorasMinutos(minutos) : '—'}
                    </span>
                  </button>
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
}: {
  dia: number
  asignaciones: Asignacion[]
  nombrePorId: Map<string, string>
}) {
  return (
    <div className="flex flex-col gap-2 rounded-card bg-muted/30 p-3">
      <p className="text-caption text-muted-foreground">{DIAS_SEMANA[dia]}</p>
      {asignaciones.length === 0 ? (
        <p className="text-footnote text-muted-foreground">Sin trabajo programado este día.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {asignaciones.map((a, k) => (
            <li key={`${a.tareaId}-${a.ocurrencia}-${k}`} className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="font-mono text-footnote tabular-nums text-foreground">
                {slotAHora(a.inicio)}–{slotAHora(a.inicio + a.largo)}
              </span>
              <span className="text-footnote text-foreground">{a.nombre}</span>
              {a.maquinaId && (
                <Pill tone="neutral">{nombrePorId.get(a.maquinaId) ?? a.maquinaId}</Pill>
              )}
              <span className="text-caption text-muted-foreground">
                {a.personas} {a.personas === 1 ? 'persona' : 'personas'} ·{' '}
                {TEXTO_CONDICION[a.condicion]}
              </span>
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
      <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
        <ChevronDown className="h-3 w-3" />
        Nunca se programa sobre higiene
      </span>
    </div>
  )
}

/** Agrupa las ejecuciones fallidas por tarea y motivo, para no repetir seis líneas iguales. */
function agrupaFallos(
  noAsignadas: Array<{ tareaId: string; nombre: string; motivo: keyof typeof MOTIVO_TEXTO }>,
) {
  const mapa = new Map<string, { tareaId: string; nombre: string; motivo: keyof typeof MOTIVO_TEXTO; veces: number }>()
  for (const n of noAsignadas) {
    const clave = `${n.tareaId}-${n.motivo}`
    const previo = mapa.get(clave)
    if (previo) previo.veces++
    else mapa.set(clave, { tareaId: n.tareaId, nombre: n.nombre, motivo: n.motivo, veces: 1 })
  }
  return [...mapa.values()]
}
