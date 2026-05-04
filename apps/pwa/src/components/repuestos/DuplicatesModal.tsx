/**
 * DuplicatesModal v2.48.93
 *
 * Modal completo para gestionar repuestos duplicados:
 *  1. Escanea todas las máquinas activas
 *  2. Agrupa duplicados por código SAP
 *  3. Permite seleccionar el "ganador" de cada grupo
 *  4. Fusiona cantidades, fotos, vínculos, galería
 *  5. Elimina los duplicados sobrantes
 *
 * Solo visible para admins.
 */

import { useState, useEffect } from 'react'
import {
  Search, Loader2, AlertTriangle, CheckCircle2, Package,
  Merge, ChevronDown, ChevronUp, Copy as CopyIcon, BookOpen,
} from 'lucide-react'
import type { Machine } from '@/types/repuestos'
import { normalizeForSearch } from '@/utils/repuestos'
import { useDuplicateScanner, type DuplicateGroup, type DuplicateEntry } from '@/hooks/repuestos/useDuplicateScanner'
import { mergeRepuestos } from '@/services/mergeRepuestos'
import { ManualSearchModal } from '@/components/repuestos/ManualSearchModal'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Badge,
} from '@/components/ui'
import { logger } from '@/lib/logger'

interface DuplicatesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  machines: Machine[]
  onDone?: () => void
}

function EntryCard({
  entry,
  isWinner,
  onSelect,
  onSearchManual,
  hasManuals,
}: {
  entry: DuplicateEntry
  isWinner: boolean
  onSelect: () => void
  onSearchManual?: () => void
  hasManuals: boolean
}) {
  return (
    <div
      className={`w-full text-left px-3 py-2 rounded-lg border transition-all text-xs ${
        isWinner
          ? 'bg-green-500/15 border-green-500/40 ring-1 ring-green-500/30'
          : 'bg-muted/20 border-border hover:bg-muted/40'
      }`}
    >
      <button onClick={onSelect} className="w-full text-left">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: entry.machineColor }}
          />
          <span className="font-medium text-foreground truncate" title={entry.machineName}>
            {entry.machineName}
          </span>
          {isWinner && (
            <Badge variant="outline" className="ml-auto text-[9px] border-green-500/40 text-green-400 px-1.5 py-0">
              Conservar
            </Badge>
          )}
        </div>
        <div className="mt-1 pl-4.5 space-y-0.5">
          <div className="text-foreground/80 truncate" title={entry.repuesto.textoBreve || entry.repuesto.descripcion || 'Sin nombre'}>{entry.repuesto.textoBreve || entry.repuesto.descripcion || 'Sin nombre'}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            <span>Cant: <span className="font-bold text-foreground">{entry.repuesto.cantidadPorMaquina || 0}</span></span>
            <span>Valor: ${(entry.repuesto.valorUnitario || 0).toLocaleString('es-CL')}</span>
            {entry.repuesto.codigoFabricante && <span>Fab: {entry.repuesto.codigoFabricante}</span>}
            {entry.repuesto.ubicacionEnPlanta && <span>Ubic: {entry.repuesto.ubicacionEnPlanta}</span>}
            {(entry.repuesto.fotosReales?.length || 0) > 0 && <span>📷 {entry.repuesto.fotosReales?.length}</span>}
            {(entry.repuesto.vinculosManual?.length || 0) > 0 && <span>📎 {entry.repuesto.vinculosManual?.length}</span>}
          </div>
        </div>
      </button>
      {/* Buscar en manual */}
      {hasManuals && entry.repuesto.codigoFabricante && (
        <div className="mt-1.5 pl-4.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSearchManual?.() }}
            className="inline-flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors bg-purple-500/10 hover:bg-purple-500/20 px-2 py-0.5 rounded-md"
          >
            <BookOpen className="h-3 w-3" />
            Buscar "{entry.repuesto.codigoFabricante}" en manual de {entry.machineName}
          </button>
        </div>
      )}
    </div>
  )
}

function GroupCard({
  group,
  winnerId,
  winnerMachineId,
  onSelectWinner,
  onMerge,
  merging,
  merged,
  onSearchManual,
  machines,
}: {
  group: DuplicateGroup
  winnerId: string | null
  winnerMachineId: string | null
  onSelectWinner: (repuestoId: string, machineId: string) => void
  onMerge: () => void
  merging: boolean
  merged: boolean
  onSearchManual: (entry: DuplicateEntry) => void
  machines: Machine[]
}) {
  const [expanded, setExpanded] = useState(false)

  const totalCantidad = group.entries.reduce((s, e) => s + (e.repuesto.cantidadPorMaquina || 0), 0)
  const totalFotos = group.entries.reduce((s, e) => s + (e.repuesto.fotosReales?.length || 0) + (e.repuesto.imagenesManual?.length || 0), 0)
  const bestName = group.entries.find(e => e.repuesto.textoBreve || e.repuesto.descripcion)
    ?.repuesto.textoBreve || group.entries[0]?.repuesto.descripcion || 'Sin nombre'

  if (merged) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
        <div className="min-w-0">
          <div className="text-xs font-medium text-green-400">Fusionado: {group.codigoSAP}</div>
          <div className="text-[10px] text-muted-foreground truncate" title={bestName}>{bestName}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/20 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-foreground">{group.codigoSAP}</span>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
              {group.entries.length}×
            </Badge>
            {group.sameMachine && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/40 text-amber-400">
                Misma máq.
              </Badge>
            )}
            {group.crossMachine && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-blue-500/40 text-blue-400">
                Cross-máq.
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground truncate mt-0.5" title={bestName}>{bestName}</div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground shrink-0">
          <span>Σ {totalCantidad}</span>
          {totalFotos > 0 && <span>📷 {totalFotos}</span>}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          <div className="text-[10px] text-muted-foreground mb-2">
            Selecciona cuál conservar (los demás se fusionarán y eliminarán):
          </div>

          <div className="space-y-1.5">
            {group.entries.map((entry) => {
              const machine = machines.find(m => m.id === entry.machineId)
              const hasManuals = (machine?.manuals?.length || 0) > 0
              return (
                <EntryCard
                  key={`${entry.machineId}-${entry.repuesto.id}`}
                  entry={entry}
                  isWinner={winnerId === entry.repuesto.id && winnerMachineId === entry.machineId}
                  onSelect={() => onSelectWinner(entry.repuesto.id, entry.machineId)}
                  onSearchManual={() => onSearchManual(entry)}
                  hasManuals={hasManuals}
                />
              )
            })}
          </div>

          {/* Merge preview */}
          {winnerId && (
            <div className="mt-3 bg-muted/30 rounded-lg p-2.5 border border-border space-y-1">
              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Resultado de fusión:</div>
              <div className="text-xs text-foreground">
                Cantidad combinada: <span className="font-bold text-green-400">{totalCantidad}</span>
              </div>
              <div className="text-xs text-foreground">
                Se eliminan: <span className="font-bold text-red-400">{group.entries.length - 1}</span> duplicado(s)
              </div>
              {totalFotos > 0 && (
                <div className="text-xs text-foreground">
                  Fotos combinadas: <span className="font-bold">{totalFotos}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Button
              size="sm"
              onClick={onMerge}
              disabled={!winnerId || merging}
              className="gap-1.5 text-xs h-7"
            >
              {merging ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> Fusionando…</>
              ) : (
                <><Merge className="h-3 w-3" /> Fusionar grupo</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function DuplicatesModal({
  open,
  onOpenChange,
  machines,
  onDone,
}: DuplicatesModalProps) {
  const { scan, scanning, groups, totalScanned, error, setGroups } = useDuplicateScanner()
  const [searchFilter, setSearchFilter] = useState('')
  const [winners, setWinners] = useState<Map<string, { repuestoId: string; machineId: string }>>(new Map())
  const [mergingGroup, setMergingGroup] = useState<string | null>(null)
  const [mergedGroups, setMergedGroups] = useState<Set<string>>(new Set())
  const [mergeAllProgress, setMergeAllProgress] = useState<number | null>(null)
  const [manualSearchEntry, setManualSearchEntry] = useState<DuplicateEntry | null>(null)

  // Auto-scan on open
  useEffect(() => {
    if (open && machines.length > 0) {
      scan(machines)
      setWinners(new Map())
      setMergedGroups(new Set())
      setMergeAllProgress(null)
      setSearchFilter('')
    }
  }, [open, machines, scan])

  const filteredGroups = searchFilter.trim()
    ? groups.filter(g => {
        const q = normalizeForSearch(searchFilter)
        return (
          normalizeForSearch(g.codigoSAP).includes(q) ||
          g.entries.some(e =>
            normalizeForSearch(e.repuesto.textoBreve).includes(q) ||
            normalizeForSearch(e.machineName).includes(q)
          )
        )
      })
    : groups

  const pendingGroups = filteredGroups.filter(g => !mergedGroups.has(g.codigoSAP))

  const handleSelectWinner = (sap: string, repuestoId: string, machineId: string) => {
    setWinners(prev => {
      const next = new Map(prev)
      next.set(sap, { repuestoId, machineId })
      return next
    })
  }

  const handleMergeGroup = async (group: DuplicateGroup) => {
    const winner = winners.get(group.codigoSAP)
    if (!winner) return

    setMergingGroup(group.codigoSAP)
    try {
      const losers = group.entries
        .filter(e => !(e.repuesto.id === winner.repuestoId && e.machineId === winner.machineId))
        .map(e => ({ repuestoId: e.repuesto.id, machineId: e.machineId }))

      await mergeRepuestos({
        winner: { repuestoId: winner.repuestoId, machineId: winner.machineId },
        losers,
      })

      setMergedGroups(prev => new Set([...prev, group.codigoSAP]))
      // Remove from groups
      setGroups(prev => prev.filter(g => g.codigoSAP !== group.codigoSAP))
    } catch (err) {
      logger.error('Error merging group', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setMergingGroup(null)
    }
  }

  // Auto-select winner for each group (the one with most data)
  const autoSelectWinners = () => {
    const next = new Map<string, { repuestoId: string; machineId: string }>()
    for (const group of groups) {
      // Score: fotos + vínculos + has specs + has gallery + higher cantidad
      let bestEntry: DuplicateEntry | null = null
      let bestScore = -1
      for (const entry of group.entries) {
        const r = entry.repuesto
        const score =
          (r.fotosReales?.length || 0) * 2 +
          (r.imagenesManual?.length || 0) +
          (r.vinculosManual?.length || 0) * 3 +
          (r.gallery?.length || 0) +
          (r.technicalSpecs ? 5 : 0) +
          (r.cantidadPorMaquina || 0) * 0.1 +
          (r.valorUnitario > 0 ? 1 : 0) +
          (r.codigoFabricante ? 1 : 0) +
          (r.ubicacionEnPlanta ? 1 : 0)
        if (score > bestScore) {
          bestScore = score
          bestEntry = entry
        }
      }
      if (bestEntry) {
        next.set(group.codigoSAP, { repuestoId: bestEntry.repuesto.id, machineId: bestEntry.machineId })
      }
    }
    setWinners(next)
  }

  const handleMergeAll = async () => {
    const pending = groups.filter(g => !mergedGroups.has(g.codigoSAP) && winners.has(g.codigoSAP))
    if (pending.length === 0) return

    setMergeAllProgress(0)
    let done = 0
    for (const group of pending) {
      const winner = winners.get(group.codigoSAP)
      if (!winner) continue
      try {
        const losers = group.entries
          .filter(e => !(e.repuesto.id === winner.repuestoId && e.machineId === winner.machineId))
          .map(e => ({ repuestoId: e.repuesto.id, machineId: e.machineId }))

        await mergeRepuestos({
          winner: { repuestoId: winner.repuestoId, machineId: winner.machineId },
          losers,
        })

        setMergedGroups(prev => new Set([...prev, group.codigoSAP]))
        setGroups(prev => prev.filter(g => g.codigoSAP !== group.codigoSAP))
      } catch (err) {
        logger.error('Error merging ' + group.codigoSAP, err instanceof Error ? err : new Error(String(err)))
      }
      done++
      setMergeAllProgress(Math.round((done / pending.length) * 100))
    }
    setMergeAllProgress(null)
    onDone?.()
  }

  const handleClose = (o: boolean) => {
    if (scanning || mergingGroup || mergeAllProgress !== null) return
    if (!o && mergedGroups.size > 0) onDone?.()
    onOpenChange(o)
  }

  const allDone = groups.length === 0 && mergedGroups.size > 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-5 pt-5 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <CopyIcon className="h-5 w-5 text-amber-500" />
            Duplicados de Repuestos
          </DialogTitle>
          <DialogDescription>
            {scanning
              ? `Escaneando… ${totalScanned} repuestos revisados`
              : groups.length > 0
                ? `${groups.length} grupo(s) de duplicados encontrados (${groups.reduce((s, g) => s + g.entries.length, 0)} repuestos totales)`
                : mergedGroups.size > 0
                  ? `¡${mergedGroups.size} grupo(s) fusionados exitosamente!`
                  : 'No se encontraron duplicados'}
          </DialogDescription>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {scanning ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              <span className="text-sm text-muted-foreground">
                Escaneando {machines.filter(m => m.activa).length} máquinas…
              </span>
              <span className="text-xs text-muted-foreground">{totalScanned} repuestos revisados</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={() => scan(machines)}>Reintentar</Button>
            </div>
          ) : allDone ? (
            <div className="flex flex-col items-center py-16 gap-3 text-center">
              <CheckCircle2 className="h-14 w-14 text-green-500" />
              <p className="text-lg font-medium text-foreground">¡Todo limpio!</p>
              <p className="text-sm text-muted-foreground">{mergedGroups.size} grupo(s) de duplicados fusionados</p>
            </div>
          ) : groups.length === 0 && !scanning ? (
            <div className="flex flex-col items-center py-16 gap-3 text-center">
              <Package className="h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No se encontraron duplicados</p>
              <p className="text-xs text-muted-foreground/70">Todos los repuestos tienen código SAP único</p>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="shrink-0 px-5 py-2 border-b border-border flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="h-8 pl-8 text-xs"
                    placeholder="Filtrar por SAP, nombre o máquina…"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={autoSelectWinners}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Auto-seleccionar mejores
                </Button>
                {winners.size > 0 && (
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={handleMergeAll}
                    disabled={mergeAllProgress !== null}
                  >
                    {mergeAllProgress !== null ? (
                      <><Loader2 className="h-3 w-3 animate-spin" /> Fusionando {mergeAllProgress}%</>
                    ) : (
                      <><Merge className="h-3 w-3" /> Fusionar todos ({winners.size})</>
                    )}
                  </Button>
                )}
              </div>

              {/* Merge-all progress bar */}
              {mergeAllProgress !== null && (
                <div className="shrink-0 px-5 py-1.5">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all duration-300"
                      style={{ width: `${mergeAllProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Groups list */}
              <div className="flex-1 min-h-0 overflow-auto px-5 py-3 space-y-2">
                {pendingGroups.map((group) => (
                  <GroupCard
                    key={group.codigoSAP}
                    group={group}
                    winnerId={winners.get(group.codigoSAP)?.repuestoId ?? null}
                    winnerMachineId={winners.get(group.codigoSAP)?.machineId ?? null}
                    onSelectWinner={(repId, machId) => handleSelectWinner(group.codigoSAP, repId, machId)}
                    onMerge={() => handleMergeGroup(group)}
                    merging={mergingGroup === group.codigoSAP}
                    merged={mergedGroups.has(group.codigoSAP)}
                    onSearchManual={(entry) => setManualSearchEntry(entry)}
                    machines={machines}
                  />
                ))}
                {pendingGroups.length === 0 && searchFilter && (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    Sin resultados para &quot;{searchFilter}&quot;
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 px-5 py-3 border-t border-border">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mr-auto">
            {mergedGroups.size > 0 && (
              <span className="text-green-400 font-medium">
                {mergedGroups.size} fusionados
              </span>
            )}
          </div>
          <Button variant="ghost" onClick={() => handleClose(false)} disabled={scanning || mergeAllProgress !== null}>
            {allDone || mergedGroups.size > 0 ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!scanning && groups.length === 0 && mergedGroups.size === 0 && (
            <Button variant="outline" onClick={() => scan(machines)}>
              Re-escanear
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Manual Search sub-modal */}
      {manualSearchEntry && (() => {
        const machine = machines.find(m => m.id === manualSearchEntry.machineId)
        return machine ? (
          <ManualSearchModal
            open={!!manualSearchEntry}
            onOpenChange={(o) => !o && setManualSearchEntry(null)}
            machine={machine}
            repuesto={manualSearchEntry.repuesto}
            isAdmin={false}
          />
        ) : null
      })()}
    </Dialog>
  )
}
