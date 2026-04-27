/**
 * ShiftConfigPanel — vista compacta de config de gates en la página de turno.
 * Posición B: justo después del grid HeroScorecard/P0Causes, antes del Timeline.
 *
 * Muestra: especie del turno, distribución de calidades, grilla de 12 gates.
 * Permite: modal rápido de cambio de gate + override manual de especie.
 */
import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { SlidersHorizontal, ChevronDown, ChevronUp, Pencil, Fish, X, GitBranch, Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import { qualityColorTextClass } from '@/services/grader/graderQualityColors'
import { fmtTime } from '@/services/grader/graderTimeFormat'
import { GateChangeModal } from './modals/GateChangeModal'
import { BeltRpmModal } from './modals/BeltRpmModal'
import { updateShiftSpecies } from '@/services/grader/graderShifts.service'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import type { GraderDailySummary } from '@/services/grader/types'
import type { GraderShiftDoc } from '@/services/grader/graderShifts.service'

type Species = 'coho' | 'salar'

const SPECIES_LABEL: Record<Species, string> = { coho: 'Coho', salar: 'Salar' }
const SPECIES_CSS: Record<Species, string> = {
  coho: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  salar: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
}

function inferSpecies(breakdown?: Record<string, number>): Species | null {
  if (!breakdown) return null
  const top = Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0]
  if (!top) return null
  const k = top[0].toLowerCase()
  if (k.includes('salar') || k.includes('atlántico') || k.includes('atlantico')) return 'salar'
  if (k.includes('coho') || k.includes('plateado') || k.includes('pacífico') || k.includes('pacifico')) return 'coho'
  return null
}

interface ShiftConfigPanelProps {
  shiftDocId: string
  shiftDoc: GraderShiftDoc | null
  configSnapshots: GateConfigSnapshot[]
  onSaved: () => void
  allowEdit?: boolean
  summary?: GraderDailySummary | null
}

export function ShiftConfigPanel({
  shiftDocId,
  shiftDoc,
  configSnapshots,
  onSaved,
  allowEdit = false,
  summary,
}: ShiftConfigPanelProps) {
  const [open, setOpen] = useState(false)
  const [gateModalOpen, setGateModalOpen] = useState(false)
  const [rpmModalOpen, setRpmModalOpen] = useState(false)
  const [editingSpecies, setEditingSpecies] = useState(false)
  const [localSpecies, setLocalSpecies] = useState<Species | null>(shiftDoc?.species ?? null)
  const [savingSpecies, setSavingSpecies] = useState(false)

  const speciesFromExcel = useMemo(() => inferSpecies(summary?.productoBreakdown), [summary])
  const displaySpecies: Species | null = localSpecies ?? speciesFromExcel ?? null
  const isExcelInferred = !localSpecies && !!speciesFromExcel

  const latest = useMemo(() => {
    if (!configSnapshots || configSnapshots.length === 0) return null
    return configSnapshots[configSnapshots.length - 1]!
  }, [configSnapshots])

  const gates = useMemo(() => {
    if (!latest) return []
    return [...latest.gates].sort((a, b) => a.gateNumber - b.gateNumber)
  }, [latest])

  const activeCount = gates.filter(g => g.active).length
  const configChangesCount = configSnapshots.length - 1

  const qualityCount = useMemo(() =>
    gates.filter(g => g.active).reduce<Record<string, number>>((acc, g) => {
      const q = g.assignedQuality ?? '?'
      acc[q] = (acc[q] ?? 0) + 1
      return acc
    }, {}),
  [gates])

  const snapshotAt = latest ? fmtTime(latest.at) : null
  const isSynthetic = latest?.synthetic

  const handleSpeciesSave = useCallback(async (species: Species | null) => {
    setSavingSpecies(true)
    try {
      await updateShiftSpecies(shiftDocId, species)
      setLocalSpecies(species)
      setEditingSpecies(false)
    } finally {
      setSavingSpecies(false)
    }
  }, [shiftDocId])

  const handleGatesSaved = useCallback(() => {
    setGateModalOpen(false)
    onSaved()
  }, [onSaved])

  if (!latest) return null

  return (
    <Card>
      <CardHeader className="pb-0 pt-3">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <SlidersHorizontal className="w-4 h-4 text-muted-foreground shrink-0" />
          Config de gates

          {/* Especie del turno */}
          {displaySpecies ? (
            <span className={cn('flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-normal', SPECIES_CSS[displaySpecies])}>
              <Fish className="w-2.5 h-2.5" />
              {SPECIES_LABEL[displaySpecies]}
              {isExcelInferred && <span className="opacity-50 ml-0.5">· Excel</span>}
            </span>
          ) : (
            allowEdit && <span className="text-[10px] text-muted-foreground/40">especie?</span>
          )}

          {allowEdit && (
            <button
              onClick={() => setEditingSpecies(v => !v)}
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              title="Cambiar especie del turno"
            >
              {editingSpecies ? <X className="w-3 h-3" /> : <Pencil className="w-2.5 h-2.5" />}
            </button>
          )}

          {/* Activas */}
          <span className="text-[11px] font-normal text-muted-foreground">
            {activeCount} de 12 activas
          </span>

          {/* Distribución calidades */}
          {Object.keys(qualityCount).length > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-normal text-muted-foreground/70">
              {Object.entries(qualityCount).sort().flatMap(([q, n], i) => [
                ...(i > 0 ? [<span key={`sep-${i}`} className="text-muted-foreground/30 mx-0.5">·</span>] : []),
                <span key={q} className={qualityColorTextClass(q)}>{n}×{q}</span>,
              ])}
            </span>
          )}

          {/* Cambios mid-turno */}
          {configChangesCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {configChangesCount} cambio{configChangesCount > 1 ? 's' : ''} mid-turno
            </span>
          )}

          {isSynthetic && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground border border-border/40 cursor-help"
              title="Inferida desde la última asignación efectiva — no se subió un snapshot manual al inicio del turno."
            >
              inferida
            </span>
          )}

          {/* Botones rápidos (solo turno live) */}
          {allowEdit && (
            <>
              <button
                onClick={() => setGateModalOpen(true)}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
              >
                <GitBranch className="w-2.5 h-2.5" />
                Cambié gate
              </button>
              <button
                onClick={() => setRpmModalOpen(true)}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-muted-foreground/20 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Gauge className="w-2.5 h-2.5" />
                Ajusté RPM
              </button>
            </>
          )}

          {/* Expand toggle */}
          <button
            onClick={() => setOpen(v => !v)}
            className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {snapshotAt && <span>desde {snapshotAt}</span>}
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </CardTitle>
      </CardHeader>

      {/* Selector de especie inline */}
      {editingSpecies && allowEdit && (
        <div className="px-4 pt-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Especie del turno:</span>
          {(['coho', 'salar'] as Species[]).map(s => (
            <button
              key={s}
              disabled={savingSpecies}
              onClick={() => void handleSpeciesSave(s)}
              className={cn(
                'text-xs px-2.5 py-0.5 rounded border transition-colors disabled:opacity-50',
                displaySpecies === s && !isExcelInferred
                  ? cn(SPECIES_CSS[s], 'font-medium')
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {SPECIES_LABEL[s]}
            </button>
          ))}
          {localSpecies && (
            <button
              disabled={savingSpecies}
              onClick={() => void handleSpeciesSave(null)}
              className="text-[10px] text-muted-foreground/50 hover:text-destructive transition-colors px-1"
              title="Quitar override — vuelve a leer del Excel"
            >
              Quitar override
            </button>
          )}
        </div>
      )}

      {/* Grilla de gates (expandible) */}
      {open && (
        <CardContent className="pt-2 pb-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5">
            {gates.map(g => (
              <div
                key={g.gateNumber}
                className={cn(
                  'flex items-center gap-2 py-1 text-xs border-b border-border/20 last:border-0',
                  !g.active && 'opacity-40',
                )}
              >
                <span className={cn('w-7 shrink-0 font-semibold tabular-nums', g.active ? 'text-foreground' : 'text-muted-foreground')}>
                  G{g.gateNumber}
                </span>
                <span className="text-muted-foreground truncate flex-1" title={g.active ? g.assignedCalibre : undefined}>
                  {g.active ? g.assignedCalibre : '—'}
                </span>
                {g.active && (
                  <span className={cn('shrink-0 font-medium', qualityColorTextClass(g.assignedQuality))}>
                    {g.assignedQuality}
                  </span>
                )}
                {!g.active && (
                  <span className="shrink-0 text-[10px] text-muted-foreground/50">inactiva</span>
                )}
              </div>
            ))}
          </div>

          {latest.changedBy?.name && (
            <p className="mt-2 text-[10px] text-muted-foreground/50">
              Último cambio por {latest.changedBy.name} · {snapshotAt}
              {latest.reason && ` · "${latest.reason}"`}
            </p>
          )}
        </CardContent>
      )}

      {/* Modal rápido de cambio de gate */}
      <GateChangeModal
        open={gateModalOpen}
        onOpenChange={setGateModalOpen}
        shiftDocId={shiftDocId}
        configSnapshots={configSnapshots}
        onSaved={handleGatesSaved}
      />

      {/* Modal velocidades Danfoss */}
      <BeltRpmModal
        open={rpmModalOpen}
        onOpenChange={setRpmModalOpen}
        shiftDocId={shiftDocId}
        shiftDoc={shiftDoc}
      />
    </Card>
  )
}
