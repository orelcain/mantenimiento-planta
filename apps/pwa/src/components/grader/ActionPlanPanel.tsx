/**
 * Panel de acciones sugeridas tripartito: terreno / oficina / verificar.
 * Las sugerencias se derivan de la causa P0 dominante y el % de rechazo.
 * El estado checked persiste en localStorage por turno.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui'
import { Wrench, Monitor, Eye, CheckSquare, Square, ChevronDown, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'
import { appendShiftAction } from '@/services/grader/graderShifts.service'
import type { MatrixP0Cause } from '@/services/grader/types'
import type { ShiftStatus } from '@/services/grader/graderShiftStatus'
import type { Runbook } from '@/services/grader/graderRunbooks'
import { RunbookCard } from '@/components/grader/RunbookCard'
import type { MachineImpact } from '@/services/shoplogix/shoplogixCorrelation'

// ============================================================================
// TIPOS
// ============================================================================

export interface SuggestedAction {
  id: string
  category: 'terreno' | 'oficina' | 'verificar'
  title: string
  description: string
  severity: 'critical' | 'warning' | 'recommended'
  estimatedImpact?: { metric: 'P0%' | 'throughput'; deltaPct: number }
}

interface ActionPlanPanelProps {
  shiftDocId: string
  suggestions: SuggestedAction[]
  status: ShiftStatus
  relatedRunbooks?: Runbook[]
}

// ============================================================================
// SUGERENCIAS BASADAS EN CAUSA DOMINANTE + CONTEXTO UPSTREAM
// ============================================================================

/**
 * Contexto extra para enriquecer las sugerencias con señales que YA detectó
 * el sistema (correlación upstream, pendiente del scatter Baader↔P0%).
 */
export interface SuggestionContext {
  /** Top máquina(s) con mayor overlap en paros del Grader (de byMachine summary). */
  upstreamByMachine?: MachineImpact[]
  /** Tiempo total (seg) de paro del Grader correlacionado upstream causal. */
  upstreamCausedDurSec?: number
  /**
   * Pendiente del scatter ritmo Baader vs P0% Grader, ya convertido a magnitud
   * operacional ("+N pts P0% por -10 ciclos/5min"). Solo cuando hay datos
   * suficientes y la dirección es 'neg' (más Baader → menos P0%).
   */
  scatterSlope?: {
    deltaP0_per_minus10cycles: number
    direction: 'neg' | 'pos' | 'flat'
  } | null
}

/** Helper local para formatear duraciones de manera amigable. */
function fmtDur(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h} h ${rm} min` : `${h} h`
}

export function deriveSuggestions(
  p0Pct: number,
  dominantCause: MatrixP0Cause | null,
  context: SuggestionContext = {},
): SuggestedAction[] {
  const actions: SuggestedAction[] = []

  if (p0Pct >= 4) {
    actions.push({
      id: 'p0-critical-general',
      category: 'verificar',
      title: 'P0 crítico — revisar con supervisor',
      description: `Rechazo ${p0Pct.toFixed(1)}% supera umbral crítico (4%). Escalar para decisión de detención o ajuste urgente.`,
      severity: 'critical',
    })
  }

  if (dominantCause === 'fuera_de_limites') {
    actions.push(
      {
        id: 'fl-calibration-terreno',
        category: 'terreno',
        title: 'Verificar calibración de pesos en gate 0',
        description: 'Causa dominante: Fuera de límites. Verificar que el peso patrón (5 kg) esté dentro de ±5 g. Limpiar bandeja de tara si hay residuos.',
        severity: p0Pct >= 4 ? 'critical' : 'warning',
        estimatedImpact: { metric: 'P0%', deltaPct: -1.5 },
      },
      {
        id: 'fl-config-limits-oficina',
        category: 'oficina',
        title: 'Revisar límites de calibre configurados',
        description: 'Verificar que los límites inferiores/superiores de calibre en la configuración física coincidan con la especie procesada actualmente.',
        severity: 'warning',
      },
      {
        id: 'fl-verify-species',
        category: 'verificar',
        title: 'Confirmar especie y talla objetivo',
        description: 'Confirmar con planta que la especie y talla objetivo sean las mismas que las configuradas en Matrix.',
        severity: 'recommended',
      },
    )
  }

  if (dominantCause === 'no_leido_fotocelula') {
    actions.push(
      {
        id: 'nf-sensor-terreno',
        category: 'terreno',
        title: 'Limpiar fotocélula de entrada',
        description: 'Causa dominante: No leído por fotocélula. Limpiar lente del sensor con paño seco. Verificar que no haya peces demasiado juntos bloqueando la lectura (gap < 10 cm).',
        severity: p0Pct >= 3 ? 'critical' : 'warning',
        estimatedImpact: { metric: 'P0%', deltaPct: -1.0 },
      },
      {
        id: 'nf-speed-oficina',
        category: 'oficina',
        title: 'Reducir velocidad de cinta si gap es insuficiente',
        description: 'Si el throughput permite, reducir la velocidad de alimentación para aumentar el gap entre peces y evitar lecturas perdidas.',
        severity: 'warning',
        estimatedImpact: { metric: 'P0%', deltaPct: -0.8 },
      },
      {
        id: 'nf-sensor-verify',
        category: 'verificar',
        title: 'Verificar sincronía eye-sync',
        description: 'Confirmar que el parámetro eye-sync en Matrix esté habilitado y calibrado para la cinta actual.',
        severity: 'recommended',
      },
    )
  }

  if (dominantCause === 'puerta_no_preparada') {
    actions.push(
      {
        id: 'pnp-timing-terreno',
        category: 'terreno',
        title: 'Verificar mecanismo de puertas',
        description: 'Causa dominante: Puerta no preparada. Inspeccionar que las puertas de desvío no tengan resistencia mecánica o desalineación.',
        severity: 'warning',
        estimatedImpact: { metric: 'P0%', deltaPct: -0.6 },
      },
      {
        id: 'pnp-timing-oficina',
        category: 'oficina',
        title: 'Ajustar timing de apertura de puertas',
        description: 'En la configuración física, revisar el parámetro de anticipación de apertura (ms) en las gates con mayor incidencia.',
        severity: 'warning',
      },
    )
  }

  if (p0Pct >= 2 && p0Pct < 4 && actions.filter(a => a.category === 'verificar').length === 0) {
    actions.push({
      id: 'general-verify',
      category: 'verificar',
      title: 'Monitorear evolución en próximos 30 min',
      description: `P0 en ${p0Pct.toFixed(1)}% (zona warning). Verificar si la tendencia es ascendente antes de intervenir.`,
      severity: 'recommended',
    })
  }

  // ── Contexto upstream: derivar acciones de las señales Shoplogix ──────────
  //
  // El sistema YA sabe qué Evisceradoras causaron paros del Grader (vía
  // `summarizeCorrelations.byMachine`) y la magnitud de la correlación
  // ritmo Baader→P0% (vía `scatterSlopeMagnitude`). Convertimos eso en
  // acciones concretas — la información existía, solo no estaba conectada.

  // 1) Máquina top con overlap significativo (>= 5 min causados) → atender
  const topMachine = context.upstreamByMachine?.[0]
  if (topMachine && topMachine.totalOverlapSec >= 300) {
    const totalUpstream = context.upstreamCausedDurSec ?? 0
    const sharePct = totalUpstream > 0 ? (topMachine.totalOverlapSec / totalUpstream) * 100 : 0
    actions.push({
      id: `upstream-attend-${topMachine.machineid}`,
      category: 'terreno',
      title: `Atender ${topMachine.machineName} (mantención prioritaria)`,
      description: `Esta máquina causó ${fmtDur(topMachine.totalOverlapSec)} de paro del Grader en ${topMachine.pauseCount} evento${topMachine.pauseCount !== 1 ? 's' : ''} (${sharePct.toFixed(0)}% del tiempo muerto upstream del turno). Priorizar mantención reduce tiempo muerto sin tener que cambiar configuración del Grader.`,
      severity: topMachine.totalOverlapSec >= 1800 ? 'critical' : 'warning',
    })
  }

  // 2) Pendiente negativa significativa del scatter → investigar ritmo upstream
  if (context.scatterSlope?.direction === 'neg' && context.scatterSlope.deltaP0_per_minus10cycles >= 0.3) {
    actions.push({
      id: 'scatter-baader-rate',
      category: 'oficina',
      title: 'Investigar caídas de ritmo en Evisceradoras',
      description: `Detectada correlación operacional: cada -10 ciclos/5min de las Baaders → +${context.scatterSlope.deltaP0_per_minus10cycles.toFixed(2)} puntos P0% del Grader. Indica que la calidad del corte en evisceración impacta la clasificación. Verificar materia prima, dotación de operadores y mantenciones programadas en esa línea.`,
      severity: 'warning',
    })
  }

  return actions
}

// ============================================================================
// COMPONENTE
// ============================================================================

const CATEGORY_META: Record<SuggestedAction['category'], {
  label: string
  icon: typeof Wrench
  color: string
  bg: string
}> = {
  terreno: { label: 'Terreno', icon: Wrench, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  oficina: { label: 'Oficina', icon: Monitor, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  verificar: { label: 'Verificar', icon: Eye, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
}

const SEVERITY_ICON: Record<SuggestedAction['severity'], typeof AlertTriangle> = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  recommended: Info,
}

const SEVERITY_COLOR: Record<SuggestedAction['severity'], string> = {
  critical: 'text-red-400',
  warning: 'text-amber-400',
  recommended: 'text-zinc-400',
}

function ActionItem({
  action,
  checked,
  onToggle,
}: {
  action: SuggestedAction
  checked: boolean
  onToggle: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const SeverityIcon = SEVERITY_ICON[action.severity]

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden transition-opacity',
        checked && 'opacity-50',
      )}
    >
      <div className="flex items-start gap-2 p-2.5">
        <button
          onClick={onToggle}
          className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={checked ? 'Desmarcar' : 'Marcar como hecho'}
        >
          {checked
            ? <CheckSquare className="w-4 h-4 text-emerald-400" />
            : <Square className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <SeverityIcon className={cn('w-3 h-3 shrink-0', SEVERITY_COLOR[action.severity])} />
            <span className={cn('font-medium text-xs', checked && 'line-through')}>
              {action.title}
            </span>
          </div>
          {action.estimatedImpact && (
            <span className="text-xs text-emerald-400 ml-5">
              ≈ {action.estimatedImpact.deltaPct > 0 ? '+' : ''}{action.estimatedImpact.deltaPct}% {action.estimatedImpact.metric}
            </span>
          )}
        </div>

        <button
          onClick={() => setExpanded(e => !e)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-2.5 pt-0 border-t bg-muted/10">
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{action.description}</p>
        </div>
      )}
    </div>
  )
}

export function ActionPlanPanel({ shiftDocId, suggestions, status, relatedRunbooks = [] }: ActionPlanPanelProps) {
  const storageKey = `grader-actions-checked-${shiftDocId}`
  const user = useAuthStore(s => s.user)

  // Parsear dateKey / shiftId desde shiftDocId (formato: YYYY-MM-DD__Turno día)
  const [fsDateKey, fsShiftId] = (() => {
    const idx = shiftDocId.indexOf('__')
    return idx > -1 ? [shiftDocId.slice(0, idx), shiftDocId.slice(idx + 2)] : ['', '']
  })()

  const [checked, setChecked] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch {
      return new Set()
    }
  })

  // Ref estable para acceder a checked en toggle sin recrear el callback
  const checkedRef = useRef(checked)
  useEffect(() => { checkedRef.current = checked }, [checked])

  // Sync to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...checked]))
    } catch { /* ignore quota errors */ }
  }, [checked, storageKey])

  const toggle = useCallback((id: string) => {
    const isNewCheck = !checkedRef.current.has(id)

    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

    // Persistir en Firestore solo al marcar (no al desmarcar)
    if (isNewCheck && fsDateKey && fsShiftId) {
      const action = suggestions.find(s => s.id === id)
      if (action) {
        appendShiftAction(fsDateKey, fsShiftId, {
          id: `${id}-${Date.now()}`,
          at: new Date().toISOString(),
          by: user?.id ?? 'sistema',
          byName: user ? `${user.nombre} ${user.apellido}` : 'Sistema',
          field: action.title,
          before: null,
          after: 'done',
        }).catch(() => { /* silencioso — localStorage ya persiste localmente */ })
      }
    }
  }, [fsDateKey, fsShiftId, suggestions, user])

  const grouped = (
    ['terreno', 'oficina', 'verificar'] as const
  ).map(cat => ({
    cat,
    items: suggestions.filter(s => s.category === cat),
  })).filter(g => g.items.length > 0)

  if (suggestions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">¿Qué hacer?</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground py-2">
            Sin sugerencias para este turno. El sistema necesita datos de causas P0 para generar recomendaciones.
          </p>
        </CardContent>
      </Card>
    )
  }

  const doneCount = suggestions.filter(s => checked.has(s.id)).length

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">¿Qué hacer?</CardTitle>
          {doneCount > 0 && (
            <span className="text-xs text-emerald-400 font-medium">
              {doneCount}/{suggestions.length} completadas
            </span>
          )}
        </div>
        <CardDescription>
          {status === 'live'
            ? 'Acciones sugeridas para el turno en curso — marcá las que ya realizaste'
            : 'Resumen de acciones para este turno'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {grouped.map(({ cat, items }) => {
          const meta = CATEGORY_META[cat]
          const Icon = meta.icon
          return (
            <div key={cat}>
              <div className={cn('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-2 px-2 py-1 rounded-md border', meta.bg, meta.color)}>
                <Icon className="w-3.5 h-3.5" />
                {meta.label}
              </div>
              <div className="space-y-1.5">
                {items.map(action => (
                  <ActionItem
                    key={action.id}
                    action={action}
                    checked={checked.has(action.id)}
                    onToggle={() => toggle(action.id)}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {relatedRunbooks.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-2 px-2 py-1 rounded-md border bg-zinc-500/10 border-zinc-500/20 text-zinc-400">
              <Eye className="w-3.5 h-3.5" />
              Runbooks relacionados
            </div>
            <div className="space-y-1.5">
              {relatedRunbooks.map(rb => (
                <RunbookCard key={rb.id} runbook={rb} compact />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
