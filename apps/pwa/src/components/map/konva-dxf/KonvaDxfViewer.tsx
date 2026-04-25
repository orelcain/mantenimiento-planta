/**
 * KonvaDxfViewer v2 — renderer optimizado con sceneFunc
 *
 * Fase 1: visualización (pan/zoom) ✅
 * Fase 2: edición (select/delete/move/undo) ✅
 * Fase 2.1: render sceneFunc — 1 Shape por capa en lugar de N Lines ✅
 *   Antes: 80k+ Konva.Line → 80k nodos React, reconciliación por cada setState
 *   Ahora: 1 Konva.Shape por capa con sceneFunc (pasada única de canvas)
 *   Speedup esperado: 50-100×
 *
 * Hit detection: Stage-level click/mousemove → distancia punto-segmento custom
 *   (umbral HIT_PX en píxeles de pantalla, convertido a unidades DXF)
 *
 * Atajos:
 *   S / H / V        → cambiar herramienta
 *   Click            → seleccionar polilínea más cercana
 *   Shift+Click      → agregar/quitar de selección
 *   Delete           → borrar seleccionadas
 *   Ctrl/⌘+Z         → deshacer
 *   Flechas          → mover (Shift ×10, Ctrl ÷10)
 *   Escape           → deseleccionar + volver a Pan
 */

import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react'
import { Stage, Layer, Shape } from 'react-konva'
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
/** Umbral de selección en píxeles de pantalla. */
const HIT_PX = 8

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

/** Distancia mínima de punto (px,py) al segmento (ax,ay)→(bx,by). */
function distPointToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * Busca la polilínea más cercana a (wx, wy) en unidades DXF.
 * Recorre todas las capas visibles. Retorna el id "capa:idx" o null.
 */
function findNearestPolyId(
  capas: CapaImportada[],
  wx: number,
  wy: number,
  threshDxf: number,
): string | null {
  let bestId: string | null = null
  let bestDist = threshDxf
  for (const capa of capas) {
    const polys = capa.polylines
    for (let i = 0; i < polys.length; i++) {
      const poly = polys[i]
      if (!poly) continue
      for (let j = 0; j + 1 < poly.length; j++) {
        const a = poly[j], b = poly[j + 1]
        if (!a || !b) continue
        const d = distPointToSegment(wx, wy, a[0], a[1], b[0], b[1])
        if (d < bestDist) { bestDist = d; bestId = polyId(capa.name, i) }
      }
    }
  }
  return bestId
}

/** Bbox robusto: descarta polilíneas outlier (paper space) via mediana + MAD. */
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

// ── CapaShapeLayer — 1 Shape por capa ────────────────────────────────────────
//
//  Renderiza TODAS las polilíneas de una capa en una sola pasada de canvas via
//  sceneFunc. Esto elimina los 80k+ nodos Konva/React del renderer anterior.
//
//  Tres pases dentro de sceneFunc:
//   1. Polilíneas normales (batch → 1 stroke() call por capa)
//   2. Polilínea hover (amarillo claro, 2px)
//   3. Polilíneas seleccionadas (ámbar, 2px)
//
//  lineWidth se calcula desde la transformación actual del canvas (getTransform)
//  para ser siempre 1px en pantalla sin depender del prop scale — esto evita
//  recrear sceneFunc en cada paso de zoom.

interface CapaShapeProps {
  capa: CapaImportada
  selectedIds: Set<string>
  hoveredId: string | null
}

const CapaShapeLayer = memo(function CapaShapeLayer({ capa, selectedIds, hoveredId }: CapaShapeProps) {
  const sceneFunc = useCallback((ctx: Konva.Context, _shape: Konva.Shape) => {
    // Acceso al contexto nativo (Konva.Context es un wrapper)
    const c = (ctx as unknown as { _context: CanvasRenderingContext2D })._context

    // Calcular 1px en unidades DXF desde la transformación actual del canvas.
    // La transformación del Stage (scaleX/scaleY) ya está aplicada al contexto
    // cuando se llama sceneFunc. getTransform().a = scaleX = scale actual.
    const t = c.getTransform()
    const screenScale = Math.abs(t.a)
    const lw = screenScale > 0 ? 1 / screenScale : 1

    c.lineCap = 'round'
    c.lineJoin = 'round'

    // ── Pase 1: todas las polilíneas normales en una sola llamada stroke() ──
    c.beginPath()
    c.strokeStyle = capa.color
    c.lineWidth = lw
    for (let i = 0; i < capa.polylines.length; i++) {
      const id = polyId(capa.name, i)
      if (selectedIds.has(id) || hoveredId === id) continue
      const poly = capa.polylines[i]
      if (!poly || poly.length < 2) continue
      c.moveTo(poly[0]![0], poly[0]![1])
      for (let j = 1; j < poly.length; j++) c.lineTo(poly[j]![0], poly[j]![1])
    }
    c.stroke()

    // ── Pase 2: hover (una sola polilínea, amarillo) ──────────────────────
    if (hoveredId !== null) {
      const { capaName, idx } = parseId(hoveredId)
      if (capaName === capa.name) {
        const poly = capa.polylines[idx]
        if (poly && poly.length >= 2) {
          c.beginPath()
          c.strokeStyle = HOVER_STROKE
          c.lineWidth = 2 * lw
          c.moveTo(poly[0]![0], poly[0]![1])
          for (let j = 1; j < poly.length; j++) c.lineTo(poly[j]![0], poly[j]![1])
          c.stroke()
        }
      }
    }

    // ── Pase 3: seleccionadas (ámbar) ─────────────────────────────────────
    for (const id of selectedIds) {
      const { capaName, idx } = parseId(id)
      if (capaName !== capa.name) continue
      const poly = capa.polylines[idx]
      if (!poly || poly.length < 2) continue
      c.beginPath()
      c.strokeStyle = SELECTED_STROKE
      c.lineWidth = 2 * lw
      c.moveTo(poly[0]![0], poly[0]![1])
      for (let j = 1; j < poly.length; j++) c.lineTo(poly[j]![0], poly[j]![1])
      c.stroke()
    }
  }, [capa, selectedIds, hoveredId])

  return (
    <Layer listening={false}>
      <Shape sceneFunc={sceneFunc} listening={false} perfectDrawEnabled={false} />
    </Layer>
  )
})

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

// ── KonvaDxfViewer — componente principal ────────────────────────────────────

interface Props {
  mapa: MapaImportado
}

export function KonvaDxfViewer({ mapa }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef     = useRef<Konva.Stage | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [scale, setScale] = useState(1)
  const [pos, setPos]     = useState({ x: 0, y: 0 })

  const [tool, setTool]           = useState<Tool>('pan')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const historyRef = useRef<CapaImportada[][]>([])
  /** RAF handle para throttling del mousemove. */
  const rafRef = useRef<number | null>(null)

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
    [mapa.capas],
  )

  const robustBbox = useMemo(() => computeRobustBbox(mapa), [mapa])

  // Fit bbox al montar / al cambiar mapa
  useEffect(() => {
    if (!size.w || !size.h) return
    const [minX, minY, maxX, maxY] = robustBbox
    const w = maxX - minX || 1
    const h = maxY - minY || 1
    const s = Math.min((size.w * 0.92) / w, (size.h * 0.92) / h)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setScale(s)
    setPos({ x: size.w / 2 - cx * s, y: size.h / 2 + cy * s })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa.id, size.w, size.h])

  // ── Limpiar hover al salir de select ──────────────────────────────────────
  useEffect(() => {
    if (tool !== 'select') {
      setHoveredId(null)
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [tool])

  // Cancelar RAF al desmontar
  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
  }, [])

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
  const deleteSelected = useCallback(() => {
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
      const polylines = c.polylines.filter((_, i) => !indices.has(i))
      return { ...c, polylines, entityCount: polylines.length }
    })
    setCapasMapa(mapa.id, nuevas)
    setSelectedIds(new Set())
  }, [selectedIds, mapa.capas, mapa.id, setCapasMapa, pushHistory])

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
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return }
      if (e.key === 'Escape') { setSelectedIds(new Set()); setTool('pan'); return }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return }
      if (e.key === 's' || e.key === 'S') { setTool('select'); return }
      if (e.key === 'h' || e.key === 'H' || e.key === 'v' || e.key === 'V') { setTool('pan'); return }
      if (selectedIds.size) {
        const base = e.shiftKey ? 10 : (e.ctrlKey || e.metaKey ? 0.1 : 1)
        let dx = 0, dy = 0
        if (e.key === 'ArrowRight') dx = base
        else if (e.key === 'ArrowLeft') dx = -base
        else if (e.key === 'ArrowUp') dy = base
        else if (e.key === 'ArrowDown') dy = -base
        if (dx || dy) { e.preventDefault(); moveSelected(dx, dy) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteSelected, undo, moveSelected, selectedIds.size])

  // ── Hit detection — Stage-level (todas las capas) ─────────────────────────
  //
  //  Dado que todas las Shapes tienen listening={false}, los clics "caen" al
  //  Stage. Aquí convertimos la posición del puntero a coords DXF y buscamos
  //  la polilínea más cercana con distancia punto-segmento.

  const onStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (tool !== 'select') return
    const stage = stageRef.current
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    // Convertir pantalla → DXF (compensar pos, scale y flipped Y)
    const sx = stage.x(), sy = stage.y(), sc = stage.scaleX()
    const wx = (pointer.x - sx) / sc
    const wy = -(pointer.y - sy) / sc
    const threshDxf = HIT_PX / sc

    const found = findNearestPolyId(capasVisibles, wx, wy, threshDxf)
    if (found !== null) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (e.evt.shiftKey) {
          if (next.has(found)) next.delete(found)
          else next.add(found)
        } else {
          if (next.size === 1 && next.has(found)) next.clear()
          else { next.clear(); next.add(found) }
        }
        return next
      })
    } else {
      setSelectedIds(new Set())
    }
  }, [tool, capasVisibles])

  const onStageMouseMove = useCallback((_e: Konva.KonvaEventObject<MouseEvent>) => {
    if (tool !== 'select') return
    // Throttle a 1 búsqueda por frame (60fps)
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const stage = stageRef.current
      if (!stage) return
      const pointer = stage.getPointerPosition()
      if (!pointer) return
      const sx = stage.x(), sy = stage.y(), sc = stage.scaleX()
      const wx = (pointer.x - sx) / sc
      const wy = -(pointer.y - sy) / sc
      const threshDxf = HIT_PX / sc
      setHoveredId(findNearestPolyId(capasVisibles, wx, wy, threshDxf))
    })
  }, [tool, capasVisibles])

  // ── Interacción zoom / pan ────────────────────────────────────────────────
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

  // ── Controles de zoom ──────────────────────────────────────────────────────
  function fitToBbox() {
    if (!size.w || !size.h) return
    const [minX, minY, maxX, maxY] = robustBbox
    const w = maxX - minX || 1
    const h = maxY - minY || 1
    const s = Math.min((size.w * 0.92) / w, (size.h * 0.92) / h)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setScale(s)
    setPos({ x: size.w / 2 - cx * s, y: size.h / 2 + cy * s })
  }

  function zoomBy(factor: number) {
    const newScale = clamp(scale * factor, 0.01, 5000)
    const cx = size.w / 2, cy = size.h / 2
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
        onMouseMove={onStageMouseMove}
        onMouseLeave={() => setHoveredId(null)}
      >
        {capasVisibles.map((capa) => (
          <CapaShapeLayer
            key={capa.name}
            capa={capa}
            selectedIds={selectedIds}
            hoveredId={hoveredId}
          />
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

      {/* Barra inferior — acciones sobre selección */}
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
