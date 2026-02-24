/**
 * ManualSearchModal — Busca un código de fabricante dentro del manual PDF
 *
 * Funcionalidades:
 *  - Selector de manual cuando la máquina tiene múltiples PDFs
 *  - Busca el código en todas las páginas y resalta coincidencias (amarillo)
 *  - Detecta posición del repuesto en la lista del manual
 *  - Busca la posición en los diagramas técnicos (resaltado cyan)
 *  - Modo dibujo: marcar con un rectángulo dónde está el repuesto en el diagrama
 *  - Guarda la anotación como VinculoManual en Firestore
 *  - Navegación libre, zoom ajustable
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BookOpen, Search, Loader2, FileText,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ExternalLink, AlertTriangle, ZoomIn, ZoomOut, Maximize2,
  Crosshair, Check, Pencil, X, Square, Save, Eye,
} from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { ref, listAll, getDownloadURL } from 'firebase/storage'
import { doc, updateDoc, Timestamp, arrayUnion } from '@/services/firestoreTracked'
import { storage, db } from '@/services/firebase'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
} from '@/components/ui'
import type { Machine, Repuesto } from '@/types/repuestos'
import type { VinculoManual } from '@/types/vinculos'

// Worker PDF.js
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
}

// ─── Types ──────────────────────────────────────────────────

export interface ManualSearchModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  machine: Machine
  repuesto: Repuesto
  /** If set, opens directly on the given VinculoManual (view mode) */
  initialVinculo?: VinculoManual
}

interface SearchResult {
  page: number
  textSnippet: string
  matchCount: number
  position: string | null
}

interface TextRect {
  x: number
  y: number
  width: number
  height: number
}

interface ManualOption {
  label: string
  url: string
}

/** Rectangle being drawn (pixel coords relative to canvas) */
interface DrawRect {
  startX: number
  startY: number
  endX: number
  endY: number
}

type HighlightMode = 'code' | 'position'

const SCALE_STEPS = [1, 1.25, 1.5, 2, 2.5, 3]
const DEFAULT_SCALE_IDX = 2
const DIAGRAM_SEARCH_RANGE = 5

// ─── Component ──────────────────────────────────────────────

export function ManualSearchModal({
  open,
  onOpenChange,
  machine,
  repuesto,
  initialVinculo,
}: ManualSearchModalProps) {
  // ─── Manual selection state ──────────────────────────────
  const [manualOptions, setManualOptions] = useState<ManualOption[]>([])
  const [selectedManualIdx, setSelectedManualIdx] = useState(0)
  const [loadingManuals, setLoadingManuals] = useState(true)

  // ─── Core PDF state ──────────────────────────────────────
  const [searching, setSearching] = useState(false)
  const [manualUrl, setManualUrl] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [matchPages, setMatchPages] = useState<Set<number>>(new Set())
  const [noManual, setNoManual] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [rendering, setRendering] = useState(false)
  const [scaleIdx, setScaleIdx] = useState(DEFAULT_SCALE_IDX)
  const [pageInput, setPageInput] = useState('')

  // ─── Position / diagram state ────────────────────────────
  const [highlightMode, setHighlightMode] = useState<HighlightMode>('code')
  const [activePosition, setActivePosition] = useState<string | null>(null)
  const [searchingDiagram, setSearchingDiagram] = useState(false)
  const [editingPosition, setEditingPosition] = useState(false)
  const [positionInput, setPositionInput] = useState('')
  const [savingPosition, setSavingPosition] = useState(false)
  const [savedPosition, setSavedPosition] = useState<string | undefined>(repuesto.posicionManual)

  // ─── Drawing / annotation state ──────────────────────────
  const [drawingMode, setDrawingMode] = useState(false)
  const [drawRect, setDrawRect] = useState<DrawRect | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [savingAnnotation, setSavingAnnotation] = useState(false)

  // ─── Existing saved annotation for this repuesto ─────────
  const existingVinculo = repuesto.vinculosManual?.find(v => v.machineId === machine.id) ?? initialVinculo ?? null

  // ─── Refs ────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const highlightLayerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const drawLayerRef = useRef<HTMLDivElement>(null)

  const searchCode = repuesto.codigoBaader || ''
  const scale = SCALE_STEPS[scaleIdx] ?? 1.5
  const autoDetectedPosition = results.find(r => r.position)?.position ?? null
  const effectivePosition = savedPosition || autoDetectedPosition

  // ─── 1. Load available manuals ───────────────────────────
  const loadManualOptions = useCallback(async () => {
    setLoadingManuals(true)
    const options: ManualOption[] = []

    // Add manuals from machine.manuals[] (saved URLs)
    if (machine.manuals && machine.manuals.length > 0) {
      machine.manuals.forEach((url, i) => {
        // Extract a readable name from the URL
        const decoded = decodeURIComponent(url)
        const fileName = decoded.split('/').pop()?.split('?')[0] ?? `Manual ${i + 1}`
        const cleanName = fileName
          .replace(/_\d+\.pdf$/i, '.pdf')
          .replace(/_/g, ' ')
          .replace(/\.pdf$/i, '')
        options.push({ label: cleanName || `Manual ${i + 1}`, url })
      })
    }

    // Also scan Storage for additional PDFs not yet in machine.manuals
    try {
      const folderRef = ref(storage, `machines/${machine.id}/manuales`)
      const listResult = await listAll(folderRef)
      for (const item of listResult.items) {
        if (item.name.toLowerCase().endsWith('.pdf')) {
          const url = await getDownloadURL(item)
          // Avoid duplicates
          if (!options.some(o => o.url === url)) {
            const cleanName = item.name
              .replace(/_\d+\.pdf$/i, '.pdf')
              .replace(/_/g, ' ')
              .replace(/\.pdf$/i, '')
            options.push({ label: cleanName, url })
          }
        }
      }
    } catch {
      // No folder — that's ok
    }

    setManualOptions(options)
    setLoadingManuals(false)

    if (options.length === 0) {
      setNoManual(true)
      return
    }

    // If we have an initialVinculo with a manualUrl, select that manual
    if (initialVinculo?.manualUrl) {
      const idx = options.findIndex(o => o.url === initialVinculo.manualUrl)
      if (idx >= 0) {
        setSelectedManualIdx(idx)
        return
      }
    }

    setSelectedManualIdx(0)
  }, [machine, initialVinculo])

  // ─── 2. When manual selection changes, set URL ───────────
  useEffect(() => {
    if (manualOptions.length > 0) {
      const opt = manualOptions[selectedManualIdx]
      if (opt) {
        setManualUrl(opt.url)
        // Reset search state when changing manual
        setResults([])
        setMatchPages(new Set())
        setCurrentPage(1)
        setTotalPages(0)
        setPdfDoc(null)
        setHighlightMode('code')
        setActivePosition(null)
        setDrawingMode(false)
        setDrawRect(null)
      }
    }
  }, [selectedManualIdx, manualOptions])

  // ─── 3. Search text in PDF ─────────────────────────────────
  const searchInPdf = useCallback(async (url: string) => {
    if (!searchCode) return
    setSearching(true)
    setResults([])

    try {
      const loadingTask = pdfjsLib.getDocument({
        url,
        cMapUrl: `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/cmaps/`,
        cMapPacked: true,
      })
      const pdf = await loadingTask.promise
      setPdfDoc(pdf)
      setTotalPages(pdf.numPages)

      const found: SearchResult[] = []
      const pages = new Set<number>()
      const searchLower = searchCode.toLowerCase().trim()

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        const pageText = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')

        const lowerText = pageText.toLowerCase()
        let matchCount = 0
        let pos = lowerText.indexOf(searchLower)
        while (pos !== -1) {
          matchCount++
          pos = lowerText.indexOf(searchLower, pos + 1)
        }

        if (matchCount > 0) {
          pages.add(i)
          const matchIdx = lowerText.indexOf(searchLower)
          const start = Math.max(0, matchIdx - 200)
          const end = Math.min(pageText.length, matchIdx + searchCode.length + 40)
          const snippet = pageText.substring(Math.max(0, matchIdx - 40), end)
          const beforeText = pageText.substring(start, matchIdx)
          const positionNum = extractPositionNumber(beforeText)
          found.push({ page: i, textSnippet: snippet, matchCount, position: positionNum })
        }
      }

      setResults(found)
      setMatchPages(pages)

      // If we have an initialVinculo, go to that page; else go to first match
      if (initialVinculo?.pagina) {
        setCurrentPage(initialVinculo.pagina)
      } else if (found.length > 0 && found[0]) {
        setCurrentPage(found[0].page)
      }
    } catch (err) {
      console.error('Error searching PDF:', err)
    } finally {
      setSearching(false)
    }
  }, [searchCode, initialVinculo])

  // ─── 4. Find highlight rectangles ──────────────────────────
  const findHighlightRects = useCallback(async (
    page: PDFPageProxy,
    viewport: { width: number; height: number; scale: number },
    code: string
  ): Promise<TextRect[]> => {
    if (!code) return []
    const content = await page.getTextContent()
    const codeLower = code.toLowerCase()
    const rects: TextRect[] = []

    let fullStr = ''
    const charMap: Array<{ itemIdx: number; charIdx: number }> = []

    for (let iIdx = 0; iIdx < content.items.length; iIdx++) {
      const item = content.items[iIdx]
      if (!item || !('str' in item)) continue
      const str = item.str
      for (let c = 0; c < str.length; c++) {
        charMap.push({ itemIdx: iIdx, charIdx: c })
        fullStr += str[c]
      }
      charMap.push({ itemIdx: iIdx, charIdx: str.length })
      fullStr += ' '
    }

    const lowerFull = fullStr.toLowerCase()
    let searchPos = 0

    while (true) {
      const idx = lowerFull.indexOf(codeLower, searchPos)
      if (idx === -1) break
      searchPos = idx + 1

      const firstCharInfo = charMap[idx]
      if (!firstCharInfo) continue
      const item = content.items[firstCharInfo.itemIdx]
      if (!item || !('transform' in item)) continue

      const tx = item.transform
      if (!tx) continue

      const fontSize = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3])
      const x = (tx[4] * viewport.scale)
      const y = viewport.height - (tx[5] * viewport.scale) - (fontSize * viewport.scale)
      const w = (item.width ?? code.length * fontSize * 0.6) * viewport.scale
      const h = fontSize * viewport.scale * 1.3
      rects.push({ x, y, width: w, height: h })
    }

    return rects
  }, [])

  const findPositionRects = useCallback(async (
    page: PDFPageProxy,
    viewport: { width: number; height: number; scale: number },
    posNum: string
  ): Promise<TextRect[]> => {
    if (!posNum) return []
    const content = await page.getTextContent()
    const rects: TextRect[] = []
    const posRegex = new RegExp(`(?:^|\\D)${escapeRegex(posNum)}(?:\\D|$)`)

    for (let iIdx = 0; iIdx < content.items.length; iIdx++) {
      const item = content.items[iIdx]
      if (!item || !('str' in item) || !('transform' in item)) continue

      const str = item.str.trim()
      const isExactMatch = str === posNum
      const hasWordMatch = posRegex.test(item.str)
      if (!isExactMatch && !hasWordMatch) continue

      const tx = item.transform
      if (!tx) continue

      const fontSize = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3])
      const x = (tx[4] * viewport.scale)
      const y = viewport.height - (tx[5] * viewport.scale) - (fontSize * viewport.scale)
      const w = isExactMatch
        ? (item.width ?? posNum.length * fontSize * 0.7) * viewport.scale
        : posNum.length * fontSize * 0.7 * viewport.scale
      const h = fontSize * viewport.scale * 1.4
      rects.push({ x, y, width: w, height: h })
    }

    return rects
  }, [])

  // ─── 5. Render page + highlights + saved annotation ────────
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc || !canvasRef.current) return
    setRendering(true)
    try {
      const page = await pdfDoc.getPage(pageNum)
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const viewport = page.getViewport({ scale })
      canvas.height = viewport.height
      canvas.width = viewport.width

      await page.render({ canvasContext: ctx, viewport }).promise

      // Highlight overlays
      if (highlightLayerRef.current) {
        const layer = highlightLayerRef.current
        layer.innerHTML = ''
        layer.style.width = `${viewport.width}px`
        layer.style.height = `${viewport.height}px`

        // Yellow code highlights
        if (searchCode && matchPages.has(pageNum)) {
          const rects = await findHighlightRects(page, viewport, searchCode)
          for (const rect of rects) {
            layer.appendChild(createHighlightDiv(rect, 'yellow'))
          }
        }

        // Cyan position highlights
        if (highlightMode === 'position' && activePosition) {
          const posRects = await findPositionRects(page, viewport, activePosition)
          for (const rect of posRects) {
            layer.appendChild(createHighlightDiv(rect, 'blue'))
          }
        }

        // Saved annotation overlay (green rectangle)
        if (existingVinculo && existingVinculo.pagina === pageNum && existingVinculo.coordenadas) {
          const c = existingVinculo.coordenadas
          const div = document.createElement('div')
          div.style.position = 'absolute'
          div.style.left = `${c.x * viewport.width}px`
          div.style.top = `${c.y * viewport.height}px`
          div.style.width = `${c.width * viewport.width}px`
          div.style.height = `${c.height * viewport.height}px`
          div.style.border = '3px solid rgba(34, 197, 94, 0.9)'
          div.style.backgroundColor = 'rgba(34, 197, 94, 0.15)'
          div.style.borderRadius = '4px'
          div.style.pointerEvents = 'none'
          div.style.boxShadow = '0 0 12px rgba(34, 197, 94, 0.4)'
          layer.appendChild(div)
        }
      }

      // Update drawing layer size
      if (drawLayerRef.current) {
        drawLayerRef.current.style.width = `${viewport.width}px`
        drawLayerRef.current.style.height = `${viewport.height}px`
      }
    } catch (err) {
      console.error('Error rendering page:', err)
    } finally {
      setRendering(false)
    }
  }, [pdfDoc, scale, searchCode, matchPages, findHighlightRects, findPositionRects, highlightMode, activePosition, existingVinculo])

  // ─── Lifecycle ─────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setNoManual(false)
      setScaleIdx(DEFAULT_SCALE_IDX)
      setHighlightMode('code')
      setActivePosition(null)
      setSearchingDiagram(false)
      setDrawingMode(false)
      setDrawRect(null)
      setSavedPosition(repuesto.posicionManual)
      loadManualOptions()
    }
    return () => {
      setPdfDoc(null)
      setResults([])
      setManualUrl(null)
      setMatchPages(new Set())
    }
  }, [open, loadManualOptions, repuesto.posicionManual])

  useEffect(() => {
    if (manualUrl && !loadingManuals) {
      searchInPdf(manualUrl)
    }
  }, [manualUrl, loadingManuals, searchInPdf])

  useEffect(() => {
    if (pdfDoc && currentPage >= 1 && currentPage <= totalPages) {
      renderPage(currentPage)
    }
  }, [pdfDoc, currentPage, renderPage, totalPages])

  // ─── Page navigation ───────────────────────────────────────
  const goToPage = (p: number) => {
    const clamped = Math.max(1, Math.min(totalPages, p))
    setCurrentPage(clamped)
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goNextMatch = () => {
    const nextMatch = results.find(r => r.page > currentPage)
    if (nextMatch) goToPage(nextMatch.page)
    else if (results[0]) goToPage(results[0].page)
  }

  const goPrevMatch = () => {
    const prevMatch = [...results].reverse().find(r => r.page < currentPage)
    if (prevMatch) goToPage(prevMatch.page)
    else if (results.length > 0) {
      const last = results[results.length - 1]
      if (last) goToPage(last.page)
    }
  }

  const handlePageInputSubmit = () => {
    const num = parseInt(pageInput, 10)
    if (!isNaN(num)) goToPage(num)
    setPageInput('')
  }

  // ─── Position / diagram mode ───────────────────────────────
  const goToDiagram = useCallback(async (posNum: string) => {
    if (!pdfDoc) return
    setSearchingDiagram(true)
    setActivePosition(posNum)
    setHighlightMode('position')

    const firstMatch = results[0]
    if (!firstMatch) { setSearchingDiagram(false); return }

    const posRegex = new RegExp(`(?:^|\\D)${escapeRegex(posNum)}(?:\\D|$)`)
    let bestPage: number | null = null
    const startPage = Math.max(1, firstMatch.page - 1)
    const endPage = Math.max(1, firstMatch.page - DIAGRAM_SEARCH_RANGE)

    for (let p = startPage; p >= endPage; p--) {
      try {
        const page = await pdfDoc.getPage(p)
        const content = await page.getTextContent()
        const hasPos = content.items.some((item) => {
          if (!('str' in item)) return false
          const str = item.str.trim()
          return str === posNum || posRegex.test(item.str)
        })
        if (hasPos) { bestPage = p; break }
      } catch { /* skip */ }
    }

    setSearchingDiagram(false)
    goToPage(bestPage ?? Math.max(1, firstMatch.page - 2))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, results])

  const exitPositionMode = () => {
    setHighlightMode('code')
    setActivePosition(null)
    const firstMatch = results[0]
    if (firstMatch) goToPage(firstMatch.page)
  }

  // ─── Save position to Firestore ────────────────────────────
  const savePosition = useCallback(async (pos: string) => {
    const trimmed = pos.trim()
    if (!trimmed) return
    setSavingPosition(true)
    try {
      const repuestoRef = doc(db, `machines/${machine.id}/repuestos`, repuesto.id)
      await updateDoc(repuestoRef, { posicionManual: trimmed, updatedAt: Timestamp.now() })
      setSavedPosition(trimmed)
      setEditingPosition(false)
    } catch (err) { console.error('Error saving position:', err) }
    finally { setSavingPosition(false) }
  }, [machine.id, repuesto.id])

  const clearSavedPosition = useCallback(async () => {
    setSavingPosition(true)
    try {
      const repuestoRef = doc(db, `machines/${machine.id}/repuestos`, repuesto.id)
      await updateDoc(repuestoRef, { posicionManual: '', updatedAt: Timestamp.now() })
      setSavedPosition(undefined)
    } catch (err) { console.error('Error clearing position:', err) }
    finally { setSavingPosition(false) }
  }, [machine.id, repuesto.id])

  const startEditingPosition = () => {
    setPositionInput(effectivePosition || '')
    setEditingPosition(true)
  }

  // ─── Drawing mode handlers ─────────────────────────────────
  const toggleDrawingMode = () => {
    setDrawingMode(prev => !prev)
    setDrawRect(null)
    setIsDrawing(false)
  }

  const handleDrawStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawingMode || !drawLayerRef.current) return
    const layerRect = drawLayerRef.current.getBoundingClientRect()
    const x = e.clientX - layerRect.left
    const y = e.clientY - layerRect.top
    setIsDrawing(true)
    setDrawRect({ startX: x, startY: y, endX: x, endY: y })
  }

  const handleDrawMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawRect || !drawLayerRef.current) return
    const layerRect = drawLayerRef.current.getBoundingClientRect()
    setDrawRect(prev => prev ? { ...prev, endX: e.clientX - layerRect.left, endY: e.clientY - layerRect.top } : null)
  }

  const handleDrawEnd = () => {
    setIsDrawing(false)
  }

  const saveAnnotation = useCallback(async () => {
    if (!drawRect || !canvasRef.current || !manualUrl) return
    setSavingAnnotation(true)

    const canvas = canvasRef.current
    const cw = canvas.width
    const ch = canvas.height

    // Normalize to 0-1
    const x = Math.min(drawRect.startX, drawRect.endX) / cw
    const y = Math.min(drawRect.startY, drawRect.endY) / ch
    const w = Math.abs(drawRect.endX - drawRect.startX) / cw
    const h = Math.abs(drawRect.endY - drawRect.startY) / ch

    const vinculo: VinculoManual = {
      id: `vinc_${Date.now()}`,
      pagina: currentPage,
      machineId: machine.id,
      manualUrl,
      coordenadas: { x, y, width: w, height: h },
      forma: 'rectangulo',
      color: 'rgba(34, 197, 94, 0.4)',
      descripcion: `Pos. ${effectivePosition || '?'} — ${repuesto.codigoBaader || repuesto.codigoSAP}`,
    }

    try {
      const repuestoRef = doc(db, `machines/${machine.id}/repuestos`, repuesto.id)
      await updateDoc(repuestoRef, {
        vinculosManual: arrayUnion(vinculo),
        updatedAt: Timestamp.now(),
      })
      setDrawingMode(false)
      setDrawRect(null)
      // Re-render to show the saved annotation
      renderPage(currentPage)
    } catch (err) {
      console.error('Error saving annotation:', err)
    } finally {
      setSavingAnnotation(false)
    }
  }, [drawRect, manualUrl, currentPage, machine.id, repuesto.id, repuesto.codigoBaader, repuesto.codigoSAP, effectivePosition, renderPage])

  // ─── Derived state ─────────────────────────────────────────
  const currentMatchInfo = results.find(r => r.page === currentPage) ?? null
  const isMatchPage = matchPages.has(currentPage)

  // Compute draw rect in CSS pixels for the overlay
  const drawRectNorm = drawRect ? {
    left: Math.min(drawRect.startX, drawRect.endX),
    top: Math.min(drawRect.startY, drawRect.endY),
    width: Math.abs(drawRect.endX - drawRect.startX),
    height: Math.abs(drawRect.endY - drawRect.startY),
  } : null

  // ─── JSX ───────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[95vh] flex flex-col overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="shrink-0 px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            {initialVinculo
              ? <><Eye className="h-5 w-5 text-green-500" /> Ver en Manual</>
              : <><BookOpen className="h-5 w-5 text-purple-500" /> Buscar en Manual</>
            }
          </DialogTitle>
        </DialogHeader>

        {/* Search info bar + manual selector */}
        <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-y border-border shrink-0">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-foreground">
              {initialVinculo ? 'Ubicación de' : 'Buscando'}{' '}
              <span className="font-mono font-bold text-purple-400">{searchCode || repuesto.codigoSAP}</span>{' '}
              en manual de <span className="font-semibold">{machine.nombre}</span>
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {repuesto.textoBreve || 'Repuesto'}
              {repuesto.codigoSAP && <span className="ml-2 opacity-50">(SAP: {repuesto.codigoSAP})</span>}
            </div>
          </div>

          {/* Manual selector */}
          {manualOptions.length > 1 && (
            <div className="shrink-0">
              <select
                value={selectedManualIdx}
                onChange={(e) => setSelectedManualIdx(Number(e.target.value))}
                className="h-7 text-xs bg-muted border border-border rounded px-2 py-0.5 text-foreground max-w-[200px] truncate"
                title="Seleccionar manual"
              >
                {manualOptions.map((opt, i) => (
                  <option key={i} value={i}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Position badge — editable */}
          <div className="shrink-0 flex items-center gap-1.5">
            {editingPosition ? (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/40">
                <Crosshair className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-[10px] text-cyan-300">Pos.</span>
                <Input
                  className="h-5 w-12 text-center text-xs font-mono px-1 bg-transparent border-cyan-500/30"
                  value={positionInput}
                  onChange={(e) => setPositionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') savePosition(positionInput)
                    if (e.key === 'Escape') setEditingPosition(false)
                  }}
                  autoFocus
                  placeholder="#"
                />
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-green-400 hover:text-green-300"
                  onClick={() => savePosition(positionInput)}
                  disabled={savingPosition || !positionInput.trim()}
                  title="Guardar posición"
                >
                  {savingPosition ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </Button>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setEditingPosition(false)} title="Cancelar"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : effectivePosition ? (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30">
                <Crosshair className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-xs font-bold text-cyan-400">Pos. {effectivePosition}</span>
                {savedPosition && <span className="text-[9px] text-green-400/70 ml-0.5" title="Guardada">✓</span>}
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 ml-0.5 text-cyan-400/50 hover:text-cyan-300"
                  onClick={startEditingPosition} title="Editar posición"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </Button>
                {savedPosition && (
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400/40 hover:text-red-400"
                    onClick={clearSavedPosition} disabled={savingPosition} title="Borrar posición"
                  >
                    <X className="h-2.5 w-2.5" />
                  </Button>
                )}
              </div>
            ) : (
              <Button variant="ghost" size="sm"
                className="h-7 px-2 text-[11px] gap-1 text-cyan-400/60 hover:text-cyan-400 border border-dashed border-cyan-500/20 hover:border-cyan-500/40 rounded-full"
                onClick={startEditingPosition} title="Asignar posición manualmente"
              >
                <Pencil className="h-3 w-3" /> Asignar pos.
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
          {loadingManuals ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Cargando manuales...</span>
            </div>
          ) : noManual ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
              <AlertTriangle className="h-10 w-10 text-amber-500/60" />
              <div>
                <p className="text-sm font-medium text-foreground">No hay manual cargado</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Sube un PDF del manual de <span className="font-semibold">{machine.nombre}</span> para habilitar la búsqueda.
                </p>
              </div>
            </div>
          ) : searching ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              <span className="text-sm text-muted-foreground">Buscando &quot;{searchCode}&quot; en el PDF...</span>
              <span className="text-xs text-muted-foreground">Esto puede tomar unos segundos</span>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="shrink-0 px-3 py-2 border-b border-border bg-muted/20 flex flex-wrap items-center gap-2">
                {/* Page nav */}
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                    disabled={currentPage <= 1} onClick={() => goToPage(1)} title="Primera"
                  ><ChevronsLeft className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                    disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)} title="Anterior"
                  ><ChevronLeft className="h-4 w-4" /></Button>
                  <div className="flex items-center gap-1 mx-1">
                    <Input className="h-7 w-14 text-center text-xs font-mono px-1"
                      value={pageInput || currentPage}
                      onChange={(e) => setPageInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handlePageInputSubmit()}
                      onBlur={handlePageInputSubmit}
                      onFocus={() => setPageInput(String(currentPage))}
                    />
                    <span className="text-xs text-muted-foreground">/ {totalPages}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                    disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)} title="Siguiente"
                  ><ChevronRight className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                    disabled={currentPage >= totalPages} onClick={() => goToPage(totalPages)} title="Última"
                  ><ChevronsRight className="h-4 w-4" /></Button>
                </div>

                <div className="h-5 w-px bg-border mx-1" />

                {/* Zoom */}
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                    disabled={scaleIdx <= 0} onClick={() => setScaleIdx(Math.max(0, scaleIdx - 1))} title="Reducir"
                  ><ZoomOut className="h-4 w-4" /></Button>
                  <span className="text-[11px] font-mono text-muted-foreground w-10 text-center">
                    {Math.round(scale * 100)}%
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                    disabled={scaleIdx >= SCALE_STEPS.length - 1}
                    onClick={() => setScaleIdx(Math.min(SCALE_STEPS.length - 1, scaleIdx + 1))} title="Ampliar"
                  ><ZoomIn className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                    onClick={() => setScaleIdx(DEFAULT_SCALE_IDX)} title="Tamaño original"
                  ><Maximize2 className="h-3.5 w-3.5" /></Button>
                </div>

                <div className="h-5 w-px bg-border mx-1" />

                {/* Match / position navigation */}
                {highlightMode === 'code' ? (
                  <>
                    {results.length > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-green-500" />
                        <span className="text-[11px] text-foreground">
                          <span className="font-bold text-green-400">{results.length}</span> pág.
                        </span>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1"
                          onClick={goPrevMatch} title="Anterior"
                        ><ChevronLeft className="h-3 w-3" /> Ant.</Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1"
                          onClick={goNextMatch} title="Siguiente"
                        >Sig. <ChevronRight className="h-3 w-3" /></Button>

                        <div className="h-5 w-px bg-border mx-1" />
                        {effectivePosition ? (
                          <Button variant="outline" size="sm"
                            className="h-7 px-2.5 text-[11px] gap-1.5 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10"
                            onClick={() => goToDiagram(effectivePosition)} disabled={searchingDiagram}
                            title={`Buscar posición ${effectivePosition} en el diagrama`}
                          >
                            {searchingDiagram
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Crosshair className="h-3.5 w-3.5" />}
                            {searchingDiagram ? 'Buscando...' : `Ver pos. ${effectivePosition} en diagrama`}
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm"
                            className="h-7 px-2 text-[11px] gap-1 text-cyan-400/60 hover:text-cyan-400 border border-dashed border-cyan-500/20 hover:border-cyan-500/40 rounded-full"
                            onClick={startEditingPosition} title="Asignar posición"
                          ><Pencil className="h-3 w-3" /> Asignar pos.</Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Sin coincidencias para &quot;{searchCode}&quot;</span>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Crosshair className="h-3.5 w-3.5 text-cyan-400" />
                    <span className="text-[11px] text-cyan-300 font-medium">
                      Modo diagrama — posición <span className="font-bold">{activePosition}</span>
                    </span>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1 text-yellow-400 hover:text-yellow-300"
                      onClick={exitPositionMode}
                    >← Volver a código</Button>
                  </div>
                )}

                <div className="flex-1" />

                {/* Drawing mode toggle */}
                <Button
                  variant={drawingMode ? 'default' : 'outline'}
                  size="sm"
                  className={`h-7 px-2.5 text-[11px] gap-1.5 ${drawingMode
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'border-green-500/40 text-green-400 hover:bg-green-500/10'
                  }`}
                  onClick={toggleDrawingMode}
                  title={drawingMode ? 'Cancelar marcado' : 'Marcar repuesto en el diagrama'}
                >
                  <Square className="h-3.5 w-3.5" />
                  {drawingMode ? 'Cancelar marcado' : 'Marcar en diagrama'}
                </Button>

                {/* Open external */}
                {manualUrl && (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1"
                    onClick={() => window.open(manualUrl, '_blank')}
                  ><ExternalLink className="h-3 w-3" /> Abrir PDF</Button>
                )}
              </div>

              {/* Drawing mode info bar */}
              {drawingMode && (
                <div className="shrink-0 px-4 py-1.5 bg-green-500/10 border-b border-green-500/20 text-xs flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-foreground">
                    <span className="font-semibold text-green-400">Modo marcado</span> — dibuja un rectángulo sobre el repuesto en el diagrama
                  </span>
                  {drawRect && !isDrawing && (
                    <Button variant="outline" size="sm"
                      className="h-6 px-2 text-[11px] gap-1 border-green-500/40 text-green-400 hover:bg-green-500/10 ml-auto"
                      onClick={saveAnnotation} disabled={savingAnnotation}
                    >
                      {savingAnnotation ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Guardar marcado
                    </Button>
                  )}
                </div>
              )}

              {/* Existing annotation info bar */}
              {existingVinculo && !drawingMode && (
                <div className="shrink-0 px-4 py-1.5 bg-green-500/10 border-b border-green-500/20 text-xs flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-green-400" />
                  <span className="text-foreground">
                    Repuesto marcado en <span className="font-bold text-green-400">página {existingVinculo.pagina}</span>
                  </span>
                  {existingVinculo.pagina !== currentPage && (
                    <Button variant="ghost" size="sm"
                      className="h-5 px-2 text-[10px] text-green-400 hover:text-green-300"
                      onClick={() => goToPage(existingVinculo.pagina)}
                    >Ir a marcado</Button>
                  )}
                </div>
              )}

              {/* Position mode info bar */}
              {highlightMode === 'position' && activePosition && !drawingMode && (
                <div className="shrink-0 px-4 py-1.5 bg-cyan-500/10 border-b border-cyan-500/20 text-xs flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-foreground">
                    Buscando <span className="font-bold text-cyan-400">posición {activePosition}</span> en el diagrama
                  </span>
                  <span className="text-muted-foreground ml-1">— navega por las páginas cercanas</span>
                </div>
              )}

              {/* Code match info bar */}
              {highlightMode === 'code' && isMatchPage && currentMatchInfo && !drawingMode && !existingVinculo && (
                <div className="shrink-0 px-4 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 text-xs flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                  <span className="text-foreground">
                    Pág. <span className="font-bold">{currentPage}</span>
                    {' — '}{currentMatchInfo.matchCount} coincidencia{currentMatchInfo.matchCount > 1 ? 's' : ''}
                    {currentMatchInfo.position && (
                      <span className="ml-2 text-cyan-400 font-medium">(Posición {currentMatchInfo.position})</span>
                    )}
                  </span>
                  <span className="text-muted-foreground italic ml-2 truncate hidden sm:inline">
                    &quot;...{highlightCode(currentMatchInfo.textSnippet, searchCode)}...&quot;
                  </span>
                </div>
              )}

              {/* Quick match page pills */}
              {results.length > 0 && highlightMode === 'code' && !drawingMode && (
                <div className="shrink-0 px-3 py-1.5 border-b border-border flex flex-wrap items-center gap-1 bg-muted/10">
                  <span className="text-[10px] text-muted-foreground mr-1">Coincidencias en:</span>
                  {results.map((r) => (
                    <button key={r.page} onClick={() => goToPage(r.page)}
                      className={`px-2 py-0.5 text-[11px] rounded-full transition-colors ${
                        r.page === currentPage
                          ? 'bg-yellow-500/30 text-yellow-300 font-bold ring-1 ring-yellow-500/50'
                          : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                      }`}
                    >
                      p.{r.page}
                      {r.matchCount > 1 && <span className="ml-0.5 opacity-60">×{r.matchCount}</span>}
                    </button>
                  ))}
                </div>
              )}

              {/* PDF Canvas + drawing layer */}
              <div ref={scrollContainerRef} className="flex-1 overflow-auto min-h-0 bg-neutral-800/50">
                <div className="flex justify-center p-4">
                  <div className="relative inline-block shadow-xl">
                    {rendering && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-20 rounded">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    )}
                    <canvas ref={canvasRef} className="block max-w-none" />
                    {/* Highlight overlay (code/position) */}
                    <div ref={highlightLayerRef}
                      className="absolute top-0 left-0 pointer-events-none"
                      style={{ zIndex: 10 }}
                    />
                    {/* Drawing interaction layer */}
                    <div
                      ref={drawLayerRef}
                      className="absolute top-0 left-0"
                      style={{
                        zIndex: drawingMode ? 15 : -1,
                        cursor: drawingMode ? 'crosshair' : 'default',
                        pointerEvents: drawingMode ? 'auto' : 'none',
                      }}
                      onMouseDown={handleDrawStart}
                      onMouseMove={handleDrawMove}
                      onMouseUp={handleDrawEnd}
                    >
                      {/* Rectangle being drawn */}
                      {drawRectNorm && (
                        <div
                          className="absolute border-2 border-green-400 bg-green-400/20 rounded"
                          style={{
                            left: drawRectNorm.left,
                            top: drawRectNorm.top,
                            width: drawRectNorm.width,
                            height: drawRectNorm.height,
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Helper functions ───────────────────────────────────────

function createHighlightDiv(rect: TextRect, color: 'yellow' | 'blue'): HTMLDivElement {
  const div = document.createElement('div')
  div.style.position = 'absolute'
  div.style.left = `${rect.x - 2}px`
  div.style.top = `${rect.y - 2}px`
  div.style.width = `${rect.width + 4}px`
  div.style.height = `${rect.height + 4}px`
  div.style.borderRadius = '3px'
  div.style.pointerEvents = 'none'
  div.style.mixBlendMode = 'multiply'
  if (color === 'yellow') {
    div.style.backgroundColor = 'rgba(250, 204, 21, 0.4)'
    div.style.border = '2px solid rgba(250, 204, 21, 0.9)'
  } else {
    div.style.backgroundColor = 'rgba(34, 211, 238, 0.35)'
    div.style.border = '2.5px solid rgba(34, 211, 238, 0.95)'
    div.style.boxShadow = '0 0 8px rgba(34, 211, 238, 0.5)'
  }
  return div
}

function extractPositionNumber(beforeText: string): string | null {
  const matches = [...beforeText.matchAll(/(?:^|\s)(\d{1,3})\s+[A-Za-zÀ-ÿ]/g)]
  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1]
    if (lastMatch?.[1]) return lastMatch[1]
  }
  return null
}

function highlightCode(text: string, code: string): React.ReactNode {
  if (!code) return text
  const parts = text.split(new RegExp(`(${escapeRegex(code)})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === code.toLowerCase()
      ? <span key={i} className="font-bold text-yellow-400 not-italic">{part}</span>
      : <span key={i}>{part}</span>
  )
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
