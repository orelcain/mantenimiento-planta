/**
 * ETTBlockRenderer — Renderiza un bloque editable del editor WYSIWYG
 *
 * Cada bloque se muestra con:
 *   - Contenido editable (texto inline / tabla / lista con sub-items)
 *   - Controles flotantes al hover: mover arriba/abajo, eliminar
 *   - Soporte para los 4 tipos de bloque (parrafo, lista, tabla, subtitulo)
 *
 * Los cambios se notifican vía `onChange`. El padre es el responsable
 * de persistir los cambios (normalmente se debounce y se guarda en Firestore).
 */

import { ArrowDown, ArrowUp, Trash2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui'
import type {
  ETTBloque,
  ETTBloqueLista,
  ETTBloqueParrafo,
  ETTBloqueSubtitulo,
  ETTBloqueTabla,
  ETTListItem,
} from '@/types'
import { ETTInlineText } from './ETTInlineText'
import { cn } from '@/lib/utils'

// ============================================================================
// PROPS
// ============================================================================

export interface ETTBlockRendererProps {
  bloque: ETTBloque
  index: number
  total: number
  onChange: (nuevoBloque: ETTBloque) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

// ============================================================================
// RENDERERS POR TIPO DE BLOQUE
// ============================================================================

function ParrafoEditor({
  bloque,
  onChange,
}: {
  bloque: ETTBloqueParrafo
  onChange: (b: ETTBloqueParrafo) => void
}) {
  return (
    <div className="py-1">
      <ETTInlineText
        value={bloque.texto}
        onChange={(texto) => onChange({ ...bloque, texto })}
        placeholder="[Párrafo vacío — click para escribir]"
        multiline
        bold={bloque.negrita}
        className={cn(
          bloque.color === 'rojo' && 'text-red-700',
          bloque.color === 'azul' && 'text-blue-700',
        )}
      />
    </div>
  )
}

function SubtituloEditor({
  bloque,
  onChange,
}: {
  bloque: ETTBloqueSubtitulo
  onChange: (b: ETTBloqueSubtitulo) => void
}) {
  return (
    <div className="py-2 mt-2">
      <ETTInlineText
        value={bloque.texto}
        onChange={(texto) => onChange({ ...bloque, texto })}
        placeholder="[Subtítulo]"
        bold
        className="text-base"
      />
    </div>
  )
}

function ListaEditor({
  bloque,
  onChange,
}: {
  bloque: ETTBloqueLista
  onChange: (b: ETTBloqueLista) => void
}) {
  const updateItem = (idx: number, nuevo: ETTListItem) => {
    const items = [...bloque.items]
    items[idx] = nuevo
    onChange({ ...bloque, items })
  }

  const addItem = () => {
    onChange({ ...bloque, items: [...bloque.items, { texto: '' }] })
  }

  const removeItem = (idx: number) => {
    onChange({ ...bloque, items: bloque.items.filter((_, i) => i !== idx) })
  }

  const addSubitem = (idx: number) => {
    const items = [...bloque.items]
    const current = items[idx]
    if (!current) return
    items[idx] = {
      ...current,
      subitems: [...(current.subitems ?? []), { texto: '' }],
    }
    onChange({ ...bloque, items })
  }

  const updateSubitem = (itemIdx: number, subIdx: number, texto: string) => {
    const items = [...bloque.items]
    const current = items[itemIdx]
    if (!current) return
    const subitems = [...(current.subitems ?? [])]
    subitems[subIdx] = { texto }
    items[itemIdx] = { ...current, subitems }
    onChange({ ...bloque, items })
  }

  const removeSubitem = (itemIdx: number, subIdx: number) => {
    const items = [...bloque.items]
    const current = items[itemIdx]
    if (!current) return
    const subitems = (current.subitems ?? []).filter((_, i) => i !== subIdx)
    items[itemIdx] = { ...current, subitems }
    onChange({ ...bloque, items })
  }

  const estilo = bloque.estilo ?? 'bullets'

  return (
    <div className="py-1 space-y-1">
      {bloque.items.map((item, idx) => (
        <div key={idx} className="group/item">
          <div className="flex items-start gap-2">
            <span className="text-gray-500 pt-0.5 min-w-[20px]">
              {estilo === 'numerada' ? `${idx + 1}.` : estilo === 'dash' ? '—' : '•'}
            </span>
            <div className="flex-1">
              <ETTInlineText
                value={item.texto}
                onChange={(texto) => updateItem(idx, { ...item, texto })}
                placeholder="[Item de lista]"
                multiline
              />
            </div>
            <div className="flex gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => addSubitem(idx)}
                title="Agregar sub-item"
              >
                <Plus className="h-3 w-3" /> sub
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-red-600"
                onClick={() => removeItem(idx)}
                title="Eliminar item"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Sub-items (nivel anidado) */}
          {item.subitems && item.subitems.length > 0 && (
            <div className="ml-8 mt-1 space-y-1">
              {item.subitems.map((sub, subIdx) => (
                <div key={subIdx} className="flex items-start gap-2 group/sub">
                  <span className="text-gray-400 pt-0.5 min-w-[14px]">•</span>
                  <div className="flex-1">
                    <ETTInlineText
                      value={sub.texto}
                      onChange={(texto) => updateSubitem(idx, subIdx, texto)}
                      placeholder="[Sub-item]"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 opacity-0 group-hover/sub:opacity-100 text-red-600"
                    onClick={() => removeSubitem(idx, subIdx)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="ml-5 h-7 text-xs text-gray-500"
        onClick={addItem}
      >
        <Plus className="h-3 w-3 mr-1" /> Agregar item
      </Button>
    </div>
  )
}

function TablaEditor({
  bloque,
  onChange,
}: {
  bloque: ETTBloqueTabla
  onChange: (b: ETTBloqueTabla) => void
}) {
  const updateColumna = (idx: number, nuevo: string) => {
    const columnas = [...bloque.columnas]
    columnas[idx] = nuevo
    onChange({ ...bloque, columnas })
  }

  const updateCelda = (filaIdx: number, colIdx: number, valor: string) => {
    const filas = bloque.filas.map((f) => ({ celdas: [...f.celdas] }))
    const fila = filas[filaIdx]
    if (!fila) return
    fila.celdas[colIdx] = valor
    onChange({ ...bloque, filas })
  }

  const addColumna = () => {
    const columnas = [...bloque.columnas, 'Nueva col']
    const filas = bloque.filas.map((f) => ({ celdas: [...f.celdas, ''] }))
    onChange({ ...bloque, columnas, filas })
  }

  const removeColumna = (idx: number) => {
    if (bloque.columnas.length <= 1) return
    const columnas = bloque.columnas.filter((_, i) => i !== idx)
    const filas = bloque.filas.map((f) => ({
      celdas: f.celdas.filter((_, i) => i !== idx),
    }))
    onChange({ ...bloque, columnas, filas })
  }

  const addFila = () => {
    const nueva = { celdas: bloque.columnas.map(() => '') }
    onChange({ ...bloque, filas: [...bloque.filas, nueva] })
  }

  const removeFila = (idx: number) => {
    onChange({ ...bloque, filas: bloque.filas.filter((_, i) => i !== idx) })
  }

  return (
    <div className="py-2 overflow-x-auto">
      <table className="border-collapse border border-blue-200">
        <thead>
          <tr className="bg-blue-900 text-white">
            {bloque.columnas.map((col, idx) => (
              <th key={idx} className="border border-blue-300 px-3 py-2 relative group/col">
                <ETTInlineText
                  value={col}
                  onChange={(v) => updateColumna(idx, v)}
                  placeholder="[Col]"
                  className="bg-yellow-100 text-blue-900 font-bold"
                />
                {bloque.columnas.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute -top-2 -right-2 h-5 w-5 p-0 bg-red-600 text-white rounded-full opacity-0 group-hover/col:opacity-100"
                    onClick={() => removeColumna(idx)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </th>
            ))}
            <th className="border border-blue-200 px-1">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={addColumna} title="Agregar columna">
                <Plus className="h-4 w-4" />
              </Button>
            </th>
          </tr>
        </thead>
        <tbody>
          {bloque.filas.map((fila, filaIdx) => (
            <tr key={filaIdx} className="group/row">
              {fila.celdas.map((celda, colIdx) => (
                <td key={colIdx} className="border border-blue-200 px-3 py-2">
                  <ETTInlineText
                    value={celda}
                    onChange={(v) => updateCelda(filaIdx, colIdx, v)}
                    placeholder="[?]"
                  />
                </td>
              ))}
              <td className="border-none px-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-red-600 opacity-0 group-hover/row:opacity-100"
                  onClick={() => removeFila(filaIdx)}
                  title="Eliminar fila"
                >
                  <X className="h-3 w-3" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button variant="ghost" size="sm" className="mt-1 h-7 text-xs text-gray-500" onClick={addFila}>
        <Plus className="h-3 w-3 mr-1" /> Agregar fila
      </Button>
    </div>
  )
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export function ETTBlockRenderer({
  bloque,
  index,
  total,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: ETTBlockRendererProps) {
  const renderByType = () => {
    switch (bloque.tipo) {
      case 'parrafo':
        return (
          <ParrafoEditor
            bloque={bloque}
            onChange={(b) => onChange(b)}
          />
        )
      case 'subtitulo':
        return (
          <SubtituloEditor
            bloque={bloque}
            onChange={(b) => onChange(b)}
          />
        )
      case 'lista':
        return (
          <ListaEditor
            bloque={bloque}
            onChange={(b) => onChange(b)}
          />
        )
      case 'tabla':
        return (
          <TablaEditor
            bloque={bloque}
            onChange={(b) => onChange(b)}
          />
        )
    }
  }

  return (
    <div className="relative group border border-transparent hover:border-gray-200 hover:bg-muted-foreground/[0.10] rounded-ctl px-2 -mx-2 transition-colors">
      {/* Controles flotantes del bloque */}
      <div className="absolute -left-10 top-2 flex-col gap-0.5 hidden group-hover:flex">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onMoveUp}
          disabled={index === 0}
          title="Mover arriba"
        >
          <ArrowUp className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onMoveDown}
          disabled={index === total - 1}
          title="Mover abajo"
        >
          <ArrowDown className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-red-600"
          onClick={onDelete}
          title="Eliminar bloque"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {renderByType()}
    </div>
  )
}
