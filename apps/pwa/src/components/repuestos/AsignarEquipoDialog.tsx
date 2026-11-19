/**
 * «Asignar a un equipo»: elige el nodo de la planta donde se usa un material (N:M).
 * Extraído tal cual de RepuestosAreaHub para que también lo use la ficha de Bodega.
 */
import { useEffect, useState } from 'react'
import { Cog } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Input } from '@/components/ui'
import { getGlobalEquipmentCache } from '@/hooks/useGlobalEquipmentSearch'
import { normalizeForSearch } from '@/utils/repuestos'

/** Nodo de equipo que se puede elegir. */
export interface CandidatoEquipo {
  id: string
  nombre: string
  alias?: string
  codigo?: string
  oculto?: boolean
}

export interface AsignarEquipoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** machineId de los equipos que ya tiene el material: no se ofrecen de nuevo. */
  yaAsignados: readonly string[]
  guardando: boolean
  onElegir: (node: CandidatoEquipo) => void
  /** Lista de equipos a ofrecer. Opcional: si no llega, se usa la caché global de equipos (como en el Hub). */
  candidatos?: readonly CandidatoEquipo[]
}

export function AsignarEquipoDialog({ open, onOpenChange, yaAsignados, guardando, onElegir, candidatos }: AsignarEquipoDialogProps) {
  const [query, setQuery] = useState('')
  // Cada vez que se abre, la búsqueda arranca vacía (como antes en el Hub).
  useEffect(() => { if (open) setQuery('') }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Asignar a un equipo</DialogTitle>
          <DialogDescription>Elige el equipo de la planta donde se usa este material. Puedes agregar varios (un material sirve a N equipos).</DialogDescription>
        </DialogHeader>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar equipo…" autoFocus />
        <div className="mt-2 max-h-[50vh] space-y-1 overflow-y-auto">
          {(() => {
            const already = new Set(yaAsignados)
            const q = normalizeForSearch(query)
            const fuente: readonly CandidatoEquipo[] = candidatos ?? getGlobalEquipmentCache() ?? []
            const cands = fuente
              .filter((e) => !e.oculto && !already.has(e.id) && (!q || normalizeForSearch(`${e.nombre} ${e.alias ?? ''} ${e.codigo ?? ''}`).includes(q)))
              .slice(0, 50)
            if (!cands.length) return <p className="px-1 py-2 text-xs text-muted-foreground">Sin equipos que coincidan.</p>
            return cands.map((e) => (
              <button
                key={e.id}
                disabled={guardando}
                onClick={() => onElegir(e)}
                className="flex w-full items-center gap-2 rounded-card border border-border bg-card px-3 py-2 text-left text-sm transition hover:bg-muted hover:border-primary/40 disabled:opacity-50"
              >
                <Cog className="h-4 w-4 shrink-0 text-cat-7-ink" />
                <span className="min-w-0 flex-1 truncate">{e.alias || e.nombre}</span>
                {e.codigo && <span className="shrink-0 font-mono text-caption text-muted-foreground">{e.codigo}</span>}
              </button>
            ))
          })()}
        </div>
      </DialogContent>
    </Dialog>
  )
}
