/**
 * useEditorHistory — Hook para undo/redo del estado del editor
 * 
 * Mantiene un historial de snapshots de nodos (y opcionalmente áreas/conectores).
 * Soporta un máximo configurable de pasos de deshacer.
 */

import { useState, useCallback, useRef } from 'react'
import type { MapNode, MapArea, MapConnector } from '@/types/isometricMap'

interface EditorSnapshot {
  nodes: MapNode[]
  areas: MapArea[]
  connectors: MapConnector[]
}

interface UseEditorHistoryReturn {
  /** Registrar un nuevo estado (push al historial) */
  pushSnapshot: (snapshot: EditorSnapshot) => void
  /** Deshacer (retorna snapshot anterior o null si no puede) */
  undo: () => EditorSnapshot | null
  /** Rehacer (retorna snapshot siguiente o null si no puede) */
  redo: () => EditorSnapshot | null
  /** ¿Se puede deshacer? */
  canUndo: boolean
  /** ¿Se puede rehacer? */
  canRedo: boolean
  /** Limpiar historial */
  clear: () => void
}

const MAX_HISTORY = 50

export function useEditorHistory(): UseEditorHistoryReturn {
  const history = useRef<EditorSnapshot[]>([])
  const currentIndex = useRef(-1)
  const [, forceRender] = useState(0)

  const trigger = useCallback(() => forceRender((n) => n + 1), [])

  const pushSnapshot = useCallback(
    (snapshot: EditorSnapshot) => {
      // Eliminar futuros (si hicimos undo y luego pushamos, perdemos redo)
      history.current = history.current.slice(0, currentIndex.current + 1)

      // Deep clone para evitar referencias compartidas
      const cloned: EditorSnapshot = {
        nodes: snapshot.nodes.map((n) => ({
          ...n,
          position: { ...n.position },
          size: { ...n.size },
        })),
        areas: snapshot.areas.map((a) => ({
          ...a,
          position: { ...a.position },
          size: { ...a.size },
        })),
        connectors: snapshot.connectors.map((c) => ({ ...c })),
      }

      history.current.push(cloned)

      // Truncar si excede máximo
      if (history.current.length > MAX_HISTORY) {
        history.current = history.current.slice(-MAX_HISTORY)
      }

      currentIndex.current = history.current.length - 1
      trigger()
    },
    [trigger]
  )

  const undo = useCallback((): EditorSnapshot | null => {
    if (currentIndex.current <= 0) return null
    currentIndex.current--
    trigger()
    return history.current[currentIndex.current]
  }, [trigger])

  const redo = useCallback((): EditorSnapshot | null => {
    if (currentIndex.current >= history.current.length - 1) return null
    currentIndex.current++
    trigger()
    return history.current[currentIndex.current]
  }, [trigger])

  const clear = useCallback(() => {
    history.current = []
    currentIndex.current = -1
    trigger()
  }, [trigger])

  return {
    pushSnapshot,
    undo,
    redo,
    canUndo: currentIndex.current > 0,
    canRedo: currentIndex.current < history.current.length - 1,
    clear,
  }
}
