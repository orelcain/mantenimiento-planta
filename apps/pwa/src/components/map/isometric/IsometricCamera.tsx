/**
 * IsometricCamera — Cámara ortográfica isométrica con rotación FFT
 * 
 * Implementa la rotación de 4 ángulos estilo Final Fantasy Tactics:
 * - Ángulo 0: Vista Sur-Oeste (clásica isométrica)
 * - Ángulo 1: Vista Sur-Este (rotación 90° horario)
 * - Ángulo 2: Vista Nor-Este (rotación 180°)
 * - Ángulo 3: Vista Nor-Oeste (rotación 270°)
 * 
 * Usa cámara ortográfica para eliminar perspectiva (aspecto isométrico puro).
 * Animación suave GSAP-style con spring interpolation entre ángulos.
 */

import { useRef, useEffect, useCallback } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { CameraAngle } from '@/types/isometricMap'
import { CAMERA_ANGLE_AZIMUTH, ISO_ELEVATION } from '@/types/isometricMap'

interface IsometricCameraProps {
  /** Ángulo actual (0-3) */
  angle: CameraAngle
  /** Nivel de zoom (unidades ortográficas) - menor = más zoom */
  zoom: number
  /** Centro de la planta (target) */
  target: [number, number, number]
  /** Offset de paneo adicional (plano XZ) */
  panOffset?: { x: number; z: number }
  /** Distancia de la cámara al centro */
  distance?: number
  /** Callback cuando termina la animación de rotación */
  onRotationComplete?: () => void
}

// Lerp suave con spring damping
function dampedLerp(current: number, target: number, damping: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-damping * dt))
}

// Normalizar ángulo a rango [0, 2π)
function normalizeAngle(a: number): number {
  return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
}

// Encontrar el camino más corto entre dos ángulos
function shortestAnglePath(from: number, to: number): number {
  const diff = normalizeAngle(to) - normalizeAngle(from)
  if (diff > Math.PI) return diff - 2 * Math.PI
  if (diff < -Math.PI) return diff + 2 * Math.PI
  return diff
}

export function IsometricCamera({
  angle,
  zoom,
  target,
  panOffset,
  distance = 100,
  onRotationComplete,
}: IsometricCameraProps) {
  const { camera, size } = useThree()
  const currentAzimuth = useRef(CAMERA_ANGLE_AZIMUTH[0])
  const targetAzimuth = useRef(CAMERA_ANGLE_AZIMUTH[0])
  const currentZoom = useRef(zoom)
  const isAnimating = useRef(false)
  const targetVec = useRef(new THREE.Vector3(...target))
  const currentPan = useRef({ x: panOffset?.x ?? 0, z: panOffset?.z ?? 0 })

  // Actualizar target del centro
  useEffect(() => {
    targetVec.current.set(...target)
  }, [target])

  // Cuando cambia el ángulo, calcular el nuevo azimut objetivo
  useEffect(() => {
    const newAzimuth = CAMERA_ANGLE_AZIMUTH[angle]
    const current = currentAzimuth.current
    // Usar el camino más corto
    targetAzimuth.current = current + shortestAnglePath(current, newAzimuth)
    isAnimating.current = true
  }, [angle])

  // Setup ortográfico inicial
  useEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) {
      camera.near = 0.1
      camera.far = 1000
      camera.zoom = 1
      camera.updateProjectionMatrix()
    }
  }, [camera])

  // Frame loop: interpolar posición de cámara y zoom
  useFrame((_, delta) => {
    if (!(camera instanceof THREE.OrthographicCamera)) return

    const dt = Math.min(delta, 0.1) // Cap delta para evitar saltos
    const DAMPING = 8 // Velocidad de la animación (mayor = más rápido)

    // Interpolar azimut
    currentAzimuth.current = dampedLerp(currentAzimuth.current, targetAzimuth.current, DAMPING, dt)

    // Detectar fin de animación
    if (isAnimating.current && Math.abs(currentAzimuth.current - targetAzimuth.current) < 0.001) {
      currentAzimuth.current = targetAzimuth.current
      isAnimating.current = false
      onRotationComplete?.()
    }

    // Interpolar zoom
    currentZoom.current = dampedLerp(currentZoom.current, zoom, DAMPING * 0.5, dt)

    // Interpolar pan offset
    const targetPanX = panOffset?.x ?? 0
    const targetPanZ = panOffset?.z ?? 0
    currentPan.current.x = dampedLerp(currentPan.current.x, targetPanX, DAMPING, dt)
    currentPan.current.z = dampedLerp(currentPan.current.z, targetPanZ, DAMPING, dt)

    // Calcular lookAt con pan offset aplicado
    const lookAtX = targetVec.current.x + currentPan.current.x
    const lookAtY = targetVec.current.y
    const lookAtZ = targetVec.current.z + currentPan.current.z

    // Calcular posición de la cámara en coordenadas esféricas
    const azimuth = currentAzimuth.current
    const elevation = ISO_ELEVATION

    const x = lookAtX + distance * Math.cos(elevation) * Math.sin(azimuth)
    const y = lookAtY + distance * Math.sin(elevation)
    const z = lookAtZ + distance * Math.cos(elevation) * Math.cos(azimuth)

    camera.position.set(x, y, z)
    camera.lookAt(lookAtX, lookAtY, lookAtZ)

    // Actualizar frustum ortográfico basado en zoom y aspect ratio
    const aspect = size.width / size.height
    const halfWidth = currentZoom.current * aspect
    const halfHeight = currentZoom.current

    camera.left = -halfWidth
    camera.right = halfWidth
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.zoom = 1
    camera.updateProjectionMatrix()
  })

  return null
}

/**
 * Hook para manejar la rotación de cámara con teclado
 * Q = rotar izquierda, E = rotar derecha
 */
export function useIsometricRotation(
  currentAngle: CameraAngle,
  onChange: (angle: CameraAngle) => void
) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault()
        const next = ((currentAngle - 1 + 4) % 4) as CameraAngle
        onChange(next)
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault()
        const next = ((currentAngle + 1) % 4) as CameraAngle
        onChange(next)
      }
    },
    [currentAngle, onChange]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
