import { useMemo } from 'react'
import { ListGroup, Pill } from '@/components/piel'
import { cn } from '@/lib/utils'
import { disponibilidadPorTramo, ordenarVentanas, ventanasDePlanta } from '@/services/ruedaCarga'
import { RejillaHoras } from './EjeDelDia'
import {
  DIAS_CORTOS,
  HORAS_EJE,
  SLOTS_POR_DIA,
  esCorteDeTurno,
  slotAHora,
  slotsAHorasMinutos,
  type MaquinaRueda,
} from '@/services/ruedaVentanas'

/**
 * La mirada de conjunto: «¿dónde tenemos tiempo hoy?».
 *
 * Las franjas por máquina dicen el detalle, pero obligan a recorrer seis filas y
 * cruzarlas mentalmente. Esta barra resume la planta entera en una sola línea:
 * la altura de cada columna es CUÁNTAS máquinas están libres en ese tramo, así
 * que los huecos se ven como picos y el resto queda plano. Debajo, las mismas
 * ventanas escritas con hora, duración y qué máquinas — porque de la barra se ve
 * DÓNDE, pero no se lee CUÁNTO, y las dos cosas hacen falta para decidir.
 */

const ALTO = 44

export interface ResumenPlantaProps {
  maquinas: MaquinaRueda[]
  diaIdx: number
  onVerMaquina?: (maquinaId: string) => void
}

export function ResumenPlanta({ maquinas, diaIdx, onVerMaquina }: ResumenPlantaProps) {
  const disponibilidad = useMemo(
    () => disponibilidadPorTramo(maquinas, diaIdx),
    [maquinas, diaIdx],
  )
  const ventanas = useMemo(() => ventanasDePlanta(maquinas, diaIdx), [maquinas, diaIdx])

  const nombrePorId = useMemo(
    () => new Map(maquinas.map((m) => [m.id, m.nombre])),
    [maquinas],
  )

  const totalLibres = useMemo(
    () => disponibilidad.reduce((a, t) => a + t.libres, 0),
    [disponibilidad],
  )
  const ordenadas = useMemo(() => ordenarVentanas(ventanas), [ventanas])
  const mejor = ordenadas[0] ?? null

  const n = maquinas.length || 1

  return (
    <ListGroup
      title={`Dónde hay tiempo · ${DIAS_CORTOS[diaIdx]}`}
      footer="La altura de cada columna es cuántas máquinas están libres en ese tramo. Donde la barra cae al piso, todas están tomadas."
    >
      <div className="flex flex-col gap-4 p-4">
        {/* Titular en palabras: lo primero que hay que poder decir en voz alta. */}
        <p className="text-body text-foreground">
          {totalLibres === 0 ? (
            <>No hay ningún tramo con máquinas libres este día.</>
          ) : mejor ? (
            <>
              La mejor ventana es{' '}
              <span className="font-mono font-semibold tabular-nums">
                {slotAHora(mejor.inicio)}–{slotAHora(mejor.inicio + mejor.largo)}
              </span>{' '}
              con {mejor.maquinaIds.length}{' '}
              {mejor.maquinaIds.length === 1 ? 'máquina libre' : 'máquinas libres'}.
            </>
          ) : (
            <>Hay tramos sueltos libres, pero ninguno lo bastante largo para entrar.</>
          )}
        </p>

        {/* Barra de disponibilidad */}
        <div className="overflow-x-auto">
          <div className="min-w-[30rem]">
            <div
              className="relative flex items-end overflow-hidden rounded-ctl bg-muted/30"
              style={{ height: ALTO }}
              role="img"
              aria-label={`Máquinas libres a lo largo del día. Total ${slotsAHorasMinutos(totalLibres)} horas-máquina.`}
            >
              {disponibilidad.map((t, i) => (
                <div
                  key={i}
                  className={cn(
                    'shrink-0',
                    t.libres > 0 ? 'bg-cat-4-tint' : t.agua > 0 ? 'bg-destructive/30' : 'bg-transparent',
                  )}
                  style={{
                    width: `${100 / SLOTS_POR_DIA}%`,
                    height: t.libres > 0 ? `${(t.libres / n) * 100}%` : t.agua > 0 ? '3px' : 0,
                  }}
                />
              ))}
              <RejillaHoras />
            </div>
            <div className="flex pt-1">
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
          </div>
        </div>

        {/* Las ventanas, escritas */}
        {ventanas.length > 0 && (
          <ul className="flex flex-col gap-2">
            {ordenadas.map((v) => (
                <li
                  key={v.inicio}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-ctl bg-muted/30 px-3 py-2.5"
                >
                  <span className="font-mono text-body font-semibold tabular-nums text-foreground">
                    {slotAHora(v.inicio)}–{slotAHora(v.inicio + v.largo)}
                  </span>
                  <span className="font-mono text-footnote tabular-nums text-muted-foreground">
                    {slotsAHorasMinutos(v.largo)}
                  </span>
                  <span className="ml-auto flex flex-wrap justify-end gap-1.5">
                    {v.maquinaIds.map((id) =>
                      onVerMaquina ? (
                        <button
                          key={id}
                          onClick={() => onVerMaquina(id)}
                          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Pill tone="ok">{nombrePorId.get(id) ?? id}</Pill>
                        </button>
                      ) : (
                        <Pill key={id} tone="ok">
                          {nombrePorId.get(id) ?? id}
                        </Pill>
                      ),
                    )}
                  </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ListGroup>
  )
}
