/**
 * Cuánto del turno cubre el Excel del Grader.
 *
 * El Excel de Matrix se carga por tandas: un turno puede tener cargado solo un
 * tramo. Hasta ahora eso no se decía en ninguna parte — había que comparar a
 * ojo el horario del turno (21:30–05:45) contra el rango del Excel
 * (01:34–05:11) para darse cuenta de que faltaban 4 horas.
 *
 * La distinción que importa, y que la app no hacía:
 *
 *   SIN DATOS      → ningún Excel cubre ese tramo. Puede haber producción
 *                    sin registrar: falta cargar el archivo.
 *   SIN PRODUCCIÓN → el Excel SÍ cubre el tramo y no pasaron piezas. La línea
 *                    estuvo parada; el dato está completo.
 *
 * Confundirlas lleva a conclusiones opuestas: en un caso falta trabajo de
 * carga, en el otro hay un paro que investigar.
 */

import { useMemo } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtTime, fmtDurationMin, parseWallClockMs } from '@/services/grader/graderTimeFormat'
import type { TimelineBucket } from '@/services/grader/types'

type Tramo = 'produccion' | 'sin-produccion' | 'sin-datos'

const ESTILO: Record<Tramo, { clase: string; label: string }> = {
  'produccion':     { clase: 'bg-emerald-500/70',  label: 'Con piezas' },
  'sin-produccion': { clase: 'bg-slate-500/45',    label: 'Sin piezas (línea parada)' },
  'sin-datos':      { clase: 'bg-amber-500/25 [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(251,191,36,0.35)_3px,rgba(251,191,36,0.35)_6px)]', label: 'Sin datos del Grader' },
}

export interface GraderCoverageBarProps {
  /** Inicio del turno (wall-clock-as-UTC). */
  shiftStartAt?: string | null
  /** Fin del turno (wall-clock-as-UTC). */
  shiftEndAt?: string | null
  /** Buckets por minuto del Excel cargado. Cada uno = 1 minuto con registros. */
  buckets: TimelineBucket[]
}

export function GraderCoverageBar({ shiftStartAt, shiftEndAt, buckets }: GraderCoverageBarProps) {
  const data = useMemo(() => {
    if (!shiftStartAt || !shiftEndAt) return null
    const inicio = parseWallClockMs(shiftStartAt)
    const fin = parseWallClockMs(shiftEndAt)
    if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) return null

    const totalMin = Math.round((fin - inicio) / 60_000)
    if (totalMin <= 0) return null

    // Minutos (offset desde el inicio del turno) que trae el Excel.
    const conDatos = new Set<number>()
    let primero = Infinity
    let ultimo = -Infinity
    for (const b of buckets) {
      // parseWallClockMs y no Date.parse: los tsMin vienen sin 'Z'
      // ("2026-08-01T01:34") y se leerían como hora local, corriendo todo 4 h.
      const t = parseWallClockMs(b.tsMin)
      if (!Number.isFinite(t)) continue
      const off = Math.floor((t - inicio) / 60_000)
      if (off < 0 || off >= totalMin) continue   // fuera del turno: no se dibuja
      conDatos.add(off)
      if (off < primero) primero = off
      if (off > ultimo) ultimo = off
    }
    if (conDatos.size === 0) return { totalMin, tramos: [], sinDatosMin: totalMin, conPiezasMin: 0, rango: null }

    // Todo lo que cae ENTRE el primer y el último registro está cubierto por
    // el Excel: que un minuto no traiga piezas ahí significa línea parada, no
    // dato faltante.
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

    return {
      totalMin,
      tramos,
      sinDatosMin: tramos.filter(t => t.tipo === 'sin-datos').reduce((s, t) => s + t.largo, 0),
      conPiezasMin: conDatos.size,
      rango: { desdeMs: inicio + primero * 60_000, hastaMs: inicio + (ultimo + 1) * 60_000 },
    }
  }, [shiftStartAt, shiftEndAt, buckets])

  if (!data) return null

  const { totalMin, tramos, sinDatosMin, conPiezasMin, rango } = data
  const cubiertoPct = totalMin > 0 ? ((totalMin - sinDatosMin) / totalMin) * 100 : 0

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
          <b className="text-foreground">{cubiertoPct.toFixed(0)}%</b> del turno
        </span>
      </div>

      <div className="flex h-2.5 rounded-sm overflow-hidden bg-muted" role="img"
        aria-label={`El Excel cubre el ${cubiertoPct.toFixed(0)}% del turno`}>
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
        <span className="ml-auto tabular-nums">
          {fmtDurationMin(conPiezasMin)} con piezas
        </span>
      </div>

      {sinDatosMin > 0 && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400/90">
          Faltan <b>{fmtDurationMin(sinDatosMin)}</b> del turno sin Excel cargado. Si hubo
          producción en ese tramo, todavía no está contada.
        </p>
      )}
    </div>
  )
}
