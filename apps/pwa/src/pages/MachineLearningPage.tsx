/**
 * MachineLearningPage — Pagina generica de maquina en el Centro de Aprendizaje
 * Ruta: /aprendizaje/maquina/:slug
 *
 * Muestra 4 secciones (tabs): Manual, Procedimientos, Flujos, Diagnostico.
 * Si la seccion esta vacia, muestra empty state.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, BookOpen, ListChecks, GitBranch, AlertTriangle, Clock, Loader2, Wrench, ChevronDown,
  ChevronLeft, ChevronRight, Ruler, Image as ImageIcon, FileText, Gauge, ShieldCheck, Activity,
  ZoomIn, ZoomOut, RotateCcw, X, GraduationCap, BookMarked, Library, ExternalLink, Search,
  MonitorPlay,
} from 'lucide-react'
import { useAuthStore } from '@/store'
import { findMachineBySlug, type LearningSection } from '@/data/learningMachines'
import { hmiPracticeUrl, glossaryPracticeUrl } from '@/services/grader/graderHmiPractice'
import { GRADER_GLOSSARY } from '@/services/grader/graderGlossary'
import { getCommonParts, type CommonPart } from '@/data/commonPartsByMachine'
import { useRepuestosByCodigos, type RepuestoResuelto } from '@/hooks/repuestos/useRepuestosByCodigos'
import { useMarkedCommonParts } from '@/hooks/repuestos/useMarkedCommonParts'
import { LC } from '@/data/learningTheme'
import {
  listProcedures,
  listManualSections,
  listFlows,
  listDiagnosis,
  listQuiz,
  listGlossary,
  listBibliografia,
  type Procedure,
  type ManualSection,
  type Flow,
  type DiagnosisEntry,
  type QuizQuestion,
  type GlossaryEntry,
  type BibliographyEntry,
} from '@/services/learningContent'
import { OtherLearningModulesStrip } from '@/components/learning/OtherLearningModulesStrip'
import { FlowDiagramViewer } from '@/components/learning/FlowDiagramViewer'
import { QuizView } from '@/components/learning/QuizView'

/** Area del catalogo cuyos temas son cursos (no maquinas) -> set de pestanas distinto. */
const COURSE_AREA = 'Capacitacion / Normativa'

/** Pestanas de maquina (LearningSection) + pestanas extra de curso. */
type TabId = LearningSection | 'casos' | 'quiz' | 'glossary' | 'bibliografia' | 'repuestos'

interface TabDef {
  id: TabId
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

/** Pestaña extra "Repuestos comunes" — solo se muestra si la máquina tiene lista curada. */
const REPUESTOS_TAB: TabDef = {
  id: 'repuestos',
  label: 'Repuestos comunes',
  shortLabel: 'Repuestos',
  icon: Wrench,
  description: 'Los repuestos más usados de la máquina, con foto y stock en vivo.',
}

/** Set de pestanas para temas de curso (area "Capacitacion / Normativa"). */
const COURSE_TABS: TabDef[] = [
  {
    id: 'manual',
    label: 'Lecciones',
    shortLabel: 'Lecciones',
    icon: BookOpen,
    description: 'Teoria del curso, ordenada por unidades.',
  },
  {
    id: 'procedures',
    label: 'Practica',
    shortLabel: 'Practica',
    icon: ListChecks,
    description: 'Procedimientos paso a paso para aplicar lo aprendido.',
  },
  {
    id: 'casos',
    label: 'Casos',
    shortLabel: 'Casos',
    icon: GitBranch,
    description: 'Que hacer en cada situacion: flujos y señal → accion.',
  },
  {
    id: 'quiz',
    label: 'Examen',
    shortLabel: 'Examen',
    icon: GraduationCap,
    description: 'Autoevaluacion tipo prueba con explicacion.',
  },
  {
    id: 'glossary',
    label: 'Glosario',
    shortLabel: 'Glosario',
    icon: BookMarked,
    description: 'Siglas y terminos del curso, con enlace a la leccion donde se explican.',
  },
  {
    id: 'bibliografia',
    label: 'Bibliografia',
    shortLabel: 'Biblio.',
    icon: Library,
    description: 'Fuentes y normas en que se basa el manual del curso.',
  },
]

export function MachineLearningPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<TabId>('manual')
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [manualSections, setManualSections] = useState<ManualSection[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [diagnosis, setDiagnosis] = useState<DiagnosisEntry[]>([])
  const [quiz, setQuiz] = useState<QuizQuestion[]>([])
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([])
  const [bibliografia, setBibliografia] = useState<BibliographyEntry[]>([])
  const [loadingTab, setLoadingTab] = useState(false)
  // Leccion a la que saltar cuando el usuario toca "Leccion N" en el Glosario.
  const [pendingLessonOrder, setPendingLessonOrder] = useState<number | null>(null)

  const machine = slug ? findMachineBySlug(slug) : undefined
  const isCourse = !!machine && machine.area === COURSE_AREA

  // Repuestos comunes: config (fallback, hoy vacía) + los marcados en Firestore
  // (comunEn). Se resuelve acá (antes de los early returns) para decidir si mostrar
  // la 5ª pestaña. Dedup por SAP.
  const { parts: markedCommonParts } = useMarkedCommonParts(machine && !isCourse ? machine.slug : undefined)
  const commonParts = useMemo<CommonPart[]>(() => {
    if (!machine || isCourse) return []
    const cfg = getCommonParts(machine.slug)
    const seen = new Set(cfg.map(p => p.sap))
    return [...cfg, ...markedCommonParts.filter(m => !seen.has(m.sap))]
  }, [machine, isCourse, markedCommonParts])

  // Cargar contenido de Firestore segun tab activo
  useEffect(() => {
    if (!machine || machine.customRoute) return
    let cancelled = false
    setLoadingTab(true)

    const loaders: Promise<unknown>[] = []
    if (activeTab === 'procedures') {
      loaders.push(listProcedures(machine.slug).then(list => { if (!cancelled) setProcedures(list) }))
    } else if (activeTab === 'manual') {
      loaders.push(listManualSections(machine.slug).then(list => { if (!cancelled) setManualSections(list) }))
    } else if (activeTab === 'flows') {
      loaders.push(listFlows(machine.slug).then(list => { if (!cancelled) setFlows(list) }))
    } else if (activeTab === 'diagnosis') {
      loaders.push(listDiagnosis(machine.slug).then(list => { if (!cancelled) setDiagnosis(list) }))
    } else if (activeTab === 'casos') {
      // Casos (curso) = flujos + diagnostico juntos
      loaders.push(listFlows(machine.slug).then(list => { if (!cancelled) setFlows(list) }))
      loaders.push(listDiagnosis(machine.slug).then(list => { if (!cancelled) setDiagnosis(list) }))
    } else if (activeTab === 'quiz') {
      loaders.push(listQuiz(machine.slug).then(list => { if (!cancelled) setQuiz(list) }))
    } else if (activeTab === 'glossary') {
      loaders.push(listGlossary(machine.slug).then(list => { if (!cancelled) setGlossary(list) }))
    } else if (activeTab === 'bibliografia') {
      loaders.push(listBibliografia(machine.slug).then(list => { if (!cancelled) setBibliografia(list) }))
    }

    Promise.all(loaders)
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
  const tabs = isCourse
    ? COURSE_TABS
    : (commonParts.length > 0 ? [...TABS, REPUESTOS_TAB] : TABS)
  const activeTabData = tabs.find(t => t.id === activeTab) ?? tabs[0]!
  const ActiveIcon = activeTabData.icon
  // Conteo de items reales por pestana (casos = flujos + diagnostico)
  const countFor = (id: TabId): number =>
    id === 'procedures' ? procedures.length
    : id === 'manual' ? manualSections.length
    : id === 'flows' ? flows.length
    : id === 'diagnosis' ? diagnosis.length
    : id === 'casos' ? flows.length + diagnosis.length
    : id === 'quiz' ? quiz.length
    : id === 'glossary' ? glossary.length
    : id === 'bibliografia' ? bibliografia.length
    : id === 'repuestos' ? commonParts.length
    : 0
  const activeCount = countFor(activeTab)
  const sectionEnabled = activeCount > 0 || (!isCourse && machine.sections[activeTab as LearningSection])
  const isAdmin = user?.rol === 'admin'

  // Altura adaptativa: dentro de MainLayout usar min-h-full, publico usar min-h-dvh
  const heightClass = isAuthenticated ? 'min-h-full' : 'min-h-dvh'

  return (
    <div
      className={`${heightClass} w-full`}
      style={{ background: LC.bg }}
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
                  style={{ background: `${machine.color}1a`, border: `1px solid ${machine.color}33` }}
                >
                  <Icon className="h-6 w-6 sm:h-8 sm:w-8" style={{ color: machine.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2 text-xs" style={{ color: LC.inkLo }}>
                    <span style={{ color: machine.color }}>
                      {isCourse
                        ? `Módulo ${machine.modulo ?? '—'}${machine.nivel != null ? ` · Nivel ${machine.nivel}` : ''}`
                        : 'Dossier técnico'}
                    </span>
                    <span>·</span>
                    <span>{isCourse ? (machine.programa ?? machine.area) : machine.area}</span>
                  </div>
                  <h1 className="text-[1.7rem] sm:text-4xl font-bold leading-tight text-[#e9eef3]">{machine.name}</h1>
                  <p className="text-sm leading-relaxed mt-3 max-w-2xl" style={{ color: LC.inkMid }}>
                    {machine.description}
                  </p>
                </div>
              </div>

              {!isCourse && machine.hmiRoute && (
                <button
                  onClick={() => navigate(machine.hmiRoute!)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
                  style={{
                    color: machine.color,
                    background: `${machine.color}14`,
                    border: `1px solid ${machine.color}40`,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = `${machine.color}26`)}
                  onMouseLeave={e => (e.currentTarget.style.background = `${machine.color}14`)}
                >
                  <MonitorPlay className="h-4 w-4" />
                  Practicar en el simulador — {machine.hmiLabel}
                </button>
              )}
            </div>

            <aside
              className="hidden p-5 sm:block sm:p-6 lg:border-l"
              style={{ background: LC.bgPanel, borderColor: LC.border }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Gauge className="h-4 w-4" style={{ color: LC.inkMid }} />
                <h2 className="text-[13px] font-semibold" style={{ color: LC.inkMid }}>
                  {isCourse ? 'Sobre el curso' : 'Lectura rápida'}
                </h2>
              </div>
              <div className="space-y-3">
                {isCourse ? (
                  <>
                    <DossierRow label="Tipo" value="Curso / Normativa" />
                    <DossierRow label="Contenido" value="Lecciones, practica, casos y examen" />
                    <DossierRow label="Acceso" value="Libre, sin login" />
                  </>
                ) : (
                  <>
                    <DossierRow label="Uso" value="Consulta en terreno" />
                    <DossierRow label="Contenido" value="Ajustes, fallas y referencias" />
                    <DossierRow label="Formato" value="Editable desde admin" />
                  </>
                )}
              </div>
              <div className="mt-5 rounded-md p-3" style={{ background: LC.surface, border: `1px solid ${LC.border}` }}>
                <div className="flex gap-2">
                  <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: LC.inkMid }} />
                  <p className="text-xs leading-relaxed" style={{ color: LC.inkMid }}>
                    {isCourse
                      ? 'Material de estudio destilado de la clase. Para la prueba, repasa la pestana Examen.'
                      : 'Prioriza medidas, tolerancias y acciones verificables antes de intervenir el equipo.'}
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
          className={`grid grid-cols-2 ${isCourse ? 'sm:grid-cols-6' : 'sm:grid-cols-4'} gap-px overflow-hidden rounded-lg backdrop-blur`}
          style={{ background: LC.border, border: `1px solid ${LC.border}` }}
        >
          {tabs.map(tab => {
            const TabIcon = tab.icon
            const isActive = activeTab === tab.id
            const tabCount = countFor(tab.id)
            const hasContent = tabCount > 0 || (!isCourse && machine.sections[tab.id as LearningSection])
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
          <ProceduresList procedures={procedures} color={machine.color} machineSlug={machine.slug} />
        ) : activeTab === 'manual' && manualSections.length > 0 ? (
          <ManualList sections={manualSections} color={machine.color} machineSlug={machine.slug} canEdit={isAdmin} isCourse={isCourse} jumpToOrder={pendingLessonOrder} onJumpConsumed={() => setPendingLessonOrder(null)} />
        ) : activeTab === 'flows' && flows.length > 0 ? (
          <FlowDiagramViewer flows={flows} color={machine.color} />
        ) : activeTab === 'diagnosis' && diagnosis.length > 0 ? (
          <DiagnosisList entries={diagnosis} color={machine.color} machineSlug={machine.slug} />
        ) : activeTab === 'casos' && (flows.length > 0 || diagnosis.length > 0) ? (
          <div className="space-y-8">
            {flows.length > 0 && (
              <div className="space-y-3">
                <CasosSectionHeader
                  icon={GitBranch}
                  color={machine.color}
                  badge="Señal → accion"
                  title="¿Que hago cuando…?"
                  subtitle="Flujo de reaccion paso a paso. Toca cada nodo para ver la instruccion completa."
                />
                <FlowDiagramViewer flows={flows} color={machine.color} />
              </div>
            )}
            {diagnosis.length > 0 && (
              <div className="space-y-3">
                <CasosSectionHeader
                  icon={Activity}
                  color={machine.color}
                  badge="Diagnostico"
                  title="Casos"
                  subtitle="Sintoma → causa probable → solucion. Toca un caso para abrirlo."
                />
                <DiagnosisList entries={diagnosis} color={machine.color} machineSlug={machine.slug} />
              </div>
            )}
          </div>
        ) : activeTab === 'quiz' && quiz.length > 0 ? (
          <QuizView questions={quiz} color={machine.color} />
        ) : activeTab === 'glossary' && glossary.length > 0 ? (
          <GlossaryView
            entries={glossary}
            color={machine.color}
            onGoToLesson={order => { setPendingLessonOrder(order); setActiveTab('manual') }}
          />
        ) : activeTab === 'bibliografia' && bibliografia.length > 0 ? (
          <BibliografiaView entries={bibliografia} color={machine.color} />
        ) : activeTab === 'repuestos' && commonParts.length > 0 ? (
          <CommonPartsList parts={commonParts} color={machine.color} />
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

function DossierRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b pb-2 last:border-b-0 last:pb-0" style={{ borderColor: LC.border }}>
      <span className="text-xs" style={{ color: LC.inkLo }}>
        {label}
      </span>
      <span className="text-xs font-medium text-right" style={{ color: LC.ink }}>
        {value}
      </span>
    </div>
  )
}

/**
 * Botón "Practicar en el simulador" — solo para contenido del Grader cuyo
 * runbook tiene ruta navegable en el clon HMI (ver graderHmiPractice.ts).
 * Abre el simulador ya encaminado a la pantalla del procedimiento.
 */
function HmiPracticeButton({ contentId, machineSlug, color }: { contentId: string; machineSlug?: string; color: string }) {
  const navigate = useNavigate()
  if (machineSlug !== 'grader') return null
  const url = hmiPracticeUrl(contentId)
  if (!url) return null
  return (
    <button
      onClick={() => navigate(url)}
      className="mb-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
      style={{ color, background: `${color}12`, border: `1px dashed ${color}55` }}
      onMouseEnter={e => (e.currentTarget.style.background = `${color}24`)}
      onMouseLeave={e => (e.currentTarget.style.background = `${color}12`)}
      title="Abre el simulador HMI Grader navegado a la pantalla de este procedimiento"
    >
      <MonitorPlay className="h-3.5 w-3.5" />
      Practicar en el simulador
    </button>
  )
}

/**
 * ProceduresList — acordeón de procedimientos (una fila abierta a la vez,
 * primera abierta), consistente con DiagnosisList. La cabecera siempre visible
 * resume el procedimiento (nº de paso + título + chips de qué trae: pasos,
 * ruta de menú, fórmula) para escanear el listado sin desplegar todo; el
 * detalle completo (descripción, ruta, práctica, fórmula, pasos, criterios)
 * vive en el cuerpo colapsable.
 */
function ProceduresList({ procedures, color, machineSlug }: { procedures: Procedure[]; color: string; machineSlug?: string }) {
  const [openId, setOpenId] = useState<string | null>(procedures[0]?.id ?? null)

  return (
    <div className="space-y-2.5">
      {procedures.map((proc, idx) => {
        const open = openId === proc.id
        return (
          <article
            key={proc.id}
            className="overflow-hidden rounded-lg transition-colors"
            style={{
              background: LC.surface,
              border: `1px solid ${open ? LC.borderHi : LC.border}`,
              boxShadow: open ? '0 4px 14px rgba(0,0,0,0.28)' : '0 1px 2px rgba(0,0,0,0.3)',
            }}
          >
            {/* Cabecera clickeable */}
            <button
              type="button"
              onClick={() => setOpenId(open ? null : proc.id)}
              aria-expanded={open}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
              style={{ background: open ? LC.surfaceHi : 'transparent' }}
            >
              <span
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums"
                style={{ background: `${color}18`, color, border: `1px solid ${color}45` }}
              >
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold leading-snug" style={{ color: LC.ink }}>
                  {proc.title}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  <ProcedureChip color={color}>{proc.steps.length} pasos</ProcedureChip>
                  {proc.menuPath && proc.menuPath.length > 0 && <ProcedureChip color={color}>ruta de menú</ProcedureChip>}
                  {proc.formula && <ProcedureChip color={color}>fórmula</ProcedureChip>}
                  {machineSlug === 'grader' && hmiPracticeUrl(proc.id) && <ProcedureChip color={color}>práctica</ProcedureChip>}
                </span>
              </span>
              <ChevronDown
                className="h-4 w-4 flex-shrink-0 transition-transform duration-200"
                style={{ color: open ? color : LC.inkLo, transform: open ? 'rotate(180deg)' : 'none' }}
              />
            </button>

            {/* Cuerpo con animación de altura (grid 0fr→1fr) */}
            <div
              style={{
                display: 'grid',
                gridTemplateRows: open ? '1fr' : '0fr',
                transition: 'grid-template-rows 260ms cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              <div style={{ overflow: 'hidden', minHeight: 0 }}>
                <div className="px-4 pb-4 pt-4" style={{ borderTop: `1px solid ${LC.border}` }}>
                  {proc.description && (
                    <p className="text-sm mb-4 whitespace-pre-wrap" style={{ color: LC.inkMid }}>
                      {proc.description}
                    </p>
                  )}

                  {proc.menuPath && proc.menuPath.length > 0 && (
                    <div className="mb-3 rounded-md px-3 py-2" style={{ background: LC.surfaceHi, border: `1px solid ${LC.border}` }}>
                      <p className="text-[10px] uppercase tracking-[0.14em] font-bold mb-1.5" style={{ color: LC.inkLo }}>
                        Ruta de menu
                      </p>
                      <div className="flex flex-wrap items-center gap-1 text-xs font-mono" style={{ color: LC.ink }}>
                        {proc.menuPath.map((segment, index) => (
                          <span key={`${segment}-${index}`} className="flex items-center gap-1">
                            {index > 0 && <ChevronRight className="h-3 w-3" style={{ color: LC.inkLo }} />}
                            <span className="rounded px-1.5 py-0.5" style={{ background: `${color}14`, border: `1px solid ${color}28` }}>
                              {segment}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <HmiPracticeButton contentId={proc.id} machineSlug={machineSlug} color={color} />

                  {proc.formula && (
                    <div className="mb-3 rounded-md p-3" style={{ background: `${color}0d`, border: `1px solid ${color}33` }}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Gauge className="h-3.5 w-3.5" style={{ color }} />
                        <p className="text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color }}>
                          Formula
                        </p>
                      </div>
                      <p className="text-sm font-mono mb-2 break-all" style={{ color: LC.ink }}>{proc.formula.expression}</p>
                      <dl className="space-y-1">
                        {Object.entries(proc.formula.variables).map(([name, meaning]) => (
                          <div key={name} className="flex gap-2 text-xs">
                            <dt className="font-mono font-semibold flex-shrink-0" style={{ color }}>{name}</dt>
                            <dd className="min-w-0 flex-1" style={{ color: LC.inkMid }}>{meaning}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
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
                            <a href={step.imageUrl} target="_blank" rel="noopener noreferrer" className="block mt-2">
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

                  {proc.successCriteria && proc.successCriteria.length > 0 && (
                    <div className="mt-4 rounded-md p-3" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.28)' }}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <ShieldCheck className="h-3.5 w-3.5" style={{ color: '#22c55e' }} />
                        <p className="text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color: '#22c55e' }}>
                          Criterios de exito
                        </p>
                      </div>
                      <ul className="space-y-1.5">
                        {proc.successCriteria.map((criterion, index) => (
                          <li key={index} className="flex gap-2 text-xs leading-relaxed" style={{ color: LC.inkMid }}>
                            <span className="mt-[6px] h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: '#22c55e' }} />
                            <span className="flex-1">{criterion}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

/** Chip compacto para la cabecera colapsada de un procedimiento. */
function ProcedureChip({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: `${color}14`, color, border: `1px solid ${color}30` }}
    >
      {children}
    </span>
  )
}

function ManualList({
  sections,
  color,
  machineSlug,
  canEdit,
  isCourse = false,
  jumpToOrder = null,
  onJumpConsumed,
}: {
  sections: ManualSection[]
  color: string
  machineSlug: string
  canEdit: boolean
  isCourse?: boolean
  /** Orden de leccion a abrir (viene del Glosario). */
  jumpToOrder?: number | null
  onJumpConsumed?: () => void
}) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '')
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const activeSection = sections.find(section => section.id === activeId) ?? sections[0]
  const activeIndex = Math.max(0, sections.findIndex(section => section.id === activeSection?.id))
  // En cursos forzamos lista plana (las lecciones no agrupan por familia de maquina).
  const compactNavigator = sections.length > 6 && !isCourse
  const sectionGroups = compactNavigator ? groupManualSections(sections) : []
  const activeGroup = sectionGroups.find(group => group.sections.some(section => section.id === activeSection?.id)) ?? sectionGroups[0]

  useEffect(() => {
    if (!sections.some(section => section.id === activeId)) {
      setActiveId(sections[0]?.id ?? '')
    }
  }, [activeId, sections])

  // Salto a una leccion concreta desde el Glosario ("Leccion N").
  useEffect(() => {
    if (jumpToOrder == null) return
    const target = sections.find(section => section.order === jumpToOrder)
    if (target) {
      setActiveId(target.id)
      setOpenGroupId(null)
    }
    onJumpConsumed?.()
  }, [jumpToOrder, sections, onJumpConsumed])

  if (!activeSection) return null

  const blocks = parseManualContent(activeSection.content)
  const canGoPrevious = activeIndex > 0
  const canGoNext = activeIndex < sections.length - 1
  const goToIndex = (index: number) => {
    const nextSection = sections[index]
    if (nextSection) {
      setActiveId(nextSection.id)
      setOpenGroupId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-lg p-2.5"
        style={{ background: LC.surface, border: `1px solid ${LC.border}` }}
      >
        <div className="flex items-center gap-2 px-1 pb-2">
          <BookOpen className="h-4 w-4" style={{ color: LC.inkMid }} />
          <h3 className="text-[13px] font-semibold" style={{ color: LC.inkMid }}>
            {isCourse ? 'Lecciones del curso' : 'Secciones del manual'}
          </h3>
        </div>
        {compactNavigator ? (
          <div className="space-y-3">
            <div>
              <p className="mb-2 text-xs" style={{ color: LC.inkLo }}>
                Familia técnica
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
              {sectionGroups.map(group => {
                const selected = group.id === activeGroup?.id
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => {
                      setOpenGroupId(current => current === group.id ? null : group.id)
                      setActiveId(group.sections[0]?.id ?? activeSection.id)
                    }}
                    className="flex min-w-max items-center gap-2 rounded-md px-3 py-2 text-left transition"
                    style={{
                      background: selected ? `${color}18` : LC.surfaceHi,
                      border: `1px solid ${selected ? color + '55' : LC.border}`,
                      color: selected ? LC.ink : LC.inkMid,
                    }}
                    aria-expanded={openGroupId === group.id}
                  >
                    <span className="text-xs font-bold">{group.label}</span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                      style={{ background: selected ? color : `${color}16`, color: selected ? LC.bg : color }}
                    >
                      {group.sections.length}
                    </span>
                    <ChevronDown
                      className="h-3.5 w-3.5 transition-transform"
                      style={{ color: LC.inkLo, transform: openGroupId === group.id ? 'rotate(180deg)' : 'none' }}
                    />
                  </button>
                )
              })}
              </div>
            </div>

            {openGroupId && (
              <div
                className="rounded-md p-2"
                style={{ background: LC.surfaceHi, border: `1px solid ${LC.border}` }}
              >
                <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: LC.inkLo }}>
                  Ajustes de {sectionGroups.find(group => group.id === openGroupId)?.label ?? 'manual'}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(sectionGroups.find(group => group.id === openGroupId)?.sections ?? []).map(sec => {
                    const selected = sec.id === activeSection.id
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => {
                          setActiveId(sec.id)
                          setOpenGroupId(null)
                        }}
                        className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold transition"
                        style={{
                          background: selected ? `${color}18` : LC.surface,
                          border: `1px solid ${selected ? color + '55' : LC.border}`,
                          color: selected ? LC.ink : LC.inkMid,
                        }}
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold tabular-nums"
                          style={{ background: selected ? color : `${color}16`, color: selected ? LC.bg : color }}
                        >
                          {sec.order}
                        </span>
                        <span className="min-w-0 flex-1 leading-snug">{sec.title}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 rounded-md p-2 sm:flex-row sm:items-center sm:justify-between" style={{ background: LC.surfaceHi, border: `1px solid ${LC.border}` }}>
              <p className="px-1 text-xs font-semibold tabular-nums" style={{ color: LC.inkMid }}>
                Ajuste {activeIndex + 1} de {sections.length}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:w-auto sm:grid-cols-[112px_112px]">
              <button
                type="button"
                onClick={() => goToIndex(activeIndex - 1)}
                disabled={!canGoPrevious}
                className="flex h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-35"
                style={{ background: LC.surfaceHi, border: `1px solid ${LC.border}`, color: LC.ink }}
                aria-label="Seccion anterior"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Anterior</span>
              </button>
              <button
                type="button"
                onClick={() => goToIndex(activeIndex + 1)}
                disabled={!canGoNext}
                className="flex h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-35"
                style={{ background: LC.surfaceHi, border: `1px solid ${LC.border}`, color: LC.ink }}
                aria-label="Seccion siguiente"
              >
                <span className="hidden sm:inline">Siguiente</span>
                <ChevronRight className="h-4 w-4" />
              </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sections.map(sec => {
              const selected = sec.id === activeSection.id
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setActiveId(sec.id)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left transition-colors sm:w-auto sm:max-w-[260px]"
                  style={{
                    background: selected ? `${color}18` : LC.surfaceHi,
                    border: `1px solid ${selected ? color + '55' : LC.border}`,
                  }}
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold tabular-nums"
                    style={{
                      background: selected ? color : `${color}16`,
                      color: selected ? LC.bg : color,
                    }}
                  >
                    {sec.order}
                  </span>
                  <span className="min-w-0 flex-1 text-xs font-semibold leading-snug sm:flex-none" style={{ color: selected ? LC.ink : LC.inkMid }}>
                    {sec.title}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <article
        className="overflow-hidden rounded-lg"
        style={{ background: LC.surface, border: `1px solid ${LC.border}` }}
      >
        <div className="p-5">
          <div className="mb-5 flex items-start gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-md text-sm font-bold tabular-nums"
              style={{ background: `${color}18`, color, border: `1px solid ${color}38` }}
            >
              {String(activeSection.order).padStart(2, '0')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs" style={{ color: LC.inkLo }}>
                {isCourse ? 'Lección' : 'Manual técnico'}
              </p>
              <h3 className="mt-1 text-lg font-semibold leading-tight text-[#e9eef3]">{activeSection.title}</h3>
              {blocks.description && (
                <p className="text-sm leading-relaxed mt-2 whitespace-pre-wrap" style={{ color: LC.inkMid }}>
                  {blocks.description}
                </p>
              )}
            </div>
          </div>

          {machineSlug === 'grader' && activeSection.id === 'grader-manual-glosario' ? (
            <GraderGlossaryView color={color} />
          ) : (
          <div className="grid gap-6">
            {blocks.documents.length > 0 && (
              <ManualDocuments documents={blocks.documents} color={color} />
            )}
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
              <ManualImages
                images={blocks.images}
                color={color}
                sectionTitle={activeSection.title}
                machineSlug={machineSlug}
                canEdit={canEdit}
              />
            )}
          </div>
          )}
        </div>
      </article>

      {compactNavigator && sections.length > 1 && (
        <div
          className="flex flex-col gap-2 rounded-lg p-2 sm:flex-row sm:items-center sm:justify-between"
          style={{ background: LC.surface, border: `1px solid ${LC.border}` }}
        >
          <button
            type="button"
            onClick={() => goToIndex(activeIndex - 1)}
            disabled={!canGoPrevious}
            className="flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-35"
            style={{ background: LC.surfaceHi, color: LC.ink, border: `1px solid ${LC.border}` }}
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </button>
          <span className="text-center text-xs font-semibold tabular-nums" style={{ color: LC.inkMid }}>
            {activeIndex + 1} / {sections.length}
          </span>
          <button
            type="button"
            onClick={() => goToIndex(activeIndex + 1)}
            disabled={!canGoNext}
            className="flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-35"
            style={{ background: LC.surfaceHi, color: LC.ink, border: `1px solid ${LC.border}` }}
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {!compactNavigator && sections.length > 1 && (
        <div className="flex justify-between gap-2">
          {sections.map(sec =>
            sec.id === activeSection.id ? (
              <span key={sec.id} className="h-1.5 flex-1 rounded-full" style={{ background: color }} />
            ) : (
              <button
                key={sec.id}
                type="button"
                aria-label={`Abrir ${sec.title}`}
                onClick={() => setActiveId(sec.id)}
                className="h-1.5 flex-1 rounded-full"
                style={{ background: LC.border }}
              />
            )
          )}
        </div>
      )}
    </div>
  )
}

interface ManualSectionGroup {
  id: string
  label: string
  sections: ManualSection[]
}

function groupManualSections(sections: ManualSection[]): ManualSectionGroup[] {
  const groups: ManualSectionGroup[] = []

  sections.forEach(section => {
    const title = section.title.toLowerCase()
    let id = 'general'
    let label = 'General'

    if (title.includes('aliment')) {
      id = 'alimentacion'
      label = 'Alimentacion'
    } else if (title.includes('aleta') || title.includes('guía') || title.includes('guia') || title.includes('espina')) {
      id = 'guiado'
      label = 'Guiado'
    } else if (title.includes('cuchillo')) {
      id = 'cuchillos'
      label = 'Cuchillos'
    } else if (title.includes('embrague') || title.includes('mando')) {
      id = 'transmision'
      label = 'Transmision'
    }

    let group = groups.find(item => item.id === id)
    if (!group) {
      group = { id, label, sections: [] }
      groups.push(group)
    }
    group.sections.push(section)
  })

  return groups
}

interface ManualContentBlocks {
  description: string
  measurements: string[]
  keyPoints: string[]
  notes: string[]
  images: { label: string; url: string }[]
  /** Documentos descargables (PDF, planos): "- Etiqueta: /ruta.pdf" */
  documents: { label: string; url: string }[]
}

/** "Etiqueta: /ruta" → {label, url}. Devuelve url vacia si la linea no trae ruta. */
function parseLabeledUrl(value: string, fallbackLabel: string): { label: string; url: string } {
  const match = value.match(/^(.*?):\s*(https?:\/\/\S+|\/\S+)$/)
  return match ? { label: match[1] || fallbackLabel, url: match[2] ?? '' } : { label: value, url: '' }
}

function parseManualContent(content: string): ManualContentBlocks {
  const blocks: ManualContentBlocks = {
    description: '',
    measurements: [],
    keyPoints: [],
    notes: [],
    images: [],
    documents: [],
  }
  type ListKey = 'measurements' | 'keyPoints' | 'notes'
  let current: ListKey | 'images' | 'documents' | 'description' = 'description'
  const description: string[] = []

  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line === 'Medidas / tolerancias:') { current = 'measurements'; continue }
    if (line === 'Puntos clave:') { current = 'keyPoints'; continue }
    if (line === 'Notas operativas:') { current = 'notes'; continue }
    if (line === 'Referencias visuales:') { current = 'images'; continue }
    if (line === 'Documentos:') { current = 'documents'; continue }

    const value = line.startsWith('- ') ? line.slice(2) : line
    if (current === 'description') {
      description.push(value)
    } else if (current === 'images') {
      blocks.images.push(parseLabeledUrl(value, 'Imagen'))
    } else if (current === 'documents') {
      blocks.documents.push(parseLabeledUrl(value, 'Documento'))
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
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5" style={{ color }} />
        <h4 className="text-[13px] font-semibold" style={{ color: LC.inkMid }}>
          {title}
        </h4>
      </div>
      <ul className={variant === 'measure' ? 'grid gap-x-6 gap-y-1.5 sm:grid-cols-2' : 'space-y-1.5'}>
        {items.map((item, index) => (
          <li
            key={`${item}-${index}`}
            className="flex gap-2.5 text-sm leading-relaxed"
            style={{ color: LC.inkMid }}
          >
            <span className="mt-[8px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: LC.inkLo }} />
            <span className="flex-1 whitespace-pre-wrap">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Documentos oficiales descargables (PDF, planos) de una seccion de manual. */
function ManualDocuments({ documents, color }: { documents: { label: string; url: string }[]; color: string }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <FileText className="h-3.5 w-3.5" style={{ color }} />
        <h4 className="text-[13px] font-semibold" style={{ color: LC.inkMid }}>
          Documentos
        </h4>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {documents.map((doc, index) => (
          <a
            key={`${doc.label}-${index}`}
            href={doc.url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm transition hover:-translate-y-0.5"
            style={{ background: LC.surface, border: `1px solid ${color}30`, color: LC.ink }}
          >
            <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} />
            <span className="min-w-0 flex-1 leading-snug">{doc.label}</span>
          </a>
        ))}
      </div>
    </section>
  )
}

function ManualImages({
  images,
  color,
  sectionTitle,
  machineSlug,
  canEdit,
}: {
  images: { label: string; url: string }[]
  color: string
  sectionTitle?: string
  machineSlug: string
  canEdit: boolean
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const activeImage = activeIndex == null ? null : images[activeIndex]

  const readableLabel = (label: string) => {
    if (!sectionTitle) return label

    const normalizedLabel = label.toLocaleLowerCase()
    const normalizedTitle = sectionTitle.toLocaleLowerCase()
    if (!normalizedLabel.startsWith(normalizedTitle)) return label

    return label
      .slice(sectionTitle.length)
      .replace(/^[\s:—-]+/, '')
      .trim() || 'Referencia visual'
  }

  return (
    <>
      <section className="rounded-md p-4" style={{ background: LC.surfaceHi, border: `1px solid ${LC.border}` }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" style={{ color }} />
            <h4 className="text-xs uppercase tracking-[0.14em] font-bold" style={{ color }}>
              Referencias visuales
            </h4>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => window.open(`/mantenimiento-planta/aprendizaje/admin/${machineSlug}?tab=manual`, '_blank', 'noopener,noreferrer')}
              className="rounded-md px-3 py-1.5 text-xs font-semibold transition hover:opacity-90"
              style={{ background: `${color}18`, border: `1px solid ${color}45`, color }}
            >
              Agregar / editar referencias
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {images.map((image, index) => (
            <button
              key={`${image.label}-${index}`}
              type="button"
              onClick={() => image.url && setActiveIndex(index)}
              className="group overflow-hidden rounded-md text-left transition hover:-translate-y-0.5"
              style={{ background: LC.surface, border: `1px solid ${color}30` }}
            >
              {image.url ? (
                <img src={image.url} alt={image.label} loading="lazy" className="h-56 w-full bg-white object-contain p-2 grayscale-[10%] transition group-hover:grayscale-0" />
              ) : (
                <div className="h-24 flex items-center justify-center" style={{ color: LC.inkGhost }}>
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs leading-snug" style={{ color: LC.inkMid }}>
                <span>{readableLabel(image.label)}</span>
                {image.url && <span className="font-semibold" style={{ color }}>Ver grande</span>}
              </div>
            </button>
          ))}
        </div>
      </section>

      {activeImage && (
        <ImageLightbox
          image={activeImage}
          label={readableLabel(activeImage.label)}
          color={color}
          onClose={() => setActiveIndex(null)}
          onPrevious={images.length > 1 ? () => setActiveIndex(index => index == null ? 0 : (index + images.length - 1) % images.length) : undefined}
          onNext={images.length > 1 ? () => setActiveIndex(index => index == null ? 0 : (index + 1) % images.length) : undefined}
        />
      )}
    </>
  )
}

function ImageLightbox({
  image,
  label,
  color,
  onClose,
  onPrevious,
  onNext,
}: {
  image: { label: string; url: string }
  label: string
  color: string
  onClose: () => void
  onPrevious?: () => void
  onNext?: () => void
}) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)

  useEffect(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [image.url])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') onPrevious?.()
      if (event.key === 'ArrowRight') onNext?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, onNext, onPrevious])

  const zoom = (delta: number) => {
    setScale(value => Math.min(4, Math.max(1, Number((value + delta).toFixed(2)))))
  }

  const reset = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: 'rgba(3, 8, 14, 0.92)' }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: LC.border, background: LC.surface }}>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color }}>
            Referencia visual
          </p>
          <h3 className="truncate text-sm font-semibold" style={{ color: LC.ink }}>{label}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => zoom(-0.25)} className="rounded-md p-2" style={{ background: LC.surfaceHi, color: LC.ink }} aria-label="Alejar">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => zoom(0.25)} className="rounded-md p-2" style={{ background: LC.surfaceHi, color: LC.ink }} aria-label="Acercar">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" onClick={reset} className="rounded-md p-2" style={{ background: LC.surfaceHi, color: LC.ink }} aria-label="Restablecer zoom">
            <RotateCcw className="h-4 w-4" />
          </button>
          <button type="button" onClick={onClose} className="rounded-md p-2" style={{ background: `${color}1f`, color }} aria-label="Cerrar visor">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-hidden touch-none"
        onWheel={event => {
          event.preventDefault()
          zoom(event.deltaY > 0 ? -0.15 : 0.15)
        }}
        onPointerDown={event => {
          if (scale <= 1) return
          event.currentTarget.setPointerCapture(event.pointerId)
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: offset.x,
            originY: offset.y,
          }
        }}
        onPointerMove={event => {
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId) return
          setOffset({
            x: drag.originX + event.clientX - drag.startX,
            y: drag.originY + event.clientY - drag.startY,
          })
        }}
        onPointerUp={() => {
          dragRef.current = null
        }}
      >
        {onPrevious && (
          <button type="button" onClick={onPrevious} className="absolute left-3 top-1/2 z-10 rounded-full p-3" style={{ background: LC.surface, color: LC.ink }} aria-label="Imagen anterior">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <img
          src={image.url}
          alt={image.label}
          className="h-full w-full select-none object-contain p-4"
          draggable={false}
          style={{
            cursor: scale > 1 ? 'grab' : 'zoom-in',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: dragRef.current ? 'none' : 'transform 140ms ease',
          }}
          onDoubleClick={() => zoom(scale > 1 ? -0.5 : 0.75)}
        />
        {onNext && (
          <button type="button" onClick={onNext} className="absolute right-3 top-1/2 z-10 rounded-full p-3" style={{ background: LC.surface, color: LC.ink }} aria-label="Imagen siguiente">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  )
}


/** Cabecera de sub-seccion dentro de la pestana "Casos" (distingue flujos de diagnostico). */
function CasosSectionHeader({
  icon: Icon,
  color,
  badge,
  title,
  subtitle,
}: {
  icon: React.ElementType
  color: string
  badge: string
  title: string
  subtitle: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${color}16`, border: `1px solid ${color}33` }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-[#e9eef3]">{title}</h3>
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]"
            style={{ background: `${color}16`, color, border: `1px solid ${color}30` }}
          >
            {badge}
          </span>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: LC.inkLo }}>
          {subtitle}
        </p>
      </div>
    </div>
  )
}

function DiagnosisList({ entries, color, machineSlug }: { entries: DiagnosisEntry[]; color: string; machineSlug?: string }) {
  // Acordeón: una fila abierta a la vez. Arranca con la primera abierta.
  const [openId, setOpenId] = useState<string | null>(entries[0]?.id ?? null)

  return (
    <div className="space-y-2.5">
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
                  <div>
                    <span
                      className="rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                      style={{ background: `${color}18`, color, border: `1px solid ${color}35` }}
                    >
                      Caso {String(idx + 1).padStart(2, '0')}
                    </span>
                  </div>

                  <HmiPracticeButton contentId={entry.id} machineSlug={machineSlug} color={color} />

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

function GlossaryView({
  entries,
  color,
  onGoToLesson,
}: {
  entries: GlossaryEntry[]
  color: string
  onGoToLesson: (order: number) => void
}) {
  const [queryText, setQueryText] = useState('')
  const q = queryText.trim().toLowerCase()
  const filtered = q
    ? entries.filter(e => e.term.toLowerCase().includes(q) || e.definition.toLowerCase().includes(q))
    : entries

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: LC.inkLo }} />
        <input
          type="text"
          value={queryText}
          onChange={e => setQueryText(e.target.value)}
          placeholder="Buscar sigla o termino…"
          className="w-full rounded-lg py-2.5 pl-9 pr-3 text-sm outline-none"
          style={{ background: LC.surface, border: `1px solid ${LC.border}`, color: LC.ink }}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm" style={{ color: LC.inkLo }}>
          Sin resultados para “{queryText}”.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map(entry => (
            <li
              key={entry.id}
              className="rounded-lg p-4"
              style={{ background: LC.surface, border: `1px solid ${LC.border}` }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold" style={{ color }}>{entry.term}</h3>
                {entry.lesson != null && (
                  <button
                    type="button"
                    onClick={() => onGoToLesson(entry.lesson!)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] transition hover:brightness-110"
                    style={{ background: `${color}16`, color, border: `1px solid ${color}33` }}
                  >
                    <BookOpen className="h-3 w-3" />
                    Leccion {entry.lesson}
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: LC.inkMid }}>
                {entry.definition}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * GraderGlossaryView — glosario rico del Grader (reemplaza el muro de viñetas
 * que salía al meter GRADER_GLOSSARY como texto de un ManualSection).
 * Lee la data estructurada directo: término destacado, alias como chips,
 * buscador (término + alias + definición) y, para los términos que apuntan a
 * una pantalla real del clon, botón "Ver en el simulador" (mismo deep-link
 * que los procedimientos).
 */
function GraderGlossaryView({ color }: { color: string }) {
  const navigate = useNavigate()
  const [queryText, setQueryText] = useState('')
  const entries = Object.entries(GRADER_GLOSSARY)
  const q = queryText.trim().toLowerCase()
  const filtered = q
    ? entries.filter(([, e]) =>
        e.label.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.alts ?? []).some(a => a.toLowerCase().includes(q)))
    : entries

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: LC.inkLo }} />
        <input
          type="text"
          value={queryText}
          onChange={e => setQueryText(e.target.value)}
          placeholder="Buscar término, alias o definición…"
          className="w-full rounded-lg py-2.5 pl-9 pr-3 text-sm outline-none"
          style={{ background: LC.surface, border: `1px solid ${LC.border}`, color: LC.ink }}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm" style={{ color: LC.inkLo }}>
          Sin resultados para “{queryText}”.
        </p>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {filtered.map(([key, entry]) => {
            const practiceUrl = glossaryPracticeUrl(key)
            return (
              <li
                key={key}
                className="flex flex-col rounded-lg p-4"
                style={{ background: LC.surface, border: `1px solid ${LC.border}` }}
              >
                <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h3 className="text-sm font-bold" style={{ color }}>{entry.label}</h3>
                  {(entry.alts ?? []).map(alt => (
                    <span
                      key={alt}
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: LC.surfaceHi, color: LC.inkLo, border: `1px solid ${LC.border}` }}
                    >
                      {alt}
                    </span>
                  ))}
                </div>
                <p className="text-sm leading-relaxed" style={{ color: LC.inkMid }}>
                  {entry.description}
                </p>
                {practiceUrl && (
                  <button
                    onClick={() => navigate(practiceUrl)}
                    className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors"
                    style={{ color, background: `${color}12`, border: `1px dashed ${color}55` }}
                    onMouseEnter={e => (e.currentTarget.style.background = `${color}24`)}
                    onMouseLeave={e => (e.currentTarget.style.background = `${color}12`)}
                    title="Abre el simulador HMI Grader en la pantalla donde vive este parámetro"
                  >
                    <MonitorPlay className="h-3.5 w-3.5" />
                    Ver en el simulador
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * CommonPartsList — pestaña "Repuestos comunes": la lista curada de la máquina
 * (commonPartsByMachine) resuelta contra el maestro `repuestos` en vivo para
 * traer foto, stock y ubicación reales. Agrupa por tipo; cada ítem enlaza al
 * módulo Repuestos (flujo diario). Fuente única compartida entre ambos lados.
 */
function CommonPartsList({ parts, color }: { parts: CommonPart[]; color: string }) {
  const navigate = useNavigate()
  const allParts = parts
  const saps = allParts.flatMap(p => [p.sap, p.sapAlt]).filter((s): s is string => !!s)
  const { bySap, loading } = useRepuestosByCodigos(saps)

  // agrupar por tipo (normalizado: el maestro usa MAYÚSCULAS singular — RESORTE,
  // CORREA...; se muestra en Title Case y se agrupa case-insensitive para unir
  // config + marcados sin duplicar grupos por diferencias de mayúsculas).
  const grpKey = (t: string) => t.trim().toUpperCase()
  const grpDisplay = (t: string) => { const s = t.trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : 'Sin clasificar' }
  const grupos: { key: string; tipo: string; items: CommonPart[] }[] = []
  for (const p of allParts) {
    const key = grpKey(p.tipo)
    let g = grupos.find(x => x.key === key)
    if (!g) { g = { key, tipo: grpDisplay(p.tipo), items: [] }; grupos.push(g) }
    g.items.push(p)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: LC.inkLo }}>
        <span>{allParts.length} repuestos comunes · stock en vivo y foto (cuando está cargada) desde el módulo Repuestos</span>
        {loading && <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> cargando datos…</span>}
      </div>

      {grupos.map(grupo => (
        <div key={grupo.tipo}>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            <h3 className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color }}>{grupo.tipo}</h3>
            <span className="text-[11px]" style={{ color: LC.inkLo }}>({grupo.items.length})</span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {grupo.items.map((p, i) => (
              <CommonPartCard
                key={`${p.sap}-${i}`}
                part={p}
                resolved={bySap.get(p.sap) ?? (p.sapAlt ? bySap.get(p.sapAlt) : undefined)}
                color={color}
                onOpen={() => navigate(`/repuestos?q=${encodeURIComponent(p.sap)}`)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function CommonPartCard({
  part, resolved, color, onOpen,
}: { part: CommonPart; resolved?: RepuestoResuelto; color: string; onOpen: () => void }) {
  return (
    <div className="flex gap-3 rounded-lg p-3" style={{ background: LC.surface, border: `1px solid ${LC.border}` }}>
      {/* Miniatura: foto real del repuesto o placeholder */}
      <div
        className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-md"
        style={{ background: LC.surfaceHi, border: `1px solid ${LC.border}` }}
      >
        {resolved?.fotoUrl ? (
          <img src={resolved.fotoUrl} alt={part.nombre} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <Wrench className="h-5 w-5" style={{ color: LC.inkLo }} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-[#e9eef3]">{part.nombre}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]" style={{ color: LC.inkMid }}>
          <span className="font-mono">SAP {part.sap}{part.sapAlt ? ` / ${part.sapAlt}` : ''}</span>
          {part.codigoManual && <span className="font-mono" style={{ color: LC.inkLo }}>Manual {part.codigoManual}</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {resolved?.stockFisico != null && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{
                background: resolved.stockFisico > 0 ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
                color: resolved.stockFisico > 0 ? '#22c55e' : '#ef4444',
                border: `1px solid ${resolved.stockFisico > 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              }}
            >
              Stock {resolved.stockFisico}
            </span>
          )}
          {resolved?.ubicacion && (
            <span className="text-[10px]" style={{ color: LC.inkLo }}>{resolved.ubicacion}</span>
          )}
          <button
            onClick={onOpen}
            className="ml-auto inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors"
            style={{ color, background: `${color}12`, border: `1px solid ${color}33` }}
            onMouseEnter={e => (e.currentTarget.style.background = `${color}24`)}
            onMouseLeave={e => (e.currentTarget.style.background = `${color}12`)}
          >
            <ExternalLink className="h-3 w-3" />
            Ver en Repuestos
          </button>
        </div>
      </div>
    </div>
  )
}

function BibliografiaView({ entries, color }: { entries: BibliographyEntry[]; color: string }) {
  return (
    <ol className="space-y-2.5">
      {entries.map((entry, idx) => (
        <li
          key={entry.id}
          className="flex gap-3 rounded-lg p-4"
          style={{ background: LC.surface, border: `1px solid ${LC.border}` }}
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums"
            style={{ background: `${color}16`, color, border: `1px solid ${color}40` }}
          >
            {idx + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-relaxed" style={{ color: LC.ink }}>{entry.label}</p>
            {entry.url && (
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold break-all transition hover:underline"
                style={{ color }}
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                {entry.url.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        </li>
      ))}
    </ol>
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
