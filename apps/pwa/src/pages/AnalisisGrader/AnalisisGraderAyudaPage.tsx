/**
 * Página de Ayuda y Runbooks del Grader.
 * Catálogo completo de procedimientos Z2 con buscador y filtros.
 * Ruta: /analisis-grader/ayuda
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Card, CardContent, Button } from '@/components/ui'
import { ArrowLeft, Search, Download, BookOpen, X, ChevronsDown, ChevronsUp, Wrench, Gauge, Sparkles, Sprout, AlertTriangle } from 'lucide-react'
import { usePermissionsStore } from '@/store'
import { RUNBOOKS, filterRunbooks } from '@/services/grader/graderRunbooks'
import { GRADER_GLOSSARY } from '@/services/grader/graderGlossary'
import { RunbookCard } from '@/components/grader/RunbookCard'
import type { RunbookCategory } from '@/services/grader/graderRunbooks'
import type { LucideProps } from 'lucide-react'

type IconComp = (props: Pick<LucideProps, 'className'>) => JSX.Element

const CATEGORIES: Array<{ value: RunbookCategory | 'all'; label: string; Icon: IconComp }> = [
  { value: 'all',             label: 'Todas',          Icon: ({ className }) => <BookOpen className={className} /> },
  { value: 'contrastacion',   label: 'Contrastación',  Icon: ({ className }) => <Gauge className={className} /> },
  { value: 'calibracion',     label: 'Calibración',    Icon: ({ className }) => <Sparkles className={className} /> },
  { value: 'mantencion',      label: 'Mantención',     Icon: ({ className }) => <Wrench className={className} /> },
  { value: 'limpieza',        label: 'Limpieza',       Icon: ({ className }) => <Sprout className={className} /> },
  { value: 'troubleshooting', label: 'Troubleshooting',Icon: ({ className }) => <AlertTriangle className={className} /> },
]

export function AnalisisGraderAyudaPage() {
  const { canSee } = usePermissionsStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [filterCat, setFilterCat] = useState<RunbookCategory | 'all'>('all')
  const [showGlossary, setShowGlossary] = useState(true) // abierto por default (contenido útil)
  const [expandedRunbooks, setExpandedRunbooks] = useState<Set<string>>(new Set())
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Autofocus al buscador en desktop (no mobile para evitar abrir teclado virtual)
  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      searchInputRef.current?.focus()
    }
  }, [])

  const filtered = useMemo(
    () => filterRunbooks(RUNBOOKS, query, filterCat),
    [query, filterCat],
  )

  // Conteo por categoría (independiente del query, refleja catálogo total)
  const countsByCat = useMemo(() => {
    const all = Object.values(RUNBOOKS)
    const map: Partial<Record<RunbookCategory | 'all', number>> = { all: all.length }
    for (const rb of all) {
      map[rb.category] = (map[rb.category] ?? 0) + 1
    }
    return map
  }, [])

  const allExpanded = filtered.length > 0 && filtered.every(rb => expandedRunbooks.has(rb.id))
  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedRunbooks(new Set())
    } else {
      setExpandedRunbooks(new Set(filtered.map(rb => rb.id)))
    }
  }

  const setRunbookExpanded = (id: string, expanded: boolean) => {
    setExpandedRunbooks(prev => {
      const next = new Set(prev)
      if (expanded) next.add(id)
      else next.delete(id)
      return next
    })
  }

  if (!canSee('analisisGrader')) return <Navigate to="/" replace />

  return (
    <div className="container mx-auto p-3 sm:p-4 space-y-5 max-w-screen-xl">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader')} className="gap-1.5 shrink-0">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Análisis de Turno</span>
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Ayuda y procedimientos
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
              {Object.keys(RUNBOOKS).length} runbooks Z2 · Manual Marelec MS4/12 · SOP CH-MT-ME-0002
            </p>
          </div>
        </div>
      </div>

      {/* ── Búsqueda + filtros por categoría ────────────────────────── */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Buscar procedimiento, paso o término…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-shadow"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-md transition-colors"
              title="Limpiar búsqueda"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Chips de categoría con icon + contador */}
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(cat => {
            const count = countsByCat[cat.value] ?? 0
            const active = filterCat === cat.value
            return (
              <button
                key={cat.value}
                onClick={() => setFilterCat(cat.value)}
                disabled={count === 0}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted border border-transparent hover:border-muted-foreground/20'
                }`}
              >
                <cat.Icon className="w-3.5 h-3.5" />
                {cat.label}
                <span className={`tabular-nums text-[10px] font-normal ${active ? 'text-primary-foreground/80' : 'text-muted-foreground/70'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Runbooks ────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-3 gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Runbooks ({filtered.length}{query && ` de ${Object.keys(RUNBOOKS).length}`})
          </h2>
          {filtered.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleExpandAll}
              className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              {allExpanded
                ? <><ChevronsUp className="w-3.5 h-3.5" />Contraer todos</>
                : <><ChevronsDown className="w-3.5 h-3.5" />Expandir todos</>}
            </Button>
          )}
        </div>
        {filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 flex flex-col items-center gap-2 text-center">
              <Search className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {query
                  ? <>No se encontraron runbooks para <strong>"{query}"</strong></>
                  : 'No hay runbooks en esta categoría.'}
              </p>
              {(query || filterCat !== 'all') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setQuery(''); setFilterCat('all') }}
                  className="mt-1"
                >
                  Limpiar filtros
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(rb => (
              <RunbookCard
                key={rb.id}
                runbook={rb}
                expanded={expandedRunbooks.has(rb.id)}
                onExpandedChange={(e) => setRunbookExpanded(rb.id, e)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Glosario ────────────────────────────────────────────────── */}
      <section>
        <button
          className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 hover:text-foreground transition-colors"
          onClick={() => setShowGlossary(g => !g)}
          aria-expanded={showGlossary}
        >
          <BookOpen className="w-4 h-4" />
          Glosario Marelec Z2
          <span className="text-xs font-normal normal-case tracking-normal ml-1 text-muted-foreground/70">
            ({Object.keys(GRADER_GLOSSARY).length} términos)
          </span>
          <span className="ml-1 text-xs">{showGlossary ? '▲' : '▼'}</span>
        </button>

        {showGlossary && (
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(GRADER_GLOSSARY).map(([key, entry]) => (
                  <div key={key} className="border rounded-md p-2.5 hover:bg-muted/30 transition-colors">
                    <div className="font-medium text-sm">{entry.label}</div>
                    {entry.alts && (
                      <div className="text-xs text-muted-foreground/70 italic mb-0.5">
                        También: {entry.alts.join(', ')}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      {entry.description}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ── Documentos oficiales ────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Documentos oficiales
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Manual Marelec MS4/12', desc: 'Manual completo del clasificador', file: '/docs/grader/manual-marelec-ms4-12.pdf' },
            { label: 'SOP Contrastación',     desc: 'CH-MT-ME-0002 — Paso a Paso Calibración Grader', file: '/docs/grader/sop-contrastacion.pdf' },
            { label: 'SOP Balanzas',          desc: 'Procedimiento de balanzas y tara', file: '/docs/grader/sop-balanzas.pdf' },
          ].map(doc => (
            <a
              key={doc.file}
              href={doc.file}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Card className="hover:bg-muted/40 transition-colors h-full">
                <CardContent className="p-4 flex items-start gap-3">
                  <Download className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-sm">{doc.label}</div>
                    <div className="text-xs text-muted-foreground">{doc.desc}</div>
                  </div>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}
