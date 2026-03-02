import { useCallback, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { IsometricViewerState, MapArea, MapConnector, MapNode } from '@/types/isometricMap'
import type { EditorTool } from './EditorToolbar'

interface EditorSnapshot {
  nodes: MapNode[]
  areas: MapArea[]
  connectors: MapConnector[]
}

interface UseMapEditorActionsParams {
  isEditMode: boolean
  selectedNodeId: string | null
  nodes: MapNode[]
  connectors: MapConnector[]
  commitEditorChange: (newNodes: MapNode[], newAreas?: MapArea[], newConnectors?: MapConnector[]) => void
  setViewerState: Dispatch<SetStateAction<IsometricViewerState>>
  setNodes: Dispatch<SetStateAction<MapNode[]>>
  setAreas: Dispatch<SetStateAction<MapArea[]>>
  setConnectors: Dispatch<SetStateAction<MapConnector[]>>
  setHasUnsavedChanges: Dispatch<SetStateAction<boolean>>
  setEditorTool: Dispatch<SetStateAction<EditorTool>>
  setSnapEnabled: Dispatch<SetStateAction<boolean>>
  history: {
    undo: () => EditorSnapshot | null
    redo: () => EditorSnapshot | null
  }
  zoomIn: () => void
  zoomOut: () => void
  resetView: () => void
}

export function useMapEditorActions({
  isEditMode,
  selectedNodeId,
  nodes,
  connectors,
  commitEditorChange,
  setViewerState,
  setNodes,
  setAreas,
  setConnectors,
  setHasUnsavedChanges,
  setEditorTool,
  setSnapEnabled,
  history,
  zoomIn,
  zoomOut,
  resetView,
}: UseMapEditorActionsParams) {
  const handleDeleteSelected = useCallback(() => {
    if (!selectedNodeId) return
    const newNodes = nodes.filter((node) => node.id !== selectedNodeId)
    const newConnectors = connectors.filter(
      (connector) => connector.fromNodeId !== selectedNodeId && connector.toNodeId !== selectedNodeId
    )
    commitEditorChange(newNodes, undefined, newConnectors)
    setViewerState((prev) => ({ ...prev, selectedNodeId: null }))
  }, [selectedNodeId, nodes, connectors, commitEditorChange, setViewerState])

  const handleDuplicateSelected = useCallback(() => {
    if (!selectedNodeId) return
    const source = nodes.find((node) => node.id === selectedNodeId)
    if (!source) return

    const newNode: MapNode = {
      ...source,
      id: `node-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      label: `${source.label} (copia)`,
      position: {
        x: source.position.x + 2,
        y: source.position.y,
        z: source.position.z + 2,
      },
    }

    commitEditorChange([...nodes, newNode])
    setViewerState((prev) => ({ ...prev, selectedNodeId: newNode.id }))
  }, [selectedNodeId, nodes, commitEditorChange, setViewerState])

  const handleRotateSelected = useCallback(() => {
    if (!selectedNodeId) return
    const newNodes = nodes.map((node) =>
      node.id === selectedNodeId
        ? { ...node, rotation: (node.rotation + 90) % 360 }
        : node
    )
    commitEditorChange(newNodes)
  }, [selectedNodeId, nodes, commitEditorChange])

  const handleUndo = useCallback(() => {
    const snapshot = history.undo()
    if (!snapshot) return
    setNodes(snapshot.nodes)
    setAreas(snapshot.areas)
    setConnectors(snapshot.connectors)
    setHasUnsavedChanges(true)
  }, [history, setNodes, setAreas, setConnectors, setHasUnsavedChanges])

  const handleRedo = useCallback(() => {
    const snapshot = history.redo()
    if (!snapshot) return
    setNodes(snapshot.nodes)
    setAreas(snapshot.areas)
    setConnectors(snapshot.connectors)
    setHasUnsavedChanges(true)
  }, [history, setNodes, setAreas, setConnectors, setHasUnsavedChanges])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (isEditMode && (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        handleUndo()
        return
      }
      if (isEditMode && (e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        handleRedo()
        return
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (isEditMode) {
        switch (e.key) {
          case 'v':
          case 'V':
            e.preventDefault()
            setEditorTool('select')
            return
          case 'm':
          case 'M':
            e.preventDefault()
            setEditorTool('move')
            return
          case 'a':
          case 'A':
            e.preventDefault()
            setEditorTool('add')
            return
          case 'b':
          case 'B':
            e.preventDefault()
            setEditorTool('bulldozer')
            return
          case 'g':
          case 'G':
            e.preventDefault()
            setSnapEnabled((prev) => !prev)
            return
          case 't':
          case 'T':
            e.preventDefault()
            handleRotateSelected()
            return
          case 'Delete':
          case 'Backspace':
            e.preventDefault()
            handleDeleteSelected()
            return
          case 'd':
          case 'D':
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault()
              handleDuplicateSelected()
              return
            }
            break
        }
      }

      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault()
          zoomIn()
          break
        case '-':
          e.preventDefault()
          zoomOut()
          break
        case 'r':
        case 'R':
          if (!isEditMode) {
            e.preventDefault()
            resetView()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [
    isEditMode,
    handleUndo,
    handleRedo,
    setEditorTool,
    setSnapEnabled,
    handleRotateSelected,
    handleDeleteSelected,
    handleDuplicateSelected,
    zoomIn,
    zoomOut,
    resetView,
  ])

  return {
    handleDeleteSelected,
    handleDuplicateSelected,
    handleRotateSelected,
    handleUndo,
    handleRedo,
  }
}
