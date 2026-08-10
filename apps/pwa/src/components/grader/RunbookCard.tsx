/**
 * Card expandible de runbook Z2. Muestra ruta de menú, fórmula, pasos y criterios.
 */

import { useState } from 'react'
import { ChevronDown, CheckCircle2, Wrench, Droplets, Settings, Zap, BookOpen, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Runbook, RunbookCategory } from '@/services/grader/graderRunbooks'

const CATEGORY_META: Record<RunbookCategory, { label: string; icon: typeof Wrench; color: string }> = {
  contrastacion: { label: 'Contrastación', icon: Settings, color: 'text-blue-400' },
  calibracion:   { label: 'Calibración',   icon: Zap,      color: 'text-amber-400' },
  mantencion:    { label: 'Mantención',    icon: Wrench,   color: 'text-cat-4-ink' },
  limpieza:      { label: 'Limpieza',      icon: Droplets, color: 'text-cat-7-ink' },
  troubleshooting: { label: 'Troubleshooting', icon: BookOpen, color: 'text-purple-400' },
}

interface RunbookCardProps {
  runbook: Runbook
  compact?: boolean
  defaultExpanded?: boolean
  /** Modo controlado: si se pasa, reemplaza el estado interno */
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
}

export function RunbookCard({ runbook, compact = false, defaultExpanded = false, expanded: expandedProp, onExpandedChange }: RunbookCardProps) {
  const [expandedState, setExpandedState] = useState(defaultExpanded)
  const isControlled = expandedProp !== undefined
  const expanded = isControlled ? expandedProp : expandedState
  const setExpanded = (next: boolean | ((prev: boolean) => boolean)) => {
    const nextValue = typeof next === 'function' ? next(expanded) : next
    if (!isControlled) setExpandedState(nextValue)
    onExpandedChange?.(nextValue)
  }
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set())

  const meta = CATEGORY_META[runbook.category]
  const Icon = meta.icon

  const toggleStep = (order: number) => {
    setCheckedSteps(prev => {
      const next = new Set(prev)
      if (next.has(order)) next.delete(order)
      else next.add(order)
      return next
    })
  }

  return (
    <div className="border rounded-card overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-start gap-3 p-3 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', meta.color)} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{runbook.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{runbook.summary}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <Badge variant="outline" className={cn('text-xs px-1.5 py-0', meta.color)}>
              {meta.label}
            </Badge>
            {runbook.serviceKey && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 text-amber-400">
                Clave: {runbook.serviceKey}
              </Badge>
            )}
            {runbook.z2Path && (
              <span className="text-xs text-muted-foreground font-mono truncate max-w-[240px]">
                {runbook.z2Path.join(' → ')}
              </span>
            )}
          </div>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-muted-foreground shrink-0 transition-transform', expanded && 'rotate-180')} />
      </button>

      {/* Body */}
      {expanded && (
        <div className="border-t bg-muted px-4 pb-4 space-y-4">
          {/* Fórmula */}
          {runbook.formula && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-muted-foreground tracking-wider mb-1">Fórmula</p>
              <div className="bg-black/30 rounded-ctl p-2.5 font-mono text-sm text-ink-warn">
                {runbook.formula.expression}
              </div>
              <div className="mt-1.5 space-y-0.5">
                {Object.entries(runbook.formula.variables).map(([k, v]) => (
                  <div key={k} className="text-xs text-muted-foreground">
                    <span className="font-mono text-amber-400">{k}</span>: {v}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pasos */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground tracking-wider mb-2">
              Pasos ({runbook.steps.length})
            </p>
            <ol className="space-y-2">
              {runbook.steps.map(step => (
                <li key={step.order} className="flex items-start gap-2">
                  <button
                    onClick={() => toggleStep(step.order)}
                    className="shrink-0 mt-0.5"
                    aria-label={`Paso ${step.order} ${checkedSteps.has(step.order) ? 'completado' : 'pendiente'}`}
                  >
                    <CheckCircle2
                      className={cn(
                        'w-4 h-4 transition-colors',
                        checkedSteps.has(step.order) ? 'text-emerald-400' : 'text-muted-foreground/40',
                      )}
                    />
                  </button>
                  <div className={cn('flex-1 text-xs leading-relaxed', checkedSteps.has(step.order) && 'opacity-50 line-through')}>
                    <span className="font-medium text-muted-foreground mr-1.5">{step.order}.</span>
                    {step.instruction}
                    {step.note && (
                      <span className="block text-amber-400/80 not-italic mt-0.5"><AlertTriangle className="inline h-3 w-3" /> {step.note}</span>
                    )}
                    {step.requiresTool && (
                      <span className="block text-blue-400/80 mt-0.5">
                        <Wrench className="inline h-3 w-3" /> {step.requiresTool.join(', ')}
                      </span>
                    )}
                    {step.durationMin && (
                      <span className="block text-muted-foreground/60 mt-0.5">~{step.durationMin} min</span>
                    )}
                    {step.imageRef && (
                      <a
                        href={step.imageRef}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-primary/80 underline mt-0.5"
                        onClick={e => e.stopPropagation()}
                      >
                        Ver imagen de referencia
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Criterios de éxito */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground tracking-wider mb-1.5">
              Criterios de éxito
            </p>
            <ul className="space-y-1">
              {runbook.successCriteria.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-emerald-400">
                  <span>✓</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Fuente */}
          {!compact && (
            <p className="text-xs text-muted-foreground/60">
              Fuente: {runbook.source}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
