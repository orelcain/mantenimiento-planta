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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { Layers, Copy, CheckCircle2 } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Pill, type PillTone } from '@/components/piel/Pill'
import { Button } from '@/components/piel/Button'
import { Tag, type TagTone } from '@/components/piel/Tag'
import { cn } from '@/lib/utils'
import { copiarTexto } from '@/lib/clipboard'
import { gateMixTotals, ANY_CALIBRE, SIN_DATO, type GateMix, type GateMixEntry } from '@/services/grader/graderGateMix'
import {
  PUREZA_OK_PCT, PUREZA_WARN_PCT, nivelDePureza, bloqueDeCaida, promedioHasta, type NivelPureza as Nivel,
} from '@/services/grader/graderPurezaNivel'
import type { GateAssignment, CalibreWeightRange } from '@/services/grader/types'
import type { P0SinPuerta } from '@/services/grader/graderGate0Store'
import { CAUSA_ORDER, normalizarCalibre, tramosDeCalibre, dimensionIntrusa, bloqueDe, parseWallClock, type CausaTipo, type GateCauses, type GateCauseGroup, type SeteoMaquina, type PesoPorPuerta, type SolapeDeRango, type CambioDePrograma, type MezclaPuerta, type MapaPeso, type DimensionMezcla, type GateObservations, type ComposicionCombo, type TramoCalibre } from '@/services/grader/graderGateObservations'
import type { FirestorePieceRecord } from '@/services/grader/graderDailySummary.service'

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
  /** Cambios de programa del Z2 dentro del turno que nadie registró en la app. */
  cambios?: CambioDePrograma[]
  /** Registrar ese cambio como snapshot a la hora en que la máquina lo hizo. Supervisor/admin. */
  onRegistrarCambio?: (cambio: CambioDePrograma) => void
  /** Mezcla en los tres ejes (calibre · calidad · conservación), derivada de la observación. */
  mezcla?: Record<number, MezclaPuerta>
  /** Observación cruda del turno (para juzgar piezas sueltas con la misma regla). */
  obs?: GateObservations
  /** Mapa peso × tiempo de una puerta, 0 lecturas. */
  mapaPeso?: (gate: number) => MapaPeso | null
  /** Piezas ya cargadas por puerta (nivel 2, bajo demanda). */
  piezas?: Record<number, FirestorePieceRecord[]>
  piezasCargando?: number | null
  onCargarPiezas?: (gate: number) => void
  /** Rangos de calibre vigentes: cada pieza se juzga «fuera de rango» contra el calibre que regía en SU bloque. */
  rangos?: CalibreWeightRange[]
  /** P0 cuyo calibre por peso no tiene puerta asignada (decisión de seteo, no falla). */
  p0SinPuerta?: P0SinPuerta[]
  /** Hasta qué hora llegan las piezas (ISO wall-clock del turno). Sin esto se usa el fin del último bloque. */
  hastaIso?: string
}

/** Desde este % de piezas fuera del rango por peso, la baldosa lo dice. */
/** Un intruso de ≥ 2 % se nombra en el mosaico aunque la puerta siga en verde: es lo que se vino a ver. */
const INTRUSO_VISIBLE_PCT = 2
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

export function PurezaPorPuertaCard({ gateMix, gates, turnoLabel, changeBuckets, causesFor, seteoDistinto, onAdoptarSeteo, onAdoptarSeteoTodas, pesoPorPuerta, solapes, inferidas, cambios, onRegistrarCambio, mezcla, obs, mapaPeso, piezas, piezasCargando, onCargarPiezas, rangos, p0SinPuerta, hastaIso }: Props) {
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
  // Con mezcla en tres ejes, el titular cuenta lo que coincide en los tres.
  const totMezcla = useMemo(() => {
    if (!mezcla) return null
    let coinciden = 0, juzgadas = 0
    for (const m of Object.values(mezcla)) {
      if (m.pct == null) continue
      coinciden += m.coinciden
      juzgadas += Math.round((m.coinciden * 100) / Math.max(0.01, m.pct))
    }
    return juzgadas > 0 ? { coinciden, juzgadas, pct: (coinciden / juzgadas) * 100 } : null
  }, [mezcla])
  const pctDe = (e: GateMixEntry) => mezcla?.[e.gate]?.pct ?? e.purityPct
  // Una puerta con seteo distinto no cuenta como mezclada: es otra cosa.
  const conteo = useMemo(() => {
    let crit = 0, warn = 0, seteo = 0, noRec = 0, intrusas = 0
    for (const e of gateMix.gates) {
      if (seteoDistinto?.[e.gate]) { if (seteoDistinto[e.gate]!.noReconocido) noRec++; else seteo++; continue }
      const n = nivelDePureza(pctDe(e))
      if (n === 'crit') crit++
      else if (n === 'warn') warn++
      for (const c of mezcla?.[e.gate]?.composicion ?? []) if (c.intrusa) intrusas += c.pieces
    }
    return { crit, warn, seteo, noRec, intrusas }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateMix, seteoDistinto, mezcla])

  // Arranca abierta en la peor puerta MEZCLADA; si no hay, en la primera con
  // seteo distinto: es lo que el usuario vino a ver.
  const peor = useMemo(() => {
    const conPureza = gateMix.gates.filter((e) => pctDe(e) != null && !seteoDistinto?.[e.gate])
    if (conPureza.length > 0) {
      const min = conPureza.reduce((a, b) => (pctDe(b)! < pctDe(a)! ? b : a))
      if (nivelDePureza(pctDe(min)) !== 'ok') return min.gate
    }
    const conSeteo = gateMix.gates.find((e) => seteoDistinto?.[e.gate])
    return conSeteo?.gate ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateMix, seteoDistinto, mezcla])
  const [seleccion, setSeleccion] = useState<number | null>(peor)
  const detalle = seleccion != null ? byGate.get(seleccion) : undefined
  const causas = useMemo(() => (detalle && causesFor ? causesFor(detalle.gate) : null), [detalle, causesFor])

  // Hasta qué hora hay piezas: con el Excel cargado a mitad de turno, es lo
  // primero que hay que saber para leer el resto.
  const datosHasta = useMemo(() => {
    // La hora real de la última pieza, si el turno la trae: «hasta las 00:00»
    // cuando el Excel llegaba a las 23:37 hacía creer que faltaban 23 min.
    if (hastaIso && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(hastaIso)) return hastaIso.slice(11, 16)
    let last = -1
    for (const e of gateMix.gates) e.purityByBucket.forEach((v, i) => { if (v != null && i > last) last = i })
    if (last < 0) return null
    const ms = Date.parse(gateMix.bucketsFrom) + (last + 1) * gateMix.bucketMinutes * 60_000
    return new Date(ms).toISOString().slice(11, 16)
  }, [gateMix, hastaIso])

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
  // Un solo aviso en la píldora, el más grave; el resto en una nota debajo.
  // Medido 09-09: con seis avisos del mismo peso («1 con mezcla · 411 pz
  // intrusas · 2 en atención · 3 con peso fuera · solapados · 1 cambio sin
  // registrar») no se priorizaba nada. El solape del Z2 no compite: es un
  // aviso fijo mientras la máquina siga así y tiene su bloque propio.
  const avisos = [
    (cambios?.length ?? 0) > 0 ? `${cambios!.length} cambio${cambios!.length > 1 ? 's' : ''} de programa sin registrar` : '',
    conteo.crit > 0 ? `${conteo.crit} con mezcla${conteo.intrusas > 0 ? ` · ${fmtPz(conteo.intrusas)} pz intrusas` : ''}` : '',
    conteo.warn > 0 ? `${conteo.warn} en atención` : '',
    conteo.seteo > 0 ? `${conteo.seteo} con seteo ≠ máquina` : '',
    conteo.noRec > 0 ? `${conteo.noRec} con calibre no reconocido` : '',
    conPesoFuera > 0 ? `${conPesoFuera} con peso fuera de rango` : '',
  ].filter(Boolean)
  const resumenPill = avisos[0] ?? (conJuicio ? 'Todas puras' : 'Sin seteo guardado')
  const notaAvisos = avisos.slice(1).join(' · ')
  // Sin ninguna puerta juzgada no hay "Todas puras" que valga.
  const pillToneFinal: PillTone = !conJuicio ? 'neutral' : pillTone

  const resumenTexto = () => {
    const lineas = [
      `Pureza por puerta · Grader · ${turnoLabel}`,
      totals.purityPct != null
        ? `Coinciden con lo asignado: ${fmtPz(totals.match)} / ${fmtPz(totals.pieces)} pz (${fmtPct(totals.purityPct)})`
        : '',
    ]
    for (const c of cambios ?? []) {
      lineas.push(`G${c.gate}: la máquina cambió el programa a ${c.nuevo.calibre} · ${c.nuevo.quality} desde las ${horaBloque(gateMix, c.desde)} (${fmtPct(c.nuevo.pct)} de ${fmtPz(c.piezasDesde)} pz); el seteo dice ${c.asignado.calibre} · ${c.asignado.quality}`)
    }
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
        {notaAvisos && <p className="text-caption text-muted-foreground" data-testid="pureza-avisos">También: {notaAvisos}.</p>}
        {totMezcla ? (
          <p className="text-footnote text-muted-foreground">
            Coinciden en calibre, calidad y conservación:{' '}
            <span className="text-foreground font-medium tabular-nums">{fmtPz(totMezcla.coinciden)} / {fmtPz(totMezcla.juzgadas)} pz</span>
            {' '}<span className="tabular-nums">({fmtPct(totMezcla.pct)})</span>
            {datosHasta && <> · piezas hasta las <span className="tabular-nums text-foreground">{datosHasta}</span></>}
          </p>
        ) : totals.purityPct != null && (
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
            const m = mezcla?.[n]
            const pctTile = m?.pct ?? e?.purityPct ?? null
            const nivel = nivelDePureza(pctTile)
            const activa = seleccion === n
            const intruso = m?.peorIntruso ? textoDimension(m.peorIntruso) : e ? textoIntruso(e, true) : null
            const ink = seteo ? 'text-ink-info' : NIVEL_INK[nivel]
            const dot = seteo ? 'bg-ink-info' : NIVEL_BG[nivel]
            const pw = pesoPorPuerta?.[n]
            const pesoFuera = pesoAvisa(pw) && !seteo ? pw : null
            const linea1 = m?.dominante && !seteo ? etiquetaCombo(m.dominante) : etiquetaAsignacion(e, gateCfg.get(n))
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
                  {pctTile != null ? fmtPctEntero(pctTile) : '—'}
                </span>
                <span className="w-full text-caption leading-tight text-foreground">
                  {linea1}
                  {inferidas?.[n] && <span className="text-muted-foreground"> · inferido</span>}
                </span>
                {seteo ? (
                  <span className="w-full text-caption font-medium leading-tight text-ink-info">{seteo.noReconocido ? 'calibre no reconocido' : 'seteo ≠ máquina'}</span>
                ) : intruso && (nivel !== 'ok' || (m?.peorIntruso && m.peorIntruso.pct >= INTRUSO_VISIBLE_PCT)) ? (
                  <span className={`w-full text-caption font-medium leading-tight ${m?.peorIntruso ? DIM_INK[m.peorIntruso.dim] : NIVEL_INK[nivel]}`}>{intruso}</span>
                ) : pesoFuera ? (
                  <span className="w-full text-caption font-medium leading-tight text-ink-warn">{fmtPctEntero(pesoFuera.pctFuera)} fuera por peso</span>
                ) : (
                  <span className="text-caption text-muted-foreground tabular-nums">
                    {e ? `${fmtPz(e.pieces)} pz` : 'sin piezas'}
                  </span>
                )}
                {m && m.composicion.length > 0 && !seteo && <TiraComposicion composicion={m.composicion} alta={false} />}
              </button>
            )
          })}
        </div>

        <p className="text-footnote text-muted-foreground">
          {mezcla
            ? <>El número es el % de piezas que coinciden en <span className="text-foreground">calibre, calidad y conservación</span>. Calibre y calidad se juzgan contra el seteo; la conservación, si el seteo no la fija, contra la dominante de cada bloque de 30 min (un cambio de lote no es mezcla). ≥{PUREZA_OK_PCT} % pura · {PUREZA_WARN_PCT}–{PUREZA_OK_PCT} % en atención · &lt;{PUREZA_WARN_PCT} % con mezcla.</>
            : <>Pureza = piezas con el calibre <span className="text-foreground">y</span> la calidad asignados ÷ piezas que cayeron en la puerta. ≥{PUREZA_OK_PCT} % pura · {PUREZA_WARN_PCT}–{PUREZA_OK_PCT} % en atención · &lt;{PUREZA_WARN_PCT} % mezclada.</>}
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

        {p0SinPuerta && p0SinPuerta.length > 0 && (
          <div className="rounded-ctl bg-muted px-3 py-2 text-footnote" data-testid="pureza-p0-sin-puerta">
            <p className="font-semibold text-foreground">Rechazos sin puerta</p>
            {p0SinPuerta.map((p) => (
              <p key={p.calibre} className="text-muted-foreground">
                <span className="tabular-nums text-foreground">{fmtPz(p.pieces)} pz</span> de{' '}
                <span className="text-foreground">{p.calibre}</span> ({fmtKg(p.minG)}–{fmtKg(p.maxG)}) cayeron a P0 porque ninguna puerta tiene{' '}
                {p.calibre} asignado. No es falla: decidir si va una puerta para ese calibre o si el rechazo se asume.
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
            cambio={cambios?.find((c) => c.gate === detalle.gate)}
            onRegistrarCambio={onRegistrarCambio}
            mezclaPuerta={mezcla?.[detalle.gate]}
            mapa={mapaPeso?.(detalle.gate) ?? null}
            obs={obs}
            piezas={piezas?.[detalle.gate]}
            piezasCargando={piezasCargando === detalle.gate}
            onCargarPiezas={onCargarPiezas}
            rangos={rangos}
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

function DetalleGate({ mix, entry, cfg, changeBuckets, causas, seteo, onAdoptar, peso, cambio, onRegistrarCambio, mezclaPuerta, mapa, obs, piezas, piezasCargando, onCargarPiezas, rangos }: {
  mix: GateMix; entry: GateMixEntry; cfg?: GateAssignment; changeBuckets?: number[]; causas?: GateCauses | null
  seteo?: SeteoMaquina; onAdoptar?: () => void; peso?: PesoPorPuerta
  cambio?: CambioDePrograma; onRegistrarCambio?: (c: CambioDePrograma) => void
  mezclaPuerta?: MezclaPuerta; mapa?: MapaPeso | null; obs?: GateObservations
  piezas?: FirestorePieceRecord[]; piezasCargando?: boolean; onCargarPiezas?: (gate: number) => void; rangos?: CalibreWeightRange[]
}) {
  const { isDark } = useTheme()
  const nivel = nivelDePureza(mezclaPuerta?.pct ?? entry.purityPct)
  const cambios = new Set(changeBuckets ?? [])
  const purezaSinCambios = sinCambios(entry.purityByBucket, changeBuckets)
  const caida = bloqueDeCaida(purezaSinCambios)
  /* Un tramo por calibre asignado: la banda del mapa sigue los cambios de
     programa en vez de aplicar el último rango a todo el turno. Si no hay
     mezcla derivada (sin referencias por bloque) cae al rango único de `peso`. */
  const tramosPeso = useMemo<TramoCalibre[]>(() => {
    if (!mapa) return []
    const porBloque = mezclaPuerta && rangos ? tramosDeCalibre(mapa.celdas, mezclaPuerta.referencias, rangos) : []
    if (porBloque.length > 0) return porBloque
    return peso?.rango ? [{ desde: 0, hasta: mapa.celdas.length - 1, ...peso.rango }] : []
  }, [mapa, mezclaPuerta, rangos, peso])
  const mezclaCalibre = entry.assignedCalibre !== ANY_CALIBRE
    && Object.keys(entry.byCalibre).some((k) => k !== entry.assignedCalibre)
  const mezclaCalidad = Object.keys(entry.byQuality).some((k) => k !== entry.assignedQuality)
  const dimsMezcla = mezclaPuerta
    ? [...new Set(mezclaPuerta.composicion.filter((c) => c.intrusa && c.dim).map((c) => DIM_LABEL[c.dim!]))].join(' y ') || 'calibre o calidad'
    : [mezclaCalibre && 'calibre', mezclaCalidad && 'calidad'].filter(Boolean).join(' y ')
  const veredicto = seteo
    ? (seteo.noReconocido ? 'Calibre que la app no conoce' : 'Seteo distinto a la máquina')
    : nivel === 'ok'
      ? 'Recibe lo que tiene asignado'
      : nivel === 'none'
        ? 'Sin asignación en este turno'
        : `Mezclada por ${dimsMezcla}`
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

      {mezclaPuerta && !seteo && mezclaPuerta.composicion.length > 0 && (
        <div className="space-y-2">
          <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Qué llegó a esta puerta</p>
          <TiraComposicion composicion={mezclaPuerta.composicion} alta />
          <LeyendaComposicion m={mezclaPuerta} />
          {mezclaPuerta.composicion.length === 1 ? (
            <p className="text-footnote text-ink-ok">Una sola combinación: calibre, calidad y conservación coinciden con lo asignado.</p>
          ) : !mezclaPuerta.fijaConservacion && mezclaPuerta.composicion.some((c) => c.conservation) ? (
            <p className="text-caption text-muted-foreground">La asignación no fija conservación: se marca la minoritaria de cada bloque de 30 min, así un cambio de lote no cuenta como mezcla.</p>
          ) : null}
        </div>
      )}

      {cambio && (
        <div className="space-y-2" data-testid="pureza-cambio">
          <p className="text-footnote">
            La máquina cambió el programa de esta puerta a{' '}
            <span className="font-semibold">{cambio.nuevo.calibre} · {cambio.nuevo.quality}</span> desde las{' '}
            <span className="tabular-nums font-semibold">{horaBloque(mix, cambio.desde)}</span>{' '}
            (<span className="tabular-nums">{fmtPct(cambio.nuevo.pct)}</span> de las {fmtPz(cambio.piezasDesde)} pz desde entonces);
            el seteo de la app sigue diciendo {cambio.asignado.calibre} · {cambio.asignado.quality}. No es mezcla: es un cambio sin
            registrar. Registrarlo desde esa hora corrige la pureza y las causas de P0.
          </p>
          {onRegistrarCambio && (
            <Button variant="tinted" onClick={() => onRegistrarCambio(cambio)}>
              Registrar cambio desde las {horaBloque(mix, cambio.desde)}
            </Button>
          )}
        </div>
      )}

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
          {entry.purityPct != null && (
            <p className="mt-1 text-footnote" data-testid="pureza-caida">
              {caida == null
                ? 'Se mantuvo sobre el umbral todo el turno.'
                : caida === 0
                  ? <>Mezclada <span className="font-semibold text-ink-crit">desde el inicio del turno</span>.</>
                  : <>Cae desde las <span className="font-semibold text-ink-crit tabular-nums">{horaBloque(mix, caida)}</span>; antes iba en {fmtPct(promedioHasta(purezaSinCambios, caida) ?? 0)}.</>}
              {cambios.size > 0 && <span className="text-muted-foreground"> Cambio de gate a las {[...cambios].sort((a, b) => a - b).map((i) => horaBloque(mix, i)).join(', ')}: ese bloque no cuenta para «cae desde».</span>}
            </p>
          )}
        </div>
      )}

      {(!seteo || seteo.noReconocido) && peso && !mapa && <PorPeso peso={peso} />}

      {mapa && (!seteo || seteo.noReconocido) && (
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Peso, bloque a bloque</p>
          <div className="mt-1"><MapaPesoSvg mapa={mapa} mix={mix} tramos={tramosPeso} /></div>
          {peso && (
            <p className={cn('mt-1 text-footnote', pesoAvisa(peso) ? 'text-ink-warn' : 'text-muted-foreground')} data-testid="pureza-peso-frase">
              {pesoAvisa(peso)
                ? `${fmtPct(peso.pctFuera)} de las piezas pesan fuera ${tramosPeso.length > 1 ? 'del rango del calibre asignado en cada bloque' : `del rango ${peso.rango?.calibre ?? ''} de la app`}${peso.gramosAbajo ? ` (más livianas: ${fmtKg(peso.gramosAbajo[0])} a ${fmtKg(peso.gramosAbajo[1])})` : ''}${peso.gramosArriba ? ` (más pesadas: ${fmtKg(peso.gramosArriba[0])} a ${fmtKg(peso.gramosArriba[1])})` : ''}. O el rango del Z2 es más ancho que el de la app, o es mezcla real.`
                : 'El peso de las piezas cae dentro del rango del calibre asignado.'}
            </p>
          )}
          <p className="text-caption text-muted-foreground">Bins de {mapa.binGrams} g × bloques de {mix.bucketMinutes} min.</p>
        </div>
      )}

      {!mezclaPuerta && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Barras titulo="Por calibre" data={entry.byCalibre} esperado={entry.assignedCalibre} total={entry.pieces} />
          <Barras titulo="Por calidad" data={entry.byQuality} esperado={entry.assignedQuality} total={entry.pieces} />
        </div>
      )}


      {obs && mezclaPuerta && !seteo && (
        <PiezasDePuerta
          obs={obs} m={mezclaPuerta} piezas={piezas} cargando={!!piezasCargando}
          onCargar={onCargarPiezas ? () => onCargarPiezas(entry.gate) : undefined}
          rango={peso?.rango ?? undefined} rangos={rangos} focoMs={cambio ? cambio.desdeMs : undefined} isDark={isDark}
        />
      )}
    </div>
  )
}

// ── Mezcla en los tres ejes: composición, mapa de peso y piezas ─────────────
//
// Tonos por dimensión (mockup 08-09, medidos contra index.css): calibre 6
// púrpura, calidad 3 índigo, conservación 7 teal (frío = tono frío), no
// reconocido 5 rosa. Los tonos 1/2 chocan con --brand/--ink-ok y en oscuro
// --cat-4-ink es byte-idéntico a --ink-warn, que acá ya significa «fuera por peso».
const DIM_TONE: Record<DimensionMezcla, TagTone> = { calibre: 6, calidad: 3, conservacion: 7, otros: 5 }
const DIM_INK: Record<DimensionMezcla, string> = { calibre: 'text-cat-6-ink', calidad: 'text-cat-3-ink', conservacion: 'text-cat-7-ink', otros: 'text-cat-5-ink' }
const DIM_VAR: Record<DimensionMezcla, string> = { calibre: 'rgb(var(--cat-6-ink))', calidad: 'rgb(var(--cat-3-ink))', conservacion: 'rgb(var(--cat-7-ink))', otros: 'rgb(var(--cat-5-ink))' }
const DIM_LABEL: Record<DimensionMezcla, string> = { calibre: 'calibre', calidad: 'calidad', conservacion: 'conservación', otros: 'no reconocido' }

const minus = (s: string) => (s === s.toUpperCase() ? s.toLowerCase() : s)

/** «43 % fresco», «14 % 10-12 lb», «6 % Grado»: la dimensión la dice el valor. */
function textoDimension(p: NonNullable<MezclaPuerta['peorIntruso']>): string {
  return `${fmtPctEntero(p.pct)} ${p.dim === 'otros' ? 'no reconocido' : minus(p.value)}`
}

function etiquetaCombo(c: { calibre: string; quality: string; conservation?: string }): string {
  const cal = c.calibre === ANY_CALIBRE ? 'todo calibre' : c.calibre.replace(' lb', '')
  return [cal, c.quality, c.conservation ? minus(c.conservation) : null].filter(Boolean).join(' · ')
}

/** Tira de composición: lo que coincide en azul de marca, cada intruso en el tono de su dimensión. */
function TiraComposicion({ composicion, alta }: { composicion: ComposicionCombo[]; alta: boolean }) {
  return (
    <div
      className={cn('flex w-full overflow-hidden rounded-full bg-border', alta ? 'h-[22px]' : 'mt-1 h-1.5')}
      role="img"
      aria-label={composicion.map((c) => `${etiquetaCombo(c)} ${fmtPct(c.pct)}${c.intrusa ? ' intrusa' : ''}`).join(', ')}
    >
      {composicion.map((c, i) => (
        <span
          key={c.key}
          className={cn('flex items-center justify-center text-caption font-semibold tabular-nums text-white', !c.intrusa && 'bg-primary', !c.intrusa && i > 0 && 'opacity-60')}
          style={{ width: `${c.pct}%`, ...(c.intrusa && c.dim ? { backgroundColor: DIM_VAR[c.dim] } : {}) }}
        >
          {alta && c.pct >= 12 ? fmtPctEntero(c.pct) : ''}
        </span>
      ))}
    </div>
  )
}

function LeyendaComposicion({ m }: { m: MezclaPuerta }) {
  return (
    <ul className="space-y-1" data-testid="pureza-composicion">
      {m.composicion.map((c) => (
        <li key={c.key} className="flex items-center gap-2 text-footnote">
          <span
            aria-hidden
            className={cn('h-2.5 w-2.5 shrink-0', c.intrusa ? 'rotate-45' : 'rounded-full bg-primary')}
            style={c.intrusa && c.dim ? { backgroundColor: DIM_VAR[c.dim] } : undefined}
          />
          <span className="min-w-0 flex-1 truncate">
            {etiquetaCombo(c)}
            {!c.intrusa && <span className="text-muted-foreground"> · coincide</span>}
          </span>
          {c.intrusa && c.dim && <Tag tone={DIM_TONE[c.dim]}>{DIM_LABEL[c.dim]}</Tag>}
          <span className="tabular-nums text-muted-foreground">{fmtPz(c.pieces)}</span>
        </li>
      ))}
    </ul>
  )
}

/** Mapa peso × tiempo: bins de 100 g × bloques de 30 min del agregado ya descargado. 0 lecturas. */
/**
 * Mapa de peso: una columna por bloque, una fila por bin de gramos, opacidad =
 * piezas. La banda encuadra el rango del calibre asignado en cada tramo.
 *
 * El SVG se dibuja al ancho REAL del contenedor (no un viewBox de 343 estirado
 * al 100 %): con el viewBox escalado, en el PC todo se multiplicaba por ~3,2 y
 * los «5.5» y el «kg» salían a 32 px (Orel, 09-09). Dibujando a escala 1:1 el
 * texto queda en 10 px siempre y el ancho de más se gasta en celdas anchas y
 * en más etiquetas de hora.
 */
function MapaPesoSvg({ mapa, mix, tramos }: { mapa: MapaPeso; mix: GateMix; tramos: TramoCalibre[] }) {
  const box = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setAncho(el.clientWidth))
    ro.observe(el)
    setAncho(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  // Escala 1:1 con el contenedor: cualquier mínimo por encima del ancho real
  // vuelve a escalar (con 300 el texto salía a 12 px en un hueco de 246).
  // 246 = el ancho de la tarjeta a 375 px, mientras no haya medición.
  const W = Math.round(Math.min(1200, Math.max(200, ancho || 246)))
  const H = W < 520 ? 176 : 240
  // TOP deja aire para el 'kg', que a 11 px se pisaba con el tick de arriba.
  const L = 36, R = 6, TOP = 20, B = 24
  // Como mucho ~28 filas: si el rango de pesos es más ancho, se agrupan bins.
  const filasCrudas = Math.round((mapa.maxG - mapa.minG) / mapa.binGrams) + 1
  const k = Math.max(1, Math.ceil(filasCrudas / 28))
  const paso = mapa.binGrams * k
  const lo = Math.floor(mapa.minG / paso) * paso
  const hi = Math.floor(mapa.maxG / paso) * paso + paso
  const nb = Math.max(1, Math.round((hi - lo) / paso))
  const cols = mapa.celdas.length
  const cw = (W - L - R) / Math.max(1, cols)
  const ch = (H - TOP - B) / nb
  const y = (g: number) => TOP + ((hi - g) / paso) * ch
  const celdas: Array<{ r: number; c: number; n: number }> = []
  let max = 0
  mapa.celdas.forEach((row, c) => {
    if (!row) return
    const acc = new Map<number, number>()
    for (const [g, n] of Object.entries(row)) {
      const r = Math.min(nb - 1, Math.max(0, Math.floor((hi - Number(g) - 1) / paso)))
      acc.set(r, (acc.get(r) ?? 0) + n)
    }
    for (const [r, n] of acc) { celdas.push({ r, c, n }); if (n > max) max = n }
  })
  const ticks: number[] = []
  const tickPaso = Math.max(paso, Math.ceil(nb / 5) * paso)
  for (let g = hi; g >= lo; g -= tickPaso) ticks.push(g)
  // Una etiqueta de hora cada ~46 px: en el PC salen todas, en 375 px cuatro.
  const cabenX = Math.max(2, Math.floor((W - L - R) / 50))
  const etiquetasX = Array.from({ length: cols }, (_, i) => i).filter((i) => i % Math.max(1, Math.ceil(cols / cabenX)) === 0)
  const bandas = tramos.map((t) => {
    const top = Math.max(TOP, y(t.maxGrams))
    const bot = Math.min(H - B, y(t.minGrams))
    const x0 = L + t.desde * cw
    const x1 = L + Math.min(cols, t.hasta + 1) * cw
    return { t, top, bot, x0, x1 }
  }).filter((b) => b.bot > b.top && b.x1 > b.x0)
  const unaBanda = bandas.length === 1
  return (
    <div ref={box} className="w-full">
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ maxWidth: '100%' }} role="img" className="text-muted-foreground" data-testid="pureza-mapa-peso"
      aria-label={`Mapa de peso por bloque de ${mix.bucketMinutes} minutos de la puerta ${mapa.gate}${tramos.length > 1 ? `, con ${tramos.length} tramos de calibre` : ''}`}>
      {bandas.map(({ t, top, bot, x0, x1 }) => (
        <g key={`${t.desde}-${t.calibre}`}>
          <rect x={x0.toFixed(1)} y={top.toFixed(1)} width={(x1 - x0).toFixed(1)} height={(bot - top).toFixed(1)} fill="currentColor" opacity="0.10" />
          <line x1={x0.toFixed(1)} x2={x1.toFixed(1)} y1={top.toFixed(1)} y2={top.toFixed(1)} stroke="currentColor" strokeOpacity="0.5" strokeDasharray="3 3" />
          <line x1={x0.toFixed(1)} x2={x1.toFixed(1)} y1={bot.toFixed(1)} y2={bot.toFixed(1)} stroke="currentColor" strokeOpacity="0.5" strokeDasharray="3 3" />
          {/* Con una sola banda la etiqueta va al margen derecho, como siempre;
              con varias, centrada en su tramo y solo si el tramo le da ancho. */}
          {unaBanda ? (
            <text x={W - R - 3} y={(top + bot) / 2 + 3.5} textAnchor="end" fontSize="11" fontWeight="600" fill="currentColor" opacity="0.8">rango {t.calibre}</text>
          ) : x1 - x0 >= 58 ? (
            <text x={((x0 + x1) / 2).toFixed(1)} y={(top + bot) / 2 + 3.5} textAnchor="middle" fontSize="11" fontWeight="600" fill="currentColor" opacity="0.8">{t.calibre}</text>
          ) : null}
        </g>
      ))}
      {celdas.map(({ r, c, n }) => (
        <rect key={`${r}-${c}`} x={(L + c * cw).toFixed(1)} y={(TOP + r * ch).toFixed(1)} width={Math.max(0.5, cw - 0.6).toFixed(1)} height={Math.max(0.5, ch - 0.6).toFixed(1)} rx="1.5"
          fill="rgb(var(--brand))" opacity={(0.14 + 0.78 * Math.pow(n / max, 0.72)).toFixed(2)} />
      ))}
      {ticks.map((g) => (
        <text key={g} x={L - 5} y={(y(g) + 3.5).toFixed(1)} textAnchor="end" fontSize="11" fill="currentColor" className="tabular-nums">{(g / 1000).toFixed(1)}</text>
      ))}
      {etiquetasX.map((i) => (
        <text key={i} x={(L + (i + 0.5) * cw).toFixed(1)} y={H - 8} textAnchor="middle" fontSize="11" fill="currentColor" className="tabular-nums">{horaBloque(mix, i)}</text>
      ))}
      <text x={L - 5} y="11" textAnchor="end" fontSize="11" fill="currentColor" opacity="0.8">kg</text>
    </svg>
    </div>
  )
}

const VENTANA_PIEZAS_MS = 90 * 60_000

interface PiezaJuzgada { x: number; y: number | null; dim?: DimensionMezcla; fuera: boolean; combo: string; ts: string }

function juzgarPiezas(piezas: FirestorePieceRecord[], obs: GateObservations, m: MezclaPuerta, rango?: { minGrams: number; maxGrams: number }, rangos?: CalibreWeightRange[]): PiezaJuzgada[] {
  return piezas.map((r) => {
    const x = parseWallClock(r.ts)
    const y = r.weightPerPieceGrams ?? (r.weightKg != null ? (r.weightKg * 1000) / Math.max(1, r.pieces || 1) : null)
    const b = bloqueDe(obs, x)
    const ref = b >= 0 ? m.referencias[b] ?? null : null
    const combo = { calibre: normalizarCalibre(r.calibre ?? SIN_DATO), quality: r.quality ?? SIN_DATO, conservation: r.conservation }
    const dim = ref ? dimensionIntrusa(combo, ref) : undefined
    // El rango que manda es el del calibre asignado en el bloque de la pieza (la G4 fue 8-10 hasta las 03:30 y 6-8 después).
    const rangoBloque = (ref?.calibre && rangos?.find((r) => r.calibre === ref.calibre)) || rango
    const fuera = !!rangoBloque && y != null && (y < rangoBloque.minGrams || y >= rangoBloque.maxGrams)
    return { x, y, dim, fuera, combo: etiquetaCombo(combo), ts: r.ts }
  })
}

/**
 * Nivel 2: cada pieza de la puerta, cargada bajo demanda (cuesta tantas
 * lecturas como piezas). Círculo = coincide · rombo = intrusa (tono de su
 * dimensión) · anillo ámbar = fuera del rango por peso. Ventana inicial de
 * 90 min sobre la primera intrusa (o el cambio de programa), porque 2.300
 * puntos en 375 px son una mancha.
 */
function PiezasDePuerta({ obs, m, piezas, cargando, onCargar, rango, rangos, focoMs, isDark }: {
  obs: GateObservations; m: MezclaPuerta; piezas?: FirestorePieceRecord[]; cargando: boolean
  onCargar?: () => void; rango?: { minGrams: number; maxGrams: number; calibre: string }; rangos?: CalibreWeightRange[]; focoMs?: number; isDark: boolean
}) {
  const [soloIntrusas, setSoloIntrusas] = useState(false)
  const juzgadas = useMemo(() => (piezas && piezas.length ? juzgarPiezas(piezas, obs, m, rango, rangos) : []), [piezas, obs, m, rango, rangos])
  const option = useMemo<EChartsOption>(() => {
    const th = isDark ? 'dark' : 'light'
    const colores = CAUSA_COLOR[th]
    const texto = CHART_TEXT[th]
    const warn = isDark ? '#ff9f0a' : '#974608'
    const visibles = soloIntrusas ? juzgadas.filter((p) => p.dim) : juzgadas
    const grupos = new Map<string, { name: string; symbol: string; color: string; fuera: boolean; data: Array<[number, number, string, string]> }>()
    for (const p of visibles) {
      if (p.y == null) continue
      const k = `${p.dim ?? 'ok'}|${p.fuera ? 1 : 0}`
      let g = grupos.get(k)
      if (!g) {
        const color = p.dim ? colores[p.dim === 'calibre' ? 'calibre_lejano' : p.dim === 'calidad' ? 'calidad' : p.dim === 'conservacion' ? 'conservacion' : 'otros'] : texto.axis
        g = { name: (p.dim ? `intrusa por ${DIM_LABEL[p.dim]}` : 'coincide') + (p.fuera ? ' · fuera de rango' : ''), symbol: p.dim ? 'diamond' : 'circle', color, fuera: p.fuera, data: [] }
        grupos.set(k, g)
      }
      g.data.push([p.x, p.y, p.combo, p.ts])
    }
    const xs = juzgadas.map((p) => p.x)
    const min = xs.length ? Math.min(...xs) : 0
    const max = xs.length ? Math.max(...xs) : 0
    const foco = focoMs ?? juzgadas.find((p) => p.dim)?.x ?? min
    const start = Math.max(min, Math.min(foco - VENTANA_PIEZAS_MS / 3, max - VENTANA_PIEZAS_MS))
    const end = Math.min(max, start + VENTANA_PIEZAS_MS)
    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: { left: 44, right: 10, top: 10, bottom: 28 },
      tooltip: {
        trigger: 'item', backgroundColor: texto.tipBg, borderColor: texto.tipBorder, textStyle: { color: texto.tipText, fontSize: 11 },
        formatter: (params: unknown) => {
          const v = (params as { value: [number, number, string, string]; seriesName: string }).value
          return `<b>${new Date(v[3]).toISOString().slice(11, 19)}</b> · ${Math.round(v[1])} g<br/>${v[2]}<br/>${(params as { seriesName: string }).seriesName}`
        },
      },
      dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none', startValue: start, endValue: end }],
      xAxis: { type: 'time', min, max, axisLabel: { color: texto.axis, fontSize: 10, formatter: (v: number) => new Date(v).toISOString().slice(11, 16) }, axisLine: { lineStyle: { color: texto.grid } }, splitLine: { show: false } },
      yAxis: { type: 'value', scale: true, axisLabel: { color: texto.axis, fontSize: 10, formatter: (v: number) => `${(v / 1000).toFixed(1)}` }, splitLine: { lineStyle: { color: texto.grid, type: 'dashed' } }, axisLine: { show: false }, axisTick: { show: false } },
      series: [
        ...(rango ? [{
          type: 'line' as const, data: [], markArea: { silent: true, itemStyle: { color: texto.axis, opacity: 0.10 }, data: [[{ yAxis: rango.minGrams }, { yAxis: rango.maxGrams }]] as [[{ yAxis: number }, { yAxis: number }]] },
          markLine: focoMs != null && focoMs !== juzgadas.find((p) => p.dim)?.x ? { silent: true, symbol: 'none', lineStyle: { color: isDark ? '#5aa0dc' : '#2e75b6', type: 'dashed' as const }, label: { show: false }, data: [{ xAxis: focoMs }] } : undefined,
        }] : []),
        ...[...grupos.values()].map((g) => ({
          name: g.name, type: 'scatter' as const, data: g.data, symbol: g.symbol, symbolSize: g.symbol === 'diamond' ? 8 : 5,
          itemStyle: g.fuera ? { color: 'transparent', borderColor: warn, borderWidth: 1.5 } : { color: g.color, opacity: g.symbol === 'circle' ? 0.55 : 0.95 },
        })),
      ],
    }
  }, [juzgadas, soloIntrusas, isDark, rango, focoMs])

  const intrusas = juzgadas.filter((p) => p.dim).length
  const fuera = juzgadas.filter((p) => p.fuera).length

  if (!piezas) {
    return (
      <div className="space-y-2" data-testid="pureza-piezas">
        <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Ver cada pieza</p>
        <p className="text-footnote text-muted-foreground">
          Esta puerta tiene <span className="tabular-nums text-foreground">{fmtPz(m.pieces)}</span> piezas guardadas. Cargarlas son{' '}
          <span className="tabular-nums text-foreground">{fmtPz(m.pieces)} lecturas</span> de Firestore; el turno completo son ~18.000 y por eso se carga de a una puerta.
        </p>
        {onCargar && (
          <Button variant="tinted" size="lg" onClick={onCargar} disabled={cargando}>
            {cargando ? 'Cargando…' : `Cargar las ${fmtPz(m.pieces)} piezas`}
          </Button>
        )}
      </div>
    )
  }
  return (
    <div className="space-y-2" data-testid="pureza-piezas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Cada pieza</p>
        <div className="flex rounded-ctl bg-border p-0.5" role="tablist" aria-label="Qué piezas mostrar">
          {([false, true] as const).map((v) => (
            <button key={String(v)} type="button" role="tab" aria-selected={soloIntrusas === v} onClick={() => setSoloIntrusas(v)}
              className={cn('min-h-[44px] rounded-[8px] px-3 text-footnote font-medium transition-colors', soloIntrusas === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
              {v ? `Solo intrusas · ${fmtPz(intrusas)}` : `Todas · ${fmtPz(juzgadas.length)}`}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[220px]">
        <ReactECharts option={option} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} notMerge />
      </div>
      <p className="text-caption text-muted-foreground">
        Círculo = coincide · rombo = intrusa (color de su dimensión) · anillo ámbar = fuera del rango por peso
        {fuera > 0 && <> ({fmtPz(fuera)} pz)</>}. Ventana de 90 min: arrastrá o pellizcá para moverla.
      </p>
    </div>
  )
}
