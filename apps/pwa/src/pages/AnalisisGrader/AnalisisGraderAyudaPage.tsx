/**
 * Página de Ayuda y Runbooks del Grader.
 * Catálogo completo de procedimientos Z2 con buscador y filtros.
 * Ruta: /analisis-grader/ayuda
 */

import { useState, useMemo } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Card, CardContent, Button } from '@/components/ui'
import { ArrowLeft, Search, Download, BookOpen } from 'lucide-react'
import { usePermissionsStore } from '@/store'
import { RUNBOOKS, filterRunbooks } from '@/services/grader/graderRunbooks'
import { GRADER_GLOSSARY } from '@/services/grader/graderGlossary'
import { RunbookCard } from '@/components/grader/RunbookCard'
import type { RunbookCategory } from '@/services/grader/graderRunbooks'

const CATEGORIES: Array<{ value: RunbookCategory | 'all'; label: string }> = [
  { value: 'all',              label: 'Todas' },
  { value: 'contrastacion',   label: 'Contrastación' },
  { value: 'calibracion',     label: 'Calibración' },
  { value: 'mantencion',      label: 'Mantención' },
  { value: 'limpieza',        label: 'Limpieza' },
  { value: 'troubleshooting', label: 'Troubleshooting' },
]

export function AnalisisGraderAyudaPage() {
  const { canSee } = usePermissionsStore()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [filterCat, setFilterCat] = useState<RunbookCategory | 'all'>('all')
  const [showGlossary, setShowGlossary] = useState(false)

  const filtered = useMemo(
    () => filterRunbooks(RUNBOOKS, query, filterCat),
    [query, filterCat],
  )

  if (!canSee('analisisGrader')) return <Navigate to="/" replace />

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader')} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" />
          Análisis Grader
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Ayuda y procedimientos</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Runbooks oficiales Z2 · Manual Marelec MS4/12 · SOP CH-MT-ME-0002
        </p>
      </div>

      {/* Búsqueda + filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar procedimiento, paso o término…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => setFilterCat(cat.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filterCat === cat.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Runbooks */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Runbooks ({filtered.length})
        </h2>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No se encontraron runbooks para "{query}".
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map(rb => (
              <RunbookCard key={rb.id} runbook={rb} />
            ))}
          </div>
        )}
      </section>

      {/* Glosario */}
      <section>
        <button
          className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 hover:text-foreground transition-colors"
          onClick={() => setShowGlossary(g => !g)}
        >
          <BookOpen className="w-4 h-4" />
          Glosario Marelec Z2
          <span className="text-xs font-normal normal-case tracking-normal ml-1">
            ({Object.keys(GRADER_GLOSSARY).length} términos)
          </span>
          <span className="ml-1">{showGlossary ? '▲' : '▼'}</span>
        </button>

        {showGlossary && (
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(GRADER_GLOSSARY).map(([key, entry]) => (
                  <div key={key} className="border rounded-md p-2.5">
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

      {/* Documentos oficiales */}
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
