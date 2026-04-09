/**
 * OtherLearningModulesStrip — Chips de navegacion cruzada entre sub-modulos de aprendizaje.
 * Se muestra al fondo de cada sub-pagina para saltar entre maquinas sin volver al hub.
 */
import { useNavigate } from 'react-router-dom'
import { Cpu, Home } from 'lucide-react'
import { LEARNING_MACHINES, type LearningMachine } from '@/data/learningMachines'

interface OtherLearningModulesStripProps {
  /** Slug de la maquina o modulo actual, para excluirlo de la lista */
  currentSlug?: string
  /** Acento visual (opcional) — usa color neutro si no se pasa */
  accent?: string
}

interface StripItem {
  key: string
  label: string
  href: string
  icon: React.ElementType
  color: string
}

function buildItems(currentSlug?: string): StripItem[] {
  const machineItems: StripItem[] = LEARNING_MACHINES
    .filter(m => m.slug !== currentSlug)
    .map((m: LearningMachine) => ({
      key: m.slug,
      label: m.name,
      href: m.customRoute || `/aprendizaje/maquina/${m.slug}`,
      icon: m.icon,
      color: m.color,
    }))

  const specialItems: StripItem[] = [
    {
      key: 'hmi-knuro',
      label: 'HMI Knuro B2',
      href: '/aprendizaje/hmi-knuro',
      icon: Cpu,
      color: '#44ddaa',
    },
  ].filter(item => item.key !== currentSlug)

  return [...machineItems, ...specialItems]
}

export function OtherLearningModulesStrip({
  currentSlug,
  accent = '#4499ff',
}: OtherLearningModulesStripProps) {
  const navigate = useNavigate()
  const items = buildItems(currentSlug)

  if (items.length === 0) return null

  return (
    <nav
      aria-label="Otros módulos de aprendizaje"
      className="mt-10 pt-6"
      style={{ borderTop: '1px solid #1e3a5f' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3
          className="text-xs uppercase tracking-widest font-semibold"
          style={{ color: '#6a90b8' }}
        >
          Otros módulos
        </h3>
        <button
          onClick={() => navigate('/aprendizaje')}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors"
          style={{
            color: accent,
            background: `${accent}12`,
            border: `1px solid ${accent}30`,
            minHeight: '36px',
          }}
        >
          <Home className="h-3.5 w-3.5" />
          Ir al Hub
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map(item => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              onClick={() => navigate(item.href)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: `${item.color}10`,
                border: `1px solid ${item.color}35`,
                color: '#d8e4f0',
                minHeight: '36px',
              }}
              title={item.label}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: item.color }} />
              <span className="truncate max-w-[140px]">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
