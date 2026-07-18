import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import type { PointZeroSuggestion } from '@/services/grader/suggestions/types'

const SEVERITY_STYLES = {
  warning:     { border: 'border-red-500/40',    bg: 'bg-red-500/15',    badge: 'bg-red-500/20 text-red-700 dark:text-red-400',    dot: 'bg-red-400'    },
  recommended: { border: 'border-amber-500/40',  bg: 'bg-amber-500/15',  badge: 'bg-amber-500/20 text-amber-700 dark:text-amber-400', dot: 'bg-amber-400'  },
  info:        { border: 'border-sky-500/30',     bg: 'bg-sky-500/8',     badge: 'bg-sky-500/20 text-sky-400',    dot: 'bg-sky-400'    },
} as const

const CONFIDENCE_LABELS = {
  high:   { label: 'Alta',   color: 'text-emerald-400' },
  medium: { label: 'Media',  color: 'text-amber-400'   },
  low:    { label: 'Baja',   color: 'text-red-400'     },
} as const

const SOURCE_ICONS = {
  fishbase:    '🐟',
  historical:  '📅',
  batch:       '📊',
  geometric:   '📐',
  datasheet:   '📋',
  measurement: '🎥',
} as const

interface Props {
  suggestion: PointZeroSuggestion
}

export function SuggestionCard({ suggestion: s }: Props) {
  const [expanded, setExpanded] = useState(false)
  const style = SEVERITY_STYLES[s.severity]
  const conf = CONFIDENCE_LABELS[s.confidence]
  const hasApply = typeof s.suggestedValue === 'number'

  return (
    <div className={cn('rounded-lg border text-xs overflow-hidden', style.border, style.bg)}>
      {/* Header (siempre visible) */}
      <button
        type="button"
        className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-white/5 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={cn('mt-0.5 h-2 w-2 rounded-full flex-shrink-0', style.dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-foreground">{s.parameter}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{s.currentValue} {s.unit}</span>
            <span className="text-muted-foreground">→</span>
            <span className="font-semibold text-foreground">{s.suggestedValue} {typeof s.suggestedValue === 'number' ? s.unit : ''}</span>
            <span className={cn('ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium', style.badge)}>
              {SOURCE_ICONS[s.source]} {s.sourceLabel}
            </span>
          </div>
          <p className="text-muted-foreground mt-0.5 line-clamp-2">{s.reasoning}</p>
        </div>
        <ChevronDown className={cn('h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-white/10 pt-2.5">
          {/* 🧠 Por qué */}
          <div>
            <p className="font-semibold text-muted-foreground mb-1">🧠 Por qué</p>
            <p className="text-muted-foreground leading-relaxed">{s.reasoning}</p>
          </div>

          {/* 📊 Datos usados */}
          {s.dataPoints.length > 0 && (
            <div>
              <p className="font-semibold text-muted-foreground mb-1">📊 Datos usados</p>
              <div className="space-y-0.5">
                {s.dataPoints.map((dp, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{dp.label}</span>
                    <span className="font-mono text-foreground">{dp.value}
                      {dp.detail && <span className="text-muted-foreground/60 ml-1 text-[10px]">({dp.detail})</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 🔬 Fórmula */}
          {s.formula && (
            <div>
              <p className="font-semibold text-muted-foreground mb-1">🔬 Fórmula</p>
              <pre className="font-mono text-[10px] text-foreground/80 whitespace-pre-wrap bg-black/20 rounded p-2">{s.formula}</pre>
            </div>
          )}

          {/* 🎯 Confianza */}
          <div>
            <p className="font-semibold text-muted-foreground mb-1">🎯 Confianza: <span className={conf.color}>{conf.label}</span></p>
            <p className="text-muted-foreground">{s.confidenceReason}</p>
          </div>

          {/* ⚠️ Impacto */}
          {s.impactText && (
            <div>
              <p className="font-semibold text-muted-foreground mb-1">⚠️ Impacto esperado</p>
              <p className="text-muted-foreground">{s.impactText}</p>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-2 pt-1">
            {hasApply && (
              <button
                type="button"
                onClick={s.applyFn}
                className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors"
              >
                Aplicar
              </button>
            )}
            {s.ignoreFn && (
              <button
                type="button"
                onClick={s.ignoreFn}
                className="px-3 py-1.5 rounded border border-slate-600 hover:bg-slate-700 text-muted-foreground text-xs transition-colors"
              >
                Ignorar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
