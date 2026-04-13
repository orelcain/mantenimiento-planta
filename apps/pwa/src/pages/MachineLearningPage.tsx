/**
 * MachineLearningPage — Pagina generica de maquina en el Centro de Aprendizaje
 * Ruta: /aprendizaje/maquina/:slug
 *
 * Muestra 4 secciones (tabs): Manual, Procedimientos, Flujos, Diagnostico.
 * Si la seccion esta vacia, muestra empty state.
 */
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, BookOpen, ListChecks, GitBranch, AlertTriangle, Clock, Loader2,
} from 'lucide-react'
import { useAuthStore } from '@/store'
import { findMachineBySlug, type LearningSection } from '@/data/learningMachines'
import {
  listProcedures,
  listManualSections,
  listFlows,
  listDiagnosis,
  type Procedure,
  type ManualSection,
  type Flow,
  type DiagnosisEntry,
} from '@/services/learningContent'
import { OtherLearningModulesStrip } from '@/components/learning/OtherLearningModulesStrip'
import { FlowDiagramViewer } from '@/components/learning/FlowDiagramViewer'

interface TabDef {
  id: LearningSection
  label: string
  shortLabel: string
  icon: React.ElementType
  description: string
}

const TABS: TabDef[] = [
  {
    id: 'manual',
    label: 'Manual',
    shortLabel: 'Manual',
    icon: BookOpen,
    description: 'Ajustes, medidas, calibracion y especificaciones tecnicas.',
  },
  {
    id: 'procedures',
    label: 'Procedimientos',
    shortLabel: 'Proced.',
    icon: ListChecks,
    description: 'Paso a paso con fotos para tareas frecuentes.',
  },
  {
    id: 'flows',
    label: '¿Que hago cuando...?',
    shortLabel: 'Flujos',
    icon: GitBranch,
    description: 'Flujos de accion y checklists de decision.',
  },
  {
    id: 'diagnosis',
    label: 'Diagnostico',
    shortLabel: 'Fallas',
    icon: AlertTriangle,
    description: 'Sintoma → Causa probable → Solucion.',
  },
]

export function MachineLearningPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const [activeTab, setActiveTab] = useState<LearningSection>('manual')
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [manualSections, setManualSections] = useState<ManualSection[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [diagnosis, setDiagnosis] = useState<DiagnosisEntry[]>([])
  const [loadingTab, setLoadingTab] = useState(false)

  const machine = slug ? findMachineBySlug(slug) : undefined

  // Cargar contenido de Firestore segun tab activo
  useEffect(() => {
    if (!machine || machine.customRoute) return
    let cancelled = false
    setLoadingTab(true)

    const loader =
      activeTab === 'procedures'
        ? listProcedures(machine.slug).then(list => {
            if (!cancelled) setProcedures(list)
          })
        : activeTab === 'manual'
        ? listManualSections(machine.slug).then(list => {
            if (!cancelled) setManualSections(list)
          })
        : activeTab === 'flows'
        ? listFlows(machine.slug).then(list => {
            if (!cancelled) setFlows(list)
          })
        : listDiagnosis(machine.slug).then(list => {
            if (!cancelled) setDiagnosis(list)
          })

    loader
      .catch(() => {
        // En silencio: mantiene empty state
      })
      .finally(() => {
        if (!cancelled) setLoadingTab(false)
      })

    return () => {
      cancelled = true
    }
  }, [machine, activeTab])

  if (!machine) {
    return <Navigate to="/aprendizaje" replace />
  }

  // Si la maquina tiene pagina propia (Baader 200), redirigir
  if (machine.customRoute) {
    return <Navigate to={machine.customRoute} replace />
  }

  const Icon = machine.icon
  const activeTabData = TABS.find(t => t.id === activeTab)!
  // Habilitado si hay items reales en Firestore para ese tab
  const activeCount =
    activeTab === 'procedures'
      ? procedures.length
      : activeTab === 'manual'
      ? manualSections.length
      : activeTab === 'flows'
      ? flows.length
      : diagnosis.length
  const sectionEnabled = activeCount > 0 || machine.sections[activeTab]

  // Altura adaptativa: dentro de MainLayout usar min-h-full, publico usar min-h-dvh
  const heightClass = isAuthenticated ? 'min-h-full' : 'min-h-dvh'

  return (
    <div
      className={`${heightClass} w-full`}
      style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0d1f3c 50%, #0a1628 100%)' }}
    >
      {/* Header */}
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-4 sm:px-6 sm:pt-12">
        <button
          onClick={() => navigate('/aprendizaje')}
          className="flex items-center gap-2 text-sm mb-3 -ml-2 px-2 py-3 rounded-lg transition-colors"
          style={{ color: '#5a7a9a', minHeight: '44px' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#7ab8ff')}
          onMouseLeave={e => (e.currentTarget.style.color = '#5a7a9a')}
        >
          <ArrowLeft className="h-5 w-5" />
          Centro de Aprendizaje
        </button>

        <div className="flex items-center gap-1.5 text-xs mb-4" style={{ color: '#6a90b8' }}>
          <span>Aprendizaje</span>
          <span>/</span>
          <span style={{ color: machine.color }}>{machine.name}</span>
        </div>

        <div className="flex items-start gap-4 mb-3">
          <div
            className="flex items-center justify-center w-14 h-14 rounded-2xl flex-shrink-0"
            style={{ background: `${machine.color}18`, border: `1px solid ${machine.color}40` }}
          >
            <Icon className="h-7 w-7" style={{ color: machine.color }} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{machine.name}</h1>
            <p className="text-xs uppercase tracking-wider mt-1" style={{ color: '#6a90b8' }}>
              {machine.area}
            </p>
          </div>
        </div>

        <p className="text-sm leading-relaxed" style={{ color: '#aab8c8' }}>
          {machine.description}
        </p>
      </div>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 mt-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TABS.map(tab => {
            const TabIcon = tab.icon
            const isActive = activeTab === tab.id
            const tabCount =
              tab.id === 'procedures'
                ? procedures.length
                : tab.id === 'manual'
                ? manualSections.length
                : tab.id === 'flows'
                ? flows.length
                : diagnosis.length
            const hasContent = tabCount > 0 || machine.sections[tab.id]
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-all relative"
                style={{
                  background: isActive ? `${machine.color}1a` : 'rgba(22,28,42,0.6)',
                  border: `1px solid ${isActive ? machine.color + '55' : '#1e3a5f'}`,
                  minHeight: '76px',
                }}
              >
                <TabIcon
                  className="h-5 w-5"
                  style={{
                    color: isActive ? machine.color : hasContent ? '#8a9aaa' : '#4a5a6a',
                  }}
                />
                <span
                  className="text-xs font-semibold text-center leading-tight"
                  style={{ color: isActive ? machine.color : '#8a9aaa' }}
                >
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </span>
                {hasContent && !isActive && (
                  <span
                    className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
                    style={{ background: machine.color }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content area */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 pb-12">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-white">{activeTabData.label}</h2>
          <p className="text-xs mt-0.5" style={{ color: '#6a90b8' }}>
            {activeTabData.description}
          </p>
        </div>

        {loadingTab ? (
          <div className="flex items-center justify-center py-12" style={{ color: '#6a90b8' }}>
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Cargando...
          </div>
        ) : activeTab === 'procedures' && procedures.length > 0 ? (
          <ProceduresList procedures={procedures} color={machine.color} />
        ) : activeTab === 'manual' && manualSections.length > 0 ? (
          <ManualList sections={manualSections} color={machine.color} />
        ) : activeTab === 'flows' && flows.length > 0 ? (
          <FlowDiagramViewer flows={flows} color={machine.color} />
        ) : activeTab === 'diagnosis' && diagnosis.length > 0 ? (
          <DiagnosisList entries={diagnosis} color={machine.color} />
        ) : sectionEnabled ? (
          <div
            className="rounded-xl p-6"
            style={{ background: 'rgba(22,28,42,0.8)', border: '1px solid #1e3a5f' }}
          >
            <p className="text-sm" style={{ color: '#aab8c8' }}>
              Contenido disponible — proximamente cargado desde Firestore.
            </p>
          </div>
        ) : (
          <EmptySection
            color={machine.color}
            tabLabel={activeTabData.label}
            machineName={machine.name}
          />
        )}

        <OtherLearningModulesStrip currentSlug={machine.slug} accent={machine.color} />
      </div>
    </div>
  )
}

function ProceduresList({ procedures, color }: { procedures: Procedure[]; color: string }) {
  return (
    <div className="space-y-4">
      {procedures.map(proc => (
        <article
          key={proc.id}
          className="rounded-xl overflow-hidden"
          style={{ background: 'rgba(22,28,42,0.8)', border: '1px solid #1e3a5f' }}
        >
          <div className="h-1" style={{ background: color, opacity: 0.9 }} />
          <div className="p-5">
            <h3 className="text-base font-semibold text-white mb-1">{proc.title}</h3>
            {proc.description && (
              <p className="text-sm mb-4" style={{ color: '#aab8c8' }}>
                {proc.description}
              </p>
            )}
            <ol className="space-y-4 mt-4">
              {proc.steps.map(step => (
                <li key={step.order} className="flex gap-3">
                  <span
                    className="flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs flex-shrink-0"
                    style={{ background: `${color}25`, color }}
                  >
                    {step.order}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{step.title}</p>
                    {step.description && (
                      <p className="text-xs mt-1 leading-relaxed whitespace-pre-wrap" style={{ color: '#aab8c8' }}>
                        {step.description}
                      </p>
                    )}
                    {step.imageUrl && (
                      <a
                        href={step.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mt-2"
                      >
                        <img
                          src={step.imageUrl}
                          alt={step.title}
                          loading="lazy"
                          className="max-h-60 rounded-lg border"
                          style={{ borderColor: `${color}40` }}
                        />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </article>
      ))}
    </div>
  )
}

function ManualList({ sections, color }: { sections: ManualSection[]; color: string }) {
  return (
    <div className="space-y-4">
      {sections.map(sec => (
        <article
          key={sec.id}
          className="rounded-xl overflow-hidden"
          style={{ background: 'rgba(22,28,42,0.8)', border: '1px solid #1e3a5f' }}
        >
          <div className="h-1" style={{ background: color, opacity: 0.9 }} />
          <div className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="flex items-center justify-center w-6 h-6 rounded-full font-bold text-[11px]"
                style={{ background: `${color}25`, color }}
              >
                {sec.order}
              </span>
              <h3 className="text-base font-semibold text-white">{sec.title}</h3>
            </div>
            <p
              className="text-sm leading-relaxed whitespace-pre-wrap"
              style={{ color: '#c0d0e0' }}
            >
              {sec.content}
            </p>
          </div>
        </article>
      ))}
    </div>
  )
}


function DiagnosisList({ entries, color }: { entries: DiagnosisEntry[]; color: string }) {
  return (
    <div className="space-y-4">
      {entries.map(entry => (
        <article
          key={entry.id}
          className="rounded-xl overflow-hidden"
          style={{ background: 'rgba(22,28,42,0.8)', border: '1px solid #1e3a5f' }}
        >
          <div className="h-1" style={{ background: '#ff8844', opacity: 0.9 }} />
          <div className="p-5">
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-1 text-orange-400">
                Síntoma
              </p>
              <h3 className="text-base font-semibold text-white leading-snug whitespace-pre-wrap">
                {entry.symptom}
              </h3>
            </div>

            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-1.5 text-orange-400">
                Causas posibles
              </p>
              <ul className="space-y-1.5">
                {entry.possibleCauses.map((cause, idx) => (
                  <li key={idx} className="flex gap-2 text-sm" style={{ color: '#c0d0e0' }}>
                    <span className="text-orange-400 flex-shrink-0">•</span>
                    <span className="flex-1 whitespace-pre-wrap">{cause}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div
              className="rounded-lg p-3"
              style={{ background: `${color}10`, border: `1px solid ${color}30` }}
            >
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color }}>
                Solución
              </p>
              <p className="text-sm whitespace-pre-wrap" style={{ color: '#d0dce8' }}>
                {entry.solution}
              </p>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

function EmptySection({
  color,
  tabLabel,
  machineName,
}: {
  color: string
  tabLabel: string
  machineName: string
}) {
  return (
    <div
      className="rounded-xl p-8 text-center"
      style={{ background: 'rgba(22,28,42,0.5)', border: '1px dashed #2a4a6a' }}
    >
      <div
        className="flex items-center justify-center w-14 h-14 rounded-full mx-auto mb-4"
        style={{ background: `${color}12`, border: `1px solid ${color}30` }}
      >
        <Clock className="h-7 w-7" style={{ color, opacity: 0.7 }} />
      </div>
      <h3 className="text-base font-semibold text-white mb-2">Sección en preparación</h3>
      <p className="text-sm mb-1" style={{ color: '#aab8c8' }}>
        La sección <strong style={{ color: '#fff' }}>{tabLabel}</strong> de{' '}
        <strong style={{ color: '#fff' }}>{machineName}</strong> aún no tiene contenido publicado.
      </p>
      <p className="text-xs mt-4" style={{ color: '#6a90b8' }}>
        El administrador puede agregar contenido desde el panel de administración.
      </p>
    </div>
  )
}
