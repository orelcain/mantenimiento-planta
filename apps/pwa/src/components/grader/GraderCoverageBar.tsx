/**
 * Cuánto del turno cubre el Excel del Grader.
 *
 * ── Contra qué se compara ────────────────────────────────────────────────────
 *
 * Contra la producción REAL de las Baader (Shoplogix), no contra el horario
 * programado del turno. El pescado va Baader → Grader, así que entre ambas
 * fuentes solo hay minutos de tránsito: si las Baader arrancaron 01:19 y la
 * primera pieza llegó al Grader 01:34, el Excel está completo — el turno
 * simplemente empezó tarde.
 *
 * La primera versión comparaba contra el horario programado (21:30–05:45) y en
 * ese mismo turno decía "faltan 4 h 37 min sin Excel cargado": mandaba a buscar
 * un archivo que no existe y tapaba el dato real, que era un arranque casi 4 h
 * tarde. Verificado contra Shoplogix: entre 21:30 y 01:19 no produjo ninguna de
 * las tres Baader.
 *
 * ── Qué informa ─────────────────────────────────────────────────────────────
 *
 *   SIN DATOS      → las Baader produjeron y el Grader no tiene nada de ese
 *                    tramo. Falta cargar Excel.
 *   SIN PRODUCCIÓN → dentro del tramo cubierto, minutos sin piezas: la línea
 *                    estuvo parada. El dato está completo.
 *
 * Sin ventana de Shoplogix (turno sin sincronizar) se cae al horario del turno,
 * que es lo único disponible — y se dice en el texto para no afirmar de más.
 */

import { useMemo } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtTime, fmtDurationMin, parseWallClockMs } from '@/services/grader/graderTimeFormat'
import type { TimelineBucket } from '@/services/grader/types'

type Tramo = 'produccion' | 'sin-produccion' | 'sin-datos'

const ESTILO: Record<Tramo, { clase: string; label: string }> = {
  'produccion':     { clase: 'bg-emerald-500/70', label: 'Con piezas' },
  'sin-produccion': { clase: 'bg-slate-500/45',   label: 'Sin piezas (línea parada)' },
  'sin-datos':      { clase: 'bg-amber-500/25 [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(251,191,36,0.35)_3px,rgba(251,191,36,0.35)_6px)]', label: 'Sin datos del Grader' },
}

/**
 * Tolerancia de tránsito Baader → Grader. Una pieza tarda unos minutos en
 * llegar de la evisceradora al Marelec, así que arrancar o cerrar con unos
 * minutos de diferencia NO es dato faltante.
 */
const TRANSITO_MIN = 20

export interface GraderCoverageBarProps {
  /** Inicio del turno programado (wall-clock-as-UTC). Fallback. */
  shiftStartAt?: string | null
  /** Fin del turno programado (wall-clock-as-UTC). Fallback. */
  shiftEndAt?: string | null
  /**
   * Ventana en que las Baader realmente produjeron, según Shoplogix. Es la
   * referencia correcta: el Excel no puede cubrir lo que nunca se produjo.
   */
  produccionReal?: { start: Date; end: Date } | null
  /** Buckets por minuto del Excel cargado. Cada uno = 1 minuto con registros. */
  buckets: TimelineBucket[]
}

export function GraderCoverageBar({
  shiftStartAt, shiftEndAt, produccionReal, buckets,
}: GraderCoverageBarProps) {
  const data = useMemo(() => {
    // Referencia: la producción real si Shoplogix la conoce; si no, el turno.
    //
    // La ventana es la producción TAL CUAL: el tránsito Baader→Grader se aplica
    // después, como tolerancia al juzgar los huecos. Ensanchar la ventana por el
    // tránsito la volvía imposible de cubrir — el Excel nunca puede traer
    // piezas de minutos en que no se produjo, así que siempre "faltaba".
    const usandoProduccion = produccionReal != null
    const inicio = usandoProduccion
      ? produccionReal!.start.getTime()
      : parseWallClockMs(shiftStartAt)
    const fin = usandoProduccion
      ? produccionReal!.end.getTime()
      : parseWallClockMs(shiftEndAt)
    if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) return null

    const totalMin = Math.round((fin - inicio) / 60_000)
    if (totalMin <= 0) return null

    const conDatos = new Set<number>()
    let primero = Infinity
    let ultimo = -Infinity
    for (const b of buckets) {
      // parseWallClockMs y no Date.parse: los tsMin vienen sin 'Z'
      // ("2026-08-01T01:34") y se leerían como hora local, corriendo todo 4 h.
      const t = parseWallClockMs(b.tsMin)
      if (!Number.isFinite(t)) continue
      const off = Math.floor((t - inicio) / 60_000)
      if (off < 0 || off >= totalMin) continue
      conDatos.add(off)
      if (off < primero) primero = off
      if (off > ultimo) ultimo = off
    }
    if (conDatos.size === 0) {
      return { totalMin, tramos: [], sinDatosMin: totalMin, faltaExcelMin: totalMin, conPiezasMin: 0, rango: null, usandoProduccion }
    }

    // Entre el primer y el último registro el Excel cubre: un minuto sin piezas
    // ahí es línea parada, no dato faltante.
    const clasificar = (off: number): Tramo =>
      off < primero || off > ultimo ? 'sin-datos'
        : conDatos.has(off) ? 'produccion'
        : 'sin-produccion'

    const tramos: Array<{ tipo: Tramo; desde: number; largo: number }> = []
    for (let off = 0; off < totalMin; off++) {
      const tipo = clasificar(off)
      const ult = tramos[tramos.length - 1]
      if (ult && ult.tipo === tipo) ult.largo++
      else tramos.push({ tipo, desde: off, largo: 1 })
    }

    // Los huecos "sin datos" solo pueden estar en los extremos: adentro del
    // rango del Excel, un minuto sin piezas es línea parada.
    //
    // El de la cabeza es el tránsito de la primera pieza desde la Baader; el de
    // la cola, el vaciado de la línea. Se toleran; lo que exceda es Excel que
    // de verdad falta.
    const huecoInicio = primero
    const huecoFin = totalMin - 1 - ultimo
    const faltaExcelMin =
      Math.max(0, huecoInicio - TRANSITO_MIN) + Math.max(0, huecoFin - TRANSITO_MIN)

    return {
      totalMin,
      tramos,
      sinDatosMin: huecoInicio + huecoFin,
      faltaExcelMin,
      conPiezasMin: conDatos.size,
      rango: { desdeMs: inicio + primero * 60_000, hastaMs: inicio + (ultimo + 1) * 60_000 },
      usandoProduccion,
    }
  }, [shiftStartAt, shiftEndAt, produccionReal, buckets])

  if (!data) return null

  const { totalMin, tramos, sinDatosMin, faltaExcelMin, conPiezasMin, rango, usandoProduccion } = data
  const cubiertoPct = totalMin > 0 ? ((totalMin - sinDatosMin) / totalMin) * 100 : 0
  const faltaExcel = (faltaExcelMin ?? 0) > 0

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span className="font-medium">Cobertura del Excel</span>
        <span className="text-muted-foreground tabular-nums">
          {rango
            ? `${fmtTime(new Date(rango.desdeMs))}–${fmtTime(new Date(rango.hastaMs))}`
            : 'sin registros en el turno'}
        </span>
        <span className="ml-auto tabular-nums text-muted-foreground">
          <b className={cn(faltaExcel ? 'text-amber-500' : 'text-emerald-500')}>
            {cubiertoPct.toFixed(0)}%
          </b>{' '}
          {usandoProduccion ? 'de lo producido' : 'del turno programado'}
        </span>
      </div>

      <div className="flex h-2.5 rounded-sm overflow-hidden bg-muted" role="img"
        aria-label={`El Excel cubre el ${cubiertoPct.toFixed(0)}% de lo producido`}>
        {tramos.map((t) => (
          <div
            key={`${t.tipo}-${t.desde}`}
            className={cn(ESTILO[t.tipo].clase, 'h-full')}
            style={{ width: `${(t.largo / totalMin) * 100}%` }}
            title={`${ESTILO[t.tipo].label} · ${fmtDurationMin(t.largo)}`}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
        {(['produccion', 'sin-produccion', 'sin-datos'] as Tramo[]).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className={cn('w-2 h-2 rounded-[2px]', ESTILO[k].clase)} />
            {ESTILO[k].label}
          </span>
        ))}
        <span className="ml-auto tabular-nums">{fmtDurationMin(conPiezasMin)} con piezas</span>
      </div>

      {faltaExcel ? (
        <p className="text-[10px] text-amber-600 dark:text-amber-400/90">
          Las Baader produjeron <b>{fmtDurationMin(faltaExcelMin ?? sinDatosMin)}</b> que el Excel no cubre.
          Esas piezas todavía no están contadas.
        </p>
      ) : (
        <p
          className="text-[10px] text-emerald-600 dark:text-emerald-400/90 cursor-help"
          title={`El pescado va Baader → Grader, así que entre ambas fuentes solo hay minutos de tránsito (se toleran ${TRANSITO_MIN}). Que el Excel arranque después no es dato faltante: es cuando llegó la primera pieza.`}
        >
          El Excel cubre toda la producción del turno.
        </p>
      )}
    </div>
  )
}
