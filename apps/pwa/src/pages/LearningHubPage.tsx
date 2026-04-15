/**
 * LearningHubPage — Centro de Aprendizaje
 * Hub principal con catalogo de maquinas + herramientas adicionales
 * Ruta: /aprendizaje (publica, sin autenticacion)
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cpu, BookOpen, ArrowRight, Scale } from 'lucide-react'
import { useAuthStore } from '@/store'
import {
  groupMachinesByArea,
  type LearningMachine,
} from '@/data/learningMachines'
import {
  getMachineContentCounts,
  type MachineContentCounts,
} from '@/services/learningContent'

/** Modulos especiales (no son maquinas fisicas) */
interface SpecialModule {
  id: string
  title: string
  subtitle: string
  description: string
  icon: React.ElementType
  href: string
  color: string
  stats: string
}

const SPECIAL_MODULES: SpecialModule[] = [
  {
    id: 'hmi-knuro',
    title: 'HMI Knuro B2',
    subtitle: 'Simulador de Parámetros',
    description:
      'Simulador interactivo del panel HMI Knuro para máquinas Baader. Presets de planta configurados y modo de práctica.',
    icon: Cpu,
    href: '/aprendizaje/hmi-knuro',
    color: '#44ddaa',
    stats: '6 presets · Modo práctica',
  },
  {
    id: 'hmi-grader',
    title: 'HMI Grader',
    subtitle: 'Simulador StaticGrader Marelec Z2',
    description:
      'Simulador interactivo del panel HMI Grader (clasificador automático por peso). Teclado F1-F4 + numpad numérico con funcionalidad real.',
    icon: Scale,
    href: '/aprendizaje/hmi-grader',
    color: '#44dd88',
    stats: 'Modo práctica · 12 pockets',
  },
]

export function LearningHubPage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const machinesByArea = groupMachinesByArea()
  const [countsMap, setCountsMap] = useState<Record<string, MachineContentCounts>>({})

  // Carga counts reales desde Firestore (no bloquea renderizado — fallback a flags estaticas)
  useEffect(() => {
    let cancelled = false
    const slugs = Object.values(machinesByArea).flat().map(m => m.slug)
    Promise.all(
      slugs.map(async slug => {
        try {
          const counts = await getMachineContentCounts(slug)
          return [slug, counts] as const
        } catch {
          return null
        }
      })
    ).then(results => {
      if (cancelled) return
      const map: Record<string, MachineContentCounts> = {}
      for (const r of results) {
        if (r) map[r[0]] = r[1]
      }
      setCountsMap(map)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Dentro de MainLayout (autenticado): usar min-h-full para no generar doble scroll
  // Publico (standalone): usar min-h-dvh para ocupar toda la pantalla
  const heightClass = isAuthenticated ? 'min-h-full' : 'min-h-dvh'

  return (
    <div
      className={`${heightClass} w-full flex flex-col`}
      style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%)' }}
    >
      {/* Header */}
      <div className="max-w-5xl w-full mx-auto px-4 pt-8 pb-6 sm:px-6 sm:pt-12 sm:pb-8 flex flex-col items-center text-center gap-3">
        <div
          className="flex items-center justify-center w-14 h-14 rounded-2xl"
          style={{ background: 'rgba(68,153,255,.14)', border: '1px solid rgba(68,153,255,.28)' }}
        >
          <BookOpen className="h-8 w-8 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Centro de Aprendizaje
          </h1>
          <p className="text-sm text-[#7a9ab8] mt-1">
            Manuales, procedimientos y diagnóstico por máquina
          </p>
        </div>
      </div>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 pb-6 sm:px-6">
        {/* Machines by area */}
        {Object.entries(machinesByArea).map(([area, machines]) => (
          <section key={area} className="mb-8">
            <h2 className="text-xs uppercase tracking-widest font-semibold mb-3 text-[#6a90b8]">
              {area}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {machines.map(machine => (
                <MachineCard
                  key={machine.slug}
                  machine={machine}
                  counts={countsMap[machine.slug]}
                  onClick={() => {
                    const route = machine.customRoute || `/aprendizaje/maquina/${machine.slug}`
                    navigate(route)
                  }}
                />
              ))}
            </div>
          </section>
        ))}

        {/* Special modules (simuladores, herramientas) */}
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-widest font-semibold mb-3 text-[#6a90b8]">
            Herramientas adicionales
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {SPECIAL_MODULES.map(mod => {
              const Icon = mod.icon
              return (
                <button
                  key={mod.id}
                  onClick={() => navigate(mod.href)}
                  className="group text-left rounded-xl border transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(22,28,42,0.9) 0%, rgba(18,24,38,0.95) 100%)',
                    borderColor: '#1e3a5f',
                    minHeight: '80px',
                  }}
                >
                  <div
                    className="h-1.5 rounded-t-xl"
                    style={{ background: mod.color, opacity: 0.9 }}
                  />
                  <div className="p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className="flex items-center justify-center w-11 h-11 rounded-xl flex-shrink-0"
                        style={{
                          background: `${mod.color}18`,
                          border: `1px solid ${mod.color}40`,
                        }}
                      >
                        <Icon className="h-6 w-6" style={{ color: mod.color }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base sm:text-lg font-semibold text-white">
                          {mod.title}
                        </h3>
                        <p className="text-xs text-[#7a9ab8] mt-0.5">{mod.subtitle}</p>
                      </div>
                    </div>
                    <p className="text-sm text-[#aab8c8] leading-relaxed mb-4">
                      {mod.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#6a90b8]">{mod.stats}</span>
                      <span
                        className="flex items-center gap-1.5 text-sm font-semibold py-2 px-4 rounded-lg"
                        style={{ background: `${mod.color}25`, color: mod.color }}
                      >
                        Abrir <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      </main>

      {/* Footer */}
      <div className="pb-6 sm:pb-8 text-center">
        <p className="text-xs text-[#4a7aaa] uppercase tracking-wider">
          No requiere inicio de sesión · Acceso libre para técnicos
        </p>
      </div>
    </div>
  )
}

/** Card de maquina con indicadores de secciones disponibles */
function MachineCard({
  machine,
  counts,
  onClick,
}: {
  machine: LearningMachine
  counts?: MachineContentCounts
  onClick: () => void
}) {
  const Icon = machine.icon
  // Si hay counts reales de Firestore, usar esos. Sino fallback a flags estaticas.
  const hasCounts = counts !== undefined
  const sectionFlags = hasCounts
    ? {
        manual: counts.manual > 0 || machine.sections.manual,
        procedures: counts.procedures > 0,
        flows: counts.flows > 0,
        diagnosis: counts.diagnosis > 0,
      }
    : machine.sections
  const enabledCount = Object.values(sectionFlags).filter(Boolean).length
  const hasContent = enabledCount > 0

  return (
    <button
      onClick={onClick}
      className="group text-left rounded-xl border transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
      style={{
        background:
          'linear-gradient(135deg, rgba(22,28,42,0.9) 0%, rgba(18,24,38,0.95) 100%)',
        borderColor: hasContent ? machine.color + '35' : '#1e3a5f',
        minHeight: '120px',
      }}
    >
      <div
        className="h-1 rounded-t-xl"
        style={{ background: machine.color, opacity: hasContent ? 0.9 : 0.4 }}
      />
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0"
            style={{
              background: `${machine.color}18`,
              border: `1px solid ${machine.color}40`,
            }}
          >
            <Icon className="h-5 w-5" style={{ color: machine.color }} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-white leading-tight">{machine.name}</h3>
            <p
              className="text-xs uppercase tracking-wider mt-1"
              style={{ color: hasContent ? machine.color : '#6a90b8' }}
            >
              {hasContent ? `${enabledCount}/4 secciones` : 'En preparación'}
            </p>
          </div>
        </div>

        {/* Section indicators */}
        <div className="flex items-center gap-1.5 mt-3">
          <SectionDot
            enabled={sectionFlags.manual}
            count={counts?.manual}
            color={machine.color}
            label="M"
            title="Manual"
          />
          <SectionDot
            enabled={sectionFlags.procedures}
            count={counts?.procedures}
            color={machine.color}
            label="P"
            title="Procedimientos"
          />
          <SectionDot
            enabled={sectionFlags.flows}
            count={counts?.flows}
            color={machine.color}
            label="F"
            title="Flujos"
          />
          <SectionDot
            enabled={sectionFlags.diagnosis}
            count={counts?.diagnosis}
            color={machine.color}
            label="D"
            title="Diagnóstico"
          />
          <span className="flex-1" />
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            style={{ color: hasContent ? machine.color : '#4a6a8a' }}
          />
        </div>
      </div>
    </button>
  )
}

function SectionDot({
  enabled,
  count,
  color,
  label,
  title,
}: {
  enabled: boolean
  count?: number
  color: string
  label: string
  title: string
}) {
  const tooltip = count !== undefined && count > 0 ? `${title}: ${count}` : title
  return (
    <span
      title={tooltip}
      className="relative flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold"
      style={{
        background: enabled ? `${color}28` : 'rgba(255,255,255,0.02)',
        color: enabled ? color : '#3a4a5a',
        border: `1px solid ${enabled ? color + '50' : '#1e3a5f'}`,
      }}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-[3px] rounded-full text-[9px] font-bold flex items-center justify-center"
          style={{
            background: color,
            color: '#0a1628',
            lineHeight: 1,
          }}
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </span>
  )
}
