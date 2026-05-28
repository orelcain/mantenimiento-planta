/**
 * LearningHubPage — Centro de Aprendizaje
 * Hub público (ruta /aprendizaje, con sidebar si el usuario está autenticado).
 *
 * Diseño:
 *   · Dark tintado + paleta corporativa AquaChile (azulMedio #2E75B6, azulClaro
 *     #9DC3E6 — fuente: utils/exportETTWord.ts).
 *   · Header compacto con batimetría SVG (curvas de nivel marinas tenues).
 *   · Métricas: catálogo total + cobertura de contenido como barra animada.
 *   · Motion: stagger de entrada + roll-up del contador (anime.js / rAF),
 *     transiciones específicas (no `transition-all`), :active para feedback táctil,
 *     focus-visible ring para teclado.
 *   · prefers-reduced-motion respetado (patrón DowntimeParetoBar).
 *   · Orden de máquinas = flujo físico del proceso (no reordenar por estado).
 *
 * Funciones:
 *   · Búsqueda por nombre (sin acentos) + por síntoma de diagnóstico (carga lazy).
 *   · Badge "Nuevo" para contenido actualizado en los últimos 14 días.
 *   · Favoritos (estrella) y Recientes (localStorage), accesos rápidos arriba.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { animate, stagger } from 'animejs'
import { Cpu, ArrowRight, Scale, Wind, FileText, ListChecks, Workflow, Stethoscope, Clock, Search, Star, X, Sparkles, Lock, Activity } from 'lucide-react'
import { useAuthStore } from '@/store'
import { usePermissions } from '@/hooks/usePermissions'
import { InfoTooltip } from '@/components/ui'
import {
  groupMachinesByArea,
  type LearningMachine,
} from '@/data/learningMachines'
import {
  getMachineContentMeta,
  getSymptomsForMachines,
  type MachineContentMeta,
  type SymptomHit,
} from '@/services/learningContent'
import { getFavorites, toggleFavorite, getRecents, pushRecent } from '@/utils/learningHubPrefs'
import { LC as C } from '@/data/learningTheme'

// ── Paleta DARK + AquaChile: ver import { LC as C } arriba (compartida con admin) ──

const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/** lowercase + sin acentos, para búsqueda tolerante */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

interface SpecialModule {
  id: string; title: string; subtitle: string; description: string
  icon: React.ElementType; href: string; tint: string; stats: string
}

const SPECIAL_MODULES: SpecialModule[] = [
  {
    id: 'hmi-knuro', title: 'HMI Knuro B2', subtitle: 'Simulador de parámetros',
    description: 'Panel HMI Knuro para máquinas Baader. Presets de planta y modo de práctica.',
    icon: Cpu, href: '/aprendizaje/hmi-knuro', tint: '#3fb98f', stats: '6 presets · práctica',
  },
  {
    id: 'hmi-grader', title: 'HMI Grader', subtitle: 'StaticGrader Marelec Z2',
    description: 'Clasificador automático por peso. Teclado F1-F4 y numpad con funcionalidad real.',
    icon: Scale, href: '/aprendizaje/hmi-grader', tint: '#46c46f', stats: '12 pockets · práctica',
  },
  {
    id: 'hmi-bombeo-s2', title: 'HMI Bombeo Acopio S2', subtitle: 'Ciclo PLC · planta Yal',
    description: 'Bombeo Sistema 2. Motor de ciclo Fase A ↔ Fase B con eventos PLC reales y sidebar interactivo.',
    icon: Wind, href: '/aprendizaje/hmi-bombeo-s2', tint: '#5aa6e8', stats: 'ciclo 90 s · 10 válvulas',
  },
]

const SECTION_META = [
  { key: 'manual' as const,     short: 'Manual',    icon: FileText,    tooltip: 'Manual técnico — referencia operacional y de mantenimiento' },
  { key: 'procedures' as const, short: 'Procedim.', icon: ListChecks,  tooltip: 'Procedimientos paso a paso — instructivos validados' },
  { key: 'flows' as const,      short: 'Flujos',    icon: Workflow,    tooltip: 'Diagramas de flujo de proceso y secuencia' },
  { key: 'diagnosis' as const,  short: 'Diagnós.',  icon: Stethoscope, tooltip: 'Árboles de diagnóstico — qué hacer cuando algo falla' },
] as const

// ── Batimetría SVG — curvas de nivel marinas (profundidad) ─────────────────────
function BathymetryBackdrop() {
  const lines = useMemo(() => {
    const W = 1200, rows = 7
    return Array.from({ length: rows }, (_, i) => {
      const baseY = 40 + i * 26
      const amp = 10 + i * 2
      const phase = i * 0.7
      let d = `M 0 ${baseY}`
      for (let x = 0; x <= W; x += 40) {
        const y = baseY + Math.sin(x / 110 + phase) * amp
        d += ` L ${x} ${y.toFixed(1)}`
      }
      return { d, opacity: 0.10 - i * 0.012 }
    })
  }, [])

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 1200 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true"
    >
      {lines.map((l, i) => (
        <path key={i} d={l.d} fill="none" stroke={C.aquaLight} strokeWidth="1" style={{ opacity: l.opacity }} />
      ))}
    </svg>
  )
}

export function LearningHubPage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const { isAdmin } = usePermissions()
  const machinesByArea = groupMachinesByArea()
  const allMachines = useMemo(() => Object.values(machinesByArea).flat(), [machinesByArea])

  const [metaMap, setMetaMap] = useState<Record<string, MachineContentMeta>>({})
  const [symptoms, setSymptoms] = useState<SymptomHit[]>([])
  const [symptomsLoaded, setSymptomsLoaded] = useState(false)
  const [favorites, setFavorites] = useState<string[]>(() => getFavorites())
  const [recents] = useState<string[]>(() => getRecents())
  const [query, setQuery] = useState('')

  const counterRef = useRef<HTMLSpanElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const [barFill, setBarFill] = useState(0)

  // ── Carga de meta (counts + lastUpdatedAt) por máquina ──
  useEffect(() => {
    let cancelled = false
    const slugs = allMachines.map(m => m.slug)
    Promise.all(
      slugs.map(async slug => {
        try { return [slug, await getMachineContentMeta(slug)] as const }
        catch { return null }
      })
    ).then(results => {
      if (cancelled) return
      const map: Record<string, MachineContentMeta> = {}
      for (const r of results) if (r) map[r[0]] = r[1]
      setMetaMap(map)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Carga lazy de síntomas: solo cuando el usuario empieza a buscar ──
  useEffect(() => {
    if (query.trim().length < 2 || symptomsLoaded) return
    let cancelled = false
    getSymptomsForMachines(allMachines.map(m => m.slug))
      .then(s => { if (!cancelled) { setSymptoms(s); setSymptomsLoaded(true) } })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, symptomsLoaded])

  // Métricas: catálogo = máquinas + simuladores (los simuladores siempre tienen contenido).
  const documentedMachines = allMachines.filter(m => hasAnyContent(m, metaMap[m.slug])).length
  const totalCatalog = allMachines.length + SPECIAL_MODULES.length
  const itemsWithContent = documentedMachines + SPECIAL_MODULES.length
  const coverageRatio = totalCatalog > 0 ? itemsWithContent / totalCatalog : 0

  // ── Búsqueda ──
  const q = norm(query.trim())
  const searching = q.length >= 2
  const machineHits = searching ? allMachines.filter(m => norm(m.name).includes(q)) : []
  const simHits = searching ? SPECIAL_MODULES.filter(s => norm(s.title).includes(q) || norm(s.subtitle).includes(q)) : []
  const symptomHits = searching
    ? symptoms.filter(h => norm(h.title).includes(q) || norm(h.symptom).includes(q)).slice(0, 8)
    : []
  const noResults = searching && machineHits.length === 0 && simHits.length === 0 && symptomHits.length === 0

  // Accesos rápidos (solo cuando no se busca)
  const favMachines = favorites.map(slug => allMachines.find(m => m.slug === slug)).filter((m): m is LearningMachine => !!m)
  const recentMachines = recents.map(slug => allMachines.find(m => m.slug === slug)).filter((m): m is LearningMachine => !!m)

  const goMachine = (m: LearningMachine) => {
    pushRecent(m.slug)
    navigate(m.customRoute || `/aprendizaje/maquina/${m.slug}`)
  }
  const handleToggleFav = (slug: string) => setFavorites(toggleFavorite(slug))

  // ── Entrada escalonada de las tarjetas (una sola vez al montar) ──
  useEffect(() => {
    if (prefersReduced() || !mainRef.current) return
    const cards = mainRef.current.querySelectorAll<HTMLElement>('[data-card]')
    if (cards.length === 0) return
    animate(cards, { opacity: [0, 1], translateY: [14, 0], duration: 480, delay: stagger(45), ease: 'outExpo' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Roll-up del contador (rAF puro, robusto) ──
  useEffect(() => {
    const node = counterRef.current
    if (!node || totalCatalog <= 0) return
    if (prefersReduced()) { node.textContent = String(totalCatalog); return }
    let raf = 0
    const start = performance.now()
    const dur = 1100
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      node.textContent = String(Math.round(eased * totalCatalog))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [totalCatalog])

  // ── Llenado de la barra de cobertura (CSS transition vía estado) ──
  useEffect(() => {
    if (prefersReduced()) { setBarFill(coverageRatio); return }
    const id = requestAnimationFrame(() => setBarFill(coverageRatio))
    return () => cancelAnimationFrame(id)
  }, [coverageRatio])

  const heightClass = isAuthenticated ? 'min-h-full' : 'min-h-dvh'

  return (
    <div className={`${heightClass} w-full flex flex-col`} style={{ background: C.bg }}>
      {/* ── Header con batimetría ── */}
      <header
        className="relative w-full overflow-hidden"
        style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}
      >
        <div className="absolute inset-x-0 top-0 h-40 opacity-40">
          <BathymetryBackdrop />
        </div>
        <div className="relative max-w-6xl w-full mx-auto px-5 pt-6 pb-5 sm:px-8 sm:pt-8 sm:pb-6">
          {isAdmin && (
            <button
              onClick={() => navigate('/aprendizaje/admin')}
              title="Administrar contenido — pedirá confirmar identidad"
              className="absolute top-4 right-5 sm:top-5 sm:right-8 z-10 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8] transition-colors active:scale-95"
              style={{ background: C.surface, border: `1px solid ${C.borderHi}`, color: C.aquaLight }}
            >
              <Lock className="h-3.5 w-3.5" />
              Administrar
            </button>
          )}
          <div
            className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 rounded-lg p-5 sm:p-6"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]"
                  style={{ color: C.aquaBright, background: C.aquaSoft, border: `1px solid ${C.borderHi}` }}
                >
                  Centro de Aprendizaje
                </span>
                <span className="hidden text-[10px] uppercase tracking-[0.18em] sm:inline" style={{ color: C.inkLo }}>
                  Centro de Aprendizaje · AquaChile
                </span>
              </div>
              <h1 className="font-extrabold leading-tight" style={{ color: C.ink, fontSize: 'clamp(1.7rem, 3.2vw, 2.35rem)' }}>
                Documentación <span style={{ color: C.aquaBright }}>de planta</span>
              </h1>
              <p className="text-sm mt-2 max-w-2xl leading-relaxed" style={{ color: C.inkMid }}>
                Manuales, procedimientos, flujos y diagnóstico, cuando algo no anda y hay que resolverlo rápido.
              </p>
              <div className="grid gap-2 sm:grid-cols-3 mt-6">
                <HubMetric icon={Activity} label="Catalogo" value={`${totalCatalog}`} detail="equipos y simuladores" color={C.aquaBright} />
                <HubMetric icon={FileText} label="Contenido" value={`${itemsWithContent}/${totalCatalog}`} detail="con material publicado" color="#22c55e" />
                <HubMetric icon={Stethoscope} label="Busqueda" value="Sintomas" detail="diagnostico integrado" color="#eab308" />
              </div>
            </div>

            <div
              className="hidden items-center gap-5 shrink-0 rounded-md p-4 md:flex"
              style={{ background: '#151a20', border: `1px solid ${C.border}` }}
            >
              <div className="flex items-baseline gap-1.5">
                <span ref={counterRef} className="font-extrabold tabular-nums leading-none" style={{ color: C.ink, fontSize: '1.9rem' }}>
                  {totalCatalog}
                </span>
                <span className="text-[11px] leading-tight" style={{ color: C.inkLo }}>equipos y<br />simuladores</span>
              </div>
              <div className="w-px h-9" style={{ background: C.border }} />
              <div className="min-w-[140px]">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: C.inkLo }}>
                    Con contenido
                  </span>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: C.aquaLight }}>
                    {itemsWithContent}/{totalCatalog}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.border }}>
                  <div
                    className="h-full rounded-full origin-left"
                    style={{
                      background: `linear-gradient(90deg, ${C.aqua}, ${C.aquaBright})`,
                      transform: `scaleX(${barFill})`,
                      transition: 'transform 0.9s cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Buscador ── */}
          <div className="relative mt-4 max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: C.inkLo }} />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar máquina o simulador…"
              aria-label="Buscar en el Centro de Aprendizaje"
              className="w-full rounded-lg py-3 pl-10 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8] transition-shadow sm:py-2.5"
              style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.ink }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8]"
                style={{ color: C.inkLo }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main ref={mainRef} className="flex-1 max-w-6xl w-full mx-auto px-4 pt-6 pb-28 sm:px-8 sm:pt-8 sm:pb-10 space-y-9 sm:space-y-10">
        {searching ? (
          // ── Resultados de búsqueda ──
          <section>
            <SectionLabel n="⌕">Resultados para "{query.trim()}"</SectionLabel>
            {noResults ? (
              <div className="mt-5 rounded-lg p-8 text-center" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
                <p className="text-sm" style={{ color: C.inkMid }}>Sin resultados para "{query.trim()}".</p>
                <p className="text-xs mt-1" style={{ color: C.inkLo }}>Probá con el nombre de la máquina o un síntoma más general.</p>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                {simHits.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    {simHits.map(mod => <SimulatorCard key={mod.id} mod={mod} onClick={() => navigate(mod.href)} />)}
                  </div>
                )}
                {machineHits.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {machineHits.map(machine => (
                      <MachineCard
                        key={machine.slug}
                        machine={machine}
                        meta={metaMap[machine.slug]}
                        isFav={favorites.includes(machine.slug)}
                        onToggleFav={() => handleToggleFav(machine.slug)}
                        onClick={() => goMachine(machine)}
                      />
                    ))}
                  </div>
                )}
                {symptomHits.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider font-semibold mb-2" style={{ color: C.inkLo }}>
                      Síntomas de diagnóstico
                    </p>
                    <ul className="space-y-1.5">
                      {symptomHits.map(hit => {
                        const m = allMachines.find(x => x.slug === hit.machineSlug)
                        return (
                          <li key={`${hit.machineSlug}-${hit.diagnosisId}`}>
                            <button
                              onClick={() => navigate(`/aprendizaje/maquina/${hit.machineSlug}`)}
                              className="group w-full text-left flex items-center gap-3 rounded-lg px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8] transition-colors"
                              style={{ background: C.surface, border: `1px solid ${C.border}` }}
                            >
                              <Stethoscope className="h-4 w-4 flex-shrink-0" style={{ color: C.aquaLight }} />
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm truncate" style={{ color: C.ink }}>{hit.title || hit.symptom}</span>
                                {hit.title && hit.symptom && (
                                  <span className="block text-[11px] truncate" style={{ color: C.inkMid }}>{hit.symptom}</span>
                                )}
                                {m && <span className="block text-[11px]" style={{ color: C.inkLo }}>{m.name}</span>}
                              </span>
                              <ArrowRight className="h-4 w-4 flex-shrink-0 transition-transform group-hover:translate-x-1" style={{ color: C.aquaBright }} />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        ) : (
          <>
            {/* ── Accesos rápidos: Favoritos + Recientes ── */}
            {(favMachines.length > 0 || recentMachines.length > 0) && (
              <section className="space-y-3">
                {favMachines.length > 0 && (
                  <QuickRow icon={<Star className="h-3.5 w-3.5" style={{ color: C.star, fill: C.star }} />} label="Favoritos">
                    {favMachines.map(m => <QuickChip key={m.slug} machine={m} onClick={() => goMachine(m)} />)}
                  </QuickRow>
                )}
                {recentMachines.length > 0 && (
                  <QuickRow icon={<Clock className="h-3.5 w-3.5" style={{ color: C.inkLo }} />} label="Recientes">
                    {recentMachines.map(m => <QuickChip key={m.slug} machine={m} onClick={() => goMachine(m)} />)}
                  </QuickRow>
                )}
              </section>
            )}

            {/* ── Simuladores PRIMERO ── */}
            <section>
              <SectionLabel n="01">Simuladores interactivos</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-5">
                {SPECIAL_MODULES.map(mod => (
                  <SimulatorCard key={mod.id} mod={mod} onClick={() => navigate(mod.href)} />
                ))}
              </div>
            </section>

            {/* ── Máquinas — orden de proceso físico ── */}
            {Object.entries(machinesByArea).map(([area, machines], areaIdx) => {
              // Editorial: documentadas como cards prominentes; en preparación como
              // chips compactos. Rompe la grilla uniforme y prioriza lo que tiene contenido.
              const documented = machines.filter(m => hasAnyContent(m, metaMap[m.slug]))
              const pending = machines.filter(m => !hasAnyContent(m, metaMap[m.slug]))
              return (
                <section key={area}>
                  <SectionLabel n={String(areaIdx + 2).padStart(2, '0')}>{area}</SectionLabel>

                  {documented.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-5">
                      {documented.map(machine => (
                        <MachineCard
                          key={machine.slug}
                          machine={machine}
                          meta={metaMap[machine.slug]}
                          isFav={favorites.includes(machine.slug)}
                          onToggleFav={() => handleToggleFav(machine.slug)}
                          onClick={() => goMachine(machine)}
                        />
                      ))}
                    </div>
                  )}

                  {pending.length > 0 && (
                    <div className="mt-4">
                      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold mb-2.5" style={{ color: C.inkLo }}>
                        <Clock className="h-3 w-3" />
                        En preparación
                        <span className="tabular-nums" style={{ color: C.inkGhost }}>· {pending.length}</span>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {pending.map(machine => (
                          <PendingChip key={machine.slug} machine={machine} onClick={() => goMachine(machine)} />
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )
            })}
          </>
        )}
      </main>

      <footer className="py-8 text-center" style={{ borderTop: `1px solid ${C.border}` }}>
        <p className="text-xs uppercase tracking-wider font-medium" style={{ color: C.inkLo }}>
          Acceso libre · No requiere inicio de sesión
        </p>
      </footer>
    </div>
  )
}

// ── Section label editorial ────────────────────────────────────────────────────
function SectionLabel({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold tabular-nums" style={{ color: C.aquaBright }}>{n}</span>
      <span className="h-px flex-shrink-0 w-6" style={{ background: C.borderHi }} />
      <h2 className="text-sm uppercase tracking-widest font-bold" style={{ color: C.ink }}>{children}</h2>
    </div>
  )
}

// ── Acceso rápido (favoritos / recientes) ──────────────────────────────────────
function HubMetric({
  icon: Icon,
  label,
  value,
  detail,
  color,
}: {
  icon: React.ElementType
  label: string
  value: string
  detail: string
  color: string
}) {
  return (
    <div className="rounded-md px-3 py-2" style={{ background: C.bgPanel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5" style={{ color }} />
        <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: C.inkLo }}>
          {label}
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold" style={{ color: C.ink }}>
        {value}
      </p>
      <p className="text-[11px] leading-snug" style={{ color: C.inkLo }}>
        {detail}
      </p>
    </div>
  )
}

function QuickRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold mr-1" style={{ color: C.inkLo }}>
        {icon}{label}
      </span>
      {children}
    </div>
  )
}

function QuickChip({ machine, onClick }: { machine: LearningMachine; onClick: () => void }) {
  const Icon = machine.icon
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8] transition-colors hover:brightness-110"
      style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.ink }}
    >
      <Icon className="h-3.5 w-3.5" style={{ color: machine.color }} />
      {machine.name}
    </button>
  )
}

// Chip compacto para máquinas sin contenido (en preparación) — borde punteado.
function PendingChip({ machine, onClick }: { machine: LearningMachine; onClick: () => void }) {
  const Icon = machine.icon
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8] transition-colors hover:brightness-125"
      style={{ background: C.bgPanel, border: `1px dashed ${C.border}`, color: C.inkMid }}
    >
      <Icon className="h-3.5 w-3.5" style={{ color: machine.color, opacity: 0.7 }} />
      {machine.name}
    </button>
  )
}

function hasAnyContent(machine: LearningMachine, meta?: MachineContentMeta): boolean {
  if (meta) return (meta.manual + meta.procedures + meta.flows + meta.diagnosis) > 0 || machine.sections.manual
  return Object.values(machine.sections).some(Boolean)
}

// ── MachineCard ────────────────────────────────────────────────────────────────
function MachineCard({
  machine, meta, isFav, onToggleFav, onClick,
}: {
  machine: LearningMachine
  meta?: MachineContentMeta
  isFav: boolean
  onToggleFav: () => void
  onClick: () => void
}) {
  const Icon = machine.icon
  const ready = hasAnyContent(machine, meta)
  const sectionFlags = meta
    ? { manual: meta.manual > 0 || machine.sections.manual, procedures: meta.procedures > 0, flows: meta.flows > 0, diagnosis: meta.diagnosis > 0 }
    : machine.sections
  const enabledCount = Object.values(sectionFlags).filter(Boolean).length
  const isNew = ready && meta?.lastUpdatedAt != null && (Date.now() - meta.lastUpdatedAt) < NEW_WINDOW_MS

  // Color de identidad de la máquina (atenuado si está en preparación)
  const accent = machine.color

  return (
    <div data-card className="relative">
      <button
        onClick={onClick}
        className="group w-full text-left rounded-lg overflow-hidden flex flex-col transition-[transform,box-shadow,border-color] duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1722] hover:-translate-y-1 hover:shadow-[0_14px_36px_-12px_rgba(46,117,182,0.45)] active:translate-y-0 active:scale-[0.98]"
        style={{ background: C.surface, border: `1px solid ${accent}33`, opacity: ready ? 1 : 0.78 }}
      >
        {/* Strip superior — color de identidad (siempre visible) + fill = progreso de secciones */}
        <div className="h-1 w-full" style={{ background: `${accent}2e` }}>
          <div className="h-full transition-[width] duration-500 ease-out"
            style={{ width: `${(enabledCount / 4) * 100}%`, background: accent }} />
        </div>

        <div className="p-4 flex flex-col flex-1">
          {/* Fila de estado (deja espacio a la derecha para la estrella) */}
          <div className="flex items-center gap-2 mb-3 pr-8 min-h-[20px]">
            {ready ? (
              <span className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: accent }}>
                {enabledCount}/4 secciones
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                style={{ background: C.prepSoft, color: C.prep, border: `1px solid ${C.prep}40` }}>
                <Clock className="h-2.5 w-2.5" /> En preparación
              </span>
            )}
            {isNew && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                style={{ background: C.nuevoSoft, color: C.nuevo, border: `1px solid ${C.nuevo}40` }}>
                <Sparkles className="h-2.5 w-2.5" /> Nuevo
              </span>
            )}
          </div>

          <div className="flex items-start gap-3 mb-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-lg flex-shrink-0 transition-transform duration-200 ease-out group-hover:scale-105"
              style={{ background: `${accent}1f`, border: `1px solid ${accent}40` }}>
              <Icon style={{ color: accent, width: 22, height: 22 }} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold leading-tight" style={{ color: C.ink }}>{machine.name}</h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-1">
            {SECTION_META.map(s => {
              const enabled = sectionFlags[s.key]
              const count = meta?.[s.key]
              const SIcon = s.icon
              return (
                <span key={s.key} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold"
                  style={{ background: enabled ? C.aquaSoft : 'transparent', color: enabled ? C.aquaLight : C.inkGhost, border: `1px solid ${enabled ? C.borderHi : C.border}`, opacity: enabled ? 1 : 0.7 }}>
                  <SIcon className="h-3 w-3" />
                  {s.short}
                  {count !== undefined && count > 0 && <span className="tabular-nums">· {count > 9 ? '9+' : count}</span>}
                  <InfoTooltip text={s.tooltip} iconSize={9} position="top" />
                </span>
              )
            })}
          </div>
        </div>
      </button>

      {/* Estrella favorito — hermana del botón (no anidada) */}
      <button
        onClick={onToggleFav}
        aria-label={isFav ? `Quitar ${machine.name} de favoritos` : `Agregar ${machine.name} a favoritos`}
        aria-pressed={isFav}
        className="absolute top-3 right-2.5 p-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8] transition-transform hover:scale-110 active:scale-95"
      >
        <Star className="h-4 w-4" style={{ color: isFav ? C.star : C.inkGhost, fill: isFav ? C.star : 'none' }} />
      </button>
    </div>
  )
}

// ── SimulatorCard ────────────────────────────────────────────────────────────
function SimulatorCard({ mod, onClick }: { mod: SpecialModule; onClick: () => void }) {
  const Icon = mod.icon
  return (
    <button
      data-card
      onClick={onClick}
      className="group text-left rounded-lg p-5 flex flex-col h-full transition-[transform,box-shadow] duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1722] hover:-translate-y-1 hover:shadow-[0_16px_40px_-14px_rgba(46,117,182,0.5)] active:translate-y-0 active:scale-[0.98]"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center justify-center w-12 h-12 rounded-lg mb-4 transition-transform duration-200 ease-out group-hover:scale-105"
        style={{ background: mod.tint, boxShadow: `0 6px 18px ${mod.tint}40` }}>
        <Icon className="h-6 w-6" style={{ color: C.bg }} />
      </div>
      <h3 className="text-base font-bold leading-tight" style={{ color: C.ink }}>{mod.title}</h3>
      <p className="text-xs font-semibold mt-0.5" style={{ color: mod.tint }}>{mod.subtitle}</p>
      <p className="text-sm leading-relaxed mt-2 flex-1" style={{ color: C.inkMid }}>{mod.description}</p>
      <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        <span className="text-[11px] uppercase tracking-wide" style={{ color: C.inkLo }}>{mod.stats}</span>
        <span className="inline-flex items-center gap-1 text-sm font-bold" style={{ color: mod.tint }}>
          Abrir <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  )
}
