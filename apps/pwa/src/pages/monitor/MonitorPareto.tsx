/**
 * "Qué se repite": el Pareto de las paradas recuperables de los últimos turnos.
 *
 * Es el bloque que faltaba para pasar de "hoy pasó esto" a "esto vuelve todos
 * los turnos, ataquémoslo". Se alimenta del historial que YA viaja en el doc
 * del monitor: cero lecturas extra.
 *
 * Cada fila lleva las dos medidas juntas —minutos y en cuántos turnos
 * aparece— porque ninguna de las dos sola alcanza: en Filete `ACUMULACION` es
 * cuarta por minutos y ocurrió una sola vez. El porqué está en
 * `monitorPareto.ts`.
 */
import { useState } from 'react'
import { DUENO_UI } from './duenoUi'
import { Bloque } from './MonitorShiftParts'
import type { ParetoResult } from '@/services/shoplogix/monitorPareto'

const nf = new Intl.NumberFormat('es-CL')
const fmtInt = (n: number) => nf.format(Math.round(n || 0))

/** "2 h 6 min" a partir de minutos, para totales que pasan la hora. */
function fmtMin(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r > 0 ? `${h} h ${r} min` : `${h} h`
}

export function ParetoDeParadas({ pareto }: { pareto: ParetoResult | null }) {
  const [abierta, setAbierta] = useState<string | null>(null)
  // Con uno o dos turnos no hay patrón que mostrar, solo el turno de hoy otra
  // vez. Tres es el mínimo para que "en 2 de 3" signifique algo.
  if (!pareto || pareto.shifts < 3 || pareto.rows.length === 0) return null

  const max = pareto.rows[0]!.minutes
  const vitales = pareto.rows.slice(0, Math.max(1, pareto.vitalCount))
  const resto = pareto.rows.slice(vitales.length)
  const cronicas = vitales.filter((r) => r.shifts >= Math.ceil(pareto.shifts / 2))

  return (
    <Bloque
      id="pareto"
      titulo="Qué se repite"
      extra={<span className="tabular-nums">{pareto.shifts} turnos · {fmtMin(pareto.totalMin)}</span>}
      defaultAbierto={false}
    >
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        Tiempo <b>recuperable</b> de los últimos <span className="tabular-nums">{pareto.shifts}</span>{' '}
        turnos de esta línea, por causa. Las paradas de convenio no entran: no son pérdidas que
        alguien pueda atacar.
      </p>

      <ul className="mt-3 space-y-2.5">
        {vitales.map((r) => (
          <FilaPareto
            key={r.label} r={r} max={max} turnos={pareto.shifts}
            abierta={abierta === r.label}
            onToggle={() => setAbierta((v) => (v === r.label ? null : r.label))}
          />
        ))}
      </ul>

      {/* El corte, dicho en palabras: es la frase que alguien puede repetir en
          una reunión sin tener que leer el gráfico. */}
      {/* La frase de gestión que las filas no dicen: quién carga con lo que
          se repite. El 15-08 el 49% no tenía dueño — no se puede atacar lo
          que nadie anota, y ESO es el hallazgo. */}
      {(pareto.porDueno.mantencion > 0 || pareto.porDueno.externo > 0 || pareto.porDueno['sin-imputar'] > 0) && (
        <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
          De lo que se repite:{' '}
          <b className="tabular-nums text-muted-foreground">{fmtMin(pareto.porDueno['sin-imputar'])} sin imputar
            {pareto.totalMin > 0 && ` (${Math.round((pareto.porDueno['sin-imputar'] / pareto.totalMin) * 100)}%)`}</b>
          {' · '}
          <b className={`tabular-nums ${DUENO_UI.externo.clase}`}>{fmtMin(pareto.porDueno.externo)} externos</b>
          {' · '}
          <b className={`tabular-nums ${DUENO_UI.mantencion.clase}`}>{fmtMin(pareto.porDueno.mantencion)} de equipos</b>.
          {pareto.porDueno['sin-imputar'] >= pareto.porDueno.mantencion &&
            pareto.porDueno['sin-imputar'] >= pareto.porDueno.externo && (
            <> Lo más grande no tiene dueño — no se puede atacar lo que nadie anota.</>
          )}
        </p>
      )}

      <p className="mt-3 rounded-lg bg-muted px-2.5 py-2 text-[12px] font-medium text-emerald-800 dark:text-emerald-300">
        {vitales.length === 1
          ? `Una sola causa explica el ${Math.round(pareto.vitalPct)}% del tiempo parado.`
          : `${vitales.length} causas explican el ${Math.round(pareto.vitalPct)}% del tiempo parado.`}
        {cronicas.length > 0 && cronicas.length < vitales.length && (
          <>
            {' '}
            <span className="font-normal text-foreground/70">
              De esas, {cronicas.length === 1 ? 'solo una vuelve' : `${cronicas.length} vuelven`} turno
              tras turno; el resto fueron episodios sueltos.
            </span>
          </>
        )}
      </p>

      {resto.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-sky-700 underline underline-offset-2 dark:text-sky-300">
            ver las otras {resto.length}
          </summary>
          <ul className="mt-2 space-y-2.5">
            {resto.map((r) => (
              <FilaPareto
                key={r.label} r={r} max={max} turnos={pareto.shifts}
                abierta={abierta === r.label}
                onToggle={() => setAbierta((v) => (v === r.label ? null : r.label))}
              />
            ))}
          </ul>
        </details>
      )}
    </Bloque>
  )
}

function FilaPareto({ r, max, turnos, abierta, onToggle }: {
  r: ParetoResult['rows'][number]
  max: number
  turnos: number
  abierta: boolean
  onToggle: () => void
}) {
  const agrupa = r.parts.length > 1
  /*
   * Una causa que aparece en menos de la mitad de los turnos se dibuja en gris:
   * pesa en minutos pero no es un patrón, y la diferencia tiene que verse sin
   * leer la cifra.
   */
  const cronica = r.shifts >= Math.ceil(turnos / 2)

  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
        <span className="min-w-0 truncate">
          {r.label}
          {agrupa && (
            <button
              type="button"
              onClick={onToggle}
              className="ml-1.5 text-[11px] text-sky-700 underline underline-offset-2 dark:text-sky-300"
            >
              {r.parts.length} causas
            </button>
          )}
        </span>
        <span className="shrink-0 tabular-nums font-semibold">
          {fmtMin(r.minutes)}
          <span className="ml-1 font-normal text-muted-foreground">{Math.round(r.sharePct)}%</span>
        </span>
      </div>

      <div className="mt-1 h-2 overflow-hidden rounded bg-muted">
        <div
          className={`h-full rounded ${cronica ? 'bg-sky-500 dark:bg-sky-400' : 'bg-muted-foreground/50'}`}
          style={{ width: `${(r.minutes / max) * 100}%` }}
        />
      </div>

      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10.5px] text-muted-foreground">
        {/* El dueño según el árbol oficial: cierra el círculo con «Qué pasó en
            el turno» — lo que se repite también dice de quién es. */}
        <span className={`font-semibold ${DUENO_UI[r.dueno].clase}`}>
          {DUENO_UI[r.dueno].corto}
        </span>
        <span className="tabular-nums">
          en <b className={cronica ? 'text-foreground/80' : ''}>{r.shifts} de {turnos}</b> turnos
        </span>
        {r.count > 0 && (
          <span className="tabular-nums">
            {fmtInt(r.count)} {r.count === 1 ? 'parada' : 'paradas'}
          </span>
        )}
        <span className="tabular-nums">acumulado {Math.round(r.cumPct)}%</span>
      </div>

      {abierta && agrupa && (
        <ul className="mt-1 space-y-0.5 border-l border-border pl-2.5 text-[11px] text-muted-foreground">
          {r.parts.map((p) => (
            <li key={p.reason} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{p.reason}</span>
              <span className="shrink-0 tabular-nums">{fmtMin(p.min)} · {p.count}×</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
