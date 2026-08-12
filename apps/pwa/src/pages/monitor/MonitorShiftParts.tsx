/**
 * Bloques del monitor público que responden "¿vamos a alcanzar, y contra qué".
 *
 * Viven fuera de `PublicShiftMonitorPage` porque esa página ya es larga y estos
 * dos son autocontenidos. Traen sus propios formateadores a propósito: el
 * bundle público no debe arrastrar los helpers del Grader, que se llevan echarts.
 */

import { useState } from 'react'
import type { PublicMonitorLive } from '@/services/shoplogix/publicShiftMonitor.service'
import type { DayComparison } from '@/services/shoplogix/monitorCompare'

const nf = new Intl.NumberFormat('es-CL')
const fmtInt = (n: number) => nf.format(Math.round(n || 0))

function fmtDurMin(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '—'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m} min`
  return m > 0 ? `${h} h ${m} min` : `${h} h`
}

/**
 * A dónde se fue el tiempo del turno.
 *
 * La separación planificado / recuperable es el hallazgo que motivó esto: en el
 * turno del 12-08 de Filete los 86 min de detenciones grandes parecían el
 * problema, y 78 eran colación, reunión de inicio, ejercicio compensatorio y
 * detención programada. Sin distinguirlos se le pide a la línea que recupere un
 * tiempo que por convenio no se recupera.
 *
 * ⚠ Las causas van CON SU DETALLE en los dos grupos, a pedido de Orel: un
 * "planificado 78 min" a secas invita a sospechar que se esconde algo. Si la
 * colación se llevó 57 minutos, que se lea "COLACION 57 min · 4×".
 */
export function TiempoDelTurno({ tb }: { tb: PublicMonitorLive['timeBreakdown'] }) {
  const [abierto, setAbierto] = useState(false)
  if (!tb || tb.windowMin <= 0) return null

  const pct = (m: number) => Math.max(0, (m / tb.windowMin) * 100)
  // Lo que no cae en ninguna categoría (huecos de sincronización). Se dibuja
  // gris y sin etiqueta: no es producción ni una parada que alguien deba
  // explicar, pero tampoco se puede hacer desaparecer de la barra.
  const otros = Math.max(0, tb.windowMin - tb.producingMin - tb.plannedMin - tb.recoverableMin)

  return (
    <section className="rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>A dónde se va el tiempo</span>
        <span className="tabular-nums normal-case">{fmtDurMin(tb.windowMin)} de turno</span>
      </div>

      <div className="mt-2 flex h-6 overflow-hidden rounded-lg text-[10px] font-semibold text-white">
        <span
          className="flex items-center justify-center bg-emerald-600 dark:bg-emerald-500"
          style={{ width: `${pct(tb.producingMin)}%` }}
          title={`Produciendo ${tb.producingMin} min`}
        >
          {pct(tb.producingMin) > 14 && `${Math.round(pct(tb.producingMin))}%`}
        </span>
        <span
          className="flex items-center justify-center bg-slate-500"
          style={{ width: `${pct(tb.plannedMin)}%` }}
          title={`Planificado ${tb.plannedMin} min`}
        >
          {pct(tb.plannedMin) > 14 && `${Math.round(pct(tb.plannedMin))}%`}
        </span>
        <span
          className="flex items-center justify-center bg-red-600 dark:bg-red-500"
          style={{ width: `${pct(tb.recoverableMin)}%` }}
          title={`Recuperable ${tb.recoverableMin} min`}
        >
          {pct(tb.recoverableMin) > 14 && `${Math.round(pct(tb.recoverableMin))}%`}
        </span>
        {otros > 0 && <span className="bg-muted-foreground/30" style={{ width: `${pct(otros)}%` }} />}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-emerald-600 dark:bg-emerald-500" />
          Produciendo <span className="tabular-nums text-foreground/80">{tb.producingMin} min</span>
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-slate-500" />
          Planificado <span className="tabular-nums text-foreground/80">{tb.plannedMin} min</span>
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-red-600 dark:bg-red-500" />
          Recuperable <span className="tabular-nums text-foreground/80">{tb.recoverableMin} min</span>
        </span>
      </div>

      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="mt-2 text-[11px] text-sky-700 underline underline-offset-2 dark:text-sky-300"
      >
        {abierto ? 'ocultar el detalle' : 'ver de qué son'}
      </button>

      {abierto && (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Planificado · no se recupera
            </p>
            <ul className="mt-1 space-y-0.5 text-[11px]">
              {tb.planned.length === 0 && (
                <li className="text-muted-foreground/60">sin paradas de convenio</li>
              )}
              {tb.planned.map((x) => (
                <li key={x.reason} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">{x.reason}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {x.min} min · {x.count}×
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Recuperable</p>
            <ul className="mt-1 space-y-0.5 text-[11px]">
              {tb.recoverable.length === 0 && (
                <li className="text-muted-foreground/60">nada por recuperar</li>
              )}
              {tb.recoverable.map((x) => (
                <li key={x.reason} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">{x.reason}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {x.min} min · {x.count}×
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

/** Colores de las líneas del comparador. Hoy siempre el primero. */
const COLORES = ['#38bdf8', '#a78bfa', '#94a3b8', '#f472b6']

/**
 * Comparador de días, a la MISMA hora.
 *
 * "Hoy llevamos 3.028 y ayer hizo 3.275" es exactamente la comparación que esto
 * viene a impedir: ayer eran las 15:30 y hoy son las 13:00. Cada día se lee al
 * corte de la última hora COMPLETA del turno en curso.
 */
export function ComparadorDias({ days, currentHour, optimalAtHour }: {
  days: DayComparison[]
  currentHour: number | null
  /** Piezas que la cuota pediría a esa hora. null si no hay meta. */
  optimalAtHour?: number | null
}) {
  if (days.length < 2 || currentHour == null) return null

  const hoy = days.find((d) => d.esHoy)
  const ref = hoy?.atCurrentHour ?? null
  const maxPieces = Math.max(
    ...days.map((d) => d.atCurrentHour ?? 0),
    optimalAtHour ?? 0,
    1,
  )

  return (
    <section className="rounded-2xl border border-border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Comparado con otros días · al cierre de las {String(currentHour).padStart(2, '0')}:00
      </div>

      <ul className="mt-2 space-y-1.5">
        {days.map((d, i) => {
          const dif = !d.esHoy && ref != null && d.atCurrentHour != null ? ref - d.atCurrentHour : null
          return (
            <li key={d.dateKey} className="flex items-center gap-2 text-[12px]">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: COLORES[i % COLORES.length] }}
              />
              <span className={`w-16 shrink-0 truncate ${d.esHoy ? 'font-semibold' : 'text-muted-foreground'}`}>
                {d.label}
              </span>
              <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${((d.atCurrentHour ?? 0) / maxPieces) * 100}%`,
                    background: COLORES[i % COLORES.length],
                  }}
                />
              </span>
              <span className="w-14 shrink-0 text-right tabular-nums">
                {d.atCurrentHour != null ? fmtInt(d.atCurrentHour) : '—'}
              </span>
              {/* La diferencia contra hoy. Sin esto hay que restar de cabeza. */}
              <span
                className={`w-12 shrink-0 text-right tabular-nums text-[11px] ${
                  dif == null
                    ? 'text-transparent'
                    : dif >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-700 dark:text-red-400'
                }`}
              >
                {dif == null ? '—' : `${dif >= 0 ? '+' : ''}${fmtInt(dif)}`}
              </span>
            </li>
          )
        })}

        {/* La cuota como una fila más: se ve de un vistazo cuánto separa a la
            realidad del objetivo, a esta misma hora. */}
        {optimalAtHour != null && optimalAtHour > 0 && (
          <li className="flex items-center gap-2 border-t border-border pt-1.5 text-[12px]">
            <span className="h-2 w-2 shrink-0 rounded-full border border-dashed border-amber-500" />
            <span className="w-16 shrink-0 truncate text-amber-700 dark:text-amber-300">Cuota</span>
            <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-amber-500/60"
                style={{ width: `${(optimalAtHour / maxPieces) * 100}%` }}
              />
            </span>
            <span className="w-14 shrink-0 text-right tabular-nums text-amber-700 dark:text-amber-300">
              {fmtInt(optimalAtHour)}
            </span>
            <span
              className={`w-12 shrink-0 text-right tabular-nums text-[11px] ${
                ref != null && ref - optimalAtHour >= 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-red-700 dark:text-red-400'
              }`}
            >
              {ref != null ? `${ref - optimalAtHour >= 0 ? '+' : ''}${fmtInt(ref - optimalAtHour)}` : '—'}
            </span>
          </li>
        )}
      </ul>

      <p className="mt-2 text-[11px] text-muted-foreground/70">
        Todos al mismo corte horario: comparar contra el TOTAL de un turno que ya cerró
        haría ver una diferencia que es solo de reloj. Al cierre esos días hicieron{' '}
        {days.filter((d) => !d.esHoy).map((d, i) => (
          <span key={d.dateKey}>
            {i > 0 && ' · '}
            <span className="tabular-nums text-foreground/70">{fmtInt(d.totalPieces)}</span>
          </span>
        ))}
        .
      </p>
    </section>
  )
}
