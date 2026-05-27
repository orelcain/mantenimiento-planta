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
  ArrowLeft, BookOpen, ListChecks, GitBranch, AlertTriangle, Clock, Loader2, Wrench, ChevronDown,
  Ruler, Image as ImageIcon, FileText,
} from 'lucide-react'
import { useAuthStore } from '@/store'
import { findMachineBySlug, type LearningSection } from '@/data/learningMachines'
import { LC } from '@/data/learningTheme'
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
      style={{ background: `linear-gradient(135deg, ${LC.bg} 0%, ${LC.bgPanel} 50%, ${LC.bg} 100%)` }}
    >
      {/* Header */}
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-4 sm:px-6 sm:pt-12">
        <button
          onClick={() => navigate('/aprendizaje')}
          className="flex items-center gap-2 text-sm mb-3 -ml-2 px-2 py-3 rounded-lg transition-colors"
          style={{ color: LC.inkLo, minHeight: '44px' }}
          onMouseEnter={e => (e.currentTarget.style.color = LC.aquaBright)}
          onMouseLeave={e => (e.currentTarget.style.color = LC.inkLo)}
        >
          <ArrowLeft className="h-5 w-5" />
          Centro de Aprendizaje
        </button>

        <div className="flex items-center gap-1.5 text-xs mb-4" style={{ color: LC.inkLo }}>
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
            <h1 className="text-2xl sm:text-3xl font-bold text-[#e9eef3]">{machine.name}</h1>
            <p className="text-xs uppercase tracking-wider mt-1" style={{ color: LC.inkLo }}>
              {machine.area}
            </p>
          </div>
        </div>

        <p className="text-sm leading-relaxed" style={{ color: LC.inkMid }}>
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
                  background: isActive ? `${machine.color}1a` : LC.surface,
                  border: `1px solid ${isActive ? machine.color + '55' : LC.border}`,
                  minHeight: '76px',
                }}
              >
                <TabIcon
                  className="h-5 w-5"
                  style={{
                    color: isActive ? machine.color : hasContent ? LC.inkMid : LC.inkGhost,
                  }}
                />
                <span
                  className="text-xs font-semibold text-center leading-tight"
                  style={{ color: isActive ? machine.color : LC.inkMid }}
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
          <h2 className="text-lg font-semibold text-[#e9eef3]">{activeTabData.label}</h2>
          <p className="text-xs mt-0.5" style={{ color: LC.inkLo }}>
            {activeTabData.description}
          </p>
        </div>

        {loadingTab ? (
          <div className="flex items-center justify-center py-12" style={{ color: LC.inkLo }}>
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
            style={{ background: LC.surface, border: `1px solid ${LC.border}` }}
          >
            <p className="text-sm" style={{ color: LC.inkMid }}>
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
          style={{ background: LC.surface, border: `1px solid ${LC.border}` }}
        >
          <div className="h-1" style={{ background: color, opacity: 0.9 }} />
          <div className="p-5">
            <h3 className="text-base font-semibold text-[#e9eef3] mb-1">{proc.title}</h3>
            {proc.description && (
              <p className="text-sm mb-4 whitespace-pre-wrap" style={{ color: LC.inkMid }}>
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
                    <p className="text-sm font-semibold text-[#e9eef3]">{step.title}</p>
                    {step.description && (
                      <p className="text-xs mt-1 leading-relaxed whitespace-pre-wrap" style={{ color: LC.inkMid }}>
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
      {sections.map(sec => {
        const blocks = parseManualContent(sec.content)
        return (
          <article
            key={sec.id}
            className="rounded-xl overflow-hidden"
            style={{ background: LC.surface, border: `1px solid ${LC.border}` }}
          >
            <div className="h-1" style={{ background: color, opacity: 0.9 }} />
            <div className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <span
                  className="flex items-center justify-center w-7 h-7 rounded-lg font-bold text-[11px] flex-shrink-0 tabular-nums"
                  style={{ background: `${color}25`, color }}
                >
                  {sec.order}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold leading-tight text-[#e9eef3]">{sec.title}</h3>
                  {blocks.description && (
                    <p className="text-sm leading-relaxed mt-1.5" style={{ color: LC.inkMid }}>
                      {blocks.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-3">
                {blocks.measurements.length > 0 && (
                  <ManualBlock
                    icon={Ruler}
                    title="Medidas / tolerancias"
                    color={color}
                    items={blocks.measurements}
                    variant="measure"
                  />
                )}
                {blocks.keyPoints.length > 0 && (
                  <ManualBlock
                    icon={FileText}
                    title="Puntos clave"
                    color={color}
                    items={blocks.keyPoints}
                  />
                )}
                {blocks.notes.length > 0 && (
                  <ManualBlock
                    icon={AlertTriangle}
                    title="Notas operativas"
                    color={color}
                    items={blocks.notes}
                    variant="note"
                  />
                )}
                {blocks.images.length > 0 && (
                  <ManualImages images={blocks.images} color={color} />
                )}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

interface ManualContentBlocks {
  description: string
  measurements: string[]
  keyPoints: string[]
  notes: string[]
  images: { label: string; url: string }[]
}

function parseManualContent(content: string): ManualContentBlocks {
  const blocks: ManualContentBlocks = {
    description: '',
    measurements: [],
    keyPoints: [],
    notes: [],
    images: [],
  }
  let current: keyof Omit<ManualContentBlocks, 'description' | 'images'> | 'images' | 'description' = 'description'
  const description: string[] = []

  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line === 'Medidas / tolerancias:') { current = 'measurements'; continue }
    if (line === 'Puntos clave:') { current = 'keyPoints'; continue }
    if (line === 'Notas operativas:') { current = 'notes'; continue }
    if (line === 'Referencias visuales:') { current = 'images'; continue }

    const value = line.startsWith('- ') ? line.slice(2) : line
    if (current === 'description') {
      description.push(value)
    } else if (current === 'images') {
      const match = value.match(/^(.*?):\s*(https?:\/\/\S+|\/\S+)$/)
      blocks.images.push(match ? { label: match[1] || 'Imagen', url: match[2] ?? '' } : { label: value, url: '' })
    } else {
      blocks[current].push(value)
    }
  }

  blocks.description = description.join('\n')
  return blocks
}

function ManualBlock({
  icon: Icon,
  title,
  color,
  items,
  variant = 'default',
}: {
  icon: React.ElementType
  title: string
  color: string
  items: string[]
  variant?: 'default' | 'measure' | 'note'
}) {
  const background = variant === 'note' ? `${color}0d` : LC.surfaceHi
  return (
    <section className="rounded-xl p-4" style={{ background, border: `1px solid ${variant === 'note' ? color + '33' : LC.border}` }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4" style={{ color }} />
        <h4 className="text-xs uppercase tracking-[0.14em] font-bold" style={{ color }}>
          {title}
        </h4>
      </div>
      <ul className={variant === 'measure' ? 'grid gap-2 sm:grid-cols-2' : 'space-y-2'}>
        {items.map((item, index) => (
          <li
            key={`${item}-${index}`}
            className={variant === 'measure' ? 'rounded-lg px-3 py-2 text-sm' : 'flex gap-2.5 text-sm leading-relaxed'}
            style={variant === 'measure'
              ? { background: `${color}10`, border: `1px solid ${color}22`, color: LC.ink }
              : { color: LC.inkMid }}
          >
            {variant === 'measure' ? (
              <span className="whitespace-pre-wrap">{item}</span>
            ) : (
              <>
                <span className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="flex-1 whitespace-pre-wrap">{item}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ManualImages({ images, color }: { images: { label: string; url: string }[]; color: string }) {
  return (
    <section className="rounded-xl p-4" style={{ background: LC.surfaceHi, border: `1px solid ${LC.border}` }}>
      <div className="flex items-center gap-2 mb-3">
        <ImageIcon className="h-4 w-4" style={{ color }} />
        <h4 className="text-xs uppercase tracking-[0.14em] font-bold" style={{ color }}>
          Referencias visuales
        </h4>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {images.map((image, index) => (
          <a
            key={`${image.label}-${index}`}
            href={image.url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="group rounded-lg overflow-hidden"
            style={{ background: LC.surface, border: `1px solid ${color}30` }}
          >
            {image.url ? (
              <img src={image.url} alt={image.label} loading="lazy" className="h-36 w-full object-cover" />
            ) : (
              <div className="h-24 flex items-center justify-center" style={{ color: LC.inkGhost }}>
                <ImageIcon className="h-6 w-6" />
              </div>
            )}
            <div className="px-3 py-2 text-xs leading-snug" style={{ color: LC.inkMid }}>
              {image.label}
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}


function DiagnosisList({ entries, color }: { entries: DiagnosisEntry[]; color: string }) {
  // Acordeón: una fila abierta a la vez. Arranca con la primera abierta.
  const [openId, setOpenId] = useState<string | null>(entries[0]?.id ?? null)

  return (
    <div className="space-y-2.5">
      {entries.map((entry, idx) => {
        const open = openId === entry.id
        return (
          <article
            key={entry.id}
            className="rounded-2xl overflow-hidden transition-colors"
            style={{
              background: LC.surface,
              border: `1px solid ${open ? LC.borderHi : LC.border}`,
              boxShadow: open ? '0 4px 14px rgba(0,0,0,0.28)' : '0 1px 2px rgba(0,0,0,0.3)',
            }}
          >
            {/* Fila clickeable: índice + título + preview del síntoma */}
            <button
              type="button"
              onClick={() => setOpenId(open ? null : entry.id)}
              aria-expanded={open}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
              style={{ background: open ? LC.surfaceHi : 'transparent' }}
            >
              <span
                className="flex items-center justify-center w-7 h-7 rounded-lg font-bold text-sm flex-shrink-0 tabular-nums"
                style={{ background: `${color}22`, color }}
              >
                {idx + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold leading-snug" style={{ color: LC.ink }}>
                  {entry.title || entry.symptom}
                </span>
                {!open && entry.symptom && (
                  <span className="block text-xs mt-0.5 truncate" style={{ color: LC.inkLo }}>
                    {entry.symptom}
                  </span>
                )}
              </span>
              <ChevronDown
                className="h-4 w-4 flex-shrink-0 transition-transform duration-200"
                style={{ color: open ? color : LC.inkLo, transform: open ? 'rotate(180deg)' : 'none' }}
              />
            </button>

            {/* Cuerpo con animación de altura (grid 0fr→1fr, sin saltos) */}
            <div
              style={{
                display: 'grid',
                gridTemplateRows: open ? '1fr' : '0fr',
                transition: 'grid-template-rows 260ms cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              <div style={{ overflow: 'hidden', minHeight: 0 }}>
                <div
                  className="px-4 pb-4 pt-4 space-y-5"
                  style={{ borderTop: `1px solid ${LC.border}` }}
                >
                  {/* Síntoma */}
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] font-semibold mb-1.5" style={{ color: LC.inkLo }}>
                      Síntoma
                    </p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: LC.ink }}>
                      {entry.symptom}
                    </p>
                  </div>

                  {/* Causas */}
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] font-semibold mb-2" style={{ color: LC.inkLo }}>
                      Causas posibles
                    </p>
                    <ul className="space-y-2">
                      {entry.possibleCauses.map((cause, i) => (
                        <li key={i} className="flex gap-2.5 text-sm leading-relaxed" style={{ color: LC.inkMid }}>
                          <span
                            className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ background: color }}
                          />
                          <span className="flex-1 whitespace-pre-wrap">{cause}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Solución — payoff destacado */}
                  <div className="rounded-xl p-4" style={{ background: `${color}0e`, border: `1px solid ${color}33` }}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Wrench className="h-3.5 w-3.5" style={{ color }} />
                      <p className="text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color }}>
                        Solución
                      </p>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: LC.ink }}>
                      {entry.solution}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </article>
        )
      })}
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
      style={{ background: LC.surface, border: `1px dashed ${LC.borderHi}` }}
    >
      <div
        className="flex items-center justify-center w-14 h-14 rounded-full mx-auto mb-4"
        style={{ background: `${color}12`, border: `1px solid ${color}30` }}
      >
        <Clock className="h-7 w-7" style={{ color, opacity: 0.7 }} />
      </div>
      <h3 className="text-base font-semibold text-[#e9eef3] mb-2">Sección en preparación</h3>
      <p className="text-sm mb-1" style={{ color: LC.inkMid }}>
        La sección <strong style={{ color: LC.ink }}>{tabLabel}</strong> de{' '}
        <strong style={{ color: LC.ink }}>{machineName}</strong> aún no tiene contenido publicado.
      </p>
      <p className="text-xs mt-4" style={{ color: LC.inkLo }}>
        El administrador puede agregar contenido desde el panel de administración.
      </p>
    </div>
  )
}
