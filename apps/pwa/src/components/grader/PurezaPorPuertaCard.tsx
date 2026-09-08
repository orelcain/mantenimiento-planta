/**
 * PurezaPorPuertaCard — ¿qué está cayendo en cada puerta del Grader?
 *
 * Lee `summary.gateMix` (calculado al guardar el Excel, ver graderGateMix.ts)
 * y responde en un vistazo la pregunta de terreno «¿la G6 cae mezclada por
 * calibre, por calidad, y desde cuándo?»:
 *
 *   1. Semáforo de las 12 puertas: pureza (calibre Y calidad asignados),
 *      lo asignado, y el intruso principal en texto — el color nunca es el
 *      único canal (§8 de la piel).
 *   2. Ficha de la puerta elegida: barras por calibre y por calidad, y la
 *      pureza en bloques de 30 min con la hora desde la que se cae.
 *   3. Acciones: copiar el resumen o registrar la incidencia con el texto
 *      ya armado (mismo patrón que GraderGatesLector).
 *
 * Umbrales: ≥95 ok · 85–95 atención · <85 crítico. El 85 es el mismo 15 % de
 * mezcla con el que GraderGatesLector ya avisa en el dashboard de la carga.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { Layers, Copy, CheckCircle2 } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Pill, type PillTone } from '@/components/piel/Pill'
import { Button } from '@/components/piel/Button'
import { cn } from '@/lib/utils'
import { copiarTexto } from '@/lib/clipboard'
import { gateMixTotals, ANY_CALIBRE, type GateMix, type GateMixEntry } from '@/services/grader/graderGateMix'
import {
  PUREZA_OK_PCT, PUREZA_WARN_PCT, nivelDePureza, bloqueDeCaida, promedioHasta, type NivelPureza as Nivel,
} from '@/services/grader/graderPurezaNivel'
import type { GateAssignment } from '@/services/grader/types'
import { CAUSA_ORDER, type CausaTipo, type GateCauses, type GateCauseGroup, type SeteoMaquina, type PesoPorPuerta, type SolapeDeRango } from '@/services/grader/graderGateObservations'

// ⚠ Nunca combinar estas clases de color con text-caption/text-title3 dentro
// de cn(): tailwind-merge no conoce la escala tipográfica propia, toma
// text-caption como color y lo descarta frente a text-ink-*. Ver los usos.
const NIVEL_INK: Record<Nivel, string> = {
  ok: 'text-ink-ok',
  warn: 'text-ink-warn',
  crit: 'text-ink-crit',
  none: 'text-muted-foreground',
}
const NIVEL_BG: Record<Nivel, string> = {
  ok: 'bg-ink-ok',
  warn: 'bg-ink-warn',
  crit: 'bg-ink-crit',
  none: 'bg-muted-foreground',
}

const fmtPz = (n: number) => n.toLocaleString('es-CL')
const fmtPct = (p: number) => {
  const r = Math.round(p * 10) / 10
  return `${(Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)).replace('.', ',')} %`
}
/** Entero, para las baldosas: a 375 px el decimal no aporta y roba ancho. */
const fmtPctEntero = (p: number) => `${Math.round(p)} %`

/** Hora wall-clock del bloque i (los ts del Grader van marcados como Z sin convertir). */
function horaBloque(mix: GateMix, i: number): string {
  const ms = Date.parse(mix.bucketsFrom) + i * mix.bucketMinutes * 60_000
  return new Date(ms).toISOString().slice(11, 16)
}

function etiquetaAsignacion(e: GateMixEntry | undefined, g: GateAssignment | undefined): string {
  const calibre = e?.assignedCalibre ?? g?.assignedCalibre
  const quality = e?.assignedQuality ?? g?.assignedQuality
  if (!calibre && !quality) return 'sin asignación'
  return `${calibre === ANY_CALIBRE ? 'Todo' : calibre ?? '—'} · ${quality ?? '—'}`
}

function textoIntruso(e: GateMixEntry, corto = false): string | null {
  if (!e.topIntruder) return null
  const { value, pct } = e.topIntruder
  return corto ? `${fmtPctEntero(pct)} ${value}` : `${fmtPct(pct)} es ${value}`
}

interface Props {
  gateMix: GateMix
  /** Config con la que se guardó el turno (`summary.gatesUsed`). Da las 12 baldosas aunque no haya piezas. */
  gates?: GateAssignment[]
  /** Para el título de la incidencia y el resumen copiado. Ej: "07/09 · Turno 1". */
  turnoLabel: string
  /**
   * Bloques que contienen un cambio de config de gates (gateMix v2). Se marcan
   * en la franja y no cuentan para "cae desde": un bloque partido por un
   * cambio sale contaminado aunque la máquina haya obedecido.
   */
  changeBuckets?: number[]
  /**
   * «¿Por qué cayó acá?» para la puerta elegida (gateMix v2): causales,
   * a qué gate debía ir según el seteo y en qué bloques se concentra. Sin esto
   * (v1) la ficha muestra solo los desgloses.
   */
  causesFor?: (gate: number) => GateCauses | null
  /** Puertas cuyo seteo no coincide con lo que manda la máquina (gateMix v2). */
  seteoDistinto?: Record<number, SeteoMaquina>
  /** Corregir el seteo de la app con lo que hace la máquina. Solo supervisor/admin. */
  onAdoptarSeteo?: (gate: number, seteo: SeteoMaquina) => void
  /** Adoptar de una vez el seteo de la máquina en todas las puertas con seteo distinto. */
  onAdoptarSeteoTodas?: (seteos: Record<number, SeteoMaquina>) => void
  /**
   * Mezcla FÍSICA: peso de cada pieza contra el rango del calibre asignado
   * (rangos configurados en la app). La etiqueta del Excel no la mide.
   */
  pesoPorPuerta?: Record<number, PesoPorPuerta>
  /** Programas de calibre solapados en el Z2, detectados por el peso (gateMix v2). */
  solapes?: SolapeDeRango[]
  /**
   * Puertas sin seteo guardado cuya asignación se infirió de lo que el Z2 les
   * etiqueta (turnos viejos). Se muestran como "inferido" hasta guardarlas.
   */
  inferidas?: Record<number, SeteoMaquina>
}

/** Desde este % de piezas fuera del rango por peso, la baldosa lo dice. */
const PESO_FUERA_AVISO_PCT = 5
/** Con menos piezas con peso, un par de pescados ya son un 20 %: no se opina. */
const PESO_MIN_PIEZAS = 30
const pesoAvisa = (p: PesoPorPuerta | undefined): p is PesoPorPuerta => !!p && p.conPeso >= PESO_MIN_PIEZAS && p.pctFuera >= PESO_FUERA_AVISO_PCT
const fmtKg = (g: number) => `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 1).replace('.', ',')} kg`

/** Nombre de cada causal y qué mirar. El color nunca es el único canal. */
const CAUSA_META: Record<CausaTipo, { label: string; hint: (g: GateCauseGroup, self: number) => string }> = {
  seteo_distinto: {
    label: 'Seteo distinto a la máquina',
    hint: (g) => `La máquina manda ${g.value} a esta puerta; el seteo de la app dice otra cosa. No es mezcla: hay que corregir el seteo.${g.debiaIr.length ? ` Según la app eso iba a ${g.debiaIr.map((d) => `G${d}`).join('/')}.` : ''}`,
  },
  calibre_no_reconocido: {
    label: 'Calibre que la app no conoce',
    hint: () => 'El Excel trae un calibre fuera de la lista de la app (p. ej. 12+ lb) o "Fuera de rango": agregarlo a los rangos de calibre.',
  },
  calibre_lejano: {
    label: 'Calibre lejano',
    hint: (g, self) => g.origen === 'atras'
      ? `Vino de más atrás: ${g.debiaIr.map((d) => `G${d}`).join('/')} no la tomó (puerta no abrió o saturada).`
      : g.origen === 'adelante'
        ? `Cayó antes de llegar a ${g.debiaIr.map((d) => `G${d}`).join('/')}: disparo anticipado o rango del Z2 distinto al seteo de la G${self}.`
        : g.origen === 'mixto'
          ? `Debía ir a ${g.debiaIr.map((d) => `G${d}`).join('/')}: revisar rangos del Z2 contra el seteo.`
          : 'Ningún gate tiene ese calibre asignado con esta calidad: falta en el seteo.',
  },
  calibre_vecino: {
    label: 'Calibre vecino',
    hint: (g) => `Peso al límite del rango: revisar rangos de calibre o calibración de balanza.${g.debiaIr.length ? ` Debía ir a ${g.debiaIr.map((d) => `G${d}`).join('/')}.` : ''}`,
  },
  calidad: {
    label: 'Calidad distinta',
    hint: (g) => `La pieza venía marcada como ${g.value} en el ingreso.${g.debiaIr.length ? ` Debía ir a ${g.debiaIr.map((d) => `G${d}`).join('/')}.` : ' Ningún gate recibe esa calidad con este calibre.'}`,
  },
  conservacion: {
    label: 'Conservación distinta',
    hint: (g) => `Cayó ${g.value} en una puerta de otra conservación.${g.debiaIr.length ? ` Debía ir a ${g.debiaIr.map((d) => `G${d}`).join('/')}.` : ''}`,
  },
  sin_dato: { label: 'Sin dato en el Excel', hint: () => 'El registro no trae calibre o calidad: no se puede juzgar.' },
  otros: { label: 'Otras combinaciones', hint: () => 'Fuera de las 8 combinaciones más frecuentes del bloque.' },
}

/** Colores del gráfico apilado por tema (misma lógica que CHART_INK en otros gráficos). */
const CAUSA_COLOR: Record<'dark' | 'light', Record<CausaTipo | 'ok', string>> = {
  light: { ok: '#2e75b6', seteo_distinto: '#1c4cd4', calibre_no_reconocido: '#7f5539', calibre_lejano: '#b51b1b', calibre_vecino: '#974608', calidad: '#8944ab', conservacion: '#0c7e78', sin_dato: '#6f6f72', otros: '#aeaeb2' },
  dark:  { ok: '#5aa0dc', seteo_distinto: '#409cff', calibre_no_reconocido: '#c3a084', calibre_lejano: '#e08a88', calibre_vecino: '#d8b57a', calidad: '#da8fff', conservacion: '#5de7df', sin_dato: '#9db0c2', otros: '#6b7c8c' },
}
const CHART_TEXT = { light: { axis: '#41566a', grid: '#c3d7e9', tipBg: '#ffffff', tipText: '#16242f', tipBorder: '#c3d7e9' }, dark: { axis: '#94a3b8', grid: '#22384a', tipBg: '#1e293b', tipText: '#e2e8f0', tipBorder: '#334155' } }

export function PurezaPorPuertaCard({ gateMix, gates, turnoLabel, changeBuckets, causesFor, seteoDistinto, onAdoptarSeteo, onAdoptarSeteoTodas, pesoPorPuerta, solapes, inferidas }: Props) {
  const navigate = useNavigate()
  const [copiado, setCopiado] = useState(false)

  const byGate = useMemo(() => new Map(gateMix.gates.map((e) => [e.gate, e])), [gateMix])
  const gateNumbers = useMemo(() => {
    const nums = new Set<number>()
    for (const g of gates ?? []) nums.add(g.gateNumber)
    for (const e of gateMix.gates) nums.add(e.gate)
    return Array.from(nums).sort((a, b) => a - b)
  }, [gates, gateMix])
  const gateCfg = useMemo(() => new Map((gates ?? []).map((g) => [g.gateNumber, g])), [gates])

  const totals = useMemo(() => gateMixTotals(gateMix), [gateMix])
  // Una puerta con seteo distinto no cuenta como mezclada: es otra cosa.
  const conteo = useMemo(() => {
    let crit = 0, warn = 0, seteo = 0, noRec = 0
    for (const e of gateMix.gates) {
      if (seteoDistinto?.[e.gate]) { if (seteoDistinto[e.gate]!.noReconocido) noRec++; else seteo++; continue }
      const n = nivelDePureza(e.purityPct)
      if (n === 'crit') crit++
      else if (n === 'warn') warn++
    }
    return { crit, warn, seteo, noRec }
  }, [gateMix, seteoDistinto])

  // Arranca abierta en la peor puerta MEZCLADA; si no hay, en la primera con
  // seteo distinto: es lo que el usuario vino a ver.
  const peor = useMemo(() => {
    const conPureza = gateMix.gates.filter((e) => e.purityPct != null && !seteoDistinto?.[e.gate])
    if (conPureza.length > 0) {
      const min = conPureza.reduce((a, b) => (b.purityPct! < a.purityPct! ? b : a))
      if (nivelDePureza(min.purityPct) !== 'ok') return min.gate
    }
    const conSeteo = gateMix.gates.find((e) => seteoDistinto?.[e.gate])
    return conSeteo?.gate ?? null
  }, [gateMix, seteoDistinto])
  const [seleccion, setSeleccion] = useState<number | null>(peor)
  const detalle = seleccion != null ? byGate.get(seleccion) : undefined
  const causas = useMemo(() => (detalle && causesFor ? causesFor(detalle.gate) : null), [detalle, causesFor])

  // Hasta qué hora hay piezas: con el Excel cargado a mitad de turno, es lo
  // primero que hay que saber para leer el resto.
  const datosHasta = useMemo(() => {
    let last = -1
    for (const e of gateMix.gates) e.purityByBucket.forEach((v, i) => { if (v != null && i > last) last = i })
    if (last < 0) return null
    const ms = Date.parse(gateMix.bucketsFrom) + (last + 1) * gateMix.bucketMinutes * 60_000
    return new Date(ms).toISOString().slice(11, 16)
  }, [gateMix])

  const nivelGlobal: Nivel = conteo.crit > 0 ? 'crit' : conteo.warn > 0 ? 'warn' : 'ok'
  const pillTone: PillTone = conteo.crit > 0 ? 'critical' : conteo.warn > 0 ? 'warning' : conteo.seteo > 0 ? 'info' : 'ok'
  // Una puerta con seteo distinto no se juzga por peso: su rango es el equivocado.
  const conPesoFuera = useMemo(
    () => Object.values(pesoPorPuerta ?? {}).filter((p) => pesoAvisa(p) && !seteoDistinto?.[p.gate]).length,
    [pesoPorPuerta, seteoDistinto],
  )
  const adoptables = useMemo(
    () => Object.fromEntries(Object.entries(seteoDistinto ?? {}).filter(([, s]) => !s.noReconocido)) as Record<number, SeteoMaquina>,
    [seteoDistinto],
  )
  const nInferidas = Object.keys(inferidas ?? {}).length
  const conJuicio = gateMix.gates.some((e) => e.purityPct != null)
  const resumenPill = [
    conteo.crit > 0 ? `${conteo.crit} mezclada${conteo.crit > 1 ? 's' : ''}` : '',
    conteo.warn > 0 ? `${conteo.warn} en atención` : '',
    conteo.seteo > 0 ? `${conteo.seteo} con seteo ≠ máquina` : '',
    conteo.noRec > 0 ? `${conteo.noRec} con calibre no reconocido` : '',
    conPesoFuera > 0 ? `${conPesoFuera} con peso fuera de rango` : '',
    (solapes?.length ?? 0) > 0 ? 'programas solapados en el Z2' : '',
  ].filter(Boolean).join(' · ') || (conJuicio ? 'Todas puras' : 'Sin seteo guardado')
  // Sin ninguna puerta juzgada no hay "Todas puras" que valga.
  const pillToneFinal: PillTone = !conJuicio ? 'neutral' : pillTone

  const resumenTexto = () => {
    const lineas = [
      `Pureza por puerta · Grader · ${turnoLabel}`,
      totals.purityPct != null
        ? `Coinciden con lo asignado: ${fmtPz(totals.match)} / ${fmtPz(totals.pieces)} pz (${fmtPct(totals.purityPct)})`
        : '',
    ]
    for (const so of solapes ?? []) {
      lineas.push(`Programas solapados en el Z2: ${so.calibreA} recibe hasta ${fmtKg(so.hastaA)} y ${so.calibreB} desde ${fmtKg(so.desdeB)} (${so.gramos} g en común; ${fmtPz(so.piezasA)} pz en ${so.calibreA}, ${fmtPz(so.piezasB)} pz en ${so.calibreB})`)
    }
    for (const e of gateMix.gates) {
      const s = seteoDistinto?.[e.gate]
      if (s) {
        lineas.push(s.noReconocido
          ? `G${e.gate} (seteo ${etiquetaAsignacion(e, gateCfg.get(e.gate))}): la máquina etiqueta ${fmtPct(s.pct)} de las piezas con un calibre que la app no conoce (${s.quality})`
          : `G${e.gate} (seteo ${etiquetaAsignacion(e, gateCfg.get(e.gate))}): seteo distinto a la máquina, que manda ${s.calibre} · ${s.quality} (${fmtPct(s.pct)})`)
        continue
      }
      const n = nivelDePureza(e.purityPct)
      if (n === 'ok' || n === 'none') continue
      const caida = bloqueDeCaida(sinCambios(e.purityByBucket, changeBuckets))
      lineas.push(
        `G${e.gate} (${etiquetaAsignacion(e, gateCfg.get(e.gate))}): ${fmtPct(e.purityPct!)} pura`
        + (textoIntruso(e) ? ` · ${textoIntruso(e)}` : '')
        + (caida != null ? ` · cae desde ${horaBloque(gateMix, caida)}` : ''),
      )
      const pw = pesoPorPuerta?.[e.gate]
      if (pesoAvisa(pw)) {
        lineas.push(`  - Por peso: ${fmtPct(pw.pctFuera)} fuera del rango ${pw.rango?.calibre ?? ''}${pw.gramosArriba ? ` (arriba: ${fmtKg(pw.gramosArriba[0])}–${fmtKg(pw.gramosArriba[1])})` : ''}${pw.gramosAbajo ? ` (abajo: ${fmtKg(pw.gramosAbajo[0])}–${fmtKg(pw.gramosAbajo[1])})` : ''}`)
      }
      const c = causesFor?.(e.gate)
      for (const g of c?.groups.slice(0, 3) ?? []) {
        lineas.push(`  - ${CAUSA_META[g.tipo].label} ${g.value}: ${fmtPz(g.pieces)} pz (${fmtPct(g.pct)})${g.debiaIr.length ? ` · debía ir a ${g.debiaIr.map((d) => `G${d}`).join('/')}` : ''}`)
      }
    }
    return lineas.filter(Boolean).join('\n')
  }

  const copiar = async () => {
    await copiarTexto(resumenTexto())
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 2500)
  }

  const registrarIncidencia = () => {
    const e = detalle
    const titulo = e
      ? `Grader: G${e.gate} cae mezclada (${fmtPct(e.purityPct ?? 0)} pura)`
      : `Grader: puertas mezcladas · ${turnoLabel}`
    navigate(`/incidents?nueva=1&titulo=${encodeURIComponent(titulo)}&desc=${encodeURIComponent(resumenTexto())}`)
  }

  return (
    <Card data-testid="pureza-por-puerta">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Layers className="w-4 h-4" />
          Pureza por puerta
          <Pill tone={pillToneFinal} dot className="ml-auto">{resumenPill}</Pill>
        </CardTitle>
        {totals.purityPct != null && (
          <p className="text-footnote text-muted-foreground">
            Coinciden con lo asignado:{' '}
            <span className="text-foreground font-medium tabular-nums">{fmtPz(totals.match)} / {fmtPz(totals.pieces)} pz</span>
            {' '}<span className="tabular-nums">({fmtPct(totals.purityPct)})</span>
            {datosHasta && <> · piezas hasta las <span className="tabular-nums text-foreground">{datosHasta}</span></>}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Semáforo de puertas: la celda completa es el botón (≥44 px) ── */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" role="list">
          {gateNumbers.map((n) => {
            const e = byGate.get(n)
            const seteo = seteoDistinto?.[n]
            const nivel = nivelDePureza(e?.purityPct)
            const activa = seleccion === n
            const intruso = e ? textoIntruso(e, true) : null
            const ink = seteo ? 'text-ink-info' : NIVEL_INK[nivel]
            const dot = seteo ? 'bg-ink-info' : NIVEL_BG[nivel]
            const pw = pesoPorPuerta?.[n]
            const pesoFuera = pesoAvisa(pw) && !seteo ? pw : null
            return (
              <button
                key={n}
                type="button"
                role="listitem"
                aria-pressed={activa}
                onClick={() => setSeleccion(activa ? null : n)}
                className={cn(
                  'flex min-h-[44px] flex-col items-start gap-0.5 rounded-ctl bg-muted px-3 py-2 text-left',
                  'transition-[transform] duration-[180ms] active:scale-[.97] motion-reduce:active:scale-100',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                  activa && 'ring-2 ring-primary',
                )}
              >
                <span className="flex w-full items-center gap-1.5 text-caption font-semibold text-muted-foreground">
                  G{n}
                  {e && nivel !== 'none' && (
                    <span aria-hidden className={cn('h-[7px] w-[7px] rounded-full', dot)} />
                  )}
                </span>
                <span className={`text-title3 tabular-nums ${ink}`}>
                  {e?.purityPct != null ? fmtPctEntero(e.purityPct) : '—'}
                </span>
                <span className="w-full text-caption leading-tight text-foreground">
                  {etiquetaAsignacion(e, gateCfg.get(n))}
                  {inferidas?.[n] && <span className="text-muted-foreground"> · inferido</span>}
                </span>
                {seteo ? (
                  <span className="w-full text-caption font-medium leading-tight text-ink-info">{seteo.noReconocido ? 'calibre no reconocido' : 'seteo ≠ máquina'}</span>
                ) : intruso && nivel !== 'ok' ? (
                  <span className={`w-full text-caption font-medium leading-tight ${NIVEL_INK[nivel]}`}>{intruso}</span>
                ) : pesoFuera ? (
                  <span className="w-full text-caption font-medium leading-tight text-ink-warn">{fmtPctEntero(pesoFuera.pctFuera)} fuera por peso</span>
                ) : (
                  <span className="text-caption text-muted-foreground tabular-nums">
                    {e ? `${fmtPz(e.pieces)} pz` : 'sin piezas'}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <p className="text-footnote text-muted-foreground">
          Pureza = piezas con el calibre <span className="text-foreground">y</span> la calidad asignados ÷ piezas que
          cayeron en la puerta. ≥{PUREZA_OK_PCT} % pura · {PUREZA_WARN_PCT}–{PUREZA_OK_PCT} % en atención · &lt;{PUREZA_WARN_PCT} % mezclada.
          {' '}Si ≥ 90 % de las piezas llevan una misma combinación distinta a la asignada, no es mezcla: es <span className="text-ink-info">seteo ≠ máquina</span>.
        </p>

        {solapes && solapes.length > 0 && (
          <div className="rounded-ctl bg-muted px-3 py-2 text-footnote" data-testid="pureza-solapes">
            <p className="font-semibold text-ink-warn">Programas de calibre solapados en el Z2</p>
            {solapes.map((s) => (
              <p key={`${s.calibreA}|${s.calibreB}`} className="text-muted-foreground">
                Las puertas <span className="text-foreground">{s.calibreA}</span> reciben hasta{' '}
                <span className="tabular-nums text-foreground">{fmtKg(s.hastaA)}</span> y las{' '}
                <span className="text-foreground">{s.calibreB}</span> desde{' '}
                <span className="tabular-nums text-foreground">{fmtKg(s.desdeB)}</span>:{' '}
                <span className="tabular-nums text-foreground">{s.gramos} g</span> en común. El pescado de ese tramo cae en cualquiera de las dos
                ({fmtPz(s.piezasA)} pz en {s.calibreA}, {fmtPz(s.piezasB)} pz en {s.calibreB}). Revisar los límites de los dos programas en el Z2.
              </p>
            ))}
          </div>
        )}

        {nInferidas > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-ctl bg-muted px-3 py-2" data-testid="pureza-inferidas">
            <p className="flex-1 min-w-[14rem] text-footnote text-muted-foreground">
              Este turno no tiene seteo guardado: en {nInferidas} puerta{nInferidas > 1 ? 's' : ''} se tomó lo que el Z2 etiqueta
              (≥ 90 % de las piezas) como asignación. Se marca «inferido» hasta guardarlo.
            </p>
            {onAdoptarSeteoTodas && (
              <Button variant="tinted" onClick={() => onAdoptarSeteoTodas(inferidas!)}>Guardar seteo inferido</Button>
            )}
          </div>
        )}

        {onAdoptarSeteoTodas && Object.keys(adoptables).length >= 2 && (
          <div className="flex flex-wrap items-center gap-2" data-testid="pureza-adoptar-todas">
            <Button variant="tinted" onClick={() => onAdoptarSeteoTodas(adoptables)}>
              Adoptar seteo de la máquina en {Object.keys(adoptables).length} puertas
            </Button>
            <span className="text-caption text-muted-foreground">
              {Object.entries(adoptables).map(([g, s]) => `G${g} → ${s.calibre} · ${s.quality}`).join(' · ')}
            </span>
          </div>
        )}

        {/* ── Ficha de la puerta elegida ── */}
        {detalle && (
          <DetalleGate
            mix={gateMix} entry={detalle} cfg={gateCfg.get(detalle.gate)} changeBuckets={changeBuckets} causas={causas}
            seteo={seteoDistinto?.[detalle.gate]}
            onAdoptar={onAdoptarSeteo && seteoDistinto?.[detalle.gate] ? () => onAdoptarSeteo(detalle.gate, seteoDistinto[detalle.gate]!) : undefined}
            peso={pesoPorPuerta?.[detalle.gate]}
          />
        )}

        <div className="flex flex-wrap gap-2">
          {(nivelGlobal !== 'ok' || conPesoFuera > 0 || (solapes?.length ?? 0) > 0) && (
            <Button variant="tinted" onClick={registrarIncidencia}>Registrar incidencia con esto</Button>
          )}
          <Button variant="plain" onClick={() => void copiar()} aria-live="polite">
            {copiado ? <CheckCircle2 /> : <Copy />}
            {copiado ? 'Copiado' : 'Copiar resumen'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Barras({ titulo, data, esperado, total }: {
  titulo: string
  data: Record<string, number>
  esperado?: string
  total: number
}) {
  const filas = Object.entries(data).sort((a, b) => b[1] - a[1])
  return (
    <div>
      <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <ul className="mt-1.5 space-y-1.5">
        {filas.map(([k, pz]) => {
          const pct = total > 0 ? (pz / total) * 100 : 0
          const ok = esperado == null || esperado === ANY_CALIBRE || k === esperado
          return (
            <li key={k} className="grid grid-cols-[minmax(0,5.5rem)_1fr_3.5rem] items-center gap-2 text-footnote">
              <span className={cn('truncate', ok ? 'font-semibold text-foreground' : 'text-foreground')}>{k}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn('block h-full rounded-full', ok ? 'bg-primary' : 'bg-ink-crit')}
                  style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
                />
              </span>
              <span className={cn('text-right tabular-nums font-medium', ok ? 'text-foreground' : 'text-ink-crit')}>{fmtPct(pct)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Barras apiladas por bloque: coincide + cada causal. Los ejes toman el color del tema. */
function buildApilado(mix: GateMix, causas: GateCauses, isDark: boolean): EChartsOption {
  const theme = isDark ? 'dark' : 'light'
  const colors = CAUSA_COLOR[theme]
  const text = CHART_TEXT[theme]
  const n = mix.bucketCount
  const horas = Array.from({ length: n }, (_, i) => horaBloque(mix, i))
  const series = [
    { key: 'ok' as const, name: 'Coincide', data: causas.okByBucket },
    ...CAUSA_ORDER
      .filter((t) => causas.byTipoByBucket[t].some((v) => v > 0))
      .map((t) => ({ key: t, name: CAUSA_META[t].label, data: causas.byTipoByBucket[t] })),
  ]
  return {
    backgroundColor: 'transparent',
    animation: false,
    // La leyenda puede ocupar dos líneas a 375 px: el grid arranca debajo.
    grid: { top: 48, bottom: 22, left: 34, right: 8, containLabel: false },
    legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 10, itemGap: 10, textStyle: { color: text.axis, fontSize: 11 } },
    xAxis: { type: 'category', data: horas, axisLabel: { color: text.axis, fontSize: 10, interval: Math.max(0, Math.ceil(n / 8) - 1) }, axisTick: { show: false }, axisLine: { lineStyle: { color: text.grid } } },
    yAxis: { type: 'value', axisLabel: { color: text.axis, fontSize: 10 }, splitLine: { lineStyle: { color: text.grid, type: 'dashed' } }, minInterval: 1 },
    tooltip: {
      trigger: 'axis', backgroundColor: text.tipBg, borderColor: text.tipBorder, textStyle: { color: text.tipText, fontSize: 11 },
      formatter: (params: unknown) => {
        const p = params as Array<{ seriesName: string; value: number; color: string; axisValue: string }>
        if (!p.length) return ''
        const lines = p.filter((s) => s.value > 0).map((s) => `<span style="color:${s.color}">■</span> ${s.seriesName}: <b>${s.value}</b>`)
        return `<b>${p[0]!.axisValue}</b><br/>${lines.join('<br/>')}`
      },
    },
    series: series.map((s) => ({
      type: 'bar', name: s.name, stack: 'pz', data: s.data, itemStyle: { color: colors[s.key] }, emphasis: { disabled: true }, barMaxWidth: 28,
    })),
  }
}

/** Anula los bloques que contienen un cambio de config: no valen como evidencia de caída. */
function sinCambios(purity: ReadonlyArray<number | null>, changeBuckets?: number[]): Array<number | null> {
  if (!changeBuckets?.length) return [...purity]
  const set = new Set(changeBuckets)
  return purity.map((v, i) => (set.has(i) ? null : v))
}

/** Mezcla física: barras dentro / al límite / fuera, con los kilos observados. */
function PorPeso({ peso }: { peso: PesoPorPuerta }) {
  const total = peso.conPeso || 1
  const filas: Array<{ label: string; n: number; cls: string; extra?: string }> = [
    { label: 'Dentro del rango', n: peso.dentro, cls: 'bg-primary' },
    { label: 'Al límite', n: peso.alLimite, cls: 'bg-muted-foreground', extra: `a menos de ${peso.binGrams} g del borde: normal cerca del corte` },
    { label: 'Fuera, más pesado', n: peso.fueraArriba, cls: 'bg-ink-crit', extra: peso.gramosArriba ? `${fmtKg(peso.gramosArriba[0])} a ${fmtKg(peso.gramosArriba[1])}` : undefined },
    { label: 'Fuera, más liviano', n: peso.fueraAbajo, cls: 'bg-ink-crit', extra: peso.gramosAbajo ? `${fmtKg(peso.gramosAbajo[0])} a ${fmtKg(peso.gramosAbajo[1])}` : undefined },
  ].filter((f) => f.n > 0)
  const fuera = pesoAvisa(peso)
  return (
    <div data-testid="pureza-peso">
      <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
        Por peso · rango {peso.rango?.calibre} {peso.rango ? `(${fmtKg(peso.rango.minGrams)} a ${fmtKg(peso.rango.maxGrams)})` : ''}
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {filas.map((f) => (
          <li key={f.label} className="grid grid-cols-[minmax(0,8.5rem)_1fr_3.5rem] items-center gap-2 text-footnote">
            <span className="leading-tight">
              {f.label}
              {f.extra && <span className="block text-caption text-muted-foreground">{f.extra}</span>}
            </span>
            <span className="h-2.5 overflow-hidden rounded-full bg-background">
              <span className={cn('block h-full rounded-full', f.cls)} style={{ width: `${Math.max((f.n / total) * 100, f.n > 0 ? 2 : 0)}%` }} />
            </span>
            <span className="text-right tabular-nums font-medium">{fmtPct((f.n / total) * 100)}</span>
          </li>
        ))}
      </ul>
      <p className={cn('mt-2 text-footnote', fuera ? 'text-ink-warn' : 'text-muted-foreground')}>
        {fuera
          ? `${fmtPct(peso.pctFuera)} de las piezas pesan fuera del rango ${peso.rango?.calibre ?? ''} de la app aunque la máquina las etiquetó así. O el rango del Z2 es más ancho que el de la app (alinear en Configuración del Grader), o es mezcla real.`
          : 'El peso de las piezas cae dentro del rango del calibre asignado.'}
      </p>
    </div>
  )
}

function DetalleGate({ mix, entry, cfg, changeBuckets, causas, seteo, onAdoptar, peso }: {
  mix: GateMix; entry: GateMixEntry; cfg?: GateAssignment; changeBuckets?: number[]; causas?: GateCauses | null
  seteo?: SeteoMaquina; onAdoptar?: () => void; peso?: PesoPorPuerta
}) {
  const { isDark } = useTheme()
  const nivel = nivelDePureza(entry.purityPct)
  const cambios = new Set(changeBuckets ?? [])
  const purezaSinCambios = sinCambios(entry.purityByBucket, changeBuckets)
  const caida = bloqueDeCaida(purezaSinCambios)
  const buckets = entry.purityByBucket
  // Etiquetas del eje: inicio, fin y un par intermedias sin amontonarse.
  const paso = Math.max(1, Math.ceil(buckets.length / 4))
  const mezclaCalibre = entry.assignedCalibre !== ANY_CALIBRE
    && Object.keys(entry.byCalibre).some((k) => k !== entry.assignedCalibre)
  const mezclaCalidad = Object.keys(entry.byQuality).some((k) => k !== entry.assignedQuality)
  const veredicto = seteo
    ? (seteo.noReconocido ? 'Calibre que la app no conoce' : 'Seteo distinto a la máquina')
    : nivel === 'ok'
      ? 'Recibe lo que tiene asignado'
      : nivel === 'none'
        ? 'Sin asignación en este turno'
        : `Mezclada por ${[mezclaCalibre && 'calibre', mezclaCalidad && 'calidad'].filter(Boolean).join(' y ')}`
  const inkVeredicto = seteo ? 'text-ink-info' : NIVEL_INK[nivel]

  return (
    <div className="space-y-4 rounded-card bg-muted p-4" data-testid="pureza-detalle">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-headline">
          G{entry.gate} · {etiquetaAsignacion(entry, cfg)} ·{' '}
          <span className="tabular-nums">{fmtPz(entry.pieces)} pz</span>
        </p>
        <span className={`text-footnote font-semibold ${inkVeredicto}`}>{veredicto}</span>
      </div>

      {seteo?.noReconocido && (
        <div className="space-y-2" data-testid="pureza-seteo">
          <p className="text-footnote">
            El Excel etiqueta el <span className="tabular-nums font-semibold">{fmtPct(seteo.pct)}</span> de las piezas de esta puerta con un
            calibre que la app no conoce (12+ lb o «fuera de rango»), calidad {seteo.quality}. No es mezcla ni seteo
            distinto: falta ese calibre en los rangos de la app (Configuración del Grader). El peso de abajo sí se juzga.
          </p>
        </div>
      )}
      {seteo && !seteo.noReconocido && (
        <div className="space-y-2" data-testid="pureza-seteo">
          <p className="text-footnote">
            La máquina manda <span className="font-semibold">{seteo.calibre} · {seteo.quality}</span> a esta puerta
            (<span className="tabular-nums">{fmtPct(seteo.pct)}</span> de las piezas); el seteo de la app dice{' '}
            <span className="font-semibold">{etiquetaAsignacion(entry, cfg)}</span>. No es mezcla: la pureza de abajo compara
            contra el seteo de la app, no contra la máquina.
          </p>
          {onAdoptar && (
            <Button variant="tinted" onClick={onAdoptar}>Adoptar seteo de la máquina</Button>
          )}
        </div>
      )}

      {/* ¿Por qué cayó acá? Va antes de los desgloses: es la respuesta, los
          desgloses son la evidencia. Solo con gateMix v2 (causas derivadas
          con la config de cada bloque). */}
      {!seteo && causas && causas.groups.length > 0 && (
        <div data-testid="pureza-causas">
          <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">¿Por qué cayó acá?</p>
          <ul className="mt-1.5 space-y-2">
            {causas.groups.map((g) => (
              <li key={`${g.tipo}|${g.value}`} className="text-footnote">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-foreground">{CAUSA_META[g.tipo].label}{g.tipo !== 'sin_dato' && g.tipo !== 'otros' ? ` · ${g.value}` : ''}</span>
                  <span className="tabular-nums text-foreground">{fmtPz(g.pieces)} pz · {fmtPct(g.pct)}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {g.desde == null ? '' : g.parejo ? 'parejo todo el turno' : g.desde === g.hasta ? `en el bloque de las ${horaBloque(mix, g.desde)}` : `entre ${horaBloque(mix, g.desde)} y ${horaBloque(mix, g.hasta!)}`}
                  </span>
                </div>
                <p className="text-muted-foreground">{CAUSA_META[g.tipo].hint(g, entry.gate)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!seteo && causas && causas.judged > 0 && (
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Qué cayó, bloque a bloque</p>
          <div className="mt-1 h-[192px]" data-testid="pureza-apilado">
            <ReactECharts option={buildApilado(mix, causas, isDark)} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} notMerge />
          </div>
        </div>
      )}

      {(!seteo || seteo.noReconocido) && peso && <PorPeso peso={peso} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Barras titulo="Por calibre" data={entry.byCalibre} esperado={entry.assignedCalibre} total={entry.pieces} />
        <Barras titulo="Por calidad" data={entry.byQuality} esperado={entry.assignedQuality} total={entry.pieces} />
      </div>

      {!seteo && entry.purityPct != null && buckets.length > 1 && (
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
            Pureza cada {mix.bucketMinutes} min
          </p>
          <div
            className="mt-2 grid h-12 items-end gap-px"
            style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}
            role="img"
            aria-label={`Pureza de la G${entry.gate} por bloque de ${mix.bucketMinutes} minutos`}
          >
            {buckets.map((v, i) => (
              <span
                key={i}
                title={`${horaBloque(mix, i)} · ${v == null ? 'sin piezas' : fmtPct(v)}${cambios.has(i) ? ' · cambio de gate en este bloque' : ''}`}
                className={cn(
                  'block',
                  v == null ? 'bg-border' : NIVEL_BG[nivelDePureza(v)],
                  cambios.has(i) && 'ring-2 ring-inset ring-primary',
                )}
                style={{ height: v == null ? '15%' : `${Math.max(v, 4)}%` }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-caption tabular-nums text-muted-foreground">
            {buckets.map((_, i) =>
              i % paso === 0 || i === buckets.length - 1
                ? <span key={i}>{horaBloque(mix, i)}</span>
                : null,
            )}
          </div>
          {cambios.size > 0 && (
            <p className="mt-1 text-caption text-muted-foreground">
              <span className="inline-block h-[9px] w-[9px] align-middle ring-2 ring-inset ring-primary mr-1" aria-hidden />
              Cambio de gate en el bloque de las{' '}
              <span className="tabular-nums">{[...cambios].sort((a, b) => a - b).map((i) => horaBloque(mix, i)).join(', ')}</span>:
              ese bloque se lee con cautela y no cuenta para "cae desde".
            </p>
          )}
          <p className="mt-2 text-footnote">
            {caida == null
              ? 'Se mantuvo sobre el umbral todo el turno.'
              : caida === 0
                ? <>Mezclada <span className="font-semibold text-ink-crit">desde el inicio del turno</span>.</>
                : <>Cae desde las <span className="font-semibold text-ink-crit tabular-nums">{horaBloque(mix, caida)}</span>; antes iba en {fmtPct(promedioHasta(purezaSinCambios, caida) ?? 0)}.</>}
          </p>
        </div>
      )}
    </div>
  )
}
