/**
 * Visor interactivo de flujos de reacción ante incidencias.
 *
 * Renderiza cada Flow como un diagrama vertical con nodos clicables:
 *   [TRIGGER] → [PASO 1] → [PASO 2] → ... → [✓ FIN]
 *
 * - Nodos clicables: al tocar se expande la instrucción completa
 * - Tooltips con el texto de cada paso
 * - Conexiones animadas entre nodos
 * - Responsive: vertical en mobile, con scroll horizontal si hay muchos pasos
 */
import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Flow } from '@/services/learningContent'

interface Props {
  flows: Flow[]
  color: string
}

export function FlowDiagramViewer({ flows, color }: Props) {
  const [expandedFlow, setExpandedFlow] = useState<string | null>(
    flows.length === 1 ? flows[0]?.id ?? null : null,
  )

  if (flows.length === 0) return null

  return (
    <div className="space-y-4">
      {flows.map((flow) => {
        const isOpen = expandedFlow === flow.id
        return (
          <article
            key={flow.id}
            className="rounded-xl overflow-hidden"
            style={{ background: 'rgba(22,28,42,0.8)', border: '1px solid #1e3a5f' }}
          >
            <div className="h-1" style={{ background: color, opacity: 0.9 }} />

            {/* Header colapsable */}
            <button
              type="button"
              className="w-full text-left p-4 sm:p-5 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition-colors"
              onClick={() => setExpandedFlow(isOpen ? null : flow.id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
                  style={{ background: `${color}18`, border: `1px solid ${color}40` }}
                >
                  <Zap className="h-4 w-4" style={{ color }} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-semibold text-white truncate">{flow.title}</h3>
                  <p className="text-[11px] text-[#7a9ab8] mt-0.5">
                    {flow.actions.length} pasos · Flujo de reacción
                  </p>
                </div>
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-[#6a90b8] transition-transform shrink-0',
                  isOpen && 'rotate-180',
                )}
              />
            </button>

            {/* Diagrama de flujo */}
            {isOpen && (
              <div className="px-4 sm:px-5 pb-5">
                <FlowDiagram flow={flow} color={color} />
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

// ── Diagrama de un flujo individual ─────────────────────────────────────────

function FlowDiagram({ flow, color }: { flow: Flow; color: string }) {
  const [activeStep, setActiveStep] = useState<number | null>(null)

  return (
    <div className="relative">
      {/* Nodo trigger */}
      <FlowNode
        type="trigger"
        color={color}
        label="Cuando sucede"
        content={flow.trigger}
        isActive={activeStep === -1}
        onClick={() => setActiveStep(activeStep === -1 ? null : -1)}
      />

      {/* Conector */}
      <FlowConnector color={color} animated />

      {/* Nodos de acción */}
      {flow.actions.map((action, idx) => (
        <div key={idx}>
          <FlowNode
            type="action"
            color={color}
            label={`Paso ${idx + 1}`}
            content={action}
            stepNumber={idx + 1}
            isActive={activeStep === idx}
            onClick={() => setActiveStep(activeStep === idx ? null : idx)}
          />
          {idx < flow.actions.length - 1 && <FlowConnector color={color} />}
        </div>
      ))}

      {/* Conector final */}
      <FlowConnector color={color} />

      {/* Nodo fin */}
      <FlowNode
        type="end"
        color={color}
        label="Acción completada"
        content="Verificar que el problema fue resuelto y registrar la incidencia si aplica."
        isActive={activeStep === flow.actions.length}
        onClick={() => setActiveStep(activeStep === flow.actions.length ? null : flow.actions.length)}
      />
    </div>
  )
}

// ── Nodo del diagrama ───────────────────────────────────────────────────────

function FlowNode({
  type,
  color,
  label,
  content,
  stepNumber,
  isActive,
  onClick,
}: {
  type: 'trigger' | 'action' | 'end'
  color: string
  label: string
  content: string
  stepNumber?: number
  isActive: boolean
  onClick: () => void
}) {
  const bgColor = type === 'trigger'
    ? `${color}12`
    : type === 'end'
    ? 'rgba(16,185,129,0.08)'
    : 'rgba(255,255,255,0.03)'

  const borderColor = type === 'trigger'
    ? `${color}40`
    : type === 'end'
    ? 'rgba(16,185,129,0.3)'
    : isActive
    ? `${color}50`
    : '#1e3a5f'

  const Icon = type === 'trigger' ? AlertTriangle : type === 'end' ? CheckCircle2 : null

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border transition-all duration-200',
        isActive ? 'ring-1 ring-offset-0' : 'hover:brightness-110',
      )}
      style={{
        background: bgColor,
        borderColor,
        boxShadow: isActive ? `0 0 0 1px ${color}` : undefined,
      }}
    >
      <div className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          {/* Icono / número */}
          <div
            className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 text-xs font-bold"
            style={{
              background: type === 'end' ? 'rgba(16,185,129,0.15)' : `${color}20`,
              color: type === 'end' ? 'rgb(16,185,129)' : color,
              border: `1.5px solid ${type === 'end' ? 'rgba(16,185,129,0.4)' : `${color}50`}`,
            }}
          >
            {Icon ? <Icon className="h-4 w-4" /> : stepNumber}
          </div>

          <div className="min-w-0 flex-1">
            <p
              className="text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: type === 'end' ? 'rgb(16,185,129)' : color }}
            >
              {label}
            </p>
            <p
              className={cn(
                'text-sm mt-0.5 transition-all duration-200',
                isActive
                  ? 'whitespace-pre-wrap text-[#d0dce8]'
                  : 'line-clamp-1 text-[#8aa0b8]',
              )}
            >
              {content}
            </p>
            {!isActive && content.length > 60 && (
              <p className="text-[10px] mt-1" style={{ color: `${color}90` }}>
                toca para ver completo
              </p>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Conector entre nodos ────────────────────────────────────────────────────

function FlowConnector({ color, animated = false }: { color: string; animated?: boolean }) {
  return (
    <div className="flex justify-center py-1">
      <div className="relative flex flex-col items-center">
        <div
          className={cn('w-0.5 h-6 rounded-full', animated && 'animate-pulse')}
          style={{ background: `${color}40` }}
        />
        <div
          className="w-0 h-0"
          style={{
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: `6px solid ${color}60`,
          }}
        />
      </div>
    </div>
  )
}
