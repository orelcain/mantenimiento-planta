/**
 * GraderLearningPage — Expediente del Grader en el Centro de Aprendizaje.
 * Ruta: /aprendizaje/grader-manual
 *
 * Mismo shell que MachineLearningPage (header dossier + pestañas + strip), pero
 * el contenido no viene de Firestore: son los runbooks Z2 de `graderRunbooks.ts`,
 * que ademas alimentan el plan de accion del Analisis de Turno. Fuente unica.
 *
 * Manual        → documentos oficiales + glosario Z2
 * Procedimientos → runbooks de contrastacion, calibracion, mantencion y limpieza
 * Diagnostico   → runbooks de troubleshooting
 */
import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, BookOpen, ListChecks, GitBranch, AlertTriangle, Clock, Download, Search, X,
  ChevronsDown, ChevronsUp, Wrench, Gauge, Sparkles, Sprout, ClipboardCheck, ShieldCheck, Activity,
} from 'lucide-react'
import { useAuthStore } from '@/store'
import { findMachineBySlug } from '@/data/learningMachines'
import { LC } from '@/data/learningTheme'
import { RUNBOOKS, filterRunbooks } from '@/services/grader/graderRunbooks'
import type { RunbookCategory } from '@/services/grader/graderRunbooks'
import { GRADER_GLOSSARY } from '@/services/grader/graderGlossary'
import { RunbookCard } from '@/components/grader/RunbookCard'
import { MachineMetric, DossierRow } from '@/components/learning/MachineDossier'
import { OtherLearningModulesStrip } from '@/components/learning/OtherLearningModulesStrip'

type TabId = 'manual' | 'procedures' | 'flows' | 'diagnosis'

/** Runbooks que son "procedimiento programado" (el resto es diagnostico reactivo). */
const PROCEDURE_CATEGORIES: RunbookCategory[] = ['contrastacion', 'calibracion', 'mantencion', 'limpieza']

const TABS: Array<{ id: TabId; label: string; shortLabel: string; icon: React.ElementType; description: string }> = [
  { id: 'manual',     label: 'Manual',              shortLabel: 'Manual',   icon: BookOpen,       description: 'Manual Marelec MS4/12, SOPs oficiales y glosario Z2.' },
  { id: 'procedures', label: 'Procedimientos',      shortLabel: 'Proced.',  icon: ListChecks,     description: 'Runbooks Z2 paso a paso: contrastacion, calibracion, mantencion y limpieza.' },
  { id: 'flows',      label: '¿Que hago cuando...?', shortLabel: 'Flujos',  icon: GitBranch,      description: 'Flujos de accion y checklists de decision.' },
  { id: 'diagnosis',  label: 'Diagnostico',          shortLabel: 'Fallas',  icon: AlertTriangle,  description: 'Sintoma → causa probable → solucion.' },
]

const CATEGORY_CHIPS: Array<{ value: RunbookCategory | 'all'; label: string; icon: React.ElementType }> = [
  { value: 'all',           label: 'Todas',         icon: BookOpen },
  { value: 'contrastacion', label: 'Contrastación', icon: Gauge },
  { value: 'calibracion',   label: 'Calibración',   icon: Sparkles },
  { value: 'mantencion',    label: 'Mantención',    icon: Wrench },
  { value: 'limpieza',      label: 'Limpieza',      icon: Sprout },
]

const OFFICIAL_DOCS = [
  { label: 'Manual Marelec MS4/12', desc: 'Manual completo del clasificador',                  file: '/docs/grader/manual-marelec-ms4-12.pdf' },
  { label: 'SOP Contrastación',     desc: 'CH-MT-ME-0002 — Paso a Paso Calibración Grader',    file: '/docs/grader/sop-contrastacion.pdf' },
  { label: 'SOP Balanzas',          desc: 'Procedimiento de balanzas y tara',                   file: '/docs/grader/sop-balanzas.pdf' },
]

export function GraderLearningPage() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabId>('manual')
  const [query, setQuery] = useState('')
  const [filterCat, setFilterCat] = useState<RunbookCategory | 'all'>('all')
  const [expandedRunbooks, setExpandedRunbooks] = useState<Set<string>>(new Set())

  const machine = findMachineBySlug('grader')

  const procedureRunbooks = useMemo(
    () => filterRunbooks(RUNBOOKS, query, filterCat).filter(rb => PROCEDURE_CATEGORIES.includes(rb.category)),
    [query, filterCat],
  )
  const diagnosisRunbooks = useMemo(
    () => filterRunbooks(RUNBOOKS, query, 'troubleshooting'),
    [query],
  )

  // Totales del catalogo (independientes del buscador) para los contadores de pestana.
  const totals = useMemo(() => {
    const all = Object.values(RUNBOOKS)
    return {
      manual: OFFICIAL_DOCS.length,
      procedures: all.filter(rb => PROCEDURE_CATEGORIES.includes(rb.category)).length,
      flows: 0,
      diagnosis: all.filter(rb => rb.category === 'troubleshooting').length,
    } satisfies Record<TabId, number>
  }, [])

  const countsByCat = useMemo(() => {
    const map: Partial<Record<RunbookCategory | 'all', number>> = {}
    const proc = Object.values(RUNBOOKS).filter(rb => PROCEDURE_CATEGORIES.includes(rb.category))
    map.all = proc.length
    for (const rb of proc) map[rb.category] = (map[rb.category] ?? 0) + 1
    return map
  }, [])

  if (!machine) return <Navigate to="/aprendizaje" replace />

  const visibleRunbooks = activeTab === 'procedures' ? procedureRunbooks : diagnosisRunbooks
  const allExpanded = visibleRunbooks.length > 0 && visibleRunbooks.every(rb => expandedRunbooks.has(rb.id))
  const toggleExpandAll = () => {
    setExpandedRunbooks(allExpanded ? new Set() : new Set(visibleRunbooks.map(rb => rb.id)))
  }
  const setRunbookExpanded = (id: string, expanded: boolean) => {
    setExpandedRunbooks(prev => {
      const next = new Set(prev)
      if (expanded) next.add(id)
      else next.delete(id)
      return next
    })
  }
  const goToTab = (id: TabId) => {
    setActiveTab(id)
    setQuery('')
    setFilterCat('all')
    setExpandedRunbooks(new Set())
  }

  const Icon = machine.icon
  const color = machine.color
  const activeTabData = TABS.find(t => t.id === activeTab) ?? TABS[0]!
  const ActiveIcon = activeTabData.icon
  const heightClass = isAuthenticated ? 'min-h-full' : 'min-h-dvh'

  return (
    <div
      className={`${heightClass} w-full`}
      style={{
        background:
          `radial-gradient(circle at 18% 0%, ${color}14 0, transparent 32%), ` +
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

        <section className="overflow-hidden rounded-lg" style={{ background: LC.surface, border: `1px solid ${LC.border}` }}>
          <div className="grid lg:grid-cols-[1fr_340px]">
            <div className="p-5 sm:p-6 lg:p-7">
              <div className="flex items-center gap-1.5 text-xs mb-5" style={{ color: LC.inkLo }}>
                <span>Aprendizaje</span>
                <span>/</span>
                <span style={{ color }}>{machine.name}</span>
              </div>

              <div className="flex items-start gap-3 sm:gap-4">
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-lg flex-shrink-0 sm:h-16 sm:w-16"
                  style={{
                    background: `linear-gradient(145deg, ${color}24, #151a20)`,
                    border: `1px solid ${color}45`,
                    boxShadow: `inset 0 0 0 1px ${color}12`,
                  }}
                >
                  <Icon className="h-6 w-6 sm:h-8 sm:w-8" style={{ color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span
                      className="rounded px-2 py-1 text-[10px] font-bold uppercase"
                      style={{ color, background: `${color}16`, border: `1px solid ${color}30` }}
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

              <div className="mt-5 flex flex-wrap gap-2 sm:mt-6">
                <MachineMetric icon={BookOpen} label="Manual" enabled={machine.sections.manual} color={color} tone="blue" />
                <MachineMetric icon={ClipboardCheck} label="Proced." enabled={machine.sections.procedures} color="#22c55e" tone="green" />
                <MachineMetric icon={GitBranch} label="Flujos" enabled={machine.sections.flows} color="#eab308" tone="amber" />
                <MachineMetric icon={Activity} label="Diagnostico" enabled={machine.sections.diagnosis} color="#f97316" tone="orange" />
              </div>
            </div>

            <aside className="hidden p-5 sm:block sm:p-6 lg:border-l" style={{ background: '#151a20', borderColor: LC.border }}>
              <div className="flex items-center gap-2 mb-4">
                <Gauge className="h-4 w-4" style={{ color }} />
                <h2 className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: LC.ink }}>
                  Lectura rapida
                </h2>
              </div>
              <div className="space-y-3">
                <DossierRow label="Uso" value="Consulta en terreno" />
                <DossierRow label="Contenido" value={`${Object.keys(RUNBOOKS).length} runbooks Z2 + glosario`} />
                <DossierRow label="Fuente" value="Marelec MS4/12 · CH-MT-ME-0002" />
              </div>
              <div className="mt-5 rounded-md p-3" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.28)' }}>
                <div className="flex gap-2">
                  <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#eab308' }} />
                  <p className="text-xs leading-relaxed" style={{ color: LC.inkMid }}>
                    Estos runbooks son los mismos que el Analisis de Turno propone como plan de accion cuando una metrica cruza su umbral.
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
            const hasContent = totals[tab.id] > 0
            return (
              <button
                key={tab.id}
                onClick={() => goToTab(tab.id)}
                className="flex items-center justify-center sm:justify-start gap-2 px-3 py-3 transition-all relative"
                style={{ background: isActive ? `${color}18` : LC.surface, minHeight: '58px' }}
              >
                <TabIcon
                  className="h-4 w-4 flex-shrink-0"
                  style={{ color: isActive ? color : hasContent ? LC.inkMid : LC.inkGhost }}
                />
                <span className="text-xs font-semibold leading-tight" style={{ color: isActive ? color : LC.inkMid }}>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </span>
                {hasContent && !isActive && (
                  <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Contenido */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 sm:pt-6 pb-28 sm:pb-12">
        <div className="mb-5 flex items-start gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ background: `${color}16`, border: `1px solid ${color}30` }}
          >
            <ActiveIcon className="h-5 w-5" style={{ color }} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#e9eef3]">{activeTabData.label}</h2>
            <p className="text-xs mt-0.5" style={{ color: LC.inkLo }}>{activeTabData.description}</p>
          </div>
        </div>

        {activeTab === 'manual' && <ManualTab color={color} />}

        {(activeTab === 'procedures' || activeTab === 'diagnosis') && (
          <div className="space-y-4">
            <RunbookSearch
              query={query}
              onQueryChange={setQuery}
              placeholder={activeTab === 'procedures' ? 'Buscar procedimiento o paso…' : 'Buscar sintoma o falla…'}
            />

            {activeTab === 'procedures' && (
              <div className="flex gap-1.5 flex-wrap">
                {CATEGORY_CHIPS.map(chip => {
                  const ChipIcon = chip.icon
                  const count = countsByCat[chip.value] ?? 0
                  const active = filterCat === chip.value
                  return (
                    <button
                      key={chip.value}
                      onClick={() => setFilterCat(chip.value)}
                      disabled={count === 0}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        background: active ? color : LC.surfaceHi,
                        color: active ? LC.bg : LC.inkMid,
                        border: `1px solid ${active ? color : LC.border}`,
                      }}
                    >
                      <ChipIcon className="w-3.5 h-3.5" />
                      {chip.label}
                      <span className="tabular-nums text-[10px] font-normal opacity-80">{count}</span>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: LC.inkLo }}>
                {visibleRunbooks.length} de {totals[activeTab]}
              </h3>
              {visibleRunbooks.length > 0 && (
                <button
                  onClick={toggleExpandAll}
                  className="flex items-center gap-1 text-xs font-medium transition-colors"
                  style={{ color: LC.inkLo }}
                  onMouseEnter={e => (e.currentTarget.style.color = LC.ink)}
                  onMouseLeave={e => (e.currentTarget.style.color = LC.inkLo)}
                >
                  {allExpanded
                    ? <><ChevronsUp className="w-3.5 h-3.5" />Contraer todos</>
                    : <><ChevronsDown className="w-3.5 h-3.5" />Expandir todos</>}
                </button>
              )}
            </div>

            {visibleRunbooks.length === 0 ? (
              <NoResults query={query} onClear={() => { setQuery(''); setFilterCat('all') }} />
            ) : (
              <div className="space-y-2">
                {visibleRunbooks.map(rb => (
                  <RunbookCard
                    key={rb.id}
                    runbook={rb}
                    expanded={expandedRunbooks.has(rb.id)}
                    onExpandedChange={e => setRunbookExpanded(rb.id, e)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'flows' && <EmptySection color={color} tabLabel={activeTabData.label} machineName={machine.name} />}

        <OtherLearningModulesStrip currentSlug="grader" accent={color} />
      </div>
    </div>
  )
}

function ManualTab({ color }: { color: string }) {
  const [showGlossary, setShowGlossary] = useState(true)

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: LC.inkLo }}>
          Documentos oficiales
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {OFFICIAL_DOCS.map(doc => (
            <a key={doc.file} href={doc.file} target="_blank" rel="noopener noreferrer" className="block">
              <div
                className="h-full rounded-lg p-4 flex items-start gap-3 transition-transform hover:-translate-y-0.5"
                style={{ background: LC.surface, border: `1px solid ${LC.border}` }}
              >
                <Download className="w-4 h-4 shrink-0 mt-0.5" style={{ color }} />
                <div>
                  <div className="font-medium text-sm" style={{ color: LC.ink }}>{doc.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: LC.inkMid }}>{doc.desc}</div>
                </div>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section>
        <button
          className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider mb-3 transition-colors"
          style={{ color: LC.inkLo }}
          onClick={() => setShowGlossary(g => !g)}
          aria-expanded={showGlossary}
        >
          <BookOpen className="w-4 h-4" />
          Glosario Marelec Z2
          <span className="text-xs font-normal normal-case tracking-normal ml-1">
            ({Object.keys(GRADER_GLOSSARY).length} terminos)
          </span>
          <span className="ml-1 text-xs">{showGlossary ? '▲' : '▼'}</span>
        </button>

        {showGlossary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(GRADER_GLOSSARY).map(([key, entry]) => (
              <div key={key} className="rounded-md p-3" style={{ background: LC.surface, border: `1px solid ${LC.border}` }}>
                <div className="font-medium text-sm" style={{ color: LC.ink }}>{entry.label}</div>
                {entry.alts && (
                  <div className="text-xs italic mb-0.5" style={{ color: LC.inkLo }}>
                    Tambien: {entry.alts.join(', ')}
                  </div>
                )}
                <div className="text-xs leading-relaxed" style={{ color: LC.inkMid }}>{entry.description}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function RunbookSearch({
  query,
  onQueryChange,
  placeholder,
}: {
  query: string
  onQueryChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: LC.inkLo }} />
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        className="w-full pl-9 pr-9 py-2.5 text-sm rounded-md outline-none"
        style={{ background: LC.surface, border: `1px solid ${LC.border}`, color: LC.ink }}
      />
      {query && (
        <button
          onClick={() => onQueryChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md"
          aria-label="Limpiar busqueda"
        >
          <X className="w-3.5 h-3.5" style={{ color: LC.inkLo }} />
        </button>
      )}
    </div>
  )
}

function NoResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="rounded-xl p-8 text-center" style={{ background: LC.surface, border: `1px dashed ${LC.borderHi}` }}>
      <Search className="w-8 h-8 mx-auto mb-3" style={{ color: LC.inkGhost }} />
      <p className="text-sm" style={{ color: LC.inkMid }}>
        {query ? <>No se encontraron runbooks para <strong style={{ color: LC.ink }}>"{query}"</strong></> : 'No hay runbooks en esta categoria.'}
      </p>
      <button
        onClick={onClear}
        className="mt-3 rounded-md px-3 py-1.5 text-xs font-semibold"
        style={{ background: LC.surfaceHi, border: `1px solid ${LC.border}`, color: LC.ink }}
      >
        Limpiar filtros
      </button>
    </div>
  )
}

function EmptySection({ color, tabLabel, machineName }: { color: string; tabLabel: string; machineName: string }) {
  return (
    <div className="rounded-xl p-8 text-center" style={{ background: LC.surface, border: `1px dashed ${LC.borderHi}` }}>
      <div
        className="flex items-center justify-center w-14 h-14 rounded-full mx-auto mb-4"
        style={{ background: `${color}12`, border: `1px solid ${color}30` }}
      >
        <Clock className="h-7 w-7" style={{ color, opacity: 0.7 }} />
      </div>
      <h3 className="text-base font-semibold text-[#e9eef3] mb-2">Sección en preparación</h3>
      <p className="text-sm" style={{ color: LC.inkMid }}>
        La sección <strong style={{ color: LC.ink }}>{tabLabel}</strong> de{' '}
        <strong style={{ color: LC.ink }}>{machineName}</strong> aún no tiene contenido publicado.
      </p>
    </div>
  )
}
