/**
 * AuditLogPanel — Historial de cambios
 *
 * Modal Dialog que muestra el timeline de operaciones CRUD
 * con filtros por acción, colección, usuario y rango de fechas.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  History,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  ArrowRightLeft,
  Loader2,
  ChevronDown,
  Filter,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui'
import { getAuditLog } from '@/services/auditLog'
import type { AuditLogEntry, AuditAction } from '@/types/audit'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ACTION_CONFIG: Record<AuditAction, { icon: typeof Plus; label: string; color: string }> = {
  create:   { icon: Plus,           label: 'Creado',     color: 'text-emerald-500' },
  update:   { icon: Pencil,         label: 'Editado',    color: 'text-blue-500' },
  delete:   { icon: Trash2,         label: 'Eliminado',  color: 'text-red-500' },
  restore:  { icon: RotateCcw,      label: 'Restaurado', color: 'text-amber-500' },
  relocate: { icon: ArrowRightLeft, label: 'Reubicado',  color: 'text-purple-500' },
}

function formatDate(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)

  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`

  const isToday = date.toDateString() === now.toDateString()
  if (isToday) return `hoy ${date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return `ayer ${date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`
  }

  return date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function collectionLabel(col: string): string {
  if (col === 'hierarchy') return 'Equipo'
  if (col.includes('/repuestos')) return 'Repuesto'
  return col
}

/** Muestra diff compacto de campos cambiados */
function ChangeSummary({ before, after }: { before?: Record<string, unknown>; after?: Record<string, unknown> }) {
  if (!before || !after) return null

  const changedKeys = Object.keys(after).filter(k => {
    if (k === 'updatedAt' || k === 'createdAt') return false
    return JSON.stringify(after[k]) !== JSON.stringify(before[k])
  })

  if (changedKeys.length === 0) return null

  return (
    <div className="mt-1 space-y-0.5">
      {changedKeys.slice(0, 3).map(key => (
        <div key={key} className="text-[10px] text-muted-foreground flex items-center gap-1">
          <span className="font-medium text-foreground/70">{key}:</span>
          <span className="line-through text-red-400 truncate max-w-[80px]" title={String(before[key] ?? '')}>
            {String(before[key] ?? '').slice(0, 30)}
          </span>
          <span className="text-foreground/60">&rarr;</span>
          <span className="text-emerald-500 truncate max-w-[80px]" title={String(after[key] ?? '')}>
            {String(after[key] ?? '').slice(0, 30)}
          </span>
        </div>
      ))}
      {changedKeys.length > 3 && (
        <span className="text-[10px] text-muted-foreground">+{changedKeys.length - 3} más</span>
      )}
    </div>
  )
}

export function AuditLogPanel({ open, onOpenChange }: Props) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [lastDoc, setLastDoc] = useState<unknown>(null)
  const [hasMore, setHasMore] = useState(true)
  const [filterAction, setFilterAction] = useState<AuditAction | ''>('')
  const [showFilters, setShowFilters] = useState(false)

  const loadEntries = useCallback(async (reset = false) => {
    setLoading(true)
    const filters: { action?: AuditAction; limit: number } = { limit: 30 }
    if (filterAction) filters.action = filterAction

    const result = await getAuditLog(filters, reset ? undefined : lastDoc)
    if (reset) {
      setEntries(result.entries)
    } else {
      setEntries(prev => [...prev, ...result.entries])
    }
    setLastDoc(result.lastDoc)
    setHasMore(result.entries.length === 30)
    setLoading(false)
  }, [filterAction, lastDoc])

  useEffect(() => {
    if (open) {
      setEntries([])
      setLastDoc(null)
      setHasMore(true)
      // Defer load para evitar stale closure
      const timer = setTimeout(() => {
        (async () => {
          setLoading(true)
          const filters: { action?: AuditAction; limit: number } = { limit: 30 }
          if (filterAction) filters.action = filterAction
          const result = await getAuditLog(filters)
          setEntries(result.entries)
          setLastDoc(result.lastDoc)
          setHasMore(result.entries.length === 30)
          setLoading(false)
        })()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [open, filterAction])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Historial de Cambios
          </DialogTitle>
        </DialogHeader>

        {/* ── Filtros ── */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(f => !f)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Filter className="h-3 w-3" />
            Filtros
            <ChevronDown className={`h-3 w-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
          {filterAction && (
            <button
              onClick={() => setFilterAction('')}
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/80"
            >
              {ACTION_CONFIG[filterAction].label} &times;
            </button>
          )}
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-1.5 pb-1">
            {(Object.keys(ACTION_CONFIG) as AuditAction[]).map(action => {
              const cfg = ACTION_CONFIG[action]
              const isActive = filterAction === action
              return (
                <button
                  key={action}
                  onClick={() => setFilterAction(isActive ? '' : action)}
                  className={[
                    'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors border',
                    isActive
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-transparent bg-muted text-muted-foreground hover:bg-muted',
                  ].join(' ')}
                >
                  <cfg.icon className="h-3 w-3" />
                  {cfg.label}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Timeline ── */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-1 min-h-0">
          {loading && entries.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No hay registros
            </div>
          ) : (
            entries.map(entry => {
              const cfg = ACTION_CONFIG[entry.action] || ACTION_CONFIG.update
              const Icon = cfg.icon
              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0"
                >
                  <div className={`shrink-0 mt-0.5 p-1 rounded-md bg-muted ${cfg.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-medium truncate" title={entry.documentLabel}>{entry.documentLabel}</span>
                      <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                        {collectionLabel(entry.collection)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                      <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                      <span>por {entry.userName || 'Sistema'}</span>
                      <span>&middot;</span>
                      <span>{formatDate(entry.timestamp)}</span>
                    </div>
                    {entry.action === 'update' && (
                      <ChangeSummary before={entry.before} after={entry.after} />
                    )}
                    {entry.action === 'relocate' && entry.metadata && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        De <span className="font-medium">{entry.metadata.sourceMachineId}</span>
                        {' '}&rarr;{' '}
                        <span className="font-medium">{entry.metadata.targetMachineId}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}

          {/* Cargar más */}
          {hasMore && entries.length > 0 && (
            <div className="py-3 text-center">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => loadEntries()}
                disabled={loading}
                className="text-xs"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Cargar más
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
