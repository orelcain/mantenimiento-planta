/**
 * PauseKpiDashboard — KPIs de tiempo muerto del período.
 *
 * Agrega totalDeadTimeSec / pausesCount de GraderDailySummary[]
 * (campos precalculados en el doc principal, sin sub-collection queries).
 *
 * Desglose por tag: lazy-load de meta/pauses solo al expandir la sección,
 * en batches de 15 para no saturar Firestore. Se resetea al cambiar el período.
 *
 * Panel de anotación batch: solo admins. Lista pausas sin clasificar del período
 * con selector inline de tag. Optimistic update de tagBreakdown al guardar.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  PauseCircle,
  Tag,
  TrendingDown,
} from 'lucide-react'
import {
  loadPausesAggregates,
  updatePauseAnnotation,
} from '@/services/grader/graderDailySummary.service'
import {
  GRADER_PAUSE_TAGS,
  resolveEffectiveTag,
  isOperationalTag,
  isOrganizationalTag,
} from '@/services/grader/graderPauseTags'
import { summarizeByCategory, SIN_TAG_ID } from '@/services/grader/pauseKpiAnalytics'
import type { GraderDailySummary, Pause } from '@/services/grader/types'
import { useIsAdmin, useAuthStore } from '@/store/authStore'

interface PauseKpiDashboardProps {
  summaries: GraderDailySummary[]
}

interface UntaggedPause {
  summaryId: string
  dateKey: string
  shiftId: string
  pause: Pause
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtSec(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon,
  /** Color tailwind para el value (alerta operacional según severidad). */
  valueColor,
}: {
  label: string
  value: string
  sub: string
  icon: React.ReactNode
  valueColor?: string
}) {
  return (
    <div className="rounded-card border border-border bg-muted px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-caption text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className={`text-lg font-semibold tabular-nums leading-none ${valueColor ?? ''}`}>{value}</div>
      <div className="text-caption text-muted-foreground/60 mt-1">{sub}</div>
    </div>
  )
}

// ── Umbrales operacionales del % muerto del turno ─────────────────────────────
//
// Aplica el principio "consistencia entre elementos" — mismos umbrales en cuanto
// a coloreo del KPI promedio del período. No hay un umbral previo en el módulo
// para "% muerto del turno" (distinto al P0% crítico del scatter), así que
// los establecemos aquí como referencia operacional típica de líneas de
// procesamiento.
const DEAD_TIME_PCT_THRESHOLDS = {
  /** ≤ 10% — operación saludable. */
  okBelow: 10,
  /** 10-20% — atención. */
  warnBelow: 20,
  /** > 20% — crítico. */
} as const

function deadTimePctColor(pct: number): string {
  if (pct <= DEAD_TIME_PCT_THRESHOLDS.okBelow) return 'text-emerald-400'
  if (pct <= DEAD_TIME_PCT_THRESHOLDS.warnBelow) return 'text-amber-400'
  return 'text-rose-400'
}

// SIN_TAG_ID y summarizeByCategory viven en services/grader/pauseKpiAnalytics
// (helpers puros) para satisfacer react-refresh/only-export-components.

function TagBreakdownChart({ tagBreakdown }: { tagBreakdown: Record<string, number> }) {
  const entries = useMemo(() => {
    const tagMap = new Map(GRADER_PAUSE_TAGS.map(t => [t.id, t]))
    const all = Object.entries(tagBreakdown).map(([id, sec]) => {
      const tag = tagMap.get(id)
      const category: 'operacional' | 'organizacional' | 'sin_clasificar' =
        id === SIN_TAG_ID ? 'sin_clasificar'
        : isOperationalTag(id) ? 'operacional'
        : isOrganizationalTag(id) ? 'organizacional'
        : 'sin_clasificar'
      return {
        id,
        sec,
        label: tag?.label ?? 'Sin clasificar',
        emoji: tag?.emoji ?? '○',
        color: tag?.color ?? '#6b7280',
        category,
      }
    })
    // Ordenar: operacionales primero (atacables), luego organizacionales,
    // luego sin clasificar. Dentro de cada grupo, por duración desc.
    const catRank = { operacional: 0, organizacional: 1, sin_clasificar: 2 } as const
    return all.sort((a, b) => {
      if (catRank[a.category] !== catRank[b.category]) return catRank[a.category] - catRank[b.category]
      return b.sec - a.sec
    })
  }, [tagBreakdown])

  const maxSec = Math.max(...entries.map(e => e.sec), 1)
  const totalSec = entries.reduce((sum, e) => sum + e.sec, 0)

  if (entries.length === 0) {
    return (
      <p className="mt-2 text-caption text-muted-foreground/60">
        Todas las pausas están sin clasificar o los datos aún no se han cargado.
      </p>
    )
  }

  // Insertar separadores entre categorías para que el operador vea de un vistazo
  // qué está atacable (operacional) vs ineludible (organizacional).
  const renderItems: React.ReactNode[] = []
  let lastCategory: string | null = null
  const CATEGORY_LABEL = {
    operacional:    { label: 'Atacables (operacionales)',     color: 'text-rose-400/80'   },
    organizacional: { label: 'Ineludibles (organizacionales)', color: 'text-cyan-400/80'  },
    sin_clasificar: { label: 'Sin clasificar',                color: 'text-slate-500'    },
  } as const
  for (const e of entries) {
    if (e.category !== lastCategory) {
      renderItems.push(
        <div
          key={`hdr-${e.category}`}
          className={`text-caption uppercase tracking-wider mt-2 first:mt-0 ${CATEGORY_LABEL[e.category].color}`}
        >
          {CATEGORY_LABEL[e.category].label}
        </div>,
      )
      lastCategory = e.category
    }
    renderItems.push(
      <div key={e.id} className="flex items-center gap-2">
        <span className="w-4 shrink-0 text-center text-xs">{e.emoji}</span>
        <span className="w-24 shrink-0 text-caption text-muted-foreground truncate">{e.label}</span>
        <div className="flex-1 h-2.5 bg-muted rounded-ctl overflow-hidden">
          <div
            className="h-full rounded-ctl transition-all duration-300"
            style={{ width: `${(e.sec / maxSec) * 100}%`, backgroundColor: e.color + 'aa' }}
          />
        </div>
        <span className="w-10 shrink-0 text-caption text-muted-foreground tabular-nums">
          {fmtSec(e.sec)}
        </span>
        <span className="w-7 shrink-0 text-caption text-muted-foreground/60 tabular-nums text-right">
          {totalSec > 0 ? `${((e.sec / totalSec) * 100).toFixed(0)}%` : '—'}
        </span>
      </div>,
    )
  }

  return <div className="space-y-1 mt-2">{renderItems}</div>
}

// ── Panel de anotación batch ──────────────────────────────────────────────────

function PauseAnnotationPanel({
  untagged,
  annotatedBy,
  onSaved,
}: {
  untagged: UntaggedPause[]
  annotatedBy: string
  onSaved: (summaryId: string, pauseId: string, tagId: string, durationSec: number) => void
}) {
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Set<string>>(new Set())

  const pending = untagged.filter(u => !saved.has(`${u.summaryId}::${u.pause.id}`))

  if (pending.length === 0) {
    return (
      <p className="mt-2 text-caption text-ink-ok">
        ✓ Todas las pausas del período están clasificadas.
      </p>
    )
  }

  async function handleSave(item: UntaggedPause) {
    const key = `${item.summaryId}::${item.pause.id}`
    const tagId = selections[key]
    if (!tagId) return
    setSaving(s => ({ ...s, [key]: true }))
    try {
      await updatePauseAnnotation(item.summaryId, item.pause.id, { tagId, annotatedBy })
      setSaved(s => new Set([...s, key]))
      onSaved(item.summaryId, item.pause.id, tagId, item.pause.durationSec)
    } finally {
      setSaving(s => ({ ...s, [key]: false }))
    }
  }

  return (
    <div className="mt-2 space-y-1 max-h-72 overflow-y-auto pr-1">
      {pending.map(item => {
        const key = `${item.summaryId}::${item.pause.id}`
        const isSaving = saving[key] ?? false
        const dateLabel = new Date(`${item.dateKey}T12:00:00`)
          .toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
          .replace('.', '')
        const durLabel = fmtSec(item.pause.durationSec)

        return (
          <div key={key} className="flex items-center gap-2 text-caption">
            <span className="w-14 shrink-0 text-muted-foreground tabular-nums">{dateLabel}</span>
            <span className="w-10 shrink-0 text-muted-foreground/60 truncate">{item.shiftId.replace('Turno ', '')}</span>
            <span className="w-8 shrink-0 text-muted-foreground tabular-nums">{durLabel}</span>
            <select
              className="flex-1 h-6 rounded-ctl border border-border bg-background text-caption px-1"
              value={selections[key] ?? ''}
              onChange={e => setSelections(s => ({ ...s, [key]: e.target.value }))}
              disabled={isSaving}
            >
              <option value="">— elegir —</option>
              {GRADER_PAUSE_TAGS.map(t => (
                <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>
              ))}
            </select>
            <button
              onClick={() => void handleSave(item)}
              disabled={!selections[key] || isSaving}
              className="shrink-0 px-2 h-6 rounded-ctl text-caption bg-amber-500/[0.15] text-white disabled:opacity-30 hover:bg-amber-500 transition-colors"
            >
              {isSaving ? '…' : 'OK'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

type ChartEntry = { key: string; sec: number; pct: number; label: string }

function buildChartEntries(withData: GraderDailySummary[]): { entries: ChartEntry[]; grouped: boolean } {
  const dayMap: Record<string, number> = {}
  for (const s of withData) {
    dayMap[s.dateKey] = (dayMap[s.dateKey] ?? 0) + (s.totalDeadTimeSec ?? 0)
  }
  const days = Object.keys(dayMap).sort()

  if (days.length <= 60) {
    const maxSec = Math.max(...days.map(d => dayMap[d]!), 1)
    return {
      grouped: false,
      entries: days.map(dateKey => ({
        key: dateKey,
        sec: dayMap[dateKey]!,
        pct: (dayMap[dateKey]! / maxSec) * 100,
        label: new Date(`${dateKey}T12:00:00`)
          .toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
          .replace('.', ''),
      })),
    }
  }

  // Más de 60 días → agrupar por semana (lunes)
  const weekMap: Record<string, number> = {}
  const weekLabel: Record<string, string> = {}
  for (const dateKey of days) {
    const d = new Date(`${dateKey}T12:00:00`)
    const mon = new Date(d)
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const wk = mon.toISOString().slice(0, 10)
    weekMap[wk] = (weekMap[wk] ?? 0) + dayMap[dateKey]!
    if (!weekLabel[wk]) {
      weekLabel[wk] = mon
        .toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
        .replace('.', '')
    }
  }
  const weeks = Object.keys(weekMap).sort()
  const maxSecW = Math.max(...weeks.map(w => weekMap[w]!), 1)
  return {
    grouped: true,
    entries: weeks.map(wk => ({
      key: wk,
      sec: weekMap[wk]!,
      pct: (weekMap[wk]! / maxSecW) * 100,
      label: weekLabel[wk]!,
    })),
  }
}

// ── Componente principal ──────────────────────────────────────────────────────

export function PauseKpiDashboard({ summaries }: PauseKpiDashboardProps) {
  const isAdmin = useIsAdmin()
  const user = useAuthStore(s => s.user)
  const annotatedBy = user?.nombre
    ? `${user.nombre}${user.apellido ? ' ' + user.apellido : ''}`
    : (user?.email ?? 'admin')

  const withData = useMemo(
    () => summaries.filter(s => s.totalDeadTimeSec !== undefined),
    [summaries],
  )

  const kpis = useMemo(() => {
    if (withData.length === 0) return null
    const totalDeadSec = withData.reduce((sum, s) => sum + (s.totalDeadTimeSec ?? 0), 0)
    const totalPauses  = withData.reduce((sum, s) => sum + (s.pausesCount ?? 0), 0)
    const avgDeadSec   = totalDeadSec / withData.length
    const withDuration = withData.filter(s => (s.durationMinutes ?? 0) > 0)
    const avgDeadPct   = withDuration.length > 0
      ? withDuration.reduce(
          (sum, s) => sum + (s.totalDeadTimeSec ?? 0) / (s.durationMinutes! * 60) * 100,
          0,
        ) / withDuration.length
      : null
    return { totalDeadSec, totalPauses, avgDeadSec, avgDeadPct }
  }, [withData])

  const chart = useMemo(() => buildChartEntries(withData), [withData])

  // Turnos que tienen pausas ≥5min (sub-collection cargable)
  const pausesWithData = useMemo(
    () => withData.filter(s => (s.pausesCount ?? 0) > 0),
    [withData],
  )

  // Estado del desglose por tag
  const [tagOpen, setTagOpen]               = useState(false)
  const [tagBreakdown, setTagBreakdown]     = useState<Record<string, number> | null>(null)
  const [loadingTags, setLoadingTags]       = useState(false)
  const [loadProgress, setLoadProgress]    = useState<{ current: number; total: number } | null>(null)

  // Estado del panel de anotación
  const [untaggedPauses, setUntaggedPauses] = useState<UntaggedPause[] | null>(null)
  const [annotationOpen, setAnnotationOpen] = useState(false)

  // Resetear todo cuando cambia el período
  useEffect(() => {
    setTagBreakdown(null)
    setTagOpen(false)
    setLoadingTags(false)
    setLoadProgress(null)
    setUntaggedPauses(null)
    setAnnotationOpen(false)
  }, [summaries])

  const doLoadTags = useCallback(async () => {
    if (pausesWithData.length === 0) return
    setLoadingTags(true)
    setLoadProgress({ current: 0, total: pausesWithData.length })

    const totals: Record<string, number> = {}
    const collected: UntaggedPause[] = []
    const BATCH = 15
    let done = 0

    for (let i = 0; i < pausesWithData.length; i += BATCH) {
      const slice = pausesWithData.slice(i, i + BATCH)
      const results = await Promise.all(slice.map(s => loadPausesAggregates(s.id)))
      for (let j = 0; j < results.length; j++) {
        const result = results[j]
        if (!result) continue
        const summary = slice[j]!
        for (const pause of result.pauses) {
          const resolved = resolveEffectiveTag(pause)
          const tagId = resolved?.id ?? SIN_TAG_ID
          totals[tagId] = (totals[tagId] ?? 0) + pause.durationSec
          if (!resolved) {
            collected.push({
              summaryId: summary.id,
              dateKey: summary.dateKey,
              shiftId: summary.shiftId,
              pause,
            })
          }
        }
      }
      done += slice.length
      setLoadProgress({ current: done, total: pausesWithData.length })
    }

    setTagBreakdown(totals)
    setUntaggedPauses(collected)
    setLoadingTags(false)
    setLoadProgress(null)
  }, [pausesWithData])

  const handleToggleTags = useCallback(() => {
    const next = !tagOpen
    setTagOpen(next)
    if (next && tagBreakdown === null && !loadingTags) {
      void doLoadTags()
    }
  }, [tagOpen, tagBreakdown, loadingTags, doLoadTags])

  // Optimistic update cuando se guarda una anotación desde el panel
  const handlePauseSaved = useCallback(
    (summaryId: string, pauseId: string, tagId: string, durationSec: number) => {
      setTagBreakdown(prev => {
        if (!prev) return prev
        const next = { ...prev }
        // Quitar del bucket sin_tag
        if (next[SIN_TAG_ID] !== undefined) {
          next[SIN_TAG_ID] = Math.max(0, (next[SIN_TAG_ID] ?? 0) - durationSec)
          if (next[SIN_TAG_ID] === 0) delete next[SIN_TAG_ID]
        }
        // Sumar al bucket del tag elegido
        next[tagId] = (next[tagId] ?? 0) + durationSec
        return next
      })
      setUntaggedPauses(prev =>
        prev ? prev.filter(u => !(u.summaryId === summaryId && u.pause.id === pauseId)) : prev,
      )
    },
    [],
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  if (withData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
            <PauseCircle className="w-4 h-4" />
            Tiempo muerto del período
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-6 text-center text-sm text-muted-foreground">
          Sin datos de tiempo muerto en el rango seleccionado.
        </CardContent>
      </Card>
    )
  }

  const sinTagCount = tagBreakdown?.[SIN_TAG_ID] !== undefined
    ? (untaggedPauses?.length ?? 0)
    : 0

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <PauseCircle className="w-4 h-4 text-muted-foreground" />
          Tiempo muerto del período
          <span className="text-caption font-normal text-muted-foreground ml-1">
            {withData.length}/{summaries.length} turnos con datos
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="pb-4 space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="Total tiempo muerto"
            value={fmtSec(kpis!.totalDeadSec)}
            sub="suma del período"
            icon={<Clock className="w-3.5 h-3.5" />}
          />
          <KpiCard
            label="Pausas ≥5 min"
            value={kpis!.totalPauses.toLocaleString('es-CL')}
            sub="pausa · larga · parada"
            icon={<PauseCircle className="w-3.5 h-3.5" />}
          />
          <KpiCard
            label="Promedio por turno"
            value={fmtSec(kpis!.avgDeadSec)}
            sub={`sobre ${withData.length} turnos`}
            icon={<TrendingDown className="w-3.5 h-3.5" />}
          />
          <KpiCard
            label="% muerto del turno"
            value={kpis!.avgDeadPct != null ? `${kpis!.avgDeadPct.toFixed(1)}%` : '—'}
            sub={
              kpis!.avgDeadPct != null
                ? kpis!.avgDeadPct <= DEAD_TIME_PCT_THRESHOLDS.okBelow
                  ? 'saludable (≤10%)'
                  : kpis!.avgDeadPct <= DEAD_TIME_PCT_THRESHOLDS.warnBelow
                  ? 'atención (10-20%)'
                  : 'crítico (>20%)'
                : 'promedio del período'
            }
            icon={<Activity className="w-3.5 h-3.5" />}
            valueColor={kpis!.avgDeadPct != null ? deadTimePctColor(kpis!.avgDeadPct) : undefined}
          />
        </div>

        {/* KPI accionable: tiempo muerto evitable vs ineludible (solo si tagBreakdown cargado).
            Aplica el principio "info útil" — el operador puede decir
            "del 12h muerto, X horas son atacables y el resto son colación/limpieza programadas". */}
        {tagBreakdown && (() => {
          const cat = summarizeByCategory(tagBreakdown)
          if (cat.totalSec === 0) return null
          const evitablePct = (cat.operationalSec / cat.totalSec) * 100
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-border/20">
              <KpiCard
                label="Evitable (operacional)"
                value={fmtSec(cat.operationalSec)}
                sub={`${evitablePct.toFixed(0)}% del muerto · falla, mantención, espera MP`}
                icon={<TrendingDown className="w-3.5 h-3.5" />}
                valueColor="text-rose-400"
              />
              <KpiCard
                label="Ineludible (organizacional)"
                value={fmtSec(cat.organizationalSec)}
                sub={`${((cat.organizationalSec / cat.totalSec) * 100).toFixed(0)}% del muerto · colación, limpieza`}
                icon={<Clock className="w-3.5 h-3.5" />}
                valueColor="text-cyan-400"
              />
              {cat.unclassifiedSec > 0 && (
                <KpiCard
                  label="Sin clasificar"
                  value={fmtSec(cat.unclassifiedSec)}
                  sub={`${((cat.unclassifiedSec / cat.totalSec) * 100).toFixed(0)}% — clasificar para análisis preciso`}
                  icon={<Tag className="w-3.5 h-3.5" />}
                  valueColor="text-slate-400"
                />
              )}
            </div>
          )
        })()}

        {/* Bar chart por día/semana */}
        {chart.entries.length > 0 && (
          <div className="pt-1">
            {chart.grouped && (
              <p className="text-caption text-muted-foreground mb-2">
                Agrupado por semana · período largo
              </p>
            )}
            <div className="space-y-0.5 max-h-56 overflow-y-auto pr-1">
              {chart.entries.map(d => (
                <div key={d.key} className="flex items-center gap-2 text-xs">
                  <span className="w-12 shrink-0 text-right text-caption text-muted-foreground tabular-nums">
                    {d.label}
                  </span>
                  <div className="flex-1 h-3 bg-muted rounded-ctl overflow-hidden">
                    <div
                      className="h-full rounded-ctl bg-amber-500/[0.15] transition-all duration-300"
                      style={{ width: `${d.pct}%` }}
                      title={fmtSec(d.sec)}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-caption text-muted-foreground tabular-nums">
                    {fmtSec(d.sec)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Desglose por tag — lazy load */}
        {kpis!.totalPauses > 0 && (
          <div className="pt-2 border-t border-border/20">
            <button
              onClick={handleToggleTags}
              className="flex items-center gap-1.5 text-caption text-muted-foreground hover:text-foreground transition-colors"
            >
              {tagOpen
                ? <ChevronUp className="w-3 h-3" />
                : <ChevronDown className="w-3 h-3" />
              }
              <Tag className="w-3 h-3" />
              Desglose por tag
              <span className="text-muted-foreground/60 ml-0.5">
                · {kpis!.totalPauses} pausas · {pausesWithData.length} turnos
              </span>
              {tagBreakdown !== null && (
                <span className="text-muted-foreground/40 ml-0.5">
                  · {Object.keys(tagBreakdown).length} categorías
                </span>
              )}
            </button>

            {/* Progreso de carga */}
            {tagOpen && loadingTags && loadProgress && (
              <div className="mt-2 space-y-1">
                <p className="text-caption text-muted-foreground">
                  Cargando pausas — {loadProgress.current}/{loadProgress.total} turnos…
                </p>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500/[0.15] transition-all duration-150"
                    style={{ width: `${(loadProgress.current / loadProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Resultado */}
            {tagOpen && tagBreakdown !== null && !loadingTags && (
              <TagBreakdownChart tagBreakdown={tagBreakdown} />
            )}

            {/* Panel de anotación batch — solo admins, solo si hay sin clasificar */}
            {tagOpen && tagBreakdown !== null && !loadingTags && isAdmin && sinTagCount > 0 && (
              <div className="mt-3 pt-2 border-t border-border/20">
                <button
                  onClick={() => setAnnotationOpen(o => !o)}
                  className="flex items-center gap-1.5 text-caption text-ink-warn hover:text-amber-500 transition-colors"
                >
                  {annotationOpen
                    ? <ChevronUp className="w-3 h-3" />
                    : <ChevronDown className="w-3 h-3" />
                  }
                  <Edit3 className="w-3 h-3" />
                  Clasificar sin clasificar
                  <span className="text-muted-foreground/60 ml-0.5">
                    · {sinTagCount} pausas pendientes
                  </span>
                </button>

                {annotationOpen && untaggedPauses !== null && (
                  <PauseAnnotationPanel
                    untagged={untaggedPauses}
                    annotatedBy={annotatedBy}
                    onSaved={handlePauseSaved}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
