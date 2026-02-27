/**
 * LinkEntityDialog — Vincular un nodo del mapa con una entidad real de Firestore
 * 
 * Permite buscar y seleccionar equipos, zonas, o dispositivos IoT
 * para vincular a un nodo del mapa isométrico.
 */

import { useState, useMemo } from 'react'
import { X, Search, Link2, Wrench, MapPin, Cpu, Unlink } from 'lucide-react'
import { Button, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { MapNode } from '@/types/isometricMap'
import type { Equipment, Zone } from '@/types'

type EntityType = 'equipment' | 'zone'

interface LinkEntityDialogProps {
  isOpen: boolean
  node: MapNode
  onLink: (nodeId: string, entityType: MapNode['linkedEntityType'], entityId: string) => void
  onUnlink: (nodeId: string) => void
  onClose: () => void
}

const ENTITY_TABS: { id: EntityType; icon: typeof Wrench; label: string }[] = [
  { id: 'equipment', icon: Wrench, label: 'Equipos' },
  { id: 'zone', icon: MapPin, label: 'Zonas' },
]

const ESTADO_BADGE: Record<string, { variant: string; label: string }> = {
  operativo: { variant: 'success', label: 'Operativo' },
  en_mantenimiento: { variant: 'warning', label: 'En mantención' },
  fuera_servicio: { variant: 'destructive', label: 'Fuera de servicio' },
}

export function LinkEntityDialog({ isOpen, node, onLink, onUnlink, onClose }: LinkEntityDialogProps) {
  const { equipment, zones } = useAppStore()
  const [activeTab, setActiveTab] = useState<EntityType>('equipment')
  const [search, setSearch] = useState('')

  if (!isOpen) return null

  const filteredEquipment = useMemo(() => {
    if (!search) return equipment.filter(e => !e.deleted)
    const q = search.toLowerCase()
    return equipment.filter(
      (e) =>
        !e.deleted &&
        (e.nombre.toLowerCase().includes(q) ||
          e.codigo.toLowerCase().includes(q) ||
          (e.marca?.toLowerCase().includes(q)) ||
          (e.modelo?.toLowerCase().includes(q)))
    )
  }, [equipment, search])

  const filteredZones = useMemo(() => {
    if (!search) return zones.filter(z => z.activa)
    const q = search.toLowerCase()
    return zones.filter(
      (z) =>
        z.activa &&
        (z.nombre.toLowerCase().includes(q) ||
          z.codigo.toLowerCase().includes(q))
    )
  }, [zones, search])

  const isLinked = !!node.linkedEntityId

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-card border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Vincular: {node.label}
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Current link info */}
        {isLinked && (
          <div className="mx-4 mt-3 p-2.5 rounded-lg border bg-muted/50 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Link2 className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">
                  Vinculado a: {node.linkedEntityType} / {node.linkedEntityId}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive gap-1 text-xs shrink-0"
              onClick={() => onUnlink(node.id)}
            >
              <Unlink className="h-3.5 w-3.5" />
              Desvincular
            </Button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b mx-4 mt-3">
          {ENTITY_TABS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors',
                activeTab === id
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              onClick={() => { setActiveTab(id); setSearch('') }}
            >
              <Icon className="h-4 w-4" />
              {label}
              <Badge variant="secondary" className="text-[10px] h-4 ml-1">
                {id === 'equipment' ? equipment.filter(e => !e.deleted).length : zones.filter(z => z.activa).length}
              </Badge>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-4 pt-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={activeTab === 'equipment' ? 'Buscar equipo por nombre o código...' : 'Buscar zona...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-muted border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {activeTab === 'equipment' && (
            filteredEquipment.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                {equipment.length === 0 ? 'No hay equipos registrados' : 'Sin resultados'}
              </p>
            ) : (
              filteredEquipment.map((eq) => {
                const isCurrentLink = node.linkedEntityId === eq.id && node.linkedEntityType === 'equipment'
                const estadoBadge = ESTADO_BADGE[eq.estado]
                return (
                  <button
                    key={eq.id}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border hover:bg-muted transition-colors',
                      isCurrentLink && 'ring-2 ring-primary bg-primary/5'
                    )}
                    onClick={() => onLink(node.id, 'equipment', eq.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm truncate">{eq.nombre}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground font-mono">{eq.codigo}</span>
                          {eq.marca && <span className="text-xs text-muted-foreground">{eq.marca}</span>}
                          {estadoBadge && (
                            <Badge variant={estadoBadge.variant as 'default'} className="text-[10px] h-4">
                              {estadoBadge.label}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {isCurrentLink && (
                        <Badge variant="default" className="text-[10px] shrink-0">Vinculado</Badge>
                      )}
                    </div>
                  </button>
                )
              })
            )
          )}

          {activeTab === 'zone' && (
            filteredZones.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                {zones.length === 0 ? 'No hay zonas registradas' : 'Sin resultados'}
              </p>
            ) : (
              filteredZones.map((zone) => {
                const isCurrentLink = node.linkedEntityId === zone.id && node.linkedEntityType === 'zone'
                return (
                  <button
                    key={zone.id}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border hover:bg-muted transition-colors',
                      isCurrentLink && 'ring-2 ring-primary bg-primary/5'
                    )}
                    onClick={() => onLink(node.id, 'zone', zone.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm truncate">{zone.nombre}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground font-mono">{zone.codigo}</span>
                          <span className="text-xs text-muted-foreground capitalize">{zone.tipo}</span>
                          {zone.color && (
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: zone.color }} />
                          )}
                        </div>
                      </div>
                      {isCurrentLink && (
                        <Badge variant="default" className="text-[10px] shrink-0">Vinculado</Badge>
                      )}
                    </div>
                  </button>
                )
              })
            )
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-end">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  )
}
