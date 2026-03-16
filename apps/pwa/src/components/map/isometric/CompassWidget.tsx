/**
 * CompassWidget — Brújula visual 3D que rota con la cámara
 * 
 * Muestra N/S/E/O y gira según el ángulo de cámara actual.
 * Se posiciona sobre el canvas del visor.
 */

import { useMemo } from 'react'
import type { CameraAngle } from '@/types/isometricMap'
import { CAMERA_ANGLE_AZIMUTH } from '@/types/isometricMap'

interface CompassWidgetProps {
  cameraAngle?: CameraAngle
  rotationDeg?: number
}

export function CompassWidget({ cameraAngle, rotationDeg }: CompassWidgetProps) {
  const computedRotationDeg = useMemo(() => {
    if (typeof rotationDeg === 'number') return rotationDeg
    if (!cameraAngle) return 0
    const azimuthRad = CAMERA_ANGLE_AZIMUTH[cameraAngle]
    // Convert azimuth to rotation: 0 = looking from SW (45°), which means N is at top-right
    // We rotate the compass so that N always points geographic north relative to the camera
    return (azimuthRad * 180) / Math.PI - 45
  }, [cameraAngle, rotationDeg])

  return (
    <div className="relative w-16 h-16" title="Brújula — norte geográfico">
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full drop-shadow-lg"
        style={{ transform: `rotate(${-computedRotationDeg}deg)`, transition: 'transform 0.4s ease-out' }}
      >
        {/* Outer ring */}
        <circle cx="50" cy="50" r="46" fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />

        {/* Crosshair ticks */}
        {[0, 90, 180, 270].map((angle) => (
          <line
            key={angle}
            x1="50"
            y1="8"
            x2="50"
            y2="14"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="1"
            transform={`rotate(${angle} 50 50)`}
          />
        ))}

        {/* North pointer (red triangle) */}
        <polygon points="50,12 44,38 56,38" fill="#ef4444" opacity="0.9" />
        {/* South pointer (white triangle) */}
        <polygon points="50,88 44,62 56,62" fill="rgba(255,255,255,0.5)" />

        {/* Center dot */}
        <circle cx="50" cy="50" r="3" fill="rgba(255,255,255,0.6)" />

        {/* Labels */}
        <text x="50" y="9" textAnchor="middle" dominantBaseline="middle" fill="#ef4444" fontSize="11" fontWeight="bold">N</text>
        <text x="50" y="95" textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.5)" fontSize="9">S</text>
        <text x="95" y="52" textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.5)" fontSize="9">E</text>
        <text x="5" y="52" textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.5)" fontSize="9">O</text>
      </svg>
    </div>
  )
}
