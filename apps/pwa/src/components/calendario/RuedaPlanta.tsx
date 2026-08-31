import { useCallback, useMemo, useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { ListGroup, Pill } from '@/components/piel'
import { cn } from '@/lib/utils'
import { ordenarVentanas, ventanasDePlanta } from '@/services/ruedaCarga'
import { exportarRuedaPng } from '@/services/exportarRuedaPng'
import {
  DIAS_SEMANA,
  SLOTS_POR_DIA,
  TURNOS,
  agruparTramos,
  condicionDe,
  contarDia,
  slotAHora,
  slotsAHorasDecimal,
  slotsAHorasMinutos,
  type MaquinaRueda,
  type Ocupante,
} from '@/services/ruedaVentanas'

/**
 * La planta entera en un solo reloj: un anillo por máquina, del centro hacia
 * afuera.
 *
 * La franja ya compara máquinas sobre un eje recto, y para MEDIR sigue siendo
 * mejor. Esto responde otra cosa: dónde está el hueco en el día. Con los anillos
 * alineados por hora, un radio limpio de punta a punta se ve de un golpe —ahí
 * está libre la planta entera— y no hay que recorrer seis filas cruzándolas de
 * cabeza.
 *
 * Es la misma razón por la que un reloj se lee más rápido que una tabla de
 * horarios cuando la pregunta es «¿a qué hora?» y no «¿cuánto?».
 */

const CX = 200
const CY = 200
const R_EXT = 176
const R_INT_MIN = 46
const SEPARACION = 2
const VB_MARGEN = 26
const VB_LADO = 400 + VB_MARGEN * 2

/**
 * Color de identidad de cada máquina, por posición en la lista.
 *
 * NO se usa como relleno del anillo: el relleno ya dice quién ocupa el tramo, y
 * meter una segunda codificación de color encima haría que ninguna de las dos se
 * lea. La identidad va en el FILO exterior del anillo y en el punto de la lista,
 * que es suficiente para seguir un anillo con la vista sin competir con el dato.
 *
 * Ocho tonos: a partir de la novena máquina se repiten, y ahí la posición y el
 * rótulo siguen distinguiéndolas.
 */
const FILO_MAQUINA = [
  'fill-cat-1-ink', 'fill-cat-2-ink', 'fill-cat-3-ink', 'fill-cat-4-ink',
  'fill-cat-5-ink', 'fill-cat-6-ink', 'fill-cat-7-ink', 'fill-cat-8-ink',
] as const
const PUNTO_MAQUINA = [
  'bg-cat-1-ink', 'bg-cat-2-ink', 'bg-cat-3-ink', 'bg-cat-4-ink',
  'bg-cat-5-ink', 'bg-cat-6-ink', 'bg-cat-7-ink', 'bg-cat-8-ink',
] as const

export function colorDeMaquina(indice: number): { filo: string; punto: string } {
  const i = ((indice % 8) + 8) % 8
  return { filo: FILO_MAQUINA[i]!, punto: PUNTO_MAQUINA[i]! }
}

const FILL_OCUPANTE: Record<Ocupante, string> = {
  P: 'fill-cat-1-tint',
  H: 'fill-cat-7-tint',
  X: 'fill-cat-7-tint',
  C: 'fill-cat-3-tint',
  '0': 'fill-muted-foreground',
}
const OPACIDAD: Record<Ocupante, number> = { P: 0.5, H: 0.62, X: 0.62, C: 0.45, '0': 0.1 }

function punto(r: number, grados: number): [number, number] {
  const a = ((grados - 90) * Math.PI) / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

function sector(inicio: number, largo: number, rIn: number, rOut: number): string {
  const paso = 360 / SLOTS_POR_DIA
  const a0 = inicio * paso
  const a1 = (inicio + largo) * paso
  const barrido = a1 - a0
  if (barrido >= 359.999) {
    return `${sector(inicio, largo / 2, rIn, rOut)} ${sector(inicio + largo / 2, largo / 2, rIn, rOut)}`
  }
  const grande = barrido > 180 ? 1 : 0
  const [x1, y1] = punto(rOut, a0)
  const [x2, y2] = punto(rOut, a1)
  const [x3, y3] = punto(rIn, a1)
  const [x4, y4] = punto(rIn, a0)
  return (
    `M${x1.toFixed(2)},${y1.toFixed(2)}` +
    `A${rOut},${rOut} 0 ${grande} 1 ${x2.toFixed(2)},${y2.toFixed(2)}` +
    `L${x3.toFixed(2)},${y3.toFixed(2)}` +
    `A${rIn},${rIn} 0 ${grande} 0 ${x4.toFixed(2)},${y4.toFixed(2)}Z`
  )
}

export interface RuedaPlantaProps {
  maquinas: MaquinaRueda[]
  diaIdx: number
  maquinaActivaId?: string
  onSeleccionar?: (maquinaId: string) => void
}

export function RuedaPlanta({ maquinas, diaIdx, maquinaActivaId, onSeleccionar }: RuedaPlantaProps) {
  /**
   * Una máquina sin ningún tramo pintado y sin confirmar no está «libre»: está
   * SIN DATOS. Sumarla como libre convertía la rueda vacía en «la planta entera
   * queda libre 24 h», que es mentira.
   */
  const sinDatos = maquinas.filter((m) => {
    const d = m.semana[diaIdx]
    const vacia = !d || !d.areas.split('').some((c) => c !== '0')
    return vacia && m.revisadoEnTerreno !== true
  })
  const todasSinDatos = maquinas.length > 0 && sinDatos.length === maquinas.length
  const [encima, setEncima] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [exportando, setExportando] = useState(false)
  const [errorExport, setErrorExport] = useState<string | null>(null)

  const anillos = useMemo(() => {
    const n = Math.max(maquinas.length, 1)
    const grosor = (R_EXT - R_INT_MIN) / n
    return maquinas.map((m, i) => ({
      maquina: m,
      indice: i,
      // La primera de la lista queda por FUERA: es el anillo más largo y el más
      // fácil de leer, y la lista se ordena por importancia.
      rOut: R_EXT - i * grosor,
      rIn: R_EXT - (i + 1) * grosor + SEPARACION,
    }))
  }, [maquinas])

  const ventanas = useMemo(
    () => ordenarVentanas(ventanasDePlanta(maquinas, diaIdx)),
    [maquinas, diaIdx],
  )
  const mejor = ventanas[0] ?? null

  /** Tramos en que TODAS las máquinas están libres: el radio limpio de punta a punta. */
  const plenos = useMemo(() => {
    const marca = Array.from({ length: SLOTS_POR_DIA }, (_, i) =>
      maquinas.length > 0 &&
      maquinas.every((m) => {
        const d = m.semana[diaIdx]
        return d ? condicionDe(d.areas[i] ?? '0') === 'limpia' : false
      })
        ? '1'
        : '0',
    ).join('')
    return agruparTramos(marca).filter((g) => g.valor === '1')
  }, [maquinas, diaIdx])

  const totalPleno = plenos.reduce((a, g) => a + g.largo, 0)

  /**
   * El PNG se compone con los colores REALES del tema en que se está mirando:
   * se leen del DOM en vez de fijarlos, para que el archivo salga coherente con
   * lo que la persona tiene en pantalla y no en un tema que no eligió.
   */
  const exportar = useCallback(async () => {
    if (!svgRef.current) return
    setExportando(true)
    setErrorExport(null)
    try {
      const cs = getComputedStyle(document.documentElement)
      const leer = (v: string, alt: string) => {
        const bruto = cs.getPropertyValue(v).trim()
        return bruto ? (bruto.includes(' ') ? `rgb(${bruto.split(/\s+/).join(' ')})` : bruto) : alt
      }
      const leyenda = maquinas.map((m, i) => {
        const tono = ((i % 8) + 8) % 8 + 1
        return {
          color: leer(`--cat-${tono}-ink`, '#666'),
          texto: `${m.nombre}${m.revisadoEnTerreno !== true ? '  (horario sin confirmar)' : ''}`,
        }
      })
      const ok = await exportarRuedaPng(svgRef.current, {
        titulo: `Ventanas de intervención · ${DIAS_SEMANA[diaIdx]}`,
        subtitulo: `${maquinas.length} equipos · ${slotsAHorasMinutos(totalPleno)} con la planta entera libre`,
        leyenda,
        fondo: leer('--background', '#ffffff'),
        tinta: leer('--foreground', '#111827'),
        nombreArchivo: `ventanas-${(DIAS_SEMANA[diaIdx] ?? '').toLowerCase()}.png`,
      })
      if (!ok) setErrorExport('El navegador no dejó generar la imagen.')
    } catch {
      setErrorExport('No se pudo generar la imagen.')
    } finally {
      setExportando(false)
    }
  }, [maquinas, diaIdx, totalPleno])

  if (!maquinas.length) return null

  return (
    <ListGroup
      title={`La planta completa · ${DIAS_SEMANA[diaIdx]}`}
      action={
        <button
          onClick={exportar}
          disabled={exportando}
          className="flex items-center gap-1.5 text-[0.8rem] font-medium text-primary disabled:opacity-50"
        >
          {exportando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Descargar PNG
        </button>
      }
      footer="Un anillo por máquina, del centro hacia afuera. Donde el radio queda limpio de punta a punta, la planta entera está libre."
    >
      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start">
        <div className="mx-auto w-full max-w-[min(28rem,58vh)] shrink-0 lg:mx-0">
          <svg
            ref={svgRef}
            viewBox={`${-VB_MARGEN} ${-VB_MARGEN} ${VB_LADO} ${VB_LADO}`}
            className="w-full select-none"
            role="img"
            aria-label={`Ocupación de ${maquinas.length} máquinas el ${DIAS_SEMANA[diaIdx]}. ${slotsAHorasMinutos(totalPleno)} con la planta entera libre.`}
          >
            {/* Los tramos en que TODA la planta está libre, marcados de lado a
                lado: es la respuesta a «¿cuándo podemos entrar sin pedir nada?» */}
            {plenos.map((g) => (
              <path
                key={`pleno${g.inicio}`}
                d={sector(g.inicio, g.largo, R_INT_MIN - 6, R_EXT + 6)}
                className="fill-cat-4-tint"
                fillOpacity={0.14}
              />
            ))}

            {anillos.map(({ maquina, rIn, rOut, indice }) => {
              const d = maquina.semana[diaIdx]
              if (!d) return null
              const activa = maquina.id === maquinaActivaId || maquina.id === encima
              // Con el puntero sobre un anillo, los demás se apagan: seguir uno
              // entre seis anillos concéntricos es imposible sin ese contraste.
              const apagada = encima !== null && encima !== maquina.id
              const color = colorDeMaquina(indice)
              return (
                <g
                  key={maquina.id}
                  onPointerEnter={() => setEncima(maquina.id)}
                  onPointerLeave={() => setEncima((v) => (v === maquina.id ? null : v))}
                  onClick={() => onSeleccionar?.(maquina.id)}
                  className={cn(
                    onSeleccionar && 'cursor-pointer',
                    'transition-opacity duration-150 motion-reduce:transition-none',
                  )}
                  opacity={apagada ? 0.3 : 1}
                >
                  {/* Filo de identidad: el color propio de la máquina */}
                  <path
                    d={sector(0, SLOTS_POR_DIA, rOut - (activa ? 3.5 : 2), rOut)}
                    className={color.filo}
                    fillOpacity={activa ? 1 : 0.75}
                  />
                  {agruparTramos(d.areas).map((g) => {
                    const oc = (['P', 'H', 'C', 'X'] as string[]).includes(g.valor)
                      ? (g.valor as Ocupante)
                      : '0'
                    return (
                      <path
                        key={`${maquina.id}-${g.inicio}`}
                        d={sector(g.inicio, g.largo, rIn, rOut)}
                        className={FILL_OCUPANTE[oc]}
                        fillOpacity={activa ? Math.min(OPACIDAD[oc] + 0.18, 1) : OPACIDAD[oc]}
                        shapeRendering="crispEdges"
                      />
                    )
                  })}
                  {/* La intervención de Mantención, como filo interior del anillo */}
                  {agruparTramos(d.mant)
                    .filter((g) => g.valor === '1')
                    .map((g) => (
                      <path
                        key={`m-${maquina.id}-${g.inicio}`}
                        d={sector(g.inicio, g.largo, rIn, rIn + 3)}
                        className="fill-cat-4-tint"
                        shapeRendering="crispEdges"
                      />
                    ))}
                </g>
              )
            })}

            {/* Marcas de hora y cortes de turno */}
            {Array.from({ length: 24 }, (_, h) => {
              const grados = h * 15
              const esTurno = TURNOS.some((t) => (t.inicio * 5) / 60 === h)
              const [x1, y1] = punto(R_EXT + 7, grados)
              const [x2, y2] = punto(R_EXT + (esTurno ? 16 : 11), grados)
              const [lx, ly] = punto(R_EXT + 27, grados)
              return (
                <g key={h}>
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    className="stroke-muted-foreground"
                    strokeWidth={esTurno ? 1.6 : 0.7}
                    strokeOpacity={esTurno ? 0.95 : 0.4}
                  />
                  {(esTurno || h % 3 === 0) && (
                    <text
                      x={lx} y={ly}
                      textAnchor="middle" dominantBaseline="central"
                      className={cn('font-mono tabular-nums', esTurno ? 'fill-foreground' : 'fill-muted-foreground')}
                      fontSize={esTurno ? 12 : 10}
                      fontWeight={esTurno ? 600 : 400}
                    >
                      {String(h).padStart(2, '0')}
                    </text>
                  )}
                </g>
              )
            })}

            <text
              x={CX} y={CY - 12} textAnchor="middle" dominantBaseline="central"
              className="fill-foreground font-mono tabular-nums" fontSize={26} fontWeight={700}
            >
              {slotsAHorasDecimal(totalPleno)}
            </text>
            <text
              x={CX} y={CY + 10} textAnchor="middle" dominantBaseline="central"
              className="fill-muted-foreground" fontSize={9}
            >
              h con todo libre
            </text>
          </svg>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {errorExport && (
            <p role="status" className="rounded-ctl bg-destructive/10 px-3 py-2 text-footnote text-destructive">
              {errorExport}
            </p>
          )}
          {todasSinDatos ? (
            <p className="rounded-ctl bg-cat-4-tint/15 px-3 py-2 text-body text-cat-4-ink">
              Ninguna máquina tiene su horario cargado todavía. Las {slotsAHorasMinutos(totalPleno)} que
              se ven libres son ausencia de datos, no tiempo disponible: pinta o confirma los horarios primero.
            </p>
          ) : (
            <>
              {sinDatos.length > 0 && (
                <p className="text-footnote text-cat-4-ink">
                  {sinDatos.length === 1
                    ? `${sinDatos[0]!.nombre} no tiene horario cargado y cuenta como libre.`
                    : `${sinDatos.length} máquinas sin horario cargado cuentan como libres.`}
                </p>
              )}
              <p className="text-body text-foreground">
                {totalPleno > 0 && mejor ? (
                  <>
                    La planta entera queda libre{' '}
                    <span className="font-mono font-semibold tabular-nums">
                      {slotsAHorasMinutos(totalPleno)}
                    </span>
                    . La mejor ventana empieza a las{' '}
                    <span className="font-mono font-semibold tabular-nums">{slotAHora(mejor.inicio)}</span>.
                  </>
                ) : (
                  <>No hay ningún tramo con todas las máquinas libres a la vez este día.</>
                )}
              </p>
            </>
          )}

          <ul className="flex flex-col gap-1.5">
            {anillos.map(({ maquina, indice }) => {
              const d = maquina.semana[diaIdx]
              const r = d ? contarDia(d) : null
              const activa = maquina.id === maquinaActivaId || maquina.id === encima
              return (
                <li key={maquina.id}>
                  <button
                    onPointerEnter={() => setEncima(maquina.id)}
                    onPointerLeave={() => setEncima((v) => (v === maquina.id ? null : v))}
                    onClick={() => onSeleccionar?.(maquina.id)}
                    className={cn(
                      'flex w-full min-h-[44px] items-center gap-2 rounded-ctl px-2 text-left',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      activa ? 'bg-muted/60' : 'hover:bg-muted/40',
                    )}
                  >
                    <span
                      className={cn('h-3 w-3 shrink-0 rounded-full', colorDeMaquina(indice).punto)}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-footnote text-foreground">
                      {maquina.nombre}
                      {maquina.revisadoEnTerreno !== true && (
                        <span className="ml-1 text-cat-4-ink" title="horario sin confirmar">*</span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-caption tabular-nums text-muted-foreground">
                      {r ? slotsAHorasDecimal(r.libres) : '0'} h libres
                    </span>
                    {r && r.condicion.agua > 0 && <Pill tone="critical">agua</Pill>}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </ListGroup>
  )
}
