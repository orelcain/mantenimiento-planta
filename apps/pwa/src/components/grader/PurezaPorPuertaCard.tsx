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
import { Layers, Copy, CheckCircle2 } from 'lucide-react'
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
const NIVEL_PILL: Record<Nivel, PillTone> = { ok: 'ok', warn: 'warning', crit: 'critical', none: 'neutral' }

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
}

export function PurezaPorPuertaCard({ gateMix, gates, turnoLabel }: Props) {
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
  const conteo = useMemo(() => {
    let crit = 0, warn = 0
    for (const e of gateMix.gates) {
      const n = nivelDePureza(e.purityPct)
      if (n === 'crit') crit++
      else if (n === 'warn') warn++
    }
    return { crit, warn }
  }, [gateMix])

  // Arranca abierta en la peor puerta: es lo que el usuario vino a ver.
  const peor = useMemo(() => {
    const conPureza = gateMix.gates.filter((e) => e.purityPct != null)
    if (conPureza.length === 0) return null
    const min = conPureza.reduce((a, b) => (b.purityPct! < a.purityPct! ? b : a))
    return nivelDePureza(min.purityPct) === 'ok' ? null : min.gate
  }, [gateMix])
  const [seleccion, setSeleccion] = useState<number | null>(peor)
  const detalle = seleccion != null ? byGate.get(seleccion) : undefined

  const nivelGlobal: Nivel = conteo.crit > 0 ? 'crit' : conteo.warn > 0 ? 'warn' : 'ok'
  const resumenPill = conteo.crit > 0
    ? `${conteo.crit} mezclada${conteo.crit > 1 ? 's' : ''}${conteo.warn > 0 ? ` · ${conteo.warn} en atención` : ''}`
    : conteo.warn > 0
      ? `${conteo.warn} en atención`
      : 'Todas puras'

  const resumenTexto = () => {
    const lineas = [
      `Pureza por puerta · Grader · ${turnoLabel}`,
      totals.purityPct != null
        ? `Coinciden con lo asignado: ${fmtPz(totals.match)} / ${fmtPz(totals.pieces)} pz (${fmtPct(totals.purityPct)})`
        : '',
    ]
    for (const e of gateMix.gates) {
      const n = nivelDePureza(e.purityPct)
      if (n === 'ok' || n === 'none') continue
      const caida = bloqueDeCaida(e.purityByBucket)
      lineas.push(
        `G${e.gate} (${etiquetaAsignacion(e, gateCfg.get(e.gate))}): ${fmtPct(e.purityPct!)} pura`
        + (textoIntruso(e) ? ` · ${textoIntruso(e)}` : '')
        + (caida != null ? ` · cae desde ${horaBloque(gateMix, caida)}` : ''),
      )
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
          <Pill tone={NIVEL_PILL[nivelGlobal]} dot className="ml-auto">{resumenPill}</Pill>
        </CardTitle>
        {totals.purityPct != null && (
          <p className="text-footnote text-muted-foreground">
            Coinciden con lo asignado:{' '}
            <span className="text-foreground font-medium tabular-nums">{fmtPz(totals.match)} / {fmtPz(totals.pieces)} pz</span>
            {' '}<span className="tabular-nums">({fmtPct(totals.purityPct)})</span>
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Semáforo de puertas: la celda completa es el botón (≥44 px) ── */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" role="list">
          {gateNumbers.map((n) => {
            const e = byGate.get(n)
            const nivel = nivelDePureza(e?.purityPct)
            const activa = seleccion === n
            const intruso = e ? textoIntruso(e, true) : null
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
                    <span aria-hidden className={cn('h-[7px] w-[7px] rounded-full', NIVEL_BG[nivel])} />
                  )}
                </span>
                <span className={`text-title3 tabular-nums ${NIVEL_INK[nivel]}`}>
                  {e?.purityPct != null ? fmtPctEntero(e.purityPct) : '—'}
                </span>
                <span className="w-full text-caption leading-tight text-foreground">
                  {etiquetaAsignacion(e, gateCfg.get(n))}
                </span>
                {intruso && nivel !== 'ok' ? (
                  <span className={`w-full text-caption font-medium leading-tight ${NIVEL_INK[nivel]}`}>{intruso}</span>
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
        </p>

        {/* ── Ficha de la puerta elegida ── */}
        {detalle && (
          <DetalleGate mix={gateMix} entry={detalle} cfg={gateCfg.get(detalle.gate)} />
        )}

        <div className="flex flex-wrap gap-2">
          {nivelGlobal !== 'ok' && (
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

function DetalleGate({ mix, entry, cfg }: { mix: GateMix; entry: GateMixEntry; cfg?: GateAssignment }) {
  const nivel = nivelDePureza(entry.purityPct)
  const caida = bloqueDeCaida(entry.purityByBucket)
  const buckets = entry.purityByBucket
  // Etiquetas del eje: inicio, fin y un par intermedias sin amontonarse.
  const paso = Math.max(1, Math.ceil(buckets.length / 4))
  const mezclaCalibre = entry.assignedCalibre !== ANY_CALIBRE
    && Object.keys(entry.byCalibre).some((k) => k !== entry.assignedCalibre)
  const mezclaCalidad = Object.keys(entry.byQuality).some((k) => k !== entry.assignedQuality)
  const veredicto = nivel === 'ok'
    ? 'Recibe lo que tiene asignado'
    : nivel === 'none'
      ? 'Sin asignación en este turno'
      : `Mezclada por ${[mezclaCalibre && 'calibre', mezclaCalidad && 'calidad'].filter(Boolean).join(' y ')}`

  return (
    <div className="space-y-4 rounded-card bg-muted p-4" data-testid="pureza-detalle">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-headline">
          G{entry.gate} · {etiquetaAsignacion(entry, cfg)} ·{' '}
          <span className="tabular-nums">{fmtPz(entry.pieces)} pz</span>
        </p>
        <span className={`text-footnote font-semibold ${NIVEL_INK[nivel]}`}>{veredicto}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Barras titulo="Por calibre" data={entry.byCalibre} esperado={entry.assignedCalibre} total={entry.pieces} />
        <Barras titulo="Por calidad" data={entry.byQuality} esperado={entry.assignedQuality} total={entry.pieces} />
      </div>

      {entry.purityPct != null && buckets.length > 1 && (
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
                title={`${horaBloque(mix, i)} · ${v == null ? 'sin piezas' : fmtPct(v)}`}
                className={cn('block', v == null ? 'bg-border' : NIVEL_BG[nivelDePureza(v)])}
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
          <p className="mt-2 text-footnote">
            {caida == null
              ? 'Se mantuvo sobre el umbral todo el turno.'
              : caida === 0
                ? <>Mezclada <span className="font-semibold text-ink-crit">desde el inicio del turno</span>.</>
                : <>Cae desde las <span className="font-semibold text-ink-crit tabular-nums">{horaBloque(mix, caida)}</span>; antes iba en {fmtPct(promedioHasta(entry.purityByBucket, caida) ?? 0)}.</>}
          </p>
        </div>
      )}
    </div>
  )
}
