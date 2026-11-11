/**
 * «Efecto de las acciones»: cobertura de las causas prioritarias, la referencia de cuánto cae
 * una causa sin hacer nada, y el antes y después por causa. Según la opción A aprobada
 * (acr-indicador.html) y la adenda de estilo: una sola superficie, sin píldoras.
 * Lee los turnos de Jack-Knife (caché) y los ACR (caché de 15 min).
 */
import { useEffect, useMemo, useState } from 'react'
import { BITACORA_PLANTA } from '@/config/bitacora'
import { listarAcrsConCache } from '@/services/acr/acrFirestore'
import type { Acr } from '@/services/acr/acr.types'
import {
  cortesPorCausa,
  coberturaPrioritarias,
  efectoPorCausa,
  referenciaCaidaSola,
  resumenEfecto,
  VENTANA_EFECTO,
  type FilaEfecto,
  type ReferenciaCaida,
} from '@/services/acr/efectoAcciones'
import {
  calcularJackKnife,
  cargarTurnosCrudos,
  prepararTurnos,
  ventanaJK,
  type TurnoCrudo,
  type TurnoJK,
} from '@/services/shoplogix/jackKnife'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { dec } from '@/utils/formatoNumeros'

interface DatosEfecto {
  crudos: TurnoCrudo[]
  acrs: Acr[]
}

/** Porcentaje con signo menos tipográfico: −56 %, 0 %, +12 %. */
function porcentaje(f: number): string {
  const n = Math.round(Math.abs(f) * 100)
  if (n === 0) return '0 %'
  return `${f < 0 ? '−' : '+'}${n} %`
}

/** «Cae −56 %» o «Sube +12 %», según el signo de la mediana. */
function textoCambio(mediana: number): string {
  const n = Math.round(Math.abs(mediana) * 100)
  return mediana < 0 ? `Cae −${n} %` : `Sube +${n} %`
}

/** Días que cubren 30 turnos, con el ritmo de los últimos 60: el historial tiene meses casi sin turnos. */
function diasPorTreintaTurnos(turnos: readonly TurnoJK[]): number | null {
  const recientes = turnos.slice(-2 * VENTANA_EFECTO)
  if (recientes.length < 2) return null
  const fechas = recientes.map((t) => Date.parse(t.dateKey)).filter((x) => !Number.isNaN(x))
  if (fechas.length < 2) return null
  const dias = (Math.max(...fechas) - Math.min(...fechas)) / 86_400_000 + 1
  return Math.round((VENTANA_EFECTO * dias) / recientes.length)
}

/** Tira −100 % a 0 %: banda p25-p75 y punto en la mediana. */
function TiraCaida({ referencia }: { referencia: ReferenciaCaida }) {
  const W = 320
  const Y = 34
  const x = (f: number) => 16 + (Math.min(0, Math.max(-1, f)) + 1) * (W - 32)
  const { mediana, p25, p75 } = referencia
  return (
    <svg
      viewBox={`0 0 ${W} 74`}
      className="block h-auto w-full"
      role="img"
      aria-label={`Rango de cambio sin acción: mitad central de ${porcentaje(p25)} a ${porcentaje(p75)}, mediana ${porcentaje(mediana)}`}
    >
      <line x1={x(-1)} y1={Y} x2={x(0)} y2={Y} strokeWidth={2} className="stroke-border" />
      <line x1={x(p25)} y1={Y} x2={x(p75)} y2={Y} strokeWidth={8} strokeLinecap="round" className="stroke-muted-foreground opacity-45" />
      <circle cx={x(mediana)} cy={Y} r={8} className="fill-muted-foreground" />
      <text x={x(mediana)} y={Y - 16} textAnchor="middle" className="fill-foreground text-footnote font-semibold">
        {porcentaje(mediana)}
      </text>
      {[-1, -0.5, 0].map((f) => (
        <text
          key={f}
          x={x(f)}
          y={Y + 28}
          textAnchor={f === -1 ? 'start' : f === 0 ? 'end' : 'middle'}
          className="fill-muted-foreground text-footnote tabular-nums"
        >
          {porcentaje(f)}
        </text>
      ))}
    </svg>
  )
}

function Veredicto({
  medidas,
  minimas,
  medianaCambio,
  veredicto,
  referencia,
  diasPor30,
}: {
  medidas: number
  minimas: number
  medianaCambio: number | null
  veredicto: 'falta' | 'caeMas' | 'igual'
  referencia: ReferenciaCaida | null
  diasPor30: number | null
}) {
  if (veredicto === 'falta') {
    return (
      <>
        <p className="text-body text-foreground">{`Falta: ${medidas} de ${minimas} causas medidas`}</p>
        <p className="text-footnote text-muted-foreground">
          {diasPor30 === null
            ? `Se muestra desde ${minimas} causas con 30 turnos.`
            : `Se muestra desde ${minimas} causas con 30 turnos, unos ${diasPor30} días.`}
        </p>
      </>
    )
  }
  if (!referencia || medianaCambio === null) {
    return <p className="text-footnote text-muted-foreground">Falta la referencia: aún no hay casos sin análisis.</p>
  }
  return (
    <p className="text-body text-foreground">
      {`${textoCambio(medianaCambio)}, ${veredicto === 'caeMas' ? 'más que lo que baja solo' : 'dentro de lo que baja solo'}`}
    </p>
  )
}

/** Estado de una fila, en palabra secundaria (sin píldora). */
function estadoFila(f: FilaEfecto): string {
  if (f.estado === 'midiendo') return `Midiendo ${f.turnosDespues} de ${VENTANA_EFECTO}`
  if (f.estado === 'pocasAntes') return 'Pocas detenciones antes'
  const c = f.cambio ?? 0
  if (c > 0) return 'Subió'
  return c < 0 ? 'Bajó' : 'Igual'
}

export function EfectoAccionesCard({ className }: { className?: string }) {
  const [datos, setDatos] = useState<DatosEfecto | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vivo = true
    Promise.all([cargarTurnosCrudos(BITACORA_PLANTA.id), listarAcrsConCache()])
      .then(([crudos, acrs]) => {
        if (vivo) setDatos({ crudos, acrs })
      })
      .catch((e: unknown) => {
        logger.error('No se pudo leer el efecto de las acciones', e instanceof Error ? e : undefined)
        if (vivo) setError(true)
      })
    return () => {
      vivo = false
    }
  }, [])

  const calculo = useMemo(() => {
    if (!datos) return null
    const { turnos } = prepararTurnos(datos.crudos)
    const cortes = cortesPorCausa(datos.acrs)
    const { desde, hasta } = ventanaJK(turnos, '90')
    const jk = calcularJackKnife(turnos, desde, hasta, 'imp')
    const referencia = referenciaCaidaSola(turnos, cortes)
    const filas = efectoPorCausa(turnos, cortes)
    return {
      cobertura: coberturaPrioritarias(jk, datos.acrs),
      referencia,
      filas,
      resumen: resumenEfecto(filas, referencia),
      diasPor30: diasPorTreintaTurnos(turnos),
    }
  }, [datos])

  // Una sola superficie. `className` va en ella (p. ej. `order-last`).
  const superficie = cn('flex flex-col gap-5 rounded-card bg-card p-4 lg:grid lg:grid-cols-3 lg:gap-6', className)

  if (error) {
    return (
      <section className={superficie}>
        <h2 className="text-headline font-semibold lg:col-span-3">Efecto de las acciones</h2>
        <p className="text-footnote text-muted-foreground lg:col-span-3">No se pudo leer el efecto de las acciones.</p>
      </section>
    )
  }

  if (!calculo) {
    return (
      <section className={superficie}>
        <h2 className="text-headline font-semibold lg:col-span-3">Efecto de las acciones</h2>
        <p className="text-footnote text-muted-foreground lg:col-span-3">Cargando…</p>
      </section>
    )
  }

  const { cobertura, referencia, filas, resumen, diasPor30 } = calculo

  return (
    <section className={superficie}>
      <h2 className="text-headline font-semibold lg:col-span-3">Efecto de las acciones</h2>

      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-title2 font-semibold tabular-nums text-foreground">{`${cobertura.cubiertas} de ${cobertura.total}`}</p>
        <p className="text-footnote text-muted-foreground">Causas prioritarias con acción fuerte hecha, niveles 1 y 2 del Jack-Knife, Chonchi, 90 días</p>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-footnote text-muted-foreground">Detenciones 30 turnos después, frente a los 30 de antes</p>
        <p className="text-body text-foreground">Sin hacer nada, una causa cae esto</p>
        {referencia ? (
          <>
            <TiraCaida referencia={referencia} />
            <p className="text-footnote text-muted-foreground">
              {`Mediana y mitad central de ${referencia.casos} casos sin análisis`}
            </p>
          </>
        ) : (
          <p className="text-footnote text-muted-foreground">Aún no hay casos sin análisis para comparar.</p>
        )}
        <p className="text-body text-foreground">Con acción fuerte</p>
        <Veredicto
          medidas={resumen.medidas}
          minimas={resumen.minimas}
          medianaCambio={resumen.medianaCambio}
          veredicto={resumen.veredicto}
          referencia={referencia}
          diasPor30={diasPor30}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-subhead font-semibold text-muted-foreground">Por causa</h3>
        {filas.length === 0 && <p className="text-body text-foreground">Aún no hay acciones fuertes hechas.</p>}
        {filas.map((f) => (
          <div key={f.causa} className="flex items-start justify-between gap-3 py-1.5">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-body text-foreground">{f.causa}</span>
              <span className="text-footnote tabular-nums text-muted-foreground">
                {`${f.antesEv} → ${f.despuesEv} detenciones, ${dec(f.antesMin, 0)} → ${dec(f.despuesMin, 0)} min`}
              </span>
            </span>
            <span className="shrink-0 text-footnote text-muted-foreground">{estadoFila(f)}</span>
          </div>
        ))}
        <p className="text-footnote text-muted-foreground">Por causa solo se muestra el antes y el después. El veredicto es del grupo.</p>
      </div>
    </section>
  )
}
