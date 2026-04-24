/**
 * KonvaDxfViewer
 * Renderiza un MapaImportado (DXF parseado) usando Konva.
 * Fase 1: solo visualización + pan/zoom. Sin edición todavía.
 *
 * Arquitectura:
 *   Stage → 1 Layer por cada capa DXF → N Konva.Line por polilínea
 *
 * Controles:
 *   - Rueda del mouse: zoom centrado en cursor
 *   - Drag (click y arrastrar): panorámica
 *   - Botones +/−: zoom controlado
 *   - Botón "Ajustar": reencuadra al bbox completo
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Line } from 'react-konva'
import type Konva from 'konva'
import { Eye, EyeOff, Trash2, Upload, ChevronDown, Maximize2, Plus, Minus } from 'lucide-react'
import { useMapaLeafletStore, type MapaImportado } from '@/store/useMapaLeafletStore'

const BG = '#0a0e14'

// ── Utilidades ───────────────────────────────────────────────────────────────

function clamp(v: number, mn: number, mx: number) {
  return Math.max(mn, Math.min(mx, v))
}

// ── Panel de capas (reusable con el anterior pero adaptado a MapaImportado) ──

function PanelCapasKonva({ mapa }: { mapa: MapaImportado }) {
  const [open, setOpen]   = useState(true)
  const toggleVisible     = useMapaLeafletStore((s) => s.toggleCapaImportadaVisible)
  const eliminar          = useMapaLeafletStore((s) => s.eliminarCapaImportada)
  const deleteMapa        = useMapaLeafletStore((s) => s.deleteMapaImportado)
  const setActivo         = useMapaLeafletStore((s) => s.setMapaImportadoActivo)

  const capas = mapa.capas.filter((c) => !c.eliminada)

  return (
    <div className="absolute top-3 right-3 w-64 bg-gray-900/97 border border-gray-700/60 rounded-lg shadow-2xl z-[1000] text-gray-200 flex flex-col max-h-[calc(100%-24px)] overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/40 shrink-0">
        <Upload size={12} className="text-emerald-400 shrink-0" />
        <span className="text-[11px] font-semibold flex-1 truncate text-emerald-300">{mapa.nombre}</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-0.5 hover:bg-gray-800 rounded text-gray-600 hover:text-gray-300 transition-colors"
        >
          <ChevronDown size={12} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
      </div>

      {open && (
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
          <div className="text-[9px] text-gray-500 px-1 mb-1 uppercase tracking-wider font-semibold">
            {capas.length} capa{capas.length !== 1 ? 's' : ''}
          </div>
          {capas.map((c) => (
            <div key={c.name} className="flex items-center gap-1 group">
              <button
                onClick={() => toggleVisible(mapa.id, c.name)}
                className="flex-1 flex items-center gap-2 px-2 py-0.5 rounded text-left hover:bg-gray-800 transition-colors min-w-0"
              >
                {c.visible
                  ? <Eye size={10} className="text-gray-400 shrink-0" />
                  : <EyeOff size={10} className="text-gray-600 shrink-0" />}
                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
                <span className={`text-[10px] truncate ${c.visible ? 'text-gray-200' : 'text-gray-600'}`}>
                  {c.name}
                </span>
                <span className="text-[8px] font-mono text-gray-600 shrink-0">{c.entityCount}</span>
              </button>
              <button
                onClick={() => {
                  if (!window.confirm(`¿Eliminar capa "${c.name}"?`)) return
                  eliminar(mapa.id, c.name)
                }}
                className="shrink-0 p-0.5 hover:bg-red-900/60 rounded text-red-500 hover:text-red-300 transition-colors"
                title="Eliminar capa"
              >
                <Trash2 size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-gray-700/40 px-2 py-1.5 flex gap-1 shrink-0">
        <button
          onClick={() => {
            if (!window.confirm(`¿Eliminar el mapa "${mapa.nombre}" y todas sus capas?`)) return
            deleteMapa(mapa.id)
            setActivo(null)
          }}
          className="flex-1 flex items-center justify-center gap-1 text-[9px] py-1 bg-red-900/20 hover:bg-red-900/40 border border-red-800/40 text-red-400 rounded transition-colors"
        >
          <Trash2 size={9} /> Eliminar mapa
        </button>
      </div>
    </div>
  )
}

// ── Vista principal ──────────────────────────────────────────────────────────

interface Props {
  mapa: MapaImportado
}

export function KonvaDxfViewer({ mapa }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef     = useRef<Konva.Stage | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [scale, setScale] = useState(1)
  const [pos, setPos]     = useState({ x: 0, y: 0 })

  // Tamaño del contenedor (responsive)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const capasVisibles = useMemo(
    () => mapa.capas.filter((c) => !c.eliminada && c.visible),
    [mapa.capas]
  )

  // Fit bbox al montar / al cambiar mapa
  useEffect(() => {
    if (!size.w || !size.h) return
    const [minX, minY, maxX, maxY] = mapa.bbox
    const w = maxX - minX || 1
    const h = maxY - minY || 1
    const pad = 0.92
    const s = Math.min((size.w * pad) / w, (size.h * pad) / h)

    // DXF Y va hacia arriba. Konva Y va hacia abajo. Para que el dibujo
    // no salga invertido, escalamos en Y con signo negativo.
    // Centramos el bbox en el viewport.
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setScale(s)
    setPos({
      x: size.w / 2 - cx * s,
      y: size.h / 2 + cy * s,   // +cy*s porque Y está invertida (scaleY = -s)
    })
  }, [mapa.id, mapa.bbox, size.w, size.h])

  // Zoom con rueda centrado en cursor
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const oldScale = scale
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const direction = e.evt.deltaY > 0 ? -1 : 1
    const factor = direction > 0 ? 1.15 : 1 / 1.15
    const newScale = clamp(oldScale * factor, 0.01, 5000)

    // Mantener el punto bajo el cursor fijo
    const mx = (pointer.x - pos.x) / oldScale
    const my = (pointer.y - pos.y) / (-oldScale)   // Y invertida
    setScale(newScale)
    setPos({
      x: pointer.x - mx * newScale,
      y: pointer.y + my * newScale,
    })
  }

  // Drag = pan
  const onDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    setPos({ x: e.target.x(), y: e.target.y() })
  }

  function fitToBbox() {
    if (!size.w || !size.h) return
    const [minX, minY, maxX, maxY] = mapa.bbox
    const w = maxX - minX || 1
    const h = maxY - minY || 1
    const pad = 0.92
    const s = Math.min((size.w * pad) / w, (size.h * pad) / h)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setScale(s)
    setPos({ x: size.w / 2 - cx * s, y: size.h / 2 + cy * s })
  }

  function zoomBy(factor: number) {
    const newScale = clamp(scale * factor, 0.01, 5000)
    // Zoom centrado en el viewport
    const cx = size.w / 2
    const cy = size.h / 2
    const mx = (cx - pos.x) / scale
    const my = (cy - pos.y) / (-scale)
    setScale(newScale)
    setPos({ x: cx - mx * newScale, y: cy + my * newScale })
  }

  return (
    <div ref={containerRef} className="absolute inset-0" style={{ background: BG }}>
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        draggable
        x={pos.x}
        y={pos.y}
        scaleX={scale}
        scaleY={-scale}   /* invertir Y: DXF arriba, Konva abajo */
        onWheel={onWheel}
        onDragEnd={onDragEnd}
      >
        {capasVisibles.map((capa) => (
          <Layer key={capa.name} listening={false}>
            {capa.polylines.map((poly, i) => {
              // Konva.Line acepta [x0,y0,x1,y1,...] plano
              const flat: number[] = []
              for (const [x, y] of poly) { flat.push(x, y) }
              return (
                <Line
                  key={i}
                  points={flat}
                  stroke={capa.color}
                  strokeWidth={1}
                  strokeScaleEnabled={false}
                  perfectDrawEnabled={false}
                  listening={false}
                  lineCap="round"
                  lineJoin="round"
                />
              )
            })}
          </Layer>
        ))}
      </Stage>

      {/* Controles de zoom */}
      <div className="absolute top-3 left-3 flex flex-col gap-1 z-[500]">
        <button
          onClick={() => zoomBy(1.25)}
          className="w-8 h-8 flex items-center justify-center bg-gray-900/90 hover:bg-gray-800 border border-gray-700 rounded text-gray-200"
          title="Acercar"
        >
          <Plus size={14} />
        </button>
        <button
          onClick={() => zoomBy(0.8)}
          className="w-8 h-8 flex items-center justify-center bg-gray-900/90 hover:bg-gray-800 border border-gray-700 rounded text-gray-200"
          title="Alejar"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={fitToBbox}
          className="w-8 h-8 flex items-center justify-center bg-gray-900/90 hover:bg-gray-800 border border-gray-700 rounded text-amber-400"
          title="Ajustar al mapa"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      {/* Indicador de zoom */}
      <div className="absolute bottom-3 left-3 text-[10px] text-gray-500 font-mono bg-gray-900/80 px-2 py-0.5 rounded">
        zoom {scale.toFixed(2)}×
      </div>

      <PanelCapasKonva mapa={mapa} />
    </div>
  )
}
