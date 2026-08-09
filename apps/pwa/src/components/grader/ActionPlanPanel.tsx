/**
 * Panel de acciones sugeridas tripartito: terreno / oficina / verificar.
 * Las sugerencias se derivan de la causa P0 dominante y el % de rechazo.
 * El estado checked persiste en localStorage por turno.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui'
import { Wrench, Monitor, Eye, CheckSquare, Square, AlertTriangle, Info, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'
import { appendShiftAction } from '@/services/grader/graderShifts.service'
import type { ShiftStatus } from '@/services/grader/graderShiftStatus'
import type { Runbook } from '@/services/grader/graderRunbooks'
import { RunbookCard } from '@/components/grader/RunbookCard'
import type { SuggestedAction, ActionTrigger } from '@/services/grader/actionPlanSuggestions'

interface ActionPlanPanelProps {
  shiftDocId: string
  suggestions: SuggestedAction[]
  status: ShiftStatus
  relatedRunbooks?: Runbook[]
  /** Callback para triggers que abren modales en el padre (belt-rpm, gate-change) */
  onActionTrigger?: (trigger: ActionTrigger) => void
  /**
   * Descriptor opcional que reemplaza el subtítulo genérico cuando aplica.
   * Útil para que cada planta indique con qué reglas se generaron las
   * sugerencias (ej. Yal: "Reglas: peso bajo, proximidad, throughput, uptime
   * Baader"; Chonchi: por defecto sin descriptor).
   */
  rulesDescriptor?: string
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
  terreno: { label: 'Terreno', icon: Wrench, color: 'text-amber-600', bg: 'bg-amber-500/[0.15] border-amber-500/[0.25]' },
  oficina: { label: 'Oficina', icon: Monitor, color: 'text-primary', bg: 'bg-primary/[0.15] border-primary/[0.25]' },
  verificar: { label: 'Verificar', icon: Eye, color: 'text-cat-6-ink', bg: 'bg-cat-6-tint/[0.15] border-cat-6-tint/[0.25]' },
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

const TRIGGER_LABELS: Record<ActionTrigger, string> = {
  'belt-rpm':     'Ajustar RPM',
  'gate-change':  'Cambiar gate',
  'global-config': 'Abrir config',
  'wizard-gates': 'Abrir wizard',
}

const TRIGGER_NAVIGATE: Partial<Record<ActionTrigger, string>> = {
  'global-config': '/configuracion-global?tab=linea',
  'wizard-gates':  '/analisis-grader/wizard?tab=gates',
}

function ActionItem({
  action,
  checked,
  onToggle,
  onTrigger,
}: {
  action: SuggestedAction
  checked: boolean
  onToggle: () => void
  onTrigger?: (trigger: ActionTrigger) => void
}) {
  const navigate = useNavigate()
  const SeverityIcon = SEVERITY_ICON[action.severity]

  function handleTrigger() {
    if (!action.actionTrigger) return
    const navPath = TRIGGER_NAVIGATE[action.actionTrigger]
    if (navPath) {
      navigate(navPath)
    } else {
      onTrigger?.(action.actionTrigger)
    }
  }

  return (
    <div
      className={cn(
        'border rounded-card overflow-hidden transition-opacity',
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
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{action.description}</p>

          {/* Botón de acción directa */}
          {action.actionTrigger && (
            <button
              onClick={handleTrigger}
              className="mt-2 flex items-center gap-1 text-[11px] px-2 py-1 rounded-ctl border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors font-medium"
            >
              {action.actionLabel ?? TRIGGER_LABELS[action.actionTrigger]}
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function ActionPlanPanel({ shiftDocId, suggestions, status, relatedRunbooks = [], onActionTrigger, rulesDescriptor }: ActionPlanPanelProps) {
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
          {rulesDescriptor && (
            <span className="block mt-1 text-[10px] text-muted-foreground/70 italic">
              {rulesDescriptor}
            </span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {grouped.map(({ cat, items }) => {
          const meta = CATEGORY_META[cat]
          const Icon = meta.icon
          return (
            <div key={cat}>
              <div className={cn('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-2 px-2 py-1 rounded-ctl border', meta.bg, meta.color)}>
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
                    onTrigger={onActionTrigger}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {relatedRunbooks.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-2 px-2 py-1 rounded-ctl border bg-muted-foreground/[0.10] border-muted-foreground/[0.10] text-muted-foreground">
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
