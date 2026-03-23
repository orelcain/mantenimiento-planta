/**
 * UnderlayImage — Base-map raster image draped on the ground plane.
 *
 * Handles texture loading, display-mode styling (original / soft-light / blueprint),
 * frame outline, and drag-based move/scale/rotate interaction.
 */

import { useCallback, useEffect, useMemo } from 'react'
import { useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { IsometricMapConfig } from '@/types/isometricMap'

export interface UnderlayImageProps {
  imageUrl: string
  displayMode?: 'original' | 'soft-light' | 'blueprint'
  opacity?: number
  width?: number
  depth?: number
  offset?: { x: number; z: number }
  rotation?: number
  interactionMode?: 'move' | 'scale' | 'rotate' | null
  onTransform?: (next: {
    width?: number
    depth?: number
    offsetX?: number
    offsetZ?: number
    rotation?: number
  }) => void
  config: IsometricMapConfig
}

export function UnderlayImage({
  imageUrl,
  displayMode,
  opacity,
  width: underlayWidth,
  depth: underlayDepth,
  offset,
  rotation: underlayRotation,
  interactionMode,
  onTransform,
  config,
}: UnderlayImageProps) {
  const { gl } = useThree()

  const dragState = useMemo(() => ({ current: null as null | {
    mode: 'move' | 'scale' | 'rotate'
    startPoint: { x: number; z: number }
    startOffsetX: number
    startOffsetZ: number
    startWidth: number
    startDepth: number
    startRotation: number
    startDistance: number
    startAngle: number
  } }), [])

  const texture = useLoader(
    THREE.TextureLoader,
    imageUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
  )

  const style = useMemo(() => {
    const baseOpacity = Math.max(0.05, Math.min(opacity ?? 0.5, 1))

    if (displayMode === 'original') {
      return { tint: '#ffffff', planeOpacity: baseOpacity, backdropOpacity: 0, backdropColor: '#000000', frameOpacity: 0, frameColor: '#ffffff' }
    }
    if (displayMode === 'blueprint') {
      return { tint: '#a7e3ff', planeOpacity: Math.min(0.34, baseOpacity * 0.72), backdropOpacity: 0.16, backdropColor: '#07273a', frameOpacity: 0.32, frameColor: '#6dd3ff' }
    }
    return { tint: '#e5eef5', planeOpacity: Math.min(0.42, baseOpacity * 0.8), backdropOpacity: 0.12, backdropColor: '#08131d', frameOpacity: 0.22, frameColor: '#b8cad8' }
  }, [displayMode, opacity])

  const w = underlayWidth ?? config.width
  const d = underlayDepth ?? config.depth

  const frameGeometry = useMemo(() => {
    const hw = w / 2, hd = d / 2
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-hw, 0.03, -hd),
      new THREE.Vector3(hw, 0.03, -hd),
      new THREE.Vector3(hw, 0.03, hd),
      new THREE.Vector3(-hw, 0.03, hd),
      new THREE.Vector3(-hw, 0.03, -hd),
    ])
  }, [w, d])

  const frameLine = useMemo(() => {
    if (style.frameOpacity <= 0) return null
    return new THREE.Line(frameGeometry, new THREE.LineBasicMaterial({ color: style.frameColor, transparent: true, opacity: style.frameOpacity, depthWrite: false }))
  }, [frameGeometry, style.frameColor, style.frameOpacity])

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    texture.needsUpdate = true
  }, [gl, texture])

  const handlePointerDown = useCallback((event: { stopPropagation: () => void; point: THREE.Vector3 }) => {
    if (!interactionMode || !onTransform) return
    event.stopPropagation()
    const cx = offset?.x ?? 0, cz = offset?.z ?? 0
    const dx = event.point.x - cx, dz = event.point.z - cz
    dragState.current = {
      mode: interactionMode, startPoint: { x: event.point.x, z: event.point.z },
      startOffsetX: cx, startOffsetZ: cz, startWidth: w, startDepth: d,
      startRotation: underlayRotation ?? 0,
      startDistance: Math.max(1, Math.hypot(dx, dz)), startAngle: Math.atan2(dz, dx),
    }
  }, [interactionMode, onTransform, offset?.x, offset?.z, w, d, underlayRotation, dragState])

  const handlePointerMove = useCallback((event: { stopPropagation: () => void; point: THREE.Vector3; buttons: number }) => {
    const drag = dragState.current
    if (!drag || !onTransform || event.buttons !== 1) return
    event.stopPropagation()
    if (drag.mode === 'move') {
      onTransform({ offsetX: Math.round((drag.startOffsetX + (event.point.x - drag.startPoint.x)) * 10) / 10, offsetZ: Math.round((drag.startOffsetZ + (event.point.z - drag.startPoint.z)) * 10) / 10 })
      return
    }
    const cdx = event.point.x - drag.startOffsetX, cdz = event.point.z - drag.startOffsetZ
    if (drag.mode === 'scale') {
      const factor = Math.max(0.1, Math.max(1, Math.hypot(cdx, cdz)) / drag.startDistance)
      onTransform({ width: Math.max(1, Math.round(drag.startWidth * factor)), depth: Math.max(1, Math.round(drag.startDepth * factor)) })
      return
    }
    const deltaAngle = (Math.atan2(cdz, cdx) - drag.startAngle) * (180 / Math.PI)
    onTransform({ rotation: Math.round((drag.startRotation + deltaAngle) * 10) / 10 })
  }, [onTransform, dragState])

  const handlePointerUp = useCallback((event: { stopPropagation: () => void }) => {
    if (!dragState.current) return
    event.stopPropagation()
    dragState.current = null
  }, [dragState])

  return (
    <group
      rotation-x={-Math.PI / 2}
      rotation-z={((underlayRotation ?? 0) * Math.PI) / 180}
      position={[offset?.x ?? 0, -0.02, offset?.z ?? 0]}
    >
      {style.backdropOpacity > 0 && (
        <mesh position={[0, 0.003, 0]}>
          <planeGeometry args={[w * 1.02, d * 1.02]} />
          <meshBasicMaterial color={style.backdropColor} transparent opacity={style.backdropOpacity} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      <mesh
        raycast={interactionMode ? undefined : () => null}
        onPointerDown={interactionMode ? handlePointerDown : undefined}
        onPointerMove={interactionMode ? handlePointerMove : undefined}
        onPointerUp={interactionMode ? handlePointerUp : undefined}
        onPointerLeave={interactionMode ? handlePointerUp : undefined}
      >
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial map={texture} color={style.tint} transparent opacity={style.planeOpacity} toneMapped={false} depthWrite={false} />
      </mesh>
      {frameLine && <primitive object={frameLine} />}
    </group>
  )
}
