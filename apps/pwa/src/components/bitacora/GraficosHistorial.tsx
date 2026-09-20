import type { ReactNode } from 'react'
import { formatoMinutos } from '@/services/bitacora/turnoMantencion'
import { etiquetaCortaTurno } from '@/services/bitacora/entregaTurno'
import { porcentaje, porcentajeFino } from '@/services/bitacora/historialBitacora'
import type { BarraPareto, FallaRepetida, PuntoIntervenciones, PuntoParada } from '@/services/bitacora/preguntasHistorial'
import type { PerdidaDeLinea } from '@/services/bitacora/pesoDeLinea'

/**
 * Gráficos del Historial, uno por PREGUNTA (mockup aprobado 19-09-2026,
 * https://claude.ai/artifact/M3eDjf8oHto5U3wp7j3tTa). Cada panel: la pregunta en
 * gris, la RESPUESTA como título y la referencia dibujada (promedio, % acumulado,
 * mediana). SVG con los tokens de color de la app: se adapta a claro y oscuro.
 */

const C = {
  crit: 'rgb(var(--ink-crit))',
  ok: 'rgb(var(--ink-ok))',
  tinta: 'rgb(var(--foreground))',
  sec: 'rgb(var(--muted-foreground))',
  grilla: 'rgb(var(--muted-foreground) / 0.18)',
  ref: 'rgb(var(--foreground) / 0.6)',
}
const W = 340
const TXT = { fill: C.sec, fontSize: 11 } as const

export function PanelPregunta({ pregunta, respuesta, referencia, children }: { pregunta: string; respuesta: string; referencia: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={pregunta} className="flex min-w-0 flex-col gap-1.5 rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
      <p className="text-footnote text-muted-foreground">{pregunta}</p>
      <h2 className="text-headline text-balance">{respuesta}</h2>
      <div className="pt-1">{children}</div>
      <p className="text-caption text-muted-foreground">{referencia}</p>
    </section>
  )
}

/** Techo «redondo» del eje: 3,7 → 4; 0,62 → 0,7. */
function techo(v: number): number {
  if (v <= 0) return 1
  const e = 10 ** Math.floor(Math.log10(v))
  return Math.ceil(v / e) * e
}

/** Etiquetas del eje X: primera, del medio y última (más satura la franja). */
function indicesEje(n: number): number[] {
  if (n <= 3) return [...Array(n).keys()]
  return [0, Math.floor((n - 1) / 2), n - 1]
}

// ── 1 · Tendencia del % parado ──────────────────────────────────────────────
export function GraficoTendencia({ serie, promedio }: { serie: readonly PuntoParada[]; promedio: number }) {
  const H = 150, PL = 34, PR = 12, PT = 12, PB = 22
  const maxY = techo(Math.max(promedio, ...serie.map((p) => p.parte)) * 100) / 100
  const x = (i: number) => (serie.length === 1 ? (PL + W - PR) / 2 : PL + (i * (W - PL - PR)) / (serie.length - 1))
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / maxY)
  const ultimo = serie[serie.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Porcentaje del tiempo de producción parado por ${serie.length > 0 ? 'período' : ''}: ${serie.map((p) => `${p.etiqueta} ${porcentajeFino(p.parte)}`).join(', ')}`}>
      {[0, 0.5, 1].map((k) => (
        <g key={k}>
          <line x1={PL} x2={W - PR} y1={y(maxY * k)} y2={y(maxY * k)} stroke={C.grilla} />
          <text x={PL - 6} y={y(maxY * k) + 4} textAnchor="end" style={TXT}>
            {porcentajeFino(maxY * k)}
          </text>
        </g>
      ))}
      <line x1={PL} x2={W - PR} y1={y(promedio)} y2={y(promedio)} stroke={C.ref} strokeWidth={1.5} strokeDasharray="4 3" />
      {serie.length > 1 && (
        <polyline fill="none" stroke={C.crit} strokeWidth={2.5} strokeLinejoin="round" points={serie.map((p, i) => `${x(i)},${y(p.parte)}`).join(' ')} />
      )}
      {serie.map((p, i) => (
        // El día en curso, hueco: sus números todavía corren.
        <circle key={p.clave} cx={x(i)} cy={y(p.parte)} r={i === serie.length - 1 ? 4 : 2.5} fill={p.parcial ? 'none' : C.crit} stroke={C.crit} strokeWidth={p.parcial ? 1.5 : 0}>
          <title>{`${p.etiqueta}${p.parcial ? ' (en curso)' : ''}: ${porcentajeFino(p.parte)} · ${formatoMinutos(p.minutosParada)} de parada`}</title>
        </circle>
      ))}
      {ultimo && (
        <text x={x(serie.length - 1) - 6} y={Math.max(PT + 10, y(ultimo.parte) - 8)} textAnchor="end" style={{ ...TXT, fill: C.tinta, fontWeight: 600 }}>
          {ultimo.parcial ? 'hoy, en curso' : porcentajeFino(ultimo.parte)}
        </text>
      )}
      {indicesEje(serie.length).map((i) => (
        <text key={i} x={x(i)} y={H - 5} textAnchor={serie.length === 1 ? 'middle' : i === 0 ? 'start' : i === serie.length - 1 ? 'end' : 'middle'} style={TXT}>
          {serie[i]!.etiqueta}
        </text>
      ))}
    </svg>
  )
}

// ── 2 · Pareto de equipos ───────────────────────────────────────────────────
export function GraficoPareto({ barras }: { barras: readonly BarraPareto[] }) {
  const max = Math.max(1, ...barras.map((b) => b.minutos))
  return (
    <ul className="flex flex-col gap-2.5" aria-label="Parada por equipo, de mayor a menor, con porcentaje acumulado">
      {barras.map((b) => (
        <li key={b.nombre} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            {/* Completo, en dos líneas si hace falta: cortado se perdía el «N3». */}
            <span className={`min-w-0 break-words text-footnote ${b.prioridad ? 'font-semibold' : 'text-muted-foreground'}`}>{b.nombre}</span>
            <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
              {formatoMinutos(b.minutos)} · <span className="font-semibold text-foreground">{porcentaje(b.acumulado)}</span>
            </span>
          </div>
          {/* Eje en cero: la longitud ES el dato. */}
          <div className="h-2 overflow-hidden rounded-full bg-muted-foreground/15">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (b.minutos / max) * 100)}%`, background: b.prioridad ? C.crit : C.sec, opacity: b.prioridad ? 1 : 0.5 }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

// ── 3 · Intervenciones sin detener / con parada ─────────────────────────────
export function GraficoIntervenciones({ serie }: { serie: readonly PuntoIntervenciones[] }) {
  const H = 140, PL = 22, PR = 6, PT = 8, PB = 22
  const max = techo(Math.max(1, ...serie.map((p) => p.sinDetener + p.conParada)))
  const paso = (W - PL - PR) / Math.max(1, serie.length)
  const ancho = Math.max(4, Math.min(28, paso - 4))
  const alto = (v: number) => ((H - PT - PB) * v) / max
  const base = H - PB
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={serie.map((p) => `${p.etiqueta}: ${p.sinDetener} sin detener, ${p.conParada} con parada`).join('; ')}>
      {[0, max / 2, max].map((v) => (
        <g key={v}>
          <line x1={PL} x2={W - PR} y1={base - alto(v)} y2={base - alto(v)} stroke={C.grilla} />
          <text x={PL - 5} y={base - alto(v) + 4} textAnchor="end" style={TXT}>
            {Number.isInteger(v) ? v : ''}
          </text>
        </g>
      ))}
      {serie.map((p, i) => {
        const x0 = PL + i * paso + (paso - ancho) / 2
        // Apiladas: la serie que importa («sin detener») abajo, sobre la base común.
        return (
          <g key={p.clave}>
            <title>{`${p.etiqueta}: ${p.sinDetener} sin detener · ${p.conParada} con parada`}</title>
            <rect x={x0} y={base - alto(p.sinDetener)} width={ancho} height={alto(p.sinDetener)} fill={C.ok} />
            <rect x={x0} y={base - alto(p.sinDetener) - alto(p.conParada)} width={ancho} height={alto(p.conParada)} fill={C.crit} opacity={0.5} />
          </g>
        )
      })}
      {indicesEje(serie.length).map((i) => (
        <text key={i} x={PL + i * paso + paso / 2} y={H - 5} textAnchor="middle" style={TXT}>
          {serie[i]!.etiqueta}
        </text>
      ))}
    </svg>
  )
}

// ── 4 · Duración de cada falla ──────────────────────────────────────────────
export function GraficoReparacion({ duraciones, mediana, p80 }: { duraciones: readonly number[]; mediana: number | null; p80: number | null }) {
  const PL = 12, PR = 16
  const maxX = techo(Math.max(10, ...duraciones))
  const x = (v: number) => PL + ((W - PL - PR) * v) / maxX
  // Puntos que caen en el mismo tramo de 5 min se apilan hacia arriba.
  const pilas = new Map<number, number>()
  const puntos = duraciones.map((d) => {
    const k = Math.round(d / 5)
    const n = pilas.get(k) ?? 0
    pilas.set(k, n + 1)
    return { d, fila: n }
  })
  const filas = Math.max(1, ...pilas.values())
  const H = 44 + filas * 9
  const base = H - 26
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Duración de cada falla en minutos: ${duraciones.join(', ')}`}>
      {[0, maxX / 2, maxX].map((v) => (
        <g key={v}>
          <line x1={x(v)} x2={x(v)} y1={14} y2={base + 5} stroke={C.grilla} />
          <text x={x(v)} y={H - 6} textAnchor={v === 0 ? 'start' : v === maxX ? 'end' : 'middle'} style={TXT}>
            {v === maxX ? `${Math.round(v)} min` : Math.round(v)}
          </text>
        </g>
      ))}
      {puntos.map((p, i) => (
        <circle key={i} cx={x(p.d)} cy={base - p.fila * 9} r={3.8} fill={C.crit} opacity={0.75}>
          <title>{formatoMinutos(p.d)}</title>
        </circle>
      ))}
      {mediana != null && duraciones.length >= 5 && (
        <g>
          <line x1={x(mediana)} x2={x(mediana)} y1={4} y2={base + 5} stroke={C.tinta} strokeWidth={2} />
          <text x={x(mediana) + 5} y={12} style={{ ...TXT, fill: C.tinta, fontWeight: 600 }}>
            mitad: {formatoMinutos(Math.round(mediana))}
          </text>
        </g>
      )}
      {p80 != null && duraciones.length >= 5 && p80 !== mediana && (
        <line x1={x(p80)} x2={x(p80)} y1={16} y2={base + 5} stroke={C.ref} strokeDasharray="3 3" />
      )}
    </svg>
  )
}

// ── 5 · Fallas repetidas ────────────────────────────────────────────────────
export function ListaRepetidas({ lista, dias }: { lista: readonly FallaRepetida[]; dias: number }) {
  if (!lista.length) return null
  return (
    <ul className="flex flex-col">
      {lista.slice(0, 5).map((r, i) => (
        <li
          key={r.equipo}
          className='relative flex items-baseline gap-3 py-2 before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-border before:content-[""] first:before:hidden'
        >
          <span className="min-w-0 flex-1">
            <span className="block break-words text-body font-semibold">{r.equipo}</span>
            <span className="block text-caption text-muted-foreground">
              {r.ultima ? `${r.ultima} · ` : ''}última: {etiquetaCortaTurno(r.ultimoTurnoId).toLowerCase()}
            </span>
          </span>
          <span className={`shrink-0 text-footnote font-semibold tabular-nums ${i === 0 ? 'text-ink-crit' : r.fallas >= 3 ? 'text-ink-warn' : 'text-muted-foreground'}`}>
            {r.fallas} en {dias} días
          </span>
        </li>
      ))}
    </ul>
  )
}

// ── 6 · De máquina detenida a línea perdida ─────────────────────────────────
/**
 * Dos barras por equipo: lo que estuvo detenida la máquina y lo que eso le costó a la
 * línea según su cuota. La diferencia es lo que absorbieron las máquinas en paralelo.
 */
export function GraficoPerdidaLinea({ perdida }: { perdida: PerdidaDeLinea }) {
  const top = perdida.equipos.slice(0, 6)
  const max = Math.max(...top.map((e) => e.minutos), 1)
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {top.map((e) => (
          <li key={e.equipo} className="flex min-w-0 flex-col gap-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-footnote font-semibold">{e.equipo}</span>
              <span className="shrink-0 text-footnote tabular-nums text-muted-foreground">
                {formatoMinutos(Math.round(e.minutos))} → <b className="text-foreground">{formatoMinutos(Math.round(e.minutosLinea))}</b>
              </span>
            </span>
            <span aria-hidden className="relative block h-2.5 rounded-full bg-muted-foreground/15">
              <span className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/35" style={{ width: `${(e.minutos / max) * 100}%` }} />
              <span className="absolute inset-y-0 left-0 rounded-full bg-[rgb(var(--brand))]" style={{ width: `${(e.minutosLinea / max) * 100}%` }} />
            </span>
            <span className="text-caption text-muted-foreground">
              {e.cuota >= 0.999 ? 'en serie: toda la línea pasa por aquí' : `${porcentajeFino(e.cuota)} de ${e.linea}`}
            </span>
          </li>
        ))}
      </ul>
      {perdida.porLinea.length > 1 && (
        <p className="text-caption text-muted-foreground">
          Por línea: {perdida.porLinea.map((l) => `${l.linea} ${formatoMinutos(Math.round(l.minutos))}`).join(' · ')}
        </p>
      )}
      {perdida.sinCuota.length > 0 && (
        <p className="text-caption text-ink-warn">
          {formatoMinutos(Math.round(perdida.minutosSinCuota))} sin convertir:{' '}
          {perdida.sinCuota.length === 1 ? 'un equipo que todavía no está ubicado' : `${perdida.sinCuota.length} equipos que todavía no están ubicados`} en el editor de
          líneas ({perdida.sinCuota.slice(0, 3).map((x) => x.equipo).join(', ')}
          {perdida.sinCuota.length > 3 ? '…' : ''}).
        </p>
      )}
    </div>
  )
}
