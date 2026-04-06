/**
 * EquipmentCard — Muestra un equipo de jerarquía con código SAP,
 * sub-equipos anidados colapsables, indicador de repuestos vinculados,
 * alias editable (admin) y botón de vinculación (abre modal externo).
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { ChevronRight, ChevronDown, X, Loader2, Pencil, Check, Plus, ArrowUp, ArrowDown, EyeOff, Eye, Pin, PinOff, Star } from 'lucide-react'
import { doc, updateDoc, addDoc, collection, Timestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { EquipmentDisplayNode } from '@/hooks/useEquipmentForArea'

/* ── Persistencia de estados fijados (expandido/colapsado) ── */
const PINNED_KEY = 'equipment-pinned-states'

function getPinnedStates(): Record<string, boolean> {
  try {
    const s = localStorage.getItem(PINNED_KEY)
    return s ? JSON.parse(s) : {}
  } catch { return {} }
}

function setPinnedState(id: string, expanded: boolean) {
  const states = getPinnedStates()
  states[id] = expanded
  try { localStorage.setItem(PINNED_KEY, JSON.stringify(states)) } catch { /* noop */ }
}

function removePinnedState(id: string) {
  const states = getPinnedStates()
  delete states[id]
  try { localStorage.setItem(PINNED_KEY, JSON.stringify(states)) } catch { /* noop */ }
}

function isPinned(id: string): boolean {
  return id in getPinnedStates()
}

function getPinnedValue(id: string): boolean | undefined {
  const states = getPinnedStates()
  return id in states ? states[id] : undefined
}

interface EquipmentCardProps {
  equipment: EquipmentDisplayNode
  isActive: boolean
  onClick: (eq: EquipmentDisplayNode) => void
  repuestosCounts?: Record<string, number>
  depth?: number
  isAdmin?: boolean
  onOpenLinkModal?: (sapNodeId: string, sapNodeName: string) => void
  onUnlinkMachine?: (sapNodeId: string) => Promise<void>
  allExpanded?: boolean
  onAliasUpdated?: () => void
  onChildAdded?: () => void
  reorderMode?: boolean
  isFirst?: boolean
  isLast?: boolean
  onMoveUp?: () => void
  onMoveDown?: () => void
  onToggleHidden?: (equipmentId: string, hidden: boolean) => Promise<void>
  isFavoriteMachine?: boolean
  onToggleFavoriteMachine?: (machineId: string, e: React.MouseEvent) => void
  onDeleteEquipment?: (equipmentId: string, name: string) => void
}

export function EquipmentCard({
  equipment,
  isActive,
  onClick,
  repuestosCounts = {},
  depth = 0,
  isAdmin,
  onOpenLinkModal,
  onUnlinkMachine,
  allExpanded,
  onAliasUpdated,
  onChildAdded,
  reorderMode,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onToggleHidden,
  isFavoriteMachine,
  onToggleFavoriteMachine,
  onDeleteEquipment,
}: EquipmentCardProps) {
  const hasChildren = equipment.children.length > 0
  const hasLinkedMachine = !!equipment.linkedMachineId

  // Total recursivo de repuestos (propio + todos los descendientes)
  const totalRepCount = useMemo(() => {
    function sumRep(node: EquipmentDisplayNode): number {
      let total = node.linkedMachineId ? (repuestosCounts[node.linkedMachineId] || 0) : 0
      for (const child of node.children) total += sumRep(child)
      return total
    }
    return sumRep(equipment)
  }, [equipment, repuestosCounts])
  const [expanded, setExpanded] = useState(() => getPinnedValue(equipment.id) ?? false)
  const [pinned, setPinned] = useState(() => isPinned(equipment.id))
  const [editing, setEditing] = useState(false)
  const [aliasValue, setAliasValue] = useState(equipment.alias || '')
  const [saving, setSaving] = useState(false)
  const [editingCode, setEditingCode] = useState(false)
  const [codeValue, setCodeValue] = useState(equipment.codigo || '')
  const [savingCode, setSavingCode] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)
  const [addingChild, setAddingChild] = useState(false)
  const [newChildName, setNewChildName] = useState('')
  const [newChildCode, setNewChildCode] = useState('')
  const [savingChild, setSavingChild] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const addChildInputRef = useRef<HTMLInputElement>(null)
  const [togglingHidden, setTogglingHidden] = useState(false)

  // Sincronizar con toggle global (no sobreescribir si está fijado)
  useEffect(() => {
    if (allExpanded !== undefined && !pinned) setExpanded(allExpanded)
  }, [allExpanded, pinned])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  useEffect(() => {
    if (editingCode) codeInputRef.current?.focus()
  }, [editingCode])

  useEffect(() => {
    if (addingChild) addChildInputRef.current?.focus()
  }, [addingChild])

  const displayName = equipment.alias || equipment.nombre

  const handleClick = () => {
    if (editing || editingCode || addingChild) return
    onClick(equipment)
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded(v => {
      const next = !v
      // Si está fijado, actualizar el valor guardado
      if (pinned) setPinnedState(equipment.id, next)
      return next
    })
  }

  const handleTogglePin = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (pinned) {
      removePinnedState(equipment.id)
      setPinned(false)
    } else {
      setPinnedState(equipment.id, expanded)
      setPinned(true)
    }
  }


  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setAliasValue(equipment.alias || '')
    setEditing(true)
  }

  const handleSaveAlias = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    const trimmed = aliasValue.trim()
    // Si es igual al nombre original o vacío, borrar alias
    const newAlias = trimmed && trimmed.toUpperCase() !== equipment.nombre ? trimmed.toUpperCase() : undefined
    setSaving(true)
    try {
      const updateData: Record<string, any> = { actualizadoEn: Timestamp.now() }
      if (newAlias) {
        updateData.alias = newAlias
      } else {
        // Importar deleteField dinámicamente para borrar el campo
        const { deleteField } = await import('firebase/firestore')
        updateData.alias = deleteField()
      }
      await updateDoc(doc(db, 'hierarchy', equipment.id), updateData)
      onAliasUpdated?.()
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') handleSaveAlias()
    if (e.key === 'Escape') setEditing(false)
  }

  const handleStartEditCode = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCodeValue(equipment.codigo || '')
    setEditingCode(true)
  }

  const handleSaveCode = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    const trimmed = codeValue.trim()
    setSavingCode(true)
    try {
      await updateDoc(doc(db, 'hierarchy', equipment.id), {
        codigo: trimmed,
        actualizadoEn: Timestamp.now(),
      })
      onAliasUpdated?.()
    } finally {
      setSavingCode(false)
      setEditingCode(false)
    }
  }

  const handleCodeKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') handleSaveCode()
    if (e.key === 'Escape') setEditingCode(false)
  }

  const handleStartAddChild = (e: React.MouseEvent) => {
    e.stopPropagation()
    setNewChildName('')
    setNewChildCode('')
    setAddingChild(true)
    setExpanded(true)
  }

  const handleSaveChild = async () => {
    const name = newChildName.trim()
    const code = newChildCode.trim()
    if (!name) return
    setSavingChild(true)
    try {
      const nextLevel = (equipment.nivel as number) + 1
      await addDoc(collection(db, 'hierarchy'), {
        nombre: name.toUpperCase(),
        codigo: code,
        nivel: nextLevel,
        parentId: equipment.id,
        path: [...(equipment as any).path || [], equipment.id],
        orden: equipment.children.length,
        activo: true,
        creadoPor: 'admin',
        creadoEn: Timestamp.now(),
        actualizadoEn: Timestamp.now(),
      })
      onChildAdded?.()
    } finally {
      setSavingChild(false)
      setAddingChild(false)
    }
  }

  const handleChildKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') handleSaveChild()
    if (e.key === 'Escape') setAddingChild(false)
  }

  const handleToggleHidden = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onToggleHidden) return
    setTogglingHidden(true)
    try {
      await onToggleHidden(equipment.id, !equipment.oculto)
    } finally {
      setTogglingHidden(false)
    }
  }

  const isHidden = !!equipment.oculto

  // Filtrar sub-equipos ocultos
  const [showHiddenChildren, setShowHiddenChildren] = useState(false)
  const hiddenChildrenCount = useMemo(() => equipment.children.filter(c => c.oculto).length, [equipment.children])
  const visibleChildren = useMemo(() =>
    showHiddenChildren ? equipment.children : equipment.children.filter(c => !c.oculto),
    [equipment.children, showHiddenChildren],
  )

  // Reordenar sub-equipos
  const handleMoveChild = async (childId: string, direction: 'up' | 'down') => {
    const idx = equipment.children.findIndex(c => c.id === childId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= equipment.children.length) return
    const a = equipment.children[idx]!
    const b = equipment.children[swapIdx]!
    try {
      await Promise.all([
        updateDoc(doc(db, 'hierarchy', a.id), { orden: swapIdx, actualizadoEn: Timestamp.now() }),
        updateDoc(doc(db, 'hierarchy', b.id), { orden: idx, actualizadoEn: Timestamp.now() }),
      ])
      onAliasUpdated?.()
    } catch (err) {
      console.error('Error reordering sub-equipment', err)
    }
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={e => { if (!editing && (e.key === 'Enter' || e.key === ' ')) handleClick() }}
        className={[
          'w-full flex items-center gap-2 text-left transition-colors duration-100 group relative cursor-pointer',
          'border-b border-border/20 last:border-b-0',
          depth === 0 ? 'px-3 py-[7px]' : 'px-3 py-[5px]',
          isActive ? 'bg-primary/8' : 'hover:bg-muted/25',
          isHidden ? 'opacity-40' : '',
        ].join(' ')}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {/* Indicador activo */}
        {isActive && (
          <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full bg-primary" />
        )}

        {/* Botones reordenar */}
        {reorderMode && (
          <div className="flex flex-col gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={onMoveUp}
              disabled={isFirst}
              className="flex items-center justify-center w-4 h-4 rounded hover:bg-primary/20 text-muted-foreground/50 hover:text-primary transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
              title="Mover arriba"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              onClick={onMoveDown}
              disabled={isLast}
              className="flex items-center justify-center w-4 h-4 rounded hover:bg-primary/20 text-muted-foreground/50 hover:text-primary transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
              title="Mover abajo"
            >
              <ArrowDown className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Toggle colapsar/expandir — alineación consistente */}
        {hasChildren ? (
          <span
            onClick={handleToggle}
            className={`shrink-0 flex items-center justify-center w-4 h-4 rounded hover:bg-muted/50 transition-colors cursor-pointer ${
              isActive ? 'text-primary' : 'text-muted-foreground/50'
            }`}
          >
            {expanded
              ? <ChevronDown className="h-3 w-3" />
              : <ChevronRight className="h-3 w-3" />
            }
          </span>
        ) : (
          <span className={`shrink-0 flex items-center justify-center w-4 h-4`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
          </span>
        )}

        {/* Info principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {editing ? (
              <div className="flex items-center gap-1 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                <input
                  ref={inputRef}
                  value={aliasValue}
                  onChange={e => setAliasValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={equipment.nombre}
                  className="flex-1 min-w-0 h-5 px-1.5 text-[11px] rounded border border-primary/50 bg-background text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <button
                  onClick={handleSaveAlias}
                  disabled={saving}
                  className="flex items-center justify-center w-5 h-5 rounded bg-primary/20 hover:bg-primary/30 text-primary transition-colors shrink-0"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setEditing(false) }}
                  className="flex items-center justify-center w-5 h-5 rounded hover:bg-muted/50 text-muted-foreground transition-colors shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <>
                <span className={[
                  'truncate leading-snug font-medium transition-colors',
                  depth === 0 ? 'text-[11.5px]' : 'text-[10.5px]',
                  isActive ? 'text-primary' : 'text-foreground group-hover:text-primary',
                ].join(' ')}>
                  {displayName}
                </span>
                {isAdmin && (
                  <button
                    onClick={handleStartEdit}
                    className="hidden group-hover:flex items-center justify-center w-4 h-4 rounded hover:bg-muted/50 text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
                    title="Editar nombre"
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </button>
                )}
              </>
            )}
          </div>
          {/* Nombre original SAP (si hay alias) */}
          {equipment.alias && (
            <p className="text-[9.5px] text-muted-foreground/50 leading-snug mt-px">
              {equipment.nombre}
            </p>
          )}
          {/* Código SAP + vinculación */}
          <div className="flex items-center gap-1.5 mt-px">
            {editingCode ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <input
                  ref={codeInputRef}
                  value={codeValue}
                  onChange={e => setCodeValue(e.target.value)}
                  onKeyDown={handleCodeKeyDown}
                  placeholder="Código SAP"
                  className="w-24 h-4 px-1 text-[9px] font-mono rounded border border-primary/50 bg-background text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <button
                  onClick={handleSaveCode}
                  disabled={savingCode}
                  className="flex items-center justify-center w-4 h-4 rounded bg-primary/20 hover:bg-primary/30 text-primary transition-colors shrink-0"
                >
                  {savingCode ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Check className="h-2.5 w-2.5" />}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setEditingCode(false) }}
                  className="flex items-center justify-center w-4 h-4 rounded hover:bg-muted/50 text-muted-foreground transition-colors shrink-0"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ) : (
              <span
                className={[
                  'text-[9px] font-mono text-muted-foreground/60 bg-muted/60 px-1 py-0.5 rounded',
                  isAdmin ? 'cursor-pointer hover:bg-muted hover:text-muted-foreground transition-colors' : '',
                ].join(' ')}
                onClick={isAdmin ? handleStartEditCode : undefined}
                title={isAdmin ? 'Editar código SAP' : undefined}
              >
                {equipment.codigo || '—'}
              </span>
            )}
            {totalRepCount > 0 ? (
              <span className="text-[9px] font-bold tabular-nums text-emerald-400">
                {totalRepCount} rep.
              </span>
            ) : hasLinkedMachine ? (
              <span className="text-[9px] font-bold tabular-nums text-muted-foreground/40">
                0 rep.
              </span>
            ) : null}
            {/* Star favorito — disponible para todos los equipos */}
            {onToggleFavoriteMachine && (
              <button
                onClick={ev => { ev.stopPropagation(); onToggleFavoriteMachine(equipment.linkedMachineId || equipment.id, ev) }}
                className={`shrink-0 p-0.5 rounded transition-colors ${
                  isFavoriteMachine
                    ? 'text-yellow-400'
                    : 'text-muted-foreground/20 hover:text-yellow-400/60 hidden group-hover:inline-flex'
                }`}
                title={isFavoriteMachine ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              >
                <Star className={`h-3 w-3 ${isFavoriteMachine ? 'fill-yellow-400' : ''}`} />
              </button>
            )}
            {/* Eliminar equipo (admin) */}
            {onDeleteEquipment && totalRepCount === 0 && (
              <button
                onClick={ev => { ev.stopPropagation(); onDeleteEquipment(equipment.id, displayName) }}
                className="shrink-0 p-0.5 rounded text-muted-foreground/20 hover:text-red-400 hidden group-hover:inline-flex transition-colors"
                title="Eliminar equipo"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Sub-equipos badge + pin */}
        {hasChildren && (
          <div className="flex items-center gap-0.5 shrink-0">
            <span className="text-[9px] font-bold px-1 py-0.5 rounded-full tabular-nums bg-muted/80 text-muted-foreground">
              {equipment.children.length}
            </span>
            <button
              onClick={handleTogglePin}
              className={[
                'flex items-center justify-center w-4 h-4 rounded transition-colors shrink-0',
                pinned
                  ? 'text-amber-500 bg-amber-500/15'
                  : 'hidden group-hover:flex text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/50',
              ].join(' ')}
              title={pinned ? 'Desfijar estado' : 'Fijar expandido/colapsado'}
            >
              {pinned ? <Pin className="h-2.5 w-2.5" /> : <PinOff className="h-2.5 w-2.5" />}
            </button>
          </div>
        )}

        {/* Botón ocultar/mostrar equipo */}
        {isAdmin && onToggleHidden && (
          <button
            onClick={handleToggleHidden}
            disabled={togglingHidden}
            className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded hover:bg-muted/50 text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
            title={isHidden ? 'Mostrar equipo' : 'Ocultar equipo'}
          >
            {togglingHidden ? <Loader2 className="h-3 w-3 animate-spin" /> : isHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
        )}

        {/* Botón agregar sub-equipo */}
        {isAdmin && onChildAdded && (
          <button
            onClick={handleStartAddChild}
            className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded hover:bg-primary/20 text-muted-foreground/40 hover:text-primary transition-colors shrink-0"
            title="Agregar sub-equipo"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}

        <ChevronRight className={`h-3 w-3 shrink-0 transition-colors ${
          isActive ? 'text-primary' : 'text-muted-foreground/25 group-hover:text-primary/50'
        }`} />
      </div>

      {/* Sub-equipos (colapsable) */}
      {(hasChildren || addingChild) && expanded && (
        <div className="relative">
          <div
            className="absolute top-0 bottom-2 w-px bg-border/30"
            style={{ left: `${20 + depth * 20}px` }}
          />
          {/* Toggle ver ocultos en sub-equipos */}
          {isAdmin && hiddenChildrenCount > 0 && (
            <div className="flex items-center gap-1 px-3 py-1" style={{ paddingLeft: `${12 + (depth + 1) * 20}px` }}>
              <button
                onClick={e => { e.stopPropagation(); setShowHiddenChildren(v => !v) }}
                className={[
                  'flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-medium transition-colors',
                  showHiddenChildren
                    ? 'bg-amber-500/15 text-amber-500'
                    : 'bg-muted/60 text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted',
                ].join(' ')}
              >
                {showHiddenChildren ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                {hiddenChildrenCount} oculto(s)
              </button>
            </div>
          )}
          {visibleChildren.map((child, idx) => (
            <EquipmentCard
              key={child.id}
              equipment={child}
              isActive={isActive}
              onClick={onClick}
              repuestosCounts={repuestosCounts}
              depth={depth + 1}
              isAdmin={isAdmin}
              onOpenLinkModal={onOpenLinkModal}
              onUnlinkMachine={onUnlinkMachine}
              allExpanded={allExpanded}
              onAliasUpdated={onAliasUpdated}
              onChildAdded={onChildAdded}
              onToggleHidden={onToggleHidden}
              reorderMode={reorderMode}
              isFirst={idx === 0}
              isLast={idx === visibleChildren.length - 1}
              onMoveUp={() => handleMoveChild(child.id, 'up')}
              onMoveDown={() => handleMoveChild(child.id, 'down')}
            />
          ))}

          {/* Formulario inline agregar sub-equipo */}
          {addingChild && (
            <div
              className="flex items-center gap-1.5 px-3 py-2 border-b border-border/20"
              style={{ paddingLeft: `${12 + (depth + 1) * 20}px` }}
              onClick={e => e.stopPropagation()}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary/50 shrink-0" />
              <input
                ref={addChildInputRef}
                value={newChildName}
                onChange={e => setNewChildName(e.target.value.toUpperCase())}
                onKeyDown={handleChildKeyDown}
                placeholder="Nombre del equipo"
                className="flex-1 min-w-0 h-5 px-1.5 text-[11px] uppercase rounded border border-primary/50 bg-background text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <input
                value={newChildCode}
                onChange={e => setNewChildCode(e.target.value)}
                onKeyDown={handleChildKeyDown}
                placeholder="Código (opc.)"
                className="w-20 h-5 px-1.5 text-[10px] font-mono rounded border border-border bg-background text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              <button
                onClick={handleSaveChild}
                disabled={savingChild || !newChildName.trim()}
                className="flex items-center justify-center w-5 h-5 rounded bg-primary/20 hover:bg-primary/30 text-primary transition-colors shrink-0 disabled:opacity-40"
              >
                {savingChild ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              </button>
              <button
                onClick={e => { e.stopPropagation(); setAddingChild(false) }}
                className="flex items-center justify-center w-5 h-5 rounded hover:bg-muted/50 text-muted-foreground transition-colors shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
