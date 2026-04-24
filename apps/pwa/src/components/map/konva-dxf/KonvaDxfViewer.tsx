/**
 * KonvaDxfViewer
 * Visor + editor de un MapaImportado (DXF parseado).
 *
 * Fase 1: visualización con pan/zoom ✅
 * Fase 2: edición — selección, borrar, mover, deshacer ← ACTUAL
 *
 * Modos (herramientas):
 *   - Pan     : arrastrar el mapa (default)
 *   - Select  : click sobre entidades para seleccionar, drag para mover
 *
 * Atajos:
 *   - S        → modo Select
 *   - H / V    → modo Pan
 *   - Delete   → borrar seleccionadas
 *   - Escape   → deseleccionar
 *   - Ctrl/⌘+Z → deshacer último cambio
 *   - Flechas  → mover selección (Shift = ×10, Ctrl = ÷10)
 *   - Shift+click → multi-selección
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Stage, Layer, Line } from 'react-konva'
import type Konva from 'konva'
import {
  Eye, EyeOff, Trash2, Upload, ChevronDown, Maximize2, Plus, Minus,
  MousePointer2, Hand, Undo2, X as XIcon,
} from 'lucide-react'
import { useMapaLeafletStore, type MapaImportado, type CapaImportada } from '@/store/useMapaLeafletStore'

const BG = '#0a0e14'
const SELECTED_STROKE = '#f59e0b'
const HOVER_STROKE = '#fbbf24'
const MAX_HISTORY = 20

type Tool = 'pan' | 'select'

// ── Utilidades ───────────────────────────────────────────────────────────────

function clamp(v: number, mn: number, mx: number) {
  return Math.max(mn, Math.min(mx, v))
}

function polyId(capaName: string, idx: number) {
  return `${capaName}:${idx}`
}

function parseId(id: string): { capaName: string; idx: number } {
  const i = id.lastIndexOf(':')
  return { capaName: id.slice(0, i), idx: parseInt(id.slice(i + 1), 10) }
}

/** Bbox robusto que descarta polilíneas outlier. Ver Fase 1 para detalle. */
function computeRobustBbox(mapa: MapaImportado): [number, number, number, number] {
  const centros: Array<{ cx: number; cy: number; poly: [number, number][] }> = []
  for (const capa of mapa.capas) {
    if (capa.eliminada) continue
    for (const poly of capa.polylines) {
      if (!poly.length) continue
      let sx = 0, sy = 0
      for (const [x, y] of poly) { sx += x; sy += y }
      centros.push({ cx: sx / poly.length, cy: sy / poly.length, poly })
    }
  }
  if (!centros.length) return mapa.bbox

  const xs = centros.map((c) => c.cx).sort((a, b) => a - b)
  const ys = centros.map((c) => c.cy).sort((a, b) => a - b)
  const medX = xs[Math.floor(xs.length / 2)]!
  const medY = ys[Math.floor(ys.length / 2)]!
  const devX = centros.map((c) => Math.abs(c.cx - medX)).sort((a, b) => a - b)
  const devY = centros.map((c) => Math.abs(c.cy - medY)).sort((a, b) => a - b)
  const madX = Math.max(devX[Math.floor(devX.length / 2)]!, 1)
  const madY = Math.max(devY[Math.floor(devY.length / 2)]!, 1)
  const UMBRAL = 15
  const insiders = centros.filter(
    (c) => Math.abs(c.cx - medX) <= UMBRAL * madX && Math.abs(c.cy - medY) <= UMBRAL * madY,
  )
  const pool = insiders.length ? insiders : centros

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const { poly } of pool) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (!isFinite(minX)) return mapa.bbox
  const padX = (maxX - minX) * 0.02
  const padY = (maxY - minY) * 0.02
  return [minX - padX, minY - padY, maxX + padX, maxY + padY]
}

// ── Panel de capas ───────────────────────────────────────────────────────────

function PanelCapasKonva({ mapa }: { mapa: MapaImportado }) {
  const [open, setOpen]   = useState(true)
  const toggleVisible     = useMapaLeafletStore((s) => s.toggleCapaImportadaVisible)
  const eliminar          = useMapaLeafletStore((s) => s.eliminarCapaImportada)
  const deleteMapa        = useMapaLeafletStore((s) => s.deleteMapaImportado)
  const setActivo         = useMapaLeafletStore((s) => s.setMapaImportadoActivo)

  const capas = mapa.capas.filter((c) => !c.eliminada)

  return (
    <div className="absolute top-3 right-3 w-64 bg-gray-900/97 border border-gray-700/60 rounded-lg shadow-2xl z-[1000] text-gray-200 flex flex-col max-h-[calc(100%-24px)] overflow-hidden">
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
                <span className="text-[8px] font-mono text-gray-600 shrink-0">{c.polylines.length}</span>
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

  // Editor state
  const [tool, setTool] = useState<Tool>('pan')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const historyRef = useRef<CapaImportada[][]>([])

  const setCapasMapa = useMapaLeafletStore((s) => s.setCapasMapaImportado)

  // ── Tamaño responsive ──────────────────────────────────────────────────────
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

  const robustBbox = useMemo(() => computeRobustBbox(mapa), [mapa])

  // Fit bbox al montar / al cambiar mapa
  useEffect(() => {
    if (!size.w || !size.h) return
    const [minX, minY, maxX, maxY] = robustBbox
    const w = maxX - minX || 1
    const h = maxY - minY || 1
    const pad = 0.92
    const s = Math.min((size.w * pad) / w, (size.h * pad) / h)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setScale(s)
    setPos({
      x: size.w / 2 - cx * s,
      y: size.h / 2 + cy * s,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa.id, size.w, size.h])

  // ── Historial (undo) ───────────────────────────────────────────────────────

  const pushHistory = useCallback(() => {
    historyRef.current.push(mapa.capas)
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift()
  }, [mapa.capas])

  const undo = useCallback(() => {
    const prev = historyRef.current.pop()
    if (prev) {
      setCapasMapa(mapa.id, prev)
      setSelectedIds(new Set())
    }
  }, [mapa.id, setCapasMapa])

  // ── Mutaciones ─────────────────────────────────────────────────────────────

  /** Borra las polilíneas seleccionadas. Si una capa queda sin polilíneas, se conserva. */
  const deleteSelected = useCallback(() => {
    if (!selectedIds.size) return
    pushHistory()
    // Agrupar IDs por capa
    const porCapa = new Map<string, Set<number>>()
    for (const id of selectedIds) {
      const { capaName, idx } = parseId(id)
      if (!porCapa.has(capaName)) porCapa.set(capaName, new Set())
      porCapa.get(capaName)!.add(idx)
    }
    const nuevas = mapa.capas.map((c) => {
      const indices = porCapa.get(c.name)
      if (!indices) return c
      const polylines = c.polylines.filter((_, i) => !indices.has(i))
      return { ...c, polylines, entityCount: polylines.length }
    })
    setCapasMapa(mapa.id, nuevas)
    setSelectedIds(new Set())
  }, [selectedIds, mapa.capas, mapa.id, setCapasMapa, pushHistory])

  /** Mueve las polilíneas seleccionadas por (dx, dy) en unidades del DXF. */
  const moveSelected = useCallback((dx: number, dy: number) => {
    if (!selectedIds.size) return
    pushHistory()
    const porCapa = new Map<string, Set<number>>()
    for (const id of selectedIds) {
      const { capaName, idx } = parseId(id)
      if (!porCapa.has(capaName)) porCapa.set(capaName, new Set())
      porCapa.get(capaName)!.add(idx)
    }
    const nuevas = mapa.capas.map((c) => {
      const indices = porCapa.get(c.name)
      if (!indices) return c
      const polylines = c.polylines.map((poly, i) => {
        if (!indices.has(i)) return poly
        return poly.map(([x, y]) => [x + dx, y + dy] as [number, number])
      })
      return { ...c, polylines }
    })
    setCapasMapa(mapa.id, nuevas)
  }, [selectedIds, mapa.capas, mapa.id, setCapasMapa, pushHistory])

  // ── Atajos de teclado ──────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // No interferir con inputs
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelected()
        return
      }
      if (e.key === 'Escape') {
        setSelectedIds(new Set())
        setTool('pan')
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if (e.key === 's' || e.key === 'S') { setTool('select'); return }
      if (e.key === 'h' || e.key === 'H' || e.key === 'v' || e.key === 'V') { setTool('pan'); return }

      // Flechas: mover selección
      if (selectedIds.size) {
        const base = e.shiftKey ? 10 : (e.ctrlKey || e.metaKey ? 0.1 : 1)
        let dx = 0, dy = 0
        if (e.key === 'ArrowRight') dx = base
        else if (e.key === 'ArrowLeft') dx = -base
        else if (e.key === 'ArrowUp') dy = base
        else if (e.key === 'ArrowDown') dy = -base
        if (dx || dy) {
          e.preventDefault()
          moveSelected(dx, dy)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteSelected, undo, moveSelected, selectedIds.size])

  // ── Interacción con el Stage ───────────────────────────────────────────────

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const oldScale = scale
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const factor = e.evt.deltaY > 0 ? 1 / 1.15 : 1.15
    const newScale = clamp(oldScale * factor, 0.01, 5000)
    const mx = (pointer.x - pos.x) / oldScale
    const my = (pointer.y - pos.y) / (-oldScale)
    setScale(newScale)
    setPos({ x: pointer.x - mx * newScale, y: pointer.y + my * newScale })
  }

  const onStageDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target === stageRef.current) {
      setPos({ x: e.target.x(), y: e.target.y() })
    }
  }

  /** Click sobre el Stage vacío → limpia selección (si estamos en select). */
  const onStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (tool !== 'select') return
    if (e.target === stageRef.current) {
      setSelectedIds(new Set())
    }
  }

  /** Click sobre una polilínea → toggle en la selección. */
  const onLineClick = (id: string, shift: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (shift) {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      } else {
        if (next.size === 1 && next.has(id)) {
          next.clear()
        } else {
          next.clear()
          next.add(id)
        }
      }
      return next
    })
  }

  // ── Controles de zoom ──────────────────────────────────────────────────────

  function fitToBbox() {
    if (!size.w || !size.h) return
    const [minX, minY, maxX, maxY] = robustBbox
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
    const cx = size.w / 2
    const cy = size.h / 2
    const mx = (cx - pos.x) / scale
    const my = (cy - pos.y) / (-scale)
    setScale(newScale)
    setPos({ x: cx - mx * newScale, y: cy + my * newScale })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const selectMode = tool === 'select'
  const cursor = selectMode ? 'default' : 'grab'

  return (
    <div ref={containerRef} className="absolute inset-0" style={{ background: BG, cursor }}>
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        draggable={tool === 'pan'}
        x={pos.x}
        y={pos.y}
        scaleX={scale}
        scaleY={-scale}
        onWheel={onWheel}
        onDragEnd={onStageDragEnd}
        onClick={onStageClick}
      >
        {capasVisibles.map((capa) => (
          <Layer key={capa.name} listening={selectMode}>
            {capa.polylines.map((poly, i) => {
              const id = polyId(capa.name, i)
              const isSel = selectedIds.has(id)
              const isHover = hoveredId === id
              const flat: number[] = []
              for (const [x, y] of poly) { flat.push(x, y) }
              const stroke = isSel ? SELECTED_STROKE : isHover ? HOVER_STROKE : capa.color
              const strokeW = isSel ? 2 : 1
              return (
                <Line
                  key={i}
                  points={flat}
                  stroke={stroke}
                  strokeWidth={strokeW}
                  strokeScaleEnabled={false}
                  perfectDrawEnabled={false}
                  listening={selectMode}
                  hitStrokeWidth={6}  /* área de click un poco más ancha para precisión */
                  lineCap="round"
                  lineJoin="round"
                  onClick={selectMode ? (e) => {
                    e.cancelBubble = true
                    onLineClick(id, e.evt.shiftKey)
                  } : undefined}
                  onMouseEnter={selectMode ? () => setHoveredId(id) : undefined}
                  onMouseLeave={selectMode ? () => setHoveredId(null) : undefined}
                />
              )
            })}
          </Layer>
        ))}
      </Stage>

      {/* Toolbar de herramientas */}
      <div className="absolute top-3 left-3 flex flex-col gap-1 z-[500]">
        <button
          onClick={() => setTool('pan')}
          className={`w-8 h-8 flex items-center justify-center border rounded transition-colors ${
            tool === 'pan'
              ? 'bg-amber-600 border-amber-500 text-white'
              : 'bg-gray-900/90 hover:bg-gray-800 border-gray-700 text-gray-200'
          }`}
          title="Pan (H)"
        >
          <Hand size={14} />
        </button>
        <button
          onClick={() => setTool('select')}
          className={`w-8 h-8 flex items-center justify-center border rounded transition-colors ${
            tool === 'select'
              ? 'bg-amber-600 border-amber-500 text-white'
              : 'bg-gray-900/90 hover:bg-gray-800 border-gray-700 text-gray-200'
          }`}
          title="Seleccionar (S)"
        >
          <MousePointer2 size={14} />
        </button>

        <div className="h-px bg-gray-700 my-1" />

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

      {/* Barra inferior con acciones sobre selección */}
      {selectMode && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-gray-900/95 border border-gray-700 rounded-lg px-3 py-1.5 z-[500] shadow-xl">
          <span className="text-[10px] text-gray-400 font-mono">
            {selectedIds.size} seleccionada{selectedIds.size === 1 ? '' : 's'}
          </span>
          <button
            onClick={undo}
            disabled={!historyRef.current.length}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-200 rounded transition-colors"
            title="Deshacer (Ctrl+Z)"
          >
            <Undo2 size={11} /> Deshacer
          </button>
          <button
            onClick={deleteSelected}
            disabled={!selectedIds.size}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-red-900/40 hover:bg-red-900/60 disabled:opacity-30 disabled:cursor-not-allowed border border-red-700/40 text-red-300 rounded transition-colors"
            title="Borrar selección (Del)"
          >
            <Trash2 size={11} /> Borrar
          </button>
          {selectedIds.size > 0 && (
            <button
              onClick={() => setSelectedIds(new Set())}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition-colors"
              title="Deseleccionar (Esc)"
            >
              <XIcon size={11} />
            </button>
          )}
          <span className="text-[9px] text-gray-500 ml-2">Flechas = mover · Shift ×10 · Ctrl ÷10</span>
        </div>
      )}

      {/* Indicador de zoom */}
      <div className="absolute bottom-3 left-3 text-[10px] text-gray-500 font-mono bg-gray-900/80 px-2 py-0.5 rounded">
        zoom {scale.toFixed(2)}×
      </div>

      <PanelCapasKonva mapa={mapa} />
    </div>
  )
}
