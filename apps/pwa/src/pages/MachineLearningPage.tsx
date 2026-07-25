/**
 * MachineLearningPage — Pagina generica de maquina en el Centro de Aprendizaje
 * Ruta: /aprendizaje/maquina/:slug
 *
 * Muestra 4 secciones (tabs): Manual, Procedimientos, Flujos, Diagnostico.
 * Si la seccion esta vacia, muestra empty state.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, BookOpen, ListChecks, GitBranch, AlertTriangle, Wrench, ChevronDown,
  ChevronLeft, ChevronRight, Image as ImageIcon,
  ZoomIn, ZoomOut, RotateCcw, X, GraduationCap, BookMarked, Library,
  MonitorPlay, Zap, Search,
} from 'lucide-react'
import '@/styles/learningDossier.css'
import { useAuthStore } from '@/store'
import { findMachineBySlug, type LearningSection } from '@/data/learningMachines'
import { hmiPracticeUrl, glossaryPracticeUrl } from '@/services/grader/graderHmiPractice'
import { GRADER_GLOSSARY } from '@/services/grader/graderGlossary'
import { getCommonParts, type CommonPart } from '@/data/commonPartsByMachine'
import { useRepuestosByCodigos, type RepuestoResuelto } from '@/hooks/repuestos/useRepuestosByCodigos'
import { useMarkedCommonParts } from '@/hooks/repuestos/useMarkedCommonParts'
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
  type SectionQuizItem,
  type Flow,
  type DiagnosisEntry,
  type QuizQuestion,
  type GlossaryEntry,
  type BibliographyEntry,
} from '@/services/learningContent'
import { OtherLearningModulesStrip } from '@/components/learning/OtherLearningModulesStrip'
import { FlowDiagramViewer } from '@/components/learning/FlowDiagramViewer'
import { QuizView } from '@/components/learning/QuizView'
import { GraderVisualPilot } from '@/components/learning/GraderVisualPilot'
import { QuickRefView } from '@/components/learning/QuickRefView'
import { getQuickRef, hasQuickRef } from '@/data/learningQuickRef'
import { getQuizBest } from '@/utils/learningProgress'

/** Area del catalogo cuyos temas son cursos (no maquinas) -> set de pestanas distinto. */
const COURSE_AREA = 'Capacitacion / Normativa'

/** Pestanas de maquina (LearningSection) + pestanas extra de curso. */
type TabId = LearningSection | 'quickref' | 'casos' | 'quiz' | 'glossary' | 'bibliografia' | 'repuestos'

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

/** Pestaña "Consulta rápida" — lámina de datos duros para terreno. Solo si la
 *  máquina tiene ficha en learningQuickRef (piloto: Grader). Va PRIMERA. */
const QUICKREF_TAB: TabDef = {
  id: 'quickref',
  label: 'Consulta rápida',
  shortLabel: 'Rápida',
  icon: Zap,
  description: 'Datos clave del equipo: parámetros, rutas del controlador y tolerancias.',
}

/** Pestaña "Evaluación" para máquinas — antes el quiz vivía solo en cursos y
 *  la autoevaluación quedaba enterrada al pie del manual. */
const QUIZ_TAB_MACHINE: TabDef = {
  id: 'quiz',
  label: 'Evaluación',
  shortLabel: 'Evaluación',
  icon: GraduationCap,
  description: 'Autoevaluación del equipo, con explicación por pregunta.',
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
  // Arranca en "Consulta rápida" si la máquina tiene ficha express (uso terreno).
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    slug && hasQuickRef(slug) ? 'quickref' : 'manual',
  )
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
  // Procedimiento a abrir cuando el usuario toca un link dentro del texto del Manual.
  const [pendingProcedureId, setPendingProcedureId] = useState<string | null>(null)

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
      // Tambien procedimientos + glosario: el Manual enlaza menciones de ambos en su texto.
      loaders.push(listProcedures(machine.slug).then(list => { if (!cancelled) setProcedures(list) }))
      loaders.push(listGlossary(machine.slug).then(list => { if (!cancelled) setGlossary(list) }))
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

  const quickRefGroups = !isCourse ? getQuickRef(machine.slug) : null
  const tabs = isCourse
    ? COURSE_TABS
    : [
        ...(quickRefGroups ? [QUICKREF_TAB] : []),
        ...TABS,
        ...(commonParts.length > 0 ? [REPUESTOS_TAB] : []),
        QUIZ_TAB_MACHINE,
      ]
  const activeTabData = tabs.find(t => t.id === activeTab) ?? tabs[0]!
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
    : id === 'quickref' ? (quickRefGroups?.length ?? 0)
    : 0
  const activeCount = countFor(activeTab)
  const sectionEnabled = activeCount > 0 || (!isCourse && machine.sections[activeTab as LearningSection])
  const isAdmin = user?.rol === 'admin'

  // Altura adaptativa: dentro de MainLayout usar min-h-full, publico usar min-h-dvh
  const heightClass = isAuthenticated ? 'min-h-full' : 'min-h-dvh'
  const docCode = machine.slug.toUpperCase()
  const activeIndex = tabs.findIndex(t => t.id === activeTab)
  // Progreso = SOLO evaluación (el material es de consulta periódica; el "% visto"
  // no aporta). Aprobado si el mejor examen local llegó al umbral.
  const quizBest = getQuizBest(machine.slug)
  const quizPassed = quizBest != null && quizBest >= 70
  const contenido = isCourse
    ? 'Curso / Normativa'
    : `${Object.values(machine.sections).filter(Boolean).length} secciones`

  return (
    <div className={`dossier ${heightClass} w-full`}>
      <div className="dp-wrap" style={{ paddingBottom: '7rem' }}>
        <button className="dp-back" onClick={() => navigate('/aprendizaje')}>
          <ArrowLeft className="h-4 w-4" /> Centro de Aprendizaje
        </button>

        {/* Portada del documento */}
        <header style={{ paddingTop: 'clamp(10px, 3vw, 30px)' }}>
          <div className="dp-eyebrow">
            {isCourse ? 'MÓDULO' : 'FICHA TÉCNICA'}<span className="sep">/</span><b>{docCode}</b><span className="sep">·</span>{isCourse ? (machine.programa ?? machine.area).toUpperCase() : 'REV 2026-07'}
          </div>
          <h1 className="dp-title">{machine.name}</h1>
          <p className="dp-sub">{machine.description}</p>

          {isCourse && (
            <div className="dp-meta">
              <div><span className="dp-lbl">Área</span><span className="dp-val">{machine.programa ?? machine.area}</span></div>
              <div><span className="dp-lbl">Contenido</span><span className="dp-val dp-num">{contenido}</span></div>
              <div><span className="dp-lbl">Uso</span><span className="dp-val">Estudio</span></div>
              <div><span className="dp-lbl">Nivel</span><span className="dp-val">{`M${machine.modulo ?? '—'}`}</span></div>
            </div>
          )}

          {!isCourse && machine.hmiRoute && (
            <button className="dp-hmi" onClick={() => navigate(machine.hmiRoute!)}>
              <MonitorPlay className="h-4 w-4" /> Practicar en el simulador · {machine.hmiLabel}
            </button>
          )}

          {/* Estado de evaluación (único progreso que importa: esto es material
              de consulta periódica, no un curso lineal) */}
          {quizBest != null && (
            <div className="dp-progress">
              <span className={`dp-progress-label ${quizPassed ? 'is-ok' : ''}`}>
                {quizPassed ? `✓ Evaluación aprobada · ${quizBest}%` : `Evaluación: mejor intento ${quizBest}% — umbral 70%`}
              </span>
            </div>
          )}
        </header>

        <div className="dp-course">
          {/* Sidebar de módulos (desktop): título + progreso + checklist */}
          <aside className="dp-side" aria-label="Secciones del módulo">
            <div className="dp-side-title">{machine.name}</div>
            {quizPassed && (
              <div className="dp-side-progress">
                <span className="dp-progress-label is-ok">✓ Evaluación aprobada · {quizBest}%</span>
              </div>
            )}
            <ul className="dp-side-list" style={quizPassed ? undefined : { marginTop: 12 }}>
              {tabs.map(tab => {
                const TabIcon = tab.icon
                const evalDone = tab.id === 'quiz' && quizPassed
                return (
                  <li key={tab.id} className={evalDone ? 'is-done' : ''}>
                    <button
                      onClick={() => setActiveTab(tab.id)}
                      aria-current={activeTab === tab.id ? 'true' : undefined}
                    >
                      <span className="dp-side-ico">
                        {evalDone ? '✓' : <TabIcon style={{ width: 11, height: 11 }} />}
                      </span>
                      {tab.label}
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          <div className="dp-main-col">
            {/* Índice / pestañas (móvil) */}
            <nav className="dp-toc" aria-label="Secciones" style={{ marginTop: 24 }}>
              {tabs.map((tab, i) => {
                const evalDone = tab.id === 'quiz' && quizPassed
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    aria-current={activeTab === tab.id ? 'true' : undefined}
                  >
                    {evalDone
                      ? <span className="dp-toc-done" aria-label="Evaluación aprobada">✓</span>
                      : <b>{String(i + 1).padStart(2, '0')}</b>}
                    {tab.label}
                  </button>
                )
              })}
            </nav>

        {/* Cabecera de sección activa */}
        <div className="dp-sec-head" style={{ marginTop: 34 }}>
          <span className="dp-sec-no">Sección {String(activeIndex + 1).padStart(2, '0')}</span>
          <h2 className="dp-sec-title">{activeTabData.label}</h2>
        </div>
        <div className="dp-sec-code" style={{ marginBottom: 28 }}>{activeTabData.description}</div>

        {activeTab === 'quickref' && quickRefGroups ? (
          <QuickRefView groups={quickRefGroups} showSensitive={isAuthenticated} />
        ) : loadingTab ? (
          <p className="dp-loading">Cargando…</p>
        ) : activeTab === 'procedures' && procedures.length > 0 ? (
          <ProceduresList
            procedures={procedures}
            machineSlug={machine.slug}
            jumpToId={pendingProcedureId}
            onJumpConsumed={() => setPendingProcedureId(null)}
          />
        ) : activeTab === 'manual' && manualSections.length > 0 ? (
          <>
            <ManualList
              sections={manualSections}
              machineSlug={machine.slug}
              canEdit={isAdmin}
              isCourse={isCourse}
              jumpToOrder={pendingLessonOrder}
              onJumpConsumed={() => setPendingLessonOrder(null)}
              procedures={procedures}
              glossary={glossary}
              onJumpToProcedure={id => { setPendingProcedureId(id); setActiveTab('procedures') }}
            />
            {machine.slug === 'grader' && <GraderVisualPilot />}
          </>
        ) : activeTab === 'flows' && flows.length > 0 ? (
          <FlowDiagramViewer flows={flows} />
        ) : activeTab === 'diagnosis' && diagnosis.length > 0 ? (
          <DiagnosisList entries={diagnosis} machineSlug={machine.slug} />
        ) : activeTab === 'casos' && (flows.length > 0 || diagnosis.length > 0) ? (
          <div>
            {flows.length > 0 && (
              <div className="dp-casos">
                <CasosSectionHeader
                  label="Señal → acción"
                  title="¿Qué hago cuando…?"
                  subtitle="Flujo de reacción paso a paso. Toca cada caso para desplegar la secuencia completa."
                />
                <FlowDiagramViewer flows={flows} />
              </div>
            )}
            {diagnosis.length > 0 && (
              <div className="dp-casos">
                <CasosSectionHeader
                  label="Diagnóstico"
                  title="Casos"
                  subtitle="Síntoma → causa probable → solución."
                />
                <DiagnosisList entries={diagnosis} machineSlug={machine.slug} />
              </div>
            )}
          </div>
        ) : activeTab === 'quiz' && quiz.length > 0 ? (
          <QuizView questions={quiz} machineSlug={machine.slug} />
        ) : activeTab === 'glossary' && glossary.length > 0 ? (
          <GlossaryView
            entries={glossary}
            onGoToLesson={order => { setPendingLessonOrder(order); setActiveTab('manual') }}
          />
        ) : activeTab === 'bibliografia' && bibliografia.length > 0 ? (
          <BibliografiaView entries={bibliografia} />
        ) : activeTab === 'repuestos' && commonParts.length > 0 ? (
          <CommonPartsList parts={commonParts} />
        ) : sectionEnabled ? (
          <p className="dp-empty">Contenido disponible — próximamente cargado desde Firestore.</p>
        ) : (
          <EmptySection
            tabLabel={activeTabData.label}
            machineName={machine.name}
          />
        )}

            <OtherLearningModulesStrip currentSlug={machine.slug} accent={machine.color} />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Botón "Practicar en el simulador" — solo para contenido del Grader cuyo
 * runbook tiene ruta navegable en el clon HMI (ver graderHmiPractice.ts).
 * Abre el simulador ya encaminado a la pantalla del procedimiento.
 */
function HmiPracticeButton({ contentId, machineSlug }: { contentId: string; machineSlug?: string }) {
  const navigate = useNavigate()
  if (machineSlug !== 'grader') return null
  const url = hmiPracticeUrl(contentId)
  if (!url) return null
  return (
    <button
      className="dp-practice"
      onClick={() => navigate(url)}
      title="Abre el simulador HMI Grader navegado a la pantalla de este procedimiento"
    >
      <MonitorPlay className="h-3.5 w-3.5" />
      Practicar en el simulador
    </button>
  )
}

/**
 * ProceduresList — índice de procedimientos en formato dossier: filas hairline
 * (una abierta a la vez, la primera). La cabecera resume el procedimiento
 * (nº + título + línea mono de qué trae: pasos, ruta, fórmula, práctica); el
 * cuerpo despliega descripción, ruta de menú, fórmula, los pasos numerados y
 * los criterios de éxito.
 */
function ProceduresList({
  procedures,
  machineSlug,
  jumpToId = null,
  onJumpConsumed,
}: {
  procedures: Procedure[]
  machineSlug?: string
  /** Id de procedimiento a abrir (viene de un link dentro del Manual). */
  jumpToId?: string | null
  onJumpConsumed?: () => void
}) {
  const [openId, setOpenId] = useState<string | null>(procedures[0]?.id ?? null)

  // Salto a un procedimiento concreto desde un link dentro del Manual.
  useEffect(() => {
    if (jumpToId == null) return
    if (procedures.some(p => p.id === jumpToId)) {
      setOpenId(jumpToId)
      document.getElementById(`proc-${jumpToId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    onJumpConsumed?.()
  }, [jumpToId, procedures, onJumpConsumed])

  return (
    <div className="dp-acc">
      {procedures.map((proc, idx) => {
        const open = openId === proc.id
        const tags = [
          `${proc.steps.length} pasos`,
          proc.menuPath && proc.menuPath.length > 0 ? 'ruta de menú' : null,
          proc.formula ? 'fórmula' : null,
          machineSlug === 'grader' && hmiPracticeUrl(proc.id) ? 'práctica' : null,
        ].filter(Boolean) as string[]
        return (
          <div key={proc.id} id={`proc-${proc.id}`} className="dp-acc-item" data-open={open}>
            <button type="button" className="dp-acc-head" aria-expanded={open} onClick={() => setOpenId(open ? null : proc.id)}>
              <span className="dp-acc-no">{String(idx + 1).padStart(2, '0')}</span>
              <span>
                <span className="dp-acc-title">{proc.title}</span>
                <span className="dp-acc-sub">{tags.join(' · ')}</span>
              </span>
              <ChevronDown className="dp-acc-chev h-4 w-4" />
            </button>

            <div
              style={{
                display: 'grid',
                gridTemplateRows: open ? '1fr' : '0fr',
                transition: 'grid-template-rows 260ms cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              <div style={{ overflow: 'hidden', minHeight: 0 }}>
                <div className="dp-acc-body-inner">
                  {proc.description && (
                    <div className="dp-body"><p style={{ whiteSpace: 'pre-wrap' }}>{proc.description}</p></div>
                  )}

                  {proc.menuPath && proc.menuPath.length > 0 && (
                    <div className="dp-path">
                      <span className="dp-lbl">Ruta</span>
                      {proc.menuPath.map((segment, index) => (
                        <span key={`${segment}-${index}`} className="inline-flex items-center gap-2">
                          {index > 0 && <span className="dp-caret">›</span>}
                          <span className="dp-seg">{segment}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  <HmiPracticeButton contentId={proc.id} machineSlug={machineSlug} />

                  {proc.formula && (
                    <div className="dp-formula">
                      <span className="dp-lbl">Fórmula</span>
                      <p className="dp-expr">{proc.formula.expression}</p>
                      <dl>
                        {Object.entries(proc.formula.variables).map(([name, meaning]) => (
                          <div key={name} className="dp-var"><dt>{name}</dt><dd>{meaning}</dd></div>
                        ))}
                      </dl>
                    </div>
                  )}

                  <ol className="dp-proc-ol">
                    {proc.steps.map(step => (
                      <li key={step.order}>
                        <span className="dp-n" />
                        <div className="dp-c">
                          <b>{step.title}</b>
                          {step.description && <span style={{ whiteSpace: 'pre-wrap' }}>{step.description}</span>}
                          {step.imageUrl && (
                            <a href={step.imageUrl} target="_blank" rel="noopener noreferrer">
                              <img src={step.imageUrl} alt={step.title} loading="lazy" />
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>

                  {proc.successCriteria && proc.successCriteria.length > 0 && (
                    <div className="dp-crit">
                      <span className="dp-lbl">Criterios de éxito</span>
                      <ul>
                        {proc.successCriteria.map((criterion, index) => (
                          <li key={index}>{criterion}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ManualList({
  sections,
  machineSlug,
  canEdit,
  isCourse = false,
  jumpToOrder = null,
  onJumpConsumed,
  procedures = [],
  glossary = [],
  onJumpToProcedure,
}: {
  sections: ManualSection[]
  machineSlug: string
  canEdit: boolean
  isCourse?: boolean
  /** Orden de leccion a abrir (viene del Glosario). */
  jumpToOrder?: number | null
  onJumpConsumed?: () => void
  /** Para enlazar menciones de un procedimiento dentro del texto del Manual. */
  procedures?: Procedure[]
  /** Para resaltar términos del Glosario dentro del texto del Manual. */
  glossary?: GlossaryEntry[]
  onJumpToProcedure?: (id: string) => void
}) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [criticalMode, setCriticalMode] = useState(false)
  const [resumeId, setResumeId] = useState<string | null>(null)
  const activeSection = sections.find(section => section.id === activeId) ?? sections[0]
  const activeIndex = Math.max(0, sections.findIndex(section => section.id === activeSection?.id))
  // El Grader tiene su glosario aparte (GRADER_GLOSSARY, componente propio) en vez de la
  // colección Firestore genérica — sumarlo acá para poder resaltar sus términos en el Manual.
  const effectiveGlossary = useMemo<GlossaryEntry[]>(() => {
    if (machineSlug !== 'grader') return glossary
    const now = Date.now()
    return Object.entries(GRADER_GLOSSARY).map(([id, entry], index) => ({
      id,
      term: entry.label,
      definition: entry.description,
      order: index,
      createdAt: now,
      updatedAt: now,
    }))
  }, [machineSlug, glossary])
  const textLinks = useMemo(() => buildTextLinks(procedures, effectiveGlossary), [procedures, effectiveGlossary])
  const linkify = (text: string) => renderBodyText(text, textLinks, query, onJumpToProcedure ?? (() => {}))
  const normalizedQuery = normalizeForMatch(query.trim())
  const filteredSections = normalizedQuery
    ? sections.filter(sec => normalizeForMatch(sec.title).includes(normalizedQuery))
    : sections

  // Metadata por sección (parseada una vez): iconos del índice + "Todo lo crítico".
  const sectionMeta = useMemo(
    () => sections.map(sec => {
      const b = parseManualContent(sec.content)
      return { id: sec.id, order: sec.order, title: sec.title, hasSteps: b.steps.length > 0, hasQuiz: !!(sec.quiz && sec.quiz.length > 0), notes: b.notes }
    }),
    [sections],
  )
  const allNotes = useMemo(
    () => sectionMeta.flatMap(m => m.notes.map(note => ({ note, sectionId: m.id, sectionOrder: m.order, sectionTitle: m.title }))),
    [sectionMeta],
  )

  useEffect(() => {
    if (!sections.some(section => section.id === activeId)) {
      setActiveId(sections[0]?.id ?? '')
    }
  }, [activeId, sections])

  // Salto a una leccion concreta desde el Glosario ("Leccion N").
  useEffect(() => {
    if (jumpToOrder == null) return
    const target = sections.find(section => section.order === jumpToOrder)
    if (target) setActiveId(target.id)
    onJumpConsumed?.()
  }, [jumpToOrder, sections, onJumpConsumed])

  // "Continuar donde quedaste": leer la última sección vista en este dispositivo (no es progreso/métrica, solo conveniencia local).
  const resumeKey = `dp-manual-last:${machineSlug}`
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(resumeKey) : null
    if (saved && saved !== sections[0]?.id && sections.some(s => s.id === saved)) {
      setResumeId(saved)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineSlug])

  useEffect(() => {
    if (activeSection && typeof window !== 'undefined') {
      window.localStorage.setItem(resumeKey, activeSection.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection?.id])

  if (!activeSection) return null

  const blocks = parseManualContent(activeSection.content)
  const isGraderGlossary = machineSlug === 'grader' && activeSection.id === 'grader-manual-glosario'
  const noun = isCourse ? 'Lección' : 'Sección'
  const goToIndex = (index: number) => {
    const nextSection = sections[index]
    if (nextSection) setActiveId(nextSection.id)
  }
  const resumeSection = resumeId ? sections.find(s => s.id === resumeId) : null

  return (
    <div className="dp-doc">
      {/* Índice de secciones / lecciones (riel lateral en desktop) */}
      <nav className="dp-index" aria-label={isCourse ? 'Lecciones del curso' : 'Secciones del manual'}>
        {sections.length > 6 && (
          <div className="dp-idx-search">
            <Search className="h-3.5 w-3.5" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Buscar ${isCourse ? 'lección' : 'sección'}...`}
              aria-label={`Buscar ${isCourse ? 'lección' : 'sección'}`}
            />
            {query && <span className="dp-idx-count">{filteredSections.length} de {sections.length}</span>}
          </div>
        )}
        {filteredSections.length === 0 && (
          <p className="dp-idx-empty">Sin resultados para "{query}".</p>
        )}
        {filteredSections.map(sec => {
          const meta = sectionMeta.find(m => m.id === sec.id)
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => { setActiveId(sec.id); setCriticalMode(false) }}
              aria-current={!criticalMode && sec.id === activeSection.id ? 'true' : undefined}
            >
              <b>{String(sec.order).padStart(2, '0')}</b>
              {meta?.hasSteps && <span className="dp-idx-kind" title="Tiene pasos">☑</span>}
              {meta?.hasQuiz && <span className="dp-idx-kind is-quiz" title="Tiene autoevaluación">✓?</span>}
              {sec.title}
            </button>
          )
        })}
        {!isCourse && allNotes.length > 0 && (
          <button
            type="button"
            className="dp-idx-critical"
            onClick={() => setCriticalMode(true)}
            aria-current={criticalMode ? 'true' : undefined}
          >
            <b>⚠</b>Todo lo crítico ({allNotes.length})
          </button>
        )}
      </nav>

      <div className="dp-doc-body">
      {resumeSection && !criticalMode && resumeSection.id !== activeSection.id && (
        <div className="dp-resume">
          <div className="dp-resume-txt">
            <span className="dp-lbl">Continuar leyendo</span>
            <span>Ibas por "{String(resumeSection.order).padStart(2, '0')} · {resumeSection.title}"</span>
          </div>
          <div className="dp-resume-actions">
            <button type="button" onClick={() => setActiveId(resumeSection.id)}>Ir ahí →</button>
            <button type="button" className="dp-resume-dismiss" onClick={() => setResumeId(null)} aria-label="Descartar">✕</button>
          </div>
        </div>
      )}

      {criticalMode ? (
        <CriticalNotesView notes={allNotes} onGoToSection={id => { setActiveId(id); setCriticalMode(false) }} />
      ) : (
      <>
      {/* Sub-cabecera de la sección activa */}
      <div className="dp-subhead">
        <span className="dp-subno">{String(activeSection.order).padStart(2, '0')}</span>
        <h3>{activeSection.title}</h3>
      </div>
      <div className="dp-sec-code">{isCourse ? 'Lección del curso' : 'Manual técnico'}</div>

      {!isGraderGlossary && activeSection.objetivo && (
        <div className="dp-objetivo">
          <span className="dp-lbl">Objetivo</span>
          <p>{activeSection.objetivo}</p>
        </div>
      )}

      {!isGraderGlossary && blocks.description && (
        <div className="dp-body" style={{ marginTop: 24 }}>
          <p style={{ whiteSpace: 'pre-wrap' }}>{linkify(blocks.description)}</p>
        </div>
      )}

      {!isGraderGlossary && blocks.steps.length > 0 && (
        <ol className="dp-proc-ol" style={{ marginTop: 24 }}>
          {blocks.steps.map((step, index) => (
            <li key={`${step}-${index}`}>
              <span className="dp-n" />
              <div className="dp-c"><span style={{ whiteSpace: 'pre-wrap' }}>{linkify(step)}</span></div>
            </li>
          ))}
        </ol>
      )}

      {!isGraderGlossary && activeSection.porque && (
        <p className="dp-porque"><span className="dp-lbl">Por qué importa — </span>{activeSection.porque}</p>
      )}

      {isGraderGlossary ? (
        <div style={{ marginTop: 24 }}><GraderGlossaryView /></div>
      ) : (
        <>
          {blocks.documents.length > 0 && <ManualDocuments documents={blocks.documents} />}
          {blocks.measurements.length > 0 && (
            <ManualBlock title="Medidas / tolerancias" items={blocks.measurements} variant="measure" />
          )}
          {blocks.keyPoints.length > 0 && (
            <ManualBlock title="Puntos clave" items={blocks.keyPoints} />
          )}
          {blocks.notes.length > 0 && (
            <ManualBlock title="Notas operativas" items={blocks.notes} variant="note" />
          )}
          {blocks.images.length > 0 && (
            <ManualImages
              images={blocks.images}
              sectionTitle={activeSection.title}
              machineSlug={machineSlug}
              canEdit={canEdit}
            />
          )}
          {activeSection.quiz && activeSection.quiz.length > 0 && (
            <SectionQuizView items={activeSection.quiz} />
          )}
        </>
      )}

      {sections.length > 1 && (
        <div className="dp-nav">
          <button type="button" onClick={() => goToIndex(activeIndex - 1)} disabled={activeIndex <= 0}>
            ← {noun} anterior
          </button>
          <span className="dp-nav-count">
            {String(activeIndex + 1).padStart(2, '0')} / {String(sections.length).padStart(2, '0')}
          </span>
          <button type="button" onClick={() => goToIndex(activeIndex + 1)} disabled={activeIndex >= sections.length - 1}>
            {noun} siguiente →
          </button>
        </div>
      )}
      </>
      )}
      </div>
    </div>
  )
}

/** Vista "Todo lo crítico": todas las Notas operativas (⚠) de todas las secciones del Manual, juntas, con link de vuelta a su sección de origen. */
function CriticalNotesView({
  notes,
  onGoToSection,
}: {
  notes: { note: string; sectionId: string; sectionOrder: number; sectionTitle: string }[]
  onGoToSection: (sectionId: string) => void
}) {
  return (
    <div className="dp-critical">
      <div className="dp-subhead">
        <h3>Todo lo crítico</h3>
      </div>
      <div className="dp-sec-code">Todas las notas operativas del manual, en un solo lugar.</div>
      {notes.map((item, index) => (
        <div className="dp-crit-item" key={index}>
          <span className="dp-crit-ico" aria-hidden>⚠</span>
          <div className="dp-crit-txt">
            <span className="dp-lbl">{item.sectionTitle}</span>
            <p style={{ whiteSpace: 'pre-wrap' }}>{item.note}</p>
            <button type="button" onClick={() => onGoToSection(item.sectionId)}>
              Ver sección {String(item.sectionOrder).padStart(2, '0')} →
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * SectionQuizView — autoevaluación al pie de una sección de manual. Cada pregunta
 * revela ✓/✕ + explicación al elegir una opción (sin flujo tipo examen del curso).
 * Estado local por pregunta, no persiste.
 */
function SectionQuizView({ items }: { items: SectionQuizItem[] }) {
  const [answers, setAnswers] = useState<Record<number, number>>({})
  return (
    <div className="dp-selfquiz">
      <span className="dp-lbl">Autoevaluación · {items.length} {items.length === 1 ? 'pregunta' : 'preguntas'}</span>
      {items.map((item, qi) => {
        const chosen = answers[qi]
        const answered = chosen !== undefined
        const correct = chosen === item.correctIndex
        return (
          <div className="dp-sq-item" key={qi}>
            <p className="dp-q">{item.question}</p>
            <div className="dp-quiz-opts">
              {item.options.map((opt, oi) => {
                const isCorrect = oi === item.correctIndex
                const isChosen = chosen === oi
                const state = answered ? (isCorrect ? 'correct' : isChosen ? 'wrong' : undefined) : undefined
                return (
                  <button
                    key={oi}
                    type="button"
                    className="dp-quiz-opt"
                    data-state={state}
                    disabled={answered}
                    onClick={() => setAnswers(a => ({ ...a, [qi]: oi }))}
                  >
                    <span className="dp-k">
                      {answered && isCorrect ? '✓' : answered && isChosen ? '✕' : String.fromCharCode(65 + oi)}
                    </span>
                    <span className="dp-otext">{opt}</span>
                  </button>
                )
              })}
            </div>
            {answered && (
              <div className={`dp-quiz-fb ${correct ? '' : 'is-wrong'}`}>
                <span className="dp-lbl">{correct ? 'Correcto' : 'Explicación'}</span>
                {item.explanation}
              </div>
            )}
          </div>
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
  /** Secuencia de acciones marcada explícitamente en el contenido (ver STEP_MARKERS) — se renderiza como lista numerada, no como párrafo. */
  steps: string[]
  images: { label: string; url: string }[]
  /** Documentos descargables (PDF, planos): "- Etiqueta: /ruta.pdf" */
  documents: { label: string; url: string }[]
}

/** Líneas-marcador que indican que lo que sigue es una secuencia de pasos, no prosa libre. */
const STEP_MARKERS = ['Secuencia técnica verificada:', 'Secuencia de ajuste:', 'Rutina verificada:']
/** Sin tildes, en minúscula — el contenido curado a veces las pierde (ver gotcha de acentos de Codex). */
const STEP_MARKERS_NORMALIZED = STEP_MARKERS.map(normalizeForMatch)

function normalizeForMatch(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
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
    steps: [],
    images: [],
    documents: [],
  }
  type ListKey = 'measurements' | 'keyPoints' | 'notes' | 'steps'
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
    if (STEP_MARKERS_NORMALIZED.includes(normalizeForMatch(line))) { current = 'steps'; continue }

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

/** Frase enlazable dentro del texto del Manual: un procedimiento (salta de pestaña) o un término del glosario (tooltip). */
interface TextLink {
  phrase: string
  kind: 'procedure' | 'glossary'
  id: string
  definition?: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Enlaces detectables en el texto del Manual: título completo de un procedimiento existente, o un término del glosario. Frases más largas primero para no partir una más corta que esté contenida en una más larga. */
function buildTextLinks(procedures: Procedure[], glossary: GlossaryEntry[]): TextLink[] {
  const links: TextLink[] = []
  for (const proc of procedures) {
    if (proc.title.length >= 10) links.push({ phrase: proc.title, kind: 'procedure', id: proc.id })
  }
  for (const entry of glossary) {
    if (entry.term.length >= 2) links.push({ phrase: entry.term, kind: 'glossary', id: entry.id, definition: entry.definition })
  }
  return links.sort((a, b) => b.phrase.length - a.phrase.length)
}

/** Envuelve las ocurrencias de `links` dentro de `text` en el span/botón correspondiente y, si `query`
 * no está vacío, resalta además esas coincidencias dentro del texto plano restante (búsqueda tipo Ctrl+F). */
function renderBodyText(text: string, links: TextLink[], query: string, onJumpToProcedure: (id: string) => void): ReactNode {
  if (!text) return text
  const byLower = new Map(links.map(l => [l.phrase.toLowerCase(), l]))
  const linkPattern = links.map(l => escapeRegExp(l.phrase)).join('|')
  const rawParts = linkPattern ? text.split(new RegExp(`(${linkPattern})`, 'gi')) : [text]
  const q = query.trim()

  const highlightPlain = (segment: string, keyPrefix: string): ReactNode => {
    if (!q) return segment
    const pieces = segment.split(new RegExp(`(${escapeRegExp(q)})`, 'gi'))
    if (pieces.length === 1) return segment
    return pieces.map((piece, i) =>
      piece.toLowerCase() === q.toLowerCase()
        ? <mark key={`${keyPrefix}-${i}`} className="dp-hit">{piece}</mark>
        : piece,
    )
  }

  return rawParts.map((part, index) => {
    const link = byLower.get(part.toLowerCase())
    if (!link) return <span key={index}>{highlightPlain(part, `p${index}`)}</span>
    if (link.kind === 'procedure') {
      return (
        <button key={index} type="button" className="dp-xlink" onClick={() => onJumpToProcedure(link.id)}>
          {part}
        </button>
      )
    }
    return (
      <span key={index} className="dp-gterm" tabIndex={0}>
        {part}
        {link.definition && (
          <span className="dp-gpop">
            <b>{link.phrase}</b>
            <span>{link.definition}</span>
          </span>
        )}
      </span>
    )
  })
}

function ManualBlock({
  title,
  items,
  variant = 'default',
}: {
  title: string
  items: string[]
  variant?: 'default' | 'measure' | 'note'
}) {
  // Notas operativas → aviso (barra óxido, como el mockup)
  if (variant === 'note') {
    return (
      <div className="dp-aviso">
        <span className="dp-lbl">{title}</span>
        {items.map((item, index) => (
          <p key={`${item}-${index}`} style={{ whiteSpace: 'pre-wrap' }}>{item}</p>
        ))}
      </div>
    )
  }
  // Medidas → fila etiqueta/valor cuando el texto trae "Etiqueta: valor" (más fácil de escanear que la oración completa)
  if (variant === 'measure') {
    return (
      <div className="dp-block">
        <div className="dp-block-head"><span className="dp-lbl">{title}</span></div>
        <dl className="dp-specs-rows">
          {items.map((item, index) => {
            const match = item.match(/^([^:]{2,50}):\s*(.+)$/)
            return (
              <div key={`${item}-${index}`} className="dp-specs-row">
                {match ? (
                  <>
                    <dt>{match[1]}</dt>
                    <dd>{match[2]}</dd>
                  </>
                ) : (
                  <dd style={{ gridColumn: '1 / -1' }}>{item}</dd>
                )}
              </div>
            )
          })}
        </dl>
      </div>
    )
  }
  // Puntos clave → lista con guiones
  return (
    <div className="dp-block">
      <div className="dp-block-head"><span className="dp-lbl">{title}</span></div>
      <ul className="dp-list">
        {items.map((item, index) => (
          <li key={`${item}-${index}`}><span style={{ whiteSpace: 'pre-wrap' }}>{item}</span></li>
        ))}
      </ul>
    </div>
  )
}

/** Documentos oficiales descargables (PDF, planos) de una seccion de manual. */
function ManualDocuments({ documents }: { documents: { label: string; url: string }[] }) {
  return (
    <>
      <div className="dp-block-head" style={{ marginTop: 26, marginBottom: 0 }}>
        <span className="dp-lbl">Documentos</span>
      </div>
      <div className="dp-docs">
        {documents.map((doc, index) => (
          <a key={`${doc.label}-${index}`} href={doc.url || undefined} target="_blank" rel="noopener noreferrer">
            {doc.label}
          </a>
        ))}
      </div>
    </>
  )
}

function ManualImages({
  images,
  sectionTitle,
  machineSlug,
  canEdit,
}: {
  images: { label: string; url: string }[]
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
      <div className="dp-fig-head">
        <span className="dp-lbl">Referencias visuales</span>
        {canEdit && (
          <button
            type="button"
            className="dp-edit"
            onClick={() => window.open(`/mantenimiento-planta/aprendizaje/admin/${machineSlug}?tab=manual`, '_blank', 'noopener,noreferrer')}
          >
            Editar referencias
          </button>
        )}
      </div>
      <div className="dp-figs">
        {images.map((image, index) => (
          <button
            key={`${image.label}-${index}`}
            type="button"
            className="dp-fig"
            onClick={() => image.url && setActiveIndex(index)}
          >
            {image.url ? (
              <img src={image.url} alt={image.label} loading="lazy" />
            ) : (
              <div className="dp-fig-empty"><ImageIcon className="h-6 w-6" /></div>
            )}
            <figcaption>
              <span>{readableLabel(image.label)}</span>
              {image.url && <span className="dp-fig-zoom">Ampliar</span>}
            </figcaption>
          </button>
        ))}
      </div>

      {activeImage && (
        <ImageLightbox
          image={activeImage}
          label={readableLabel(activeImage.label)}
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
  onClose,
  onPrevious,
  onNext,
}: {
  image: { label: string; url: string }
  label: string
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
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--dp-rule)', background: 'var(--dp-paper)' }}>
        <div className="min-w-0">
          <p className="dp-lbl">Referencia visual</p>
          <h3 className="truncate text-sm font-semibold" style={{ color: 'var(--dp-ink)' }}>{label}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => zoom(-0.25)} className="rounded-md p-2" style={{ color: 'var(--dp-ink-soft)' }} aria-label="Alejar">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => zoom(0.25)} className="rounded-md p-2" style={{ color: 'var(--dp-ink-soft)' }} aria-label="Acercar">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" onClick={reset} className="rounded-md p-2" style={{ color: 'var(--dp-ink-soft)' }} aria-label="Restablecer zoom">
            <RotateCcw className="h-4 w-4" />
          </button>
          <button type="button" onClick={onClose} className="rounded-md p-2" style={{ color: 'var(--dp-accent)' }} aria-label="Cerrar visor">
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
          <button type="button" onClick={onPrevious} className="absolute left-3 top-1/2 z-10 rounded-full p-3" style={{ background: 'var(--dp-paper)', color: 'var(--dp-ink)' }} aria-label="Imagen anterior">
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
          <button type="button" onClick={onNext} className="absolute right-3 top-1/2 z-10 rounded-full p-3" style={{ background: 'var(--dp-paper)', color: 'var(--dp-ink)' }} aria-label="Imagen siguiente">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  )
}


/** Cabecera de sub-sección dentro de la pestaña "Casos" (distingue flujos de diagnóstico). */
function CasosSectionHeader({ label, title, subtitle }: { label: string; title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <span className="dp-lbl" style={{ display: 'block', marginBottom: 10 }}>{label}</span>
      <div className="dp-subhead"><h3>{title}</h3></div>
      <div className="dp-sec-code">{subtitle}</div>
    </div>
  )
}

/**
 * DiagnosisList — tabla de diagnóstico en formato dossier (flat, como el §06 del
 * mockup): columna de caso (óxido) + síntoma, causas con guiones y solución con
 * etiqueta verde. Sin acordeón: todo a la vista, se lee como una tabla de fallas.
 */
function DiagnosisList({ entries, machineSlug }: { entries: DiagnosisEntry[]; machineSlug?: string }) {
  return (
    <div className="dp-diag">
      {entries.map((entry, idx) => {
        const heading = entry.title || entry.symptom
        const showSymptom = !!entry.title && !!entry.symptom && entry.title !== entry.symptom
        return (
          <div className="dp-row" key={entry.id}>
            <div className="dp-code">CASO {String(idx + 1).padStart(2, '0')}</div>
            <div>
              <div className="dp-sy">{heading}</div>
              {showSymptom && (
                <div className="dp-cause" style={{ whiteSpace: 'pre-wrap' }}>{entry.symptom}</div>
              )}
              {entry.possibleCauses.length > 0 && (
                <ul className="dp-causes">
                  {entry.possibleCauses.map((cause, i) => (
                    <li key={i}><span style={{ whiteSpace: 'pre-wrap' }}>{cause}</span></li>
                  ))}
                </ul>
              )}
              <div className="dp-sol">
                <span className="dp-lbl">Solución</span>
                <span style={{ whiteSpace: 'pre-wrap' }}>{entry.solution}</span>
              </div>
              <HmiPracticeButton contentId={entry.id} machineSlug={machineSlug} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function GlossaryView({
  entries,
  onGoToLesson,
}: {
  entries: GlossaryEntry[]
  onGoToLesson: (order: number) => void
}) {
  const [queryText, setQueryText] = useState('')
  const q = queryText.trim().toLowerCase()
  const filtered = q
    ? entries.filter(e => e.term.toLowerCase().includes(q) || e.definition.toLowerCase().includes(q))
    : entries

  return (
    <div>
      <input
        type="text"
        className="dp-search"
        value={queryText}
        onChange={e => setQueryText(e.target.value)}
        placeholder="Buscar sigla o término…"
      />

      {filtered.length === 0 ? (
        <p className="dp-noresult">Sin resultados para «{queryText}».</p>
      ) : (
        <ul className="dp-gloss">
          {filtered.map(entry => (
            <li key={entry.id}>
              <span className="dp-term">{entry.term}</span>
              <p className="dp-def">{entry.definition}</p>
              {entry.lesson != null && (
                <button type="button" className="dp-lesson" onClick={() => onGoToLesson(entry.lesson!)}>
                  → Lección {entry.lesson}
                </button>
              )}
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
function GraderGlossaryView() {
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
    <div>
      <input
        type="text"
        className="dp-search"
        value={queryText}
        onChange={e => setQueryText(e.target.value)}
        placeholder="Buscar término, alias o definición…"
      />

      {filtered.length === 0 ? (
        <p className="dp-noresult">Sin resultados para «{queryText}».</p>
      ) : (
        <ul className="dp-gloss">
          {filtered.map(([key, entry]) => {
            const practiceUrl = glossaryPracticeUrl(key)
            return (
              <li key={key}>
                <span className="dp-term">{entry.label}</span>
                {(entry.alts ?? []).map(alt => <span key={alt} className="dp-alt">{alt}</span>)}
                <p className="dp-def">{entry.description}</p>
                {practiceUrl && (
                  <button
                    type="button"
                    className="dp-practice"
                    onClick={() => navigate(practiceUrl)}
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
function CommonPartsList({ parts }: { parts: CommonPart[] }) {
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
    <div className="dp-parts">
      <p className="dp-parts-meta">
        {allParts.length} repuestos comunes · stock en vivo y foto desde el módulo Repuestos{loading ? ' · cargando datos…' : ''}
      </p>

      {grupos.map(grupo => (
        <div className="dp-part-group" key={grupo.key}>
          <span className="dp-lbl">{grupo.tipo} · {grupo.items.length}</span>
          {grupo.items.map((p, i) => (
            <CommonPartRow
              key={`${p.sap}-${i}`}
              part={p}
              resolved={bySap.get(p.sap) ?? (p.sapAlt ? bySap.get(p.sapAlt) : undefined)}
              onOpen={() => navigate(`/repuestos?q=${encodeURIComponent(p.sap)}`)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function CommonPartRow({
  part, resolved, onOpen,
}: { part: CommonPart; resolved?: RepuestoResuelto; onOpen: () => void }) {
  return (
    <div className="dp-part">
      {resolved?.fotoUrl ? (
        <img className="dp-part-thumb" src={resolved.fotoUrl} alt={part.nombre} loading="lazy" />
      ) : (
        <div className="dp-part-thumb-empty"><Wrench className="h-5 w-5" /></div>
      )}

      <div className="min-w-0">
        <div className="dp-part-name">{part.nombre}</div>
        <div className="dp-part-codes">
          <span>SAP {part.sap}{part.sapAlt ? ` / ${part.sapAlt}` : ''}</span>
          {part.codigoManual && <span className="dp-alt">Manual {part.codigoManual}</span>}
        </div>
        <div className="dp-part-foot">
          {resolved?.stockFisico != null && (
            <span className={`dp-stock ${resolved.stockFisico > 0 ? 'dp-stock-ok' : 'dp-stock-no'}`}>
              Stock {resolved.stockFisico}
            </span>
          )}
          {resolved?.ubicacion && <span className="dp-part-loc">{resolved.ubicacion}</span>}
          <button type="button" className="dp-part-link" onClick={onOpen}>Ver en Repuestos →</button>
        </div>
      </div>
    </div>
  )
}

function BibliografiaView({ entries }: { entries: BibliographyEntry[] }) {
  return (
    <ol className="dp-biblio">
      {entries.map(entry => (
        <li key={entry.id}>
          <span className="dp-bibno" />
          <div>
            <div className="dp-bibtext">{entry.label}</div>
            {entry.url && (
              <a href={entry.url} target="_blank" rel="noopener noreferrer">
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
  tabLabel,
  machineName,
}: {
  tabLabel: string
  machineName: string
}) {
  return (
    <p className="dp-empty">
      La sección <b>{tabLabel}</b> de <b>{machineName}</b> aún no tiene contenido publicado.
      El administrador puede agregarlo desde el panel de administración.
    </p>
  )
}
