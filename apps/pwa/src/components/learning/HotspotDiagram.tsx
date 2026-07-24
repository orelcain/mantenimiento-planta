/**
 * HotspotDiagram — diagrama con puntos de referencia numerados. Toca un punto
 * para desplegar su nota (nombre + descripción corta). Pensado para despieces
 * de equipo (partes, sensores, puntos de riesgo) dentro del "dossier de campo".
 *
 * No depende de una imagen real: recibe un `stageSvg` (ilustración plana, ej. un
 * bosquejo del equipo) y una lista de puntos posicionados en % sobre ese stage.
 */
import { useState } from 'react'

export interface HotspotPoint {
  id: string
  /** Posición horizontal, 0–100 (%). */
  x: number
  /** Posición vertical, 0–100 (%). */
  y: number
  label: string
  description: string
}

export function HotspotDiagram({
  points,
  stageSvg,
  height = 220,
}: {
  points: HotspotPoint[]
  /** Ilustración de fondo del stage (SVG plano, sin colores de marca). */
  stageSvg?: React.ReactNode
  height?: number
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const active = points.find(p => p.id === openId)

  return (
    <div className="dp-hotspot">
      <div className="dp-hotspot-stage" style={{ height }}>
        {stageSvg}
        {points.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className="dp-hotspot-point"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            aria-pressed={openId === p.id}
            aria-label={p.label}
            onClick={() => setOpenId(openId === p.id ? null : p.id)}
          >
            {i + 1}
          </button>
        ))}
        {active && (
          <div
            className="dp-hotspot-tip"
            style={{
              left: `${Math.min(active.x + 4, 62)}%`,
              top: `${Math.min(active.y + 6, 68)}%`,
            }}
          >
            <span className="dp-lbl">{active.label}</span>
            {active.description}
          </div>
        )}
      </div>
      <div className="dp-hotspot-legend">
        {points.map((p, i) => (
          <span key={p.id}><b>{i + 1}</b>{p.label}</span>
        ))}
      </div>
    </div>
  )
}
