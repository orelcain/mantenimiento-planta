import { useCallback, useState } from 'react'

export type EditorOverlay =
  | 'none'
  | 'add-equipment'
  | 'area-editor'
  | 'area-manager'
  | 'shape-editor'

export function useEditorOverlayState() {
  const [activeOverlay, setActiveOverlay] = useState<EditorOverlay>('none')

  const openOverlay = useCallback((overlay: Exclude<EditorOverlay, 'none'>) => {
    setActiveOverlay(overlay)
  }, [])

  const closeOverlay = useCallback(() => {
    setActiveOverlay('none')
  }, [])

  const closeOverlayIf = useCallback((overlay: Exclude<EditorOverlay, 'none'>) => {
    setActiveOverlay((prev) => (prev === overlay ? 'none' : prev))
  }, [])

  return {
    activeOverlay,
    isOverlayOpen: (overlay: Exclude<EditorOverlay, 'none'>) => activeOverlay === overlay,
    openOverlay,
    closeOverlay,
    closeOverlayIf,
  }
}
