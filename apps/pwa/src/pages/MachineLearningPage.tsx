/**
 * MachineLearningPage — Pagina generica de maquina en el Centro de Aprendizaje
 * Ruta: /aprendizaje/maquina/:slug
 *
 * Muestra 4 secciones (tabs): Manual, Procedimientos, Flujos, Diagnostico.
 * Si la seccion esta vacia, muestra empty state.
 */
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, BookOpen, ListChecks, GitBranch, AlertTriangle, Clock,
} from 'lucide-react'
import { useAuthStore } from '@/store'
import { findMachineBySlug, type LearningSection } from '@/data/learningMachines'

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

  const machine = slug ? findMachineBySlug(slug) : undefined

  if (!machine) {
    return <Navigate to="/aprendizaje" replace />
  }

  // Si la maquina tiene pagina propia (Baader 200), redirigir
  if (machine.customRoute) {
    return <Navigate to={machine.customRoute} replace />
  }

  const Icon = machine.icon
  const activeTabData = TABS.find(t => t.id === activeTab)!
  const sectionEnabled = machine.sections[activeTab]

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
            const hasContent = machine.sections[tab.id]
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

        {sectionEnabled ? (
          <ContentPlaceholder color={machine.color} />
        ) : (
          <EmptySection
            color={machine.color}
            tabLabel={activeTabData.label}
            machineName={machine.name}
          />
        )}
      </div>
    </div>
  )
}

function ContentPlaceholder({ color }: { color: string }) {
  return (
    <div
      className="rounded-xl p-6"
      style={{ background: 'rgba(22,28,42,0.8)', border: '1px solid #1e3a5f' }}
    >
      <p className="text-sm" style={{ color: '#aab8c8' }}>
        Contenido disponible — pendiente de conexion a Firestore.
      </p>
      <p className="text-xs mt-2" style={{ color: '#6a90b8' }}>
        (Color de referencia: <span style={{ color }}>{color}</span>)
      </p>
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
