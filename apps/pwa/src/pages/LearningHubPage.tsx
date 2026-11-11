/**
 * Centro de Aprendizaje — hub de máquinas y simuladores.
 *
 * Desde 2026-09-16 es una pantalla más de la app (vara iOS 27, DESIGN.md):
 * título grande, búsqueda, y listas agrupadas por sección. Se retiró el héroe
 * de "plataforma de cursos" (título en degradado, métricas en tarjeta,
 * secciones numeradas) y la paleta propia `lc-*` deja de usarse aquí — sigue
 * viva en el editor admin y en planos hasta que migren.
 *
 * Contenido:
 *   · Simuladores (SPECIAL_MODULES) como filas: los inDevelopment solo los ven admins.
 *   · Máquinas por área en orden de proceso físico; el color de identidad de la
 *     máquina vive solo en el tile de 40 px, nunca tiñe la fila.
 *   · Búsqueda por nombre (sin acentos) + por síntoma de diagnóstico (carga lazy).
 *   · Favoritos (deslizar a la derecha) y recientes como chips bajo la búsqueda.
 *   · Lo único que "progresa" es la evaluación: aprobada = trailing en tinta ok.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, ListChecks, Workflow, Stethoscope, Clock, Search, Star, X,
  Lock, MoreHorizontal,
} from 'lucide-react'
import { useAuthStore } from '@/store'
import { usePermissions } from '@/hooks/usePermissions'
import {
  groupMachinesByArea,
  isCourseMachine,
  type LearningMachine,
} from '@/data/learningMachines'
import {
  getMachineContentMeta,
  getSymptomsForMachines,
  type MachineContentMeta,
  type SymptomHit,
} from '@/services/learningContent'
import { getFavorites, toggleFavorite, getRecents, pushRecent } from '@/utils/learningHubPrefs'
import { getQuizBest, QUIZ_PASS_PCT } from '@/utils/learningProgress'
import { normHub, textoBuscable, coincide } from '@/data/learningHubSearch'
import { ListGroup, ListCell, SwipeRow, Tag } from '@/components/piel'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { formatNombreSAP } from '@/utils/repuestos/formatNombreSAP'
import { CompartirPaseLectura } from '@/components/learning/CompartirPaseLectura'
import { cn } from '@/lib/utils'
import { useEsPC } from '@/hooks/useEsPC'
import { HubAprendizajePC } from '@/components/learning/HubAprendizajePC'

const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

/** lowercase + sin acentos, para búsqueda tolerante */
const norm = normHub

import { SPECIAL_MODULES, type SpecialModule } from '@/data/learningSpecialModules'

const SECTION_META = [
  { key: 'manual' as const,     label: 'manual',         icon: FileText },
  { key: 'procedures' as const, label: 'procedimientos', icon: ListChecks },
  { key: 'flows' as const,      label: 'flujos',         icon: Workflow },
  { key: 'diagnosis' as const,  label: 'diagnósticos',   icon: Stethoscope },
] as const

function hasAnyContent(machine: LearningMachine, meta?: MachineContentMeta): boolean {
  if (meta) return (meta.manual + meta.procedures + meta.flows + meta.diagnosis) > 0 || machine.sections.manual
  return Object.values(machine.sections).some(Boolean)
}

export function LearningHubPage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const { isAdmin } = usePermissions()
  const pc = useEsPC()
  const machinesByArea = groupMachinesByArea()
  const allMachines = useMemo(() => Object.values(machinesByArea).flat(), [machinesByArea])

  const [metaMap, setMetaMap] = useState<Record<string, MachineContentMeta>>({})
  const [symptoms, setSymptoms] = useState<SymptomHit[]>([])
  const [symptomsLoaded, setSymptomsLoaded] = useState(false)
  const [favorites, setFavorites] = useState<string[]>(() => getFavorites())
  const [recents] = useState<string[]>(() => getRecents())
  const [query, setQuery] = useState('')

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

  // Simuladores visibles: los inDevelopment solo los ven admins (con etiqueta).
  const visibleSims = SPECIAL_MODULES.filter(s => !s.inDevelopment || isAdmin)

  // Métricas: catálogo = máquinas + simuladores (los simuladores siempre tienen contenido).
  const documentedMachines = allMachines.filter(m => hasAnyContent(m, metaMap[m.slug])).length
  const totalCatalog = allMachines.length + visibleSims.length
  const itemsWithContent = documentedMachines + visibleSims.length

  // ── Búsqueda ──
  // Se busca TODO lo que la fila muestra, no solo el nombre: el técnico llega con
  // la placa en la mano y escribe `A600`, `MS4`, `clasificador`…
  const q = norm(query.trim())
  const searching = q.length >= 2
  const machineHits = searching
    ? allMachines.filter(m => coincide(textoBuscable(m.name, m.description, m.area), q))
    : []
  const simHits = searching
    ? visibleSims.filter(s => coincide(textoBuscable(s.title, s.subtitle, s.description, s.stats), q))
    : []
  const symptomHits = searching
    ? symptoms.filter(h => norm(h.title).includes(q) || norm(h.symptom).includes(q)).slice(0, 8)
    : []
  const noResults = searching && machineHits.length === 0 && simHits.length === 0 && symptomHits.length === 0

  // Accesos rápidos (solo cuando no se busca)
  const favMachines = favorites.map(slug => allMachines.find(m => m.slug === slug)).filter((m): m is LearningMachine => !!m)
  const recentMachines = recents
    .map(slug => allMachines.find(m => m.slug === slug))
    .filter((m): m is LearningMachine => !!m && !favorites.includes(m.slug))

  const goMachine = (m: LearningMachine) => {
    pushRecent(m.slug)
    navigate(m.customRoute || `/aprendizaje/maquina/${m.slug}`)
  }
  const handleToggleFav = (slug: string) => setFavorites(toggleFavorite(slug))

  const heightClass = isAuthenticated ? 'min-h-full' : 'min-h-dvh'

  const machineRow = (machine: LearningMachine) => (
    <MachineRow
      key={machine.slug}
      machine={machine}
      meta={metaMap[machine.slug]}
      isFav={favorites.includes(machine.slug)}
      onToggleFav={() => handleToggleFav(machine.slug)}
      onClick={() => goMachine(machine)}
    />
  )

  // Resultados de búsqueda: los mismos en celular y en PC.
  const resultadosBusqueda = (
    noResults ? (
      <ListGroup title={`Resultados para "${query.trim()}"`}>
        <p className="px-4 py-6 text-body text-muted-foreground">
          Sin resultados. Prueba con el nombre de la máquina o un síntoma más general.
        </p>
      </ListGroup>
    ) : (
      <>
        {simHits.length > 0 && (
          <ListGroup title="Simuladores">
            {simHits.map(mod => <SimRow key={mod.id} mod={mod} onClick={() => navigate(mod.href)} />)}
          </ListGroup>
        )}
        {machineHits.length > 0 && (
          <ListGroup title="Máquinas">{machineHits.map(machineRow)}</ListGroup>
        )}
        {symptomHits.length > 0 && (
          <ListGroup title="Síntomas de diagnóstico">
            {symptomHits.map(hit => {
              const m = allMachines.find(x => x.slug === hit.machineSlug)
              return (
                <ListCell
                  key={`${hit.machineSlug}-${hit.diagnosisId}`}
                  className="bg-card"
                  leading={<span className="flex size-10 items-center justify-center rounded-ctl bg-muted text-muted-foreground"><Stethoscope className="size-5" /></span>}
                  title={<span className="font-normal">{hit.title || hit.symptom}</span>}
                  subtitle={[hit.title && hit.symptom ? hit.symptom : null, m?.name].filter(Boolean).join(' · ')}
                  onClick={() => navigate(`/aprendizaje/maquina/${hit.machineSlug}`)}
                />
              )
            })}
          </ListGroup>
        )}
      </>
    )
  )


  if (pc) {
    const sinCursos = Object.entries(machinesByArea)
      .filter(([, ms]) => ms.some(m => !isCourseMachine(m)))
      .map(([area, ms]) => ({ nombre: formatNombreSAP(area).nombre || area, maquinas: ms.filter(m => !isCourseMachine(m)) }))
    const planta = sinCursos.flatMap(a => a.maquinas)
    const suma = (k: 'procedures' | 'flows' | 'diagnosis') => planta.reduce((s, m) => s + (metaMap[m.slug]?.[k] ?? 0), 0)
    const conMaterial = planta.filter(m => {
      const x = metaMap[m.slug]
      return !!x && x.manual + x.procedures + x.flows + x.diagnosis > 0
    }).length
    const cargado = Object.keys(metaMap).length > 0
    return (
      <div className={cn(heightClass, 'w-full bg-background')}>
        <div className="flex w-full flex-col gap-[18px] px-8 pb-10 pt-6">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-1">
              <span className="text-[13px] text-muted-foreground tabular-nums">
                Centro de aprendizaje · {itemsWithContent} de {totalCatalog} con material
              </span>
              <h1 className="text-[22px] font-semibold leading-tight text-foreground [text-wrap:balance]">
                {cargado
                  ? `${suma('diagnosis')} casos de diagnóstico, ${suma('procedures')} procedimientos y ${suma('flows')} flujos en ${conMaterial} máquinas`
                  : 'Centro de aprendizaje'}
              </h1>
            </div>
            <div className="flex flex-[0_1_460px] items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Máquina, simulador o síntoma"
                  aria-label="Buscar en el Centro de aprendizaje"
                  className="min-h-[36px] w-full rounded-ctl border border-foreground/20 bg-transparent pl-9 pr-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              {isAdmin && <CompartirPaseLectura />}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => navigate('/aprendizaje/admin')}
                  className="inline-flex min-h-[36px] shrink-0 items-center gap-2 rounded-ctl border border-foreground/20 px-3.5 text-[15px] text-foreground hover:border-foreground/40"
                >
                  <Lock className="size-4 text-muted-foreground" />Administrar
                </button>
              )}
            </div>
          </header>
          {searching ? (
            <div className="flex max-w-3xl flex-col gap-4">{resultadosBusqueda}</div>
          ) : (
            <HubAprendizajePC
              areas={sinCursos}
              cursos={allMachines.filter(isCourseMachine)}
              metaMap={metaMap}
              simuladores={visibleSims.map(s => ({
                id: s.id,
                titulo: s.title,
                detalle: `${s.subtitle} · ${s.stats}`,
                enDesarrollo: s.inDevelopment,
                onAbrir: () => navigate(s.href),
              }))}
              recientes={[...favMachines, ...recentMachines]}
              onMaquina={goMachine}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={cn(heightClass, 'w-full bg-background')}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-28 pt-4 sm:px-6 sm:pt-6">
        {/* ── Título grande + línea secundaria con las métricas ── */}
        <header>
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-display font-bold tracking-tight text-foreground">Aprendizaje</h1>
            <div className="flex shrink-0 items-center gap-2">
            {/* Link + QR del pase de lectura para los nuevos (Aprendizaje, Repuestos, monitores) */}
            {isAdmin && <CompartirPaseLectura />}
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Más acciones"
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground hover:bg-muted-foreground/[0.15] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <MoreHorizontal className="size-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[13rem]">
                  <DropdownMenuItem className="gap-2 py-2" onClick={() => navigate('/aprendizaje/admin')}>
                    <Lock className="size-4 text-muted-foreground" />Administrar contenido
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            </div>
          </div>
          <p className="text-footnote text-muted-foreground tabular-nums">
            {totalCatalog} equipos y simuladores · {itemsWithContent} con material publicado
          </p>
        </header>

        {/* ── Buscador capsular ── */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Máquina, simulador o síntoma"
            aria-label="Buscar en el Centro de aprendizaje"
            className="h-11 w-full rounded-full bg-muted pl-10 pr-9 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted-foreground/[0.12]"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {searching ? (
          resultadosBusqueda
        ) : (
          <>
            {/* ── Favoritos y recientes: una sola fila de chips ── */}
            {(favMachines.length > 0 || recentMachines.length > 0) && (
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
                {favMachines.map(m => (
                  <QuickChip key={`fav-${m.slug}`} machine={m} kind="fav" onClick={() => goMachine(m)} />
                ))}
                {recentMachines.map(m => (
                  <QuickChip key={`rec-${m.slug}`} machine={m} kind="recent" onClick={() => goMachine(m)} />
                ))}
              </div>
            )}

            {/* ── Simuladores ── */}
            <ListGroup title="Simuladores">
              {visibleSims.map(mod => <SimRow key={mod.id} mod={mod} onClick={() => navigate(mod.href)} />)}
            </ListGroup>

            {/* ── Máquinas — orden de proceso físico; con material primero ── */}
            {Object.entries(machinesByArea).map(([area, machines]) => {
              const documented = machines.filter(m => hasAnyContent(m, metaMap[m.slug]))
              const pending = machines.filter(m => !hasAnyContent(m, metaMap[m.slug]))
              return (
                <ListGroup key={area} title={formatNombreSAP(area).nombre || area}>
                  {documented.map(machineRow)}
                  {pending.map(machineRow)}
                </ListGroup>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

// ── Chip de acceso rápido (favorito / reciente) ──────────────────────────────
function QuickChip({ machine, kind, onClick }: { machine: LearningMachine; kind: 'fav' | 'recent'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-muted px-4 text-subhead font-medium text-foreground transition-colors hover:bg-muted-foreground/[0.15] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {kind === 'fav'
        ? <Star className="size-3.5 fill-current text-ink-warn" aria-label="Favorito" />
        : <Clock className="size-3.5 text-muted-foreground" aria-label="Reciente" />}
      {machine.name}
    </button>
  )
}

// ── Fila de simulador ────────────────────────────────────────────────────────
function SimRow({ mod, onClick }: { mod: SpecialModule; onClick: () => void }) {
  const Icon = mod.icon
  return (
    <ListCell
      className="bg-card"
      leading={<span className="flex size-10 items-center justify-center rounded-ctl bg-primary/[0.12] text-brand-ink"><Icon className="size-5" /></span>}
      title={
        <span className="font-normal">
          {mod.inDevelopment && <Tag tone="neutral" className="mr-1.5 align-[2px]">En desarrollo</Tag>}
          {mod.title}
        </span>
      }
      subtitle={`${mod.subtitle} · ${mod.stats}`}
      onClick={onClick}
    />
  )
}

// ── Fila de máquina ──────────────────────────────────────────────────────────
function MachineRow({
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
  const course = isCourseMachine(machine)
  const isNew = ready && meta?.lastUpdatedAt != null && (Date.now() - meta.lastUpdatedAt) < NEW_WINDOW_MS

  // Una sola línea de contenido: "7 manual · 9+ procedimientos · 5 flujos · 9+ diagnósticos"
  const countLine = course
    ? [
        machine.modulo != null
          ? `Módulo ${machine.modulo}${machine.nivel != null ? ` · Nivel ${machine.nivel}` : ''}`
          : (machine.programa ?? 'Curso'),
        'lecciones, práctica y examen',
      ].join(' · ')
    : SECTION_META
        .filter(s => meta ? (meta[s.key] > 0 || machine.sections[s.key]) : machine.sections[s.key])
        .map(s => {
          const n = meta?.[s.key] ?? 0
          return `${n > 0 ? (n > 9 ? '9+ ' : `${n} `) : ''}${s.label}`
        })
        .join(' · ')

  // Estado de evaluación local: lo único que "progresa" en material de consulta.
  const quizBest = getQuizBest(machine.slug)
  const quizPassed = quizBest != null && quizBest >= QUIZ_PASS_PCT

  return (
    <SwipeRow leading={{ label: isFav ? 'Quitar' : 'Favorito', icon: <Star className={cn('size-5', isFav && 'fill-current')} />, onClick: onToggleFav }}>
      <ListCell
        className="bg-card"
        leading={
          // El color de identidad de la máquina vive solo aquí.
          <span className="flex size-10 items-center justify-center rounded-ctl bg-muted" style={{ color: machine.color }}>
            <Icon className="size-5" />
          </span>
        }
        title={
          <span className="font-normal">
            {!ready && <Tag tone="neutral" className="mr-1.5 align-[2px]">En preparación</Tag>}
            {isNew && <Tag tone="neutral" className="mr-1.5 align-[2px]">Nuevo</Tag>}
            {isFav && <Star className="mr-1 inline size-3.5 fill-current align-[-1px] text-ink-warn" aria-label="Favorito" />}
            {machine.name}
          </span>
        }
        subtitle={ready ? countLine : 'Sin material todavía'}
        trailing={
          quizBest != null
            ? <span className={cn('text-footnote font-medium tabular-nums', quizPassed ? 'text-ink-ok' : 'text-muted-foreground')}>
                {quizPassed ? `✓ ${quizBest} %` : `${quizBest} %`}
              </span>
            : undefined
        }
        onClick={onClick}
      />
    </SwipeRow>
  )
}
