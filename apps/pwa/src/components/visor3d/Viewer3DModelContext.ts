import { createContext, useContext } from 'react'
import * as THREE from 'three'

export interface Viewer3DModelInfo {
  center: THREE.Vector3
  size: THREE.Vector3
  maxDim: number
}

export interface Viewer3DModelContextValue {
  object: THREE.Object3D | null
  info: Viewer3DModelInfo | null
}

export const Viewer3DModelContext = createContext<Viewer3DModelContextValue>({
  object: null,
  info: null,
})

export function useViewer3DModelContext(): Viewer3DModelContextValue {
  return useContext(Viewer3DModelContext)
}