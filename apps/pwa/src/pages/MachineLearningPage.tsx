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
  Ruler, Image as ImageIcon, FileText, Gauge, ClipboardCheck, ShieldCheck, Activity,
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
  const ActiveIcon = activeTabData.icon
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
      style={{
        background:
          `radial-gradient(circle at 18% 0%, ${machine.color}14 0, transparent 32%), ` +
          `linear-gradient(180deg, ${LC.bgPanel} 0%, ${LC.bg} 38%, ${LC.bg} 100%)`,
      }}
    >
      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 pt-4 pb-3 sm:px-6 sm:pt-10 sm:pb-4">
        <button
          onClick={() => navigate('/aprendizaje')}
          className="flex items-center gap-2 text-sm mb-3 -ml-2 px-2 py-2 rounded-lg transition-colors sm:mb-5 sm:py-3"
          style={{ color: LC.inkLo, minHeight: '44px' }}
          onMouseEnter={e => (e.currentTarget.style.color = LC.aquaBright)}
          onMouseLeave={e => (e.currentTarget.style.color = LC.inkLo)}
        >
          <ArrowLeft className="h-5 w-5" />
          Centro de Aprendizaje
        </button>

        <section
          className="overflow-hidden rounded-lg"
          style={{ background: LC.surface, border: `1px solid ${LC.border}` }}
        >
          <div className="grid lg:grid-cols-[1fr_340px]">
            <div className="p-5 sm:p-6 lg:p-7">
              <div className="flex items-center gap-1.5 text-xs mb-5" style={{ color: LC.inkLo }}>
                <span>Aprendizaje</span>
                <span>/</span>
                <span style={{ color: machine.color }}>{machine.name}</span>
              </div>

              <div className="flex items-start gap-3 sm:gap-4">
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-lg flex-shrink-0 sm:h-16 sm:w-16"
                  style={{
                    background: `linear-gradient(145deg, ${machine.color}24, #151a20)`,
                    border: `1px solid ${machine.color}45`,
                    boxShadow: `inset 0 0 0 1px ${machine.color}12`,
                  }}
                >
                  <Icon className="h-6 w-6 sm:h-8 sm:w-8" style={{ color: machine.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span
                      className="rounded px-2 py-1 text-[10px] font-bold uppercase"
                      style={{ color: machine.color, background: `${machine.color}16`, border: `1px solid ${machine.color}30` }}
                    >
                      Dossier tecnico
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.18em]" style={{ color: LC.inkLo }}>
                      {machine.area}
                    </span>
                  </div>
                  <h1 className="text-[1.7rem] sm:text-4xl font-bold leading-tight text-[#e9eef3]">{machine.name}</h1>
                  <p className="text-sm leading-relaxed mt-3 max-w-2xl" style={{ color: LC.inkMid }}>
                    {machine.description}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mt-5 sm:mt-6">
                <MachineMetric icon={BookOpen} label="Manual" value={machine.sections.manual ? 'Activo' : 'Pendiente'} color={machine.color} tone="blue" />
                <MachineMetric icon={ClipboardCheck} label="Proced." value={machine.sections.procedures ? 'Activo' : 'Pendiente'} color="#22c55e" tone="green" />
                <MachineMetric icon={GitBranch} label="Flujos" value={machine.sections.flows ? 'Activo' : 'Pendiente'} color="#eab308" tone="amber" />
                <MachineMetric icon={Activity} label="Diagnostico" value={machine.sections.diagnosis ? 'Activo' : 'Pendiente'} color="#f97316" tone="orange" />
              </div>
            </div>

            <aside
              className="hidden p-5 sm:block sm:p-6 lg:border-l"
              style={{ background: '#151a20', borderColor: LC.border }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Gauge className="h-4 w-4" style={{ color: machine.color }} />
                <h2 className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: LC.ink }}>
                  Lectura rapida
                </h2>
              </div>
              <div className="space-y-3">
                <DossierRow label="Uso" value="Consulta en terreno" />
                <DossierRow label="Contenido" value="Ajustes, fallas y referencias" />
                <DossierRow label="Formato" value="Editable desde admin" />
              </div>
              <div className="mt-5 rounded-md p-3" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.28)' }}>
                <div className="flex gap-2">
                  <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#eab308' }} />
                  <p className="text-xs leading-relaxed" style={{ color: LC.inkMid }}>
                    Prioriza medidas, tolerancias y acciones verificables antes de intervenir el equipo.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-20 max-w-6xl mx-auto px-4 sm:static sm:px-6 mt-3">
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden rounded-lg backdrop-blur"
          style={{ background: LC.border, border: `1px solid ${LC.border}` }}
        >
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
                className="flex items-center justify-center sm:justify-start gap-2 px-3 py-3 transition-all relative"
                style={{
                  background: isActive ? `${machine.color}18` : LC.surface,
                  minHeight: '58px',
                }}
              >
                <TabIcon
                  className="h-4 w-4 flex-shrink-0"
                  style={{
                    color: isActive ? machine.color : hasContent ? LC.inkMid : LC.inkGhost,
                  }}
                />
                <span
                  className="text-xs font-semibold leading-tight"
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 sm:pt-6 pb-28 sm:pb-12">
        <div className="mb-5 flex items-start gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ background: `${machine.color}16`, border: `1px solid ${machine.color}30` }}
          >
            <ActiveIcon className="h-5 w-5" style={{ color: machine.color }} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#e9eef3]">{activeTabData.label}</h2>
            <p className="text-xs mt-0.5" style={{ color: LC.inkLo }}>
              {activeTabData.description}
            </p>
          </div>
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

function MachineMetric({
  icon: Icon,
  label,
  value,
  color,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: string
  color: string
  tone: 'blue' | 'green' | 'amber' | 'orange'
}) {
  const active = value === 'Activo'
  const toneBg = {
    blue: `${color}12`,
    green: 'rgba(34,197,94,0.10)',
    amber: 'rgba(234,179,8,0.10)',
    orange: 'rgba(249,115,22,0.10)',
  }[tone]
  const toneBorder = {
    blue: `${color}24`,
    green: 'rgba(34,197,94,0.24)',
    amber: 'rgba(234,179,8,0.24)',
    orange: 'rgba(249,115,22,0.24)',
  }[tone]
  return (
    <div className="rounded-md px-3 py-2" style={{ background: active ? toneBg : LC.surfaceHi, border: `1px solid ${active ? toneBorder : LC.border}` }}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5" style={{ color: active ? color : LC.inkGhost }} />
        <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: LC.inkLo }}>
          {label}
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold" style={{ color: active ? LC.ink : LC.inkLo }}>
        {value}
      </p>
    </div>
  )
}

function DossierRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b pb-2 last:border-b-0 last:pb-0" style={{ borderColor: LC.border }}>
      <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: LC.inkLo }}>
        {label}
      </span>
      <span className="text-xs font-medium text-right" style={{ color: LC.ink }}>
        {value}
      </span>
    </div>
  )
}

function ProceduresList({ procedures, color }: { procedures: Procedure[]; color: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {procedures.map(proc => (
        <article
          key={proc.id}
          className="rounded-lg overflow-hidden"
          style={{ background: LC.surface, border: `1px solid ${LC.border}` }}
        >
          <div className="h-1" style={{ background: `linear-gradient(90deg, ${color}, ${color}55)` }} />
          <div className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" style={{ color }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color }}>
                Procedimiento
              </span>
            </div>
            <h3 className="text-base font-semibold text-[#e9eef3] mb-1">{proc.title}</h3>
            {proc.description && (
              <p className="text-sm mb-4 whitespace-pre-wrap" style={{ color: LC.inkMid }}>
                {proc.description}
              </p>
            )}
            <ol className="space-y-0 mt-4 border-l" style={{ borderColor: `${color}35` }}>
              {proc.steps.map(step => (
                <li key={step.order} className="relative flex gap-3 pb-4 pl-4 last:pb-0">
                  <span
                    className="absolute -left-[14px] flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                    style={{ background: LC.bg, color, border: `1px solid ${color}55` }}
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
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-4 rounded-lg p-4" style={{ background: LC.surface, border: `1px solid ${LC.border}` }}>
          <div className="mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4" style={{ color }} />
            <h3 className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: LC.ink }}>
              Indice tecnico
            </h3>
          </div>
          <nav className="space-y-1">
            {sections.map(sec => (
              <a
                key={sec.id}
                href={`#manual-${sec.id}`}
                className="group flex items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors"
                style={{ color: LC.inkMid }}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold tabular-nums"
                  style={{ background: `${color}16`, color }}
                >
                  {sec.order}
                </span>
                <span className="leading-snug">{sec.title}</span>
              </a>
            ))}
          </nav>
        </div>
      </aside>

      <div className="space-y-4">
        {sections.map(sec => {
          const blocks = parseManualContent(sec.content)
          return (
            <article
              id={`manual-${sec.id}`}
              key={sec.id}
              className="overflow-hidden rounded-lg scroll-mt-6"
              style={{ background: LC.surface, border: `1px solid ${LC.border}` }}
            >
              <div className="grid sm:grid-cols-[104px_1fr]">
                <div
                  className="flex items-center justify-between gap-3 border-b px-5 py-4 sm:block sm:border-b-0 sm:border-r"
                  style={{ borderColor: LC.border, background: LC.surfaceHi }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: LC.inkLo }}>
                    Ajuste
                  </span>
                  <span className="block text-3xl font-bold tabular-nums sm:mt-2" style={{ color }}>
                    {String(sec.order).padStart(2, '0')}
                  </span>
                </div>

                <div className="p-5">
                  <div className="mb-5">
                    <h3 className="text-lg font-semibold leading-tight text-[#e9eef3]">{sec.title}</h3>
                    {blocks.description && (
                      <p className="text-sm leading-relaxed mt-2 whitespace-pre-wrap" style={{ color: LC.inkMid }}>
                        {blocks.description}
                      </p>
                    )}
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
              </div>
            </article>
          )
        })}
      </div>
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
    <section className="rounded-md p-4" style={{ background, border: `1px solid ${variant === 'note' ? color + '33' : LC.border}` }}>
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
            className={variant === 'measure' ? 'rounded-md px-3 py-2 text-sm' : 'flex gap-2.5 text-sm leading-relaxed'}
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
    <section className="rounded-md p-4" style={{ background: LC.surfaceHi, border: `1px solid ${LC.border}` }}>
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
            className="group overflow-hidden rounded-md"
            style={{ background: LC.surface, border: `1px solid ${color}30` }}
          >
            {image.url ? (
              <img src={image.url} alt={image.label} loading="lazy" className="h-40 w-full object-cover grayscale-[15%] transition group-hover:grayscale-0" />
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
    <div className="grid gap-3 lg:grid-cols-2">
      {entries.map((entry, idx) => {
        const open = openId === entry.id
        return (
          <article
            key={entry.id}
            className="overflow-hidden rounded-lg transition-colors"
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
                className="flex items-center justify-center w-7 h-7 rounded-md font-bold text-sm flex-shrink-0 tabular-nums"
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
                  <div className="rounded-md p-4" style={{ background: `${color}0e`, border: `1px solid ${color}33` }}>
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
