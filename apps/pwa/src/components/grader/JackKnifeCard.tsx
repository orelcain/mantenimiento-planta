/**
 * JackKnifeCard — Diagrama Jack-Knife de Mantención.
 *
 * Cada punto es una causa del balde Mantención: cuántas veces detuvo la línea
 * (eje X, log) y cuánto duró cada vez (eje Y, MTTR en minutos, log). Los
 * umbrales son el promedio de eventos por causa y de minutos por evento de la
 * ventana elegida. Port del mockup aprobado (07-11-2026); la lógica de ventanas,
 * riel y colocación de etiquetas es la del mockup.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { SegmentedControl } from '@/components/piel'
import { calcularLayout } from './jackKnifeLayout'
import { dec, dec1 } from '@/utils/formatoNumeros'
import {
  SIN_IMPUTAR,
  calcularJackKnife,
  cargarTurnosCrudos,
  comentariosDe,
  prepararTurnos,
  ventanaJK,
  type CuadranteJK,
  type TurnoCrudo,
  type TurnoJK,
  type VentanaJK,
  type VistaJK,
} from '@/services/shoplogix/jackKnife'

// ── Presentación ────────────────────────────────────────────────────────────

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

/** Colores de cuadrante: tinta para el texto, punto para el marcador, relleno de baja opacidad. */
const Q: Record<CuadranteJK, { t: string; a: string; ink: string; dot: string; fill: string }> = {
  amb: { t: 'Agudas y crónicas', a: 'Prioridad 1: atacar causa raíz y tiempo de reparación.', ink: 'rgb(var(--tw-red-600))', dot: 'rgb(var(--tw-red-500))', fill: 'rgb(var(--tw-red-500) / 0.08)' },
  agu: { t: 'Agudas', a: 'Pocas veces, pero larga: revisar repuestos, diagnóstico y procedimiento.', ink: 'rgb(var(--warning-ink))', dot: 'rgb(var(--warning))', fill: 'rgb(var(--warning) / 0.08)' },
  cro: { t: 'Crónicas', a: 'Rápida, pero repetida: buscar causa raíz o preventivo.', ink: 'rgb(var(--tw-amber-600))', dot: 'rgb(var(--tw-amber-500))', fill: 'rgb(var(--tw-amber-500) / 0.08)' },
  ok: { t: 'Bajo control', a: 'Sin acción. Mantener seguimiento.', ink: 'rgb(var(--success))', dot: 'rgb(var(--success))', fill: 'rgb(var(--success) / 0.07)' },
}
const COLOR_SIN = 'rgb(var(--cat-6-ink))'

const VISTAS: { value: VistaJK; label: string }[] = [
  { value: 'imp', label: 'Imputadas' },
  { value: 'sin', label: 'Sin imputar' },
  { value: 'todas', label: 'Todas' },
]
const PRESETS: { value: VentanaJK; label: string }[] = [
  { value: 'turno', label: 'Último turno' },
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
  { value: 'todo', label: 'Todo' },
]

const fechaCorta = (dateKey: string) => {
  const [, m, d] = dateKey.split('-')
  return `${Number(d)}-${MES[Number(m) - 1]}`
}
const turnoCorto = (shiftId: string) => shiftId.replace('Turno ', 'T')
/** Horas con coma: menos de una hora en minutos. */
const hrs = (m: number) => (m < 60 ? `${m < 10 ? dec1(m) : dec(m, 0)} min` : `${dec1(m / 60)} h`)
const durS = (m: number) => (m >= 90 ? `${dec1(m / 60)} h` : `${dec1(m)} min`)
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)

// ── Riel ────────────────────────────────────────────────────────────────────

const RANGO_INPUT =
  'absolute inset-x-0 bottom-[18px] h-7 w-full appearance-none bg-transparent pointer-events-none ' +
  '[&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent ' +
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none ' +
  '[&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:rounded-full ' +
  '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-accent [&::-webkit-slider-thumb]:bg-card ' +
  '[&::-webkit-slider-thumb]:cursor-ew-resize [&::-moz-range-thumb]:pointer-events-auto ' +
  '[&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full ' +
  '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-accent [&::-moz-range-thumb]:bg-card'

export function JackKnifeCard({ plantSlug }: { plantSlug: string }) {
  const [crudos, setCrudos] = useState<TurnoCrudo[] | null>(null)
  const [error, setError] = useState(false)
  const [vista, setVista] = useState<VistaJK>('imp')
  const [preset, setPreset] = useState<VentanaJK | 'libre'>('90')
  const [manual, setManual] = useState<{ a: number; b: number } | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [ancho, setAncho] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vivo = true
    setCrudos(null)
    setError(false)
    cargarTurnosCrudos(plantSlug)
      .then((r) => { if (vivo) setCrudos(r) })
      .catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [plantSlug])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    setAncho(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setAncho(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const prep = useMemo(() => prepararTurnos(crudos ?? []), [crudos])
  const turnos: TurnoJK[] = prep.turnos
  const n = turnos.length

  const win = useMemo(() => {
    if (preset !== 'libre') return ventanaJK(turnos, preset)
    if (!manual || n === 0) return ventanaJK(turnos, '90')
    const desde = Math.min(Math.max(0, manual.a), n - 1)
    const hasta = Math.min(Math.max(manual.b, desde), n - 1)
    return { desde, hasta }
  }, [turnos, preset, manual, n])

  const calc = useMemo(
    () => calcularJackKnife(turnos, win.desde, win.hasta, vista),
    [turnos, win.desde, win.hasta, vista],
  )

  const W = Math.max(300, ancho || 900)
  const layout = useMemo(
    () => (calc.pts.length ? calcularLayout(calc, W, sel) : null),
    [calc, W, sel],
  )

  const porTotal = [...calc.pts].sort((a, b) => b.min - a.min)
  const selPunto = calc.pts.find((p) => p.k === sel) ?? porTotal[0] ?? null
  const esSin = vista === 'sin' || selPunto?.k === SIN_IMPUTAR
  const comentarios = selPunto && !esSin && n > 0
    ? comentariosDe(turnos, win.desde, win.hasta, selPunto.k, 5)
    : []

  const prim = calc.pts.filter((p) => p.q === 'amb')
  const sinPt = calc.pts.find((p) => p.k === SIN_IMPUTAR)
  const tesis = (() => {
    if (vista === 'sin') {
      if (!calc.pts.length) return 'No hay detenciones sin causa en esta ventana, sin contar microdetenciones.'
      const top = porTotal[0]!
      return `${calc.N} ${plural(calc.N, 'detención', 'detenciones')} sin causa anotada (${hrs(calc.D)}). La que más deja sin anotar: ${top.k}, con ${top.ev} y ${hrs(top.min)}.`
    }
    if (!calc.pts.length) return 'Sin detenciones de Mantención con causa en esta ventana.'
    const cabecera = prim.length
      ? `Prioridad 1: ${[...prim].sort((a, b) => b.min - a.min).map((p) => p.k).join(', ')}.`
      : 'Ninguna causa cae en agudas y crónicas.'
    const sinTxt = sinPt ? `, de las que ${hrs(sinPt.min)} no tienen causa.` : ' atribuidas a Mantención.'
    return `${cabecera} ${calc.N} ${plural(calc.N, 'evento', 'eventos')} y ${hrs(calc.D)} de detención${sinTxt}`
  })()

  const avisos: string[] = []
  if (vista !== 'sin' && calc.pts.length && (calc.N < 15 || calc.pts.length < 4)) {
    avisos.push(`Con ${calc.N} ${plural(calc.N, 'evento', 'eventos')} y ${calc.pts.length} ${plural(calc.pts.length, 'causa', 'causas')} los cuadrantes orientan poco: usa la lista.`)
  }
  if (calc.cob !== null && calc.cob < 0.5) {
    avisos.push(`Solo ${Math.round(calc.cob * 100)} % del tiempo detenido no planificado tiene causa anotada, contando microdetenciones: faltan eventos en este gráfico.`)
  }

  // Riel: barras por turno (escala raíz, como el mockup).
  const mxBarra = Math.max(...calc.barras, 1)
  const alturaBarra = (v: number) => (v ? Math.max(4, 100 * Math.sqrt(v / mxBarra)) : 0)
  const meses = useMemo(() => {
    const out: { i: number; t: string }[] = []
    let ult = ''
    turnos.forEach((t, i) => {
      const k = t.dateKey.slice(0, 7)
      if (k !== ult) { ult = k; out.push({ i, t: MES[Number(k.slice(5)) - 1]! }) }
    })
    const w = ancho || 600
    let prev = -1e9
    return out.filter(({ i }) => {
      const px = (w * i) / Math.max(1, n)
      if (px - prev < 44) return false
      prev = px
      return true
    })
  }, [turnos, n, ancho])

  const mover = (dir: -1 | 1) => {
    const len = win.hasta - win.desde + 1
    const max = n - 1
    let a = win.desde + dir * len
    let b = win.hasta + dir * len
    if (a < 0) { a = 0; b = len - 1 }
    if (b > max) { b = max; a = max - len + 1 }
    setManual({ a, b })
    setPreset('libre')
  }

  const cambiarVista = (v: VistaJK) => { setVista(v); setSel(null) }
  const cambiarPreset = (v: VentanaJK | 'libre') => { setPreset(v); setManual(null) }

  const nuevoA = (v: number) => { setManual({ a: Math.min(v, win.hasta), b: win.hasta }); setPreset('libre') }
  const nuevoB = (v: number) => { setManual({ a: win.desde, b: Math.max(v, win.desde) }); setPreset('libre') }

  const inicioVentana = n ? turnos[win.desde]! : null
  const finVentana = n ? turnos[win.hasta]! : null
  const nTurnosVentana = n ? win.hasta - win.desde + 1 : 0

  return (
    <Card ref={rootRef} className="bg-card">
      <CardContent className="p-4 space-y-3 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-headline font-semibold text-foreground">Diagrama Jack-Knife de Mantención</h3>
        </div>
        <p className="text-footnote text-muted-foreground max-w-prose">
          Cada punto es una causa de Mantención: cuántas veces detuvo la línea y cuánto duró cada vez.
        </p>

        <div className="flex flex-wrap gap-2">
          <SegmentedControl<VistaJK> ariaLabel="Qué detenciones ver" value={vista} onChange={cambiarVista} segments={VISTAS} />
          <SegmentedControl<VentanaJK | 'libre'> ariaLabel="Período" value={preset} onChange={cambiarPreset} segments={PRESETS} />
        </div>

        {error && <p className="text-footnote text-destructive">No se pudo leer el resumen de turnos. Intenta de nuevo.</p>}
        {!error && crudos === null && <p className="text-footnote text-muted-foreground">Cargando turnos…</p>}

        {crudos !== null && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label="Ventana anterior"
                  disabled={win.desde === 0 || n === 0}
                  onClick={() => mover(-1)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-accent disabled:opacity-35"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
                <div className="min-w-0 text-center text-footnote tabular-nums text-foreground">
                  {inicioVentana && finVentana ? (
                    nTurnosVentana === 1 ? (
                      <>
                        {fechaCorta(inicioVentana.dateKey)} · {turnoCorto(inicioVentana.shiftId)}
                        <span className="block text-caption text-muted-foreground">1 turno</span>
                      </>
                    ) : (
                      <>
                        {fechaCorta(inicioVentana.dateKey)} {turnoCorto(inicioVentana.shiftId)} a {fechaCorta(finVentana.dateKey)} {turnoCorto(finVentana.shiftId)}
                        <span className="block text-caption text-muted-foreground">{nTurnosVentana} turnos</span>
                      </>
                    )
                  ) : (
                    <span className="text-muted-foreground">Sin turnos con resumen</span>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Ventana siguiente"
                  disabled={win.hasta >= n - 1 || n === 0}
                  onClick={() => mover(1)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-accent disabled:opacity-35"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
              </div>

              <div className="relative h-24 touch-none">
                <svg
                  className="absolute inset-x-0 top-0 h-[68px] w-full"
                  viewBox={`0 0 ${Math.max(1, n)} 100`}
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  {calc.barras.map((v, i) => (
                    <rect
                      key={turnos[i]?.id ?? i}
                      x={i}
                      y={100 - alturaBarra(v)}
                      width={0.8}
                      height={alturaBarra(v)}
                      className={i >= win.desde && i <= win.hasta ? 'fill-accent' : 'fill-muted-foreground opacity-40'}
                    />
                  ))}
                </svg>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, n - 1)}
                  step={1}
                  value={win.desde}
                  onChange={(e) => nuevoA(Number(e.target.value))}
                  aria-label="Primer turno"
                  disabled={n === 0}
                  className={RANGO_INPUT}
                />
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, n - 1)}
                  step={1}
                  value={win.hasta}
                  onChange={(e) => nuevoB(Number(e.target.value))}
                  aria-label="Último turno"
                  disabled={n === 0}
                  className={RANGO_INPUT}
                />
                <div className="absolute inset-x-0 bottom-0 h-4 text-caption text-muted-foreground">
                  {meses.map(({ i, t }) => (
                    <span
                      key={`${i}-${t}`}
                      className="absolute -translate-x-1/2 whitespace-nowrap"
                      style={{ left: `${Math.min(96, Math.max(3, (100 * i) / Math.max(1, n)))}%` }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-caption text-muted-foreground">
                Las barras son las horas de detención por turno de lo que muestra el filtro. Arrastra las dos manijas, o usa ‹ › para mover la misma ventana.
              </p>
            </div>

            <p className="text-body font-semibold text-foreground">{tesis}</p>
            {avisos.length > 0 && <p className="text-footnote text-warning">{avisos.join(' ')}</p>}
            {prep.sinResumen > 0 && (
              <p className="text-caption text-muted-foreground">
                {prep.sinResumen} {plural(prep.sinResumen, 'turno sin resumen', 'turnos sin resumen')}: se abrieron antes de la carga del resumen. Se pueden rellenar con el script de backfill.
              </p>
            )}

            {layout ? (
              <svg
                viewBox={`0 0 ${layout.W} ${layout.H}`}
                height={layout.H}
                role="img"
                aria-label="Eventos contra MTTR por causa"
                className="block w-full"
              >
                <rect x={layout.L} y={layout.T} width={Math.max(0, layout.ux - layout.L)} height={Math.max(0, layout.uy - layout.T)} fill={Q.agu.fill} />
                <rect x={layout.ux} y={layout.T} width={Math.max(0, layout.W - layout.R - layout.ux)} height={Math.max(0, layout.uy - layout.T)} fill={Q.amb.fill} />
                <rect x={layout.L} y={layout.uy} width={Math.max(0, layout.ux - layout.L)} height={Math.max(0, layout.T + layout.ih - layout.uy)} fill={Q.ok.fill} />
                <rect x={layout.ux} y={layout.uy} width={Math.max(0, layout.W - layout.R - layout.ux)} height={Math.max(0, layout.T + layout.ih - layout.uy)} fill={Q.cro.fill} />

                {layout.xs.map(({ v, x }) => (
                  <text key={`x${v}`} x={x} y={layout.T + layout.ih + 18} textAnchor="middle" className="fill-muted-foreground text-caption">
                    {String(v).replace('.', ',')}
                  </text>
                ))}
                {layout.ys.map(({ v, y }) => (
                  <text key={`y${v}`} x={layout.L - 8} y={y + 4} textAnchor="end" className="fill-muted-foreground text-caption">
                    {String(v).replace('.', ',')}
                  </text>
                ))}
                <text x={layout.L + layout.iw / 2} y={layout.H - 6} textAnchor="middle" className="fill-muted-foreground text-caption">Eventos en el período</text>
                <text transform={`translate(13 ${layout.T + layout.ih / 2}) rotate(-90)`} textAnchor="middle" className="fill-muted-foreground text-caption">MTTR (min)</text>

                <line x1={layout.ux} y1={layout.T} x2={layout.ux} y2={layout.T + layout.ih} className="stroke-muted-foreground opacity-40" strokeDasharray="4 4" />
                <line x1={layout.L} y1={layout.uy} x2={layout.W - layout.R} y2={layout.uy} className="stroke-muted-foreground opacity-40" strokeDasharray="4 4" />

                {(
                  [
                    ['amb', 'Agudas y crónicas', layout.W - layout.R - 8, layout.T + 18, 'end'],
                    ['agu', 'Agudas', layout.L + 8, layout.T + 18, 'start'],
                    ['ok', 'Bajo control', layout.L + 8, layout.T + layout.ih - 8, 'start'],
                    ['cro', 'Crónicas', layout.W - layout.R - 8, layout.T + layout.ih - 8, 'end'],
                  ] as const
                ).map(([q, t, x, y, an]) => (
                  <text key={q} x={x} y={y} textAnchor={an} className="text-footnote font-semibold" style={{ fill: Q[q].ink }}>
                    {t}
                  </text>
                ))}

                {layout.puntos.filter((d) => d.etiqueta?.lin).map(({ p, x, y, etiqueta }) => (
                  <line key={`l-${p.k}`} x1={x} y1={y} x2={etiqueta!.cx} y2={etiqueta!.cy} className="stroke-muted-foreground opacity-40" />
                ))}
                {layout.puntos.map(({ p, x, y, rad, etiqueta }) => {
                  const color = p.k === SIN_IMPUTAR ? COLOR_SIN : Q[p.q].dot
                  const activar = () => setSel(p.k)
                  return (
                    <g
                      key={p.k}
                      role="button"
                      tabIndex={0}
                      aria-label={`${p.k}: ${p.ev} ${plural(p.ev, 'evento', 'eventos')}, ${durS(p.mttr)}`}
                      onClick={activar}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activar() } }}
                      className="cursor-pointer focus-visible:outline-none"
                    >
                      <title>{p.k}</title>
                      <circle cx={x} cy={y} r={rad} fill={color} className="stroke-card" strokeWidth={1.5} />
                      {etiqueta && (
                        <text x={etiqueta.bx} y={etiqueta.by} className="fill-foreground text-footnote">{p.k}</text>
                      )}
                    </g>
                  )
                })}
              </svg>
            ) : (
              <p className="text-footnote text-muted-foreground">Sin detenciones de Mantención con causa en esta ventana.</p>
            )}

            {selPunto && (
              <div className="text-footnote space-y-1">
                <p className="font-semibold text-foreground">
                  <span style={{ color: Q[selPunto.q].ink }}>{selPunto.k} · {Q[selPunto.q].t}</span>
                </p>
                <p className="text-foreground tabular-nums">
                  {selPunto.ev} {plural(selPunto.ev, 'evento', 'eventos')} · {esSin ? 'duración media' : 'MTTR'} {durS(selPunto.mttr)} · {hrs(selPunto.min)} en total.{' '}
                  <span className="text-muted-foreground">
                    {esSin
                      ? 'Sin causa anotada: pedir la imputación al supervisor del turno; hasta entonces no se sabe si es de Mantención.'
                      : Q[selPunto.q].a}
                  </span>
                </p>
                {comentarios.length > 0 && (
                  <ul className="space-y-1 pt-1">
                    {comentarios.map((c) => (
                      <li key={`${c.inicioMs}-${c.texto}`} className="text-foreground">
                        <span className="text-caption text-muted-foreground tabular-nums">{fechaCorta(c.dateKey)} · {turnoCorto(c.shiftId)}</span>{' '}
                        «{c.texto}»
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 min-[561px]:grid-cols-2 min-[981px]:grid-cols-4">
              {(['amb', 'agu', 'cro', 'ok'] as const).map((k) => {
                const filas = calc.pts.filter((p) => p.q === k).sort((a, b) => b.min - a.min)
                return (
                  <div key={k} className="min-w-0">
                    <h4 className="flex items-center gap-2 text-footnote font-semibold text-foreground mb-1">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: Q[k].dot }} aria-hidden />
                      {Q[k].t}
                    </h4>
                    {filas.length ? (
                      filas.map((p) => (
                        <button
                          key={p.k}
                          type="button"
                          aria-pressed={selPunto?.k === p.k}
                          onClick={() => setSel(p.k)}
                          className={cn(
                            'flex min-h-11 w-full items-center justify-between gap-3 text-left text-footnote tabular-nums',
                            selPunto?.k === p.k ? 'font-semibold text-accent' : 'text-foreground',
                          )}
                        >
                          <span className="min-w-0 truncate">{p.k}</span>
                          <span className="shrink-0 text-caption text-muted-foreground">{p.ev} · {durS(p.mttr)}</span>
                        </button>
                      ))
                    ) : (
                      <p className="text-caption text-muted-foreground">Ninguna en este período</p>
                    )}
                  </div>
                )
              })}
            </div>

            <p className="text-caption text-muted-foreground">
              {calc.N > 0 && (vista === 'sin'
                ? `Umbrales: ${dec1(calc.un)} eventos por evisceradora y ${dec1(calc.um)} min de duración media. `
                : `Umbrales: ${dec1(calc.un)} eventos por causa y ${dec1(calc.um)} min de MTTR, recalculados con cada ventana. `)}
              {calc.cob !== null && `Cobertura de causa aproximada, con microdetenciones: ${Math.round(calc.cob * 100)} %. `}
              {layout && layout.ocultas > 0 && `${layout.ocultas} ${plural(layout.ocultas, 'punto no lleva', 'puntos no llevan')} nombre para no montarse: tócalos o míralos en la lista. `}
              {vista === 'sin'
                ? 'Sin imputar se cuenta por evisceradora, para ver dónde falta anotar. No incluye microdetenciones.'
                : 'Una detención simultánea en las 3 evisceradoras cuenta como un evento.'}
              {vista === 'todas' && ' «Sin imputar» junta las detenciones sin causa de la línea, sin microdetenciones.'}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
