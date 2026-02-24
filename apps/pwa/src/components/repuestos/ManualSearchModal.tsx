/**
 * ManualSearchModal v2.48.81
 *
 * Flujo:
 *  1. Se abre y carga la lista de manuales disponibles
 *  2. El usuario elige en qué manual buscar → botón "Buscar"
 *  3. Se busca el código de fabricante en todas las páginas y resalta en amarillo
 *  4. El usuario navega manualmente por las páginas para encontrar el diagrama
 *  5. "Marcar en diagrama" activa modo polígono: click para colocar puntos,
 *     click en punto 1 para cerrar la figura
 *  6. Guardar → se persiste como VinculoManual con puntos normalizados (0-1)
 *  7. "Ver en manual" aparece al lado de "Buscar en manual" una vez guardado
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BookOpen, Search, Loader2, FileText,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ExternalLink, AlertTriangle, ZoomIn, ZoomOut, Maximize2,
  Save, Eye, Undo2, MousePointerClick,
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

// PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
}

// ─── Types ──────────────────────────────────────────────────

export interface ManualSearchModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  machine: Machine
  repuesto: Repuesto
  /** Si se pasa, abre en modo vista directamente en la anotación guardada */
  initialVinculo?: VinculoManual
}

interface SearchResult {
  page: number
  textSnippet: string
  matchCount: number
}

interface TextRect {
  x: number; y: number; width: number; height: number
}

interface ManualOption {
  label: string
  url: string
}

/** Punto en píxeles relativos al canvas */
interface PixelPoint {
  x: number
  y: number
}

type ModalStep = 'select-manual' | 'viewing'

const SCALE_STEPS = [1, 1.25, 1.5, 2, 2.5, 3]
const DEFAULT_SCALE_IDX = 2
const CLOSE_THRESHOLD_PX = 14 // px para detectar cierre del polígono

// ─── Component ──────────────────────────────────────────────

export function ManualSearchModal({
  open,
  onOpenChange,
  machine,
  repuesto,
  initialVinculo,
}: ManualSearchModalProps) {
  // ─── Step state ──────────────────────────────────────────
  const [step, setStep] = useState<ModalStep>('select-manual')

  // ─── Manual selection ────────────────────────────────────
  const [manualOptions, setManualOptions] = useState<ManualOption[]>([])
  const [selectedManualIdx, setSelectedManualIdx] = useState(0)
  const [loadingManuals, setLoadingManuals] = useState(true)
  const [noManual, setNoManual] = useState(false)

  // ─── PDF state ───────────────────────────────────────────
  const [searching, setSearching] = useState(false)
  const [manualUrl, setManualUrl] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [matchPages, setMatchPages] = useState<Set<number>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [rendering, setRendering] = useState(false)
  const [scaleIdx, setScaleIdx] = useState(DEFAULT_SCALE_IDX)
  const [pageInput, setPageInput] = useState('')

  // ─── Polygon drawing state ──────────────────────────────
  const [drawingMode, setDrawingMode] = useState(false)
  const [polyPoints, setPolyPoints] = useState<PixelPoint[]>([])
  const [polyClosed, setPolyClosed] = useState(false)
  const [hoverPoint, setHoverPoint] = useState<PixelPoint | null>(null)
  const [nearFirstPoint, setNearFirstPoint] = useState(false)
  const [savingAnnotation, setSavingAnnotation] = useState(false)

  // ─── Existing saved annotation ───────────────────────────
  const existingVinculo = repuesto.vinculosManual?.find(v => v.machineId === machine.id) ?? initialVinculo ?? null

  // ─── Refs ────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const highlightLayerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const drawLayerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const searchCode = repuesto.codigoBaader || ''
  const scale = SCALE_STEPS[scaleIdx] ?? 1.5

  // ─── 1. Load manual options ──────────────────────────────
  const loadManualOptions = useCallback(async () => {
    setLoadingManuals(true)
    const options: ManualOption[] = []

    if (machine.manuals && machine.manuals.length > 0) {
      machine.manuals.forEach((url, i) => {
        const decoded = decodeURIComponent(url)
        const fileName = decoded.split('/').pop()?.split('?')[0] ?? `Manual ${i + 1}`
        const cleanName = fileName
          .replace(/_\d+\.pdf$/i, '.pdf')
          .replace(/_/g, ' ')
          .replace(/\.pdf$/i, '')
        options.push({ label: cleanName || `Manual ${i + 1}`, url })
      })
    }

    try {
      const folderRef = ref(storage, `machines/${machine.id}/manuales`)
      const listResult = await listAll(folderRef)
      for (const item of listResult.items) {
        if (item.name.toLowerCase().endsWith('.pdf')) {
          const url = await getDownloadURL(item)
          if (!options.some(o => o.url === url)) {
            const cleanName = item.name
              .replace(/_\d+\.pdf$/i, '.pdf')
              .replace(/_/g, ' ')
              .replace(/\.pdf$/i, '')
            options.push({ label: cleanName, url })
          }
        }
      }
    } catch { /* sin carpeta */ }

    setManualOptions(options)
    setLoadingManuals(false)

    if (options.length === 0) {
      setNoManual(true)
      return
    }

    // Si tenemos vínculo inicial, seleccionamos su manual
    if (initialVinculo?.manualUrl) {
      const idx = options.findIndex(o => o.url === initialVinculo.manualUrl)
      if (idx >= 0) setSelectedManualIdx(idx)
    }

    // Si viene con initialVinculo, saltamos la selección
    if (initialVinculo) {
      const opt = options[initialVinculo.manualUrl ? options.findIndex(o => o.url === initialVinculo.manualUrl) : 0]
      if (opt) {
        setManualUrl(opt.url)
        setStep('viewing')
      }
    }
  }, [machine, initialVinculo])

  // ─── 2. Search text in PDF ─────────────────────────────────
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
          const snippet = pageText.substring(Math.max(0, matchIdx - 40), Math.min(pageText.length, matchIdx + searchCode.length + 40))
          found.push({ page: i, textSnippet: snippet, matchCount })
        }
      }

      setResults(found)
      setMatchPages(pages)

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

  // ─── 3. Highlight rect finder ────────────────────────────
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
      const x = tx[4] * viewport.scale
      const y = viewport.height - (tx[5] * viewport.scale) - (fontSize * viewport.scale)
      const w = (item.width ?? code.length * fontSize * 0.6) * viewport.scale
      const h = fontSize * viewport.scale * 1.3
      rects.push({ x, y, width: w, height: h })
    }

    return rects
  }, [])

  // ─── 4. Render page ──────────────────────────────────────
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

      // Highlight layer
      if (highlightLayerRef.current) {
        const layer = highlightLayerRef.current
        layer.innerHTML = ''
        layer.style.width = `${viewport.width}px`
        layer.style.height = `${viewport.height}px`

        // Yellow code highlights
        if (searchCode && matchPages.has(pageNum)) {
          const rects = await findHighlightRects(page, viewport, searchCode)
          for (const rect of rects) {
            layer.appendChild(createHighlightDiv(rect))
          }
        }

        // Saved polygon annotation (green)
        if (existingVinculo && existingVinculo.pagina === pageNum && existingVinculo.puntos && existingVinculo.puntos.length >= 3) {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          svg.setAttribute('width', String(viewport.width))
          svg.setAttribute('height', String(viewport.height))
          svg.style.position = 'absolute'
          svg.style.top = '0'
          svg.style.left = '0'
          svg.style.pointerEvents = 'none'

          const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
          const pointsStr = existingVinculo.puntos
            .map(p => `${p.x * viewport.width},${p.y * viewport.height}`)
            .join(' ')
          polygon.setAttribute('points', pointsStr)
          polygon.setAttribute('fill', 'rgba(34, 197, 94, 0.18)')
          polygon.setAttribute('stroke', 'rgba(34, 197, 94, 0.9)')
          polygon.setAttribute('stroke-width', '3')
          svg.appendChild(polygon)
          layer.appendChild(svg)
        }

        // Saved rect annotation (backwards compatibility)
        if (existingVinculo && existingVinculo.pagina === pageNum && existingVinculo.coordenadas && !existingVinculo.puntos) {
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
          layer.appendChild(div)
        }
      }

      // Update draw layer size
      if (drawLayerRef.current) {
        drawLayerRef.current.style.width = `${viewport.width}px`
        drawLayerRef.current.style.height = `${viewport.height}px`
      }
      if (svgRef.current) {
        svgRef.current.setAttribute('width', String(viewport.width))
        svgRef.current.setAttribute('height', String(viewport.height))
      }
    } catch (err) {
      console.error('Error rendering page:', err)
    } finally {
      setRendering(false)
    }
  }, [pdfDoc, scale, searchCode, matchPages, findHighlightRects, existingVinculo])

  // ─── Lifecycle ─────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setNoManual(false)
      setScaleIdx(DEFAULT_SCALE_IDX)
      setDrawingMode(false)
      setPolyPoints([])
      setPolyClosed(false)
      setStep(initialVinculo ? 'viewing' : 'select-manual')
      loadManualOptions()
    }
    return () => {
      setPdfDoc(null)
      setResults([])
      setManualUrl(null)
      setMatchPages(new Set())
    }
  }, [open, loadManualOptions, initialVinculo])

  useEffect(() => {
    if (manualUrl && step === 'viewing') {
      searchInPdf(manualUrl)
    }
  }, [manualUrl, step, searchInPdf])

  useEffect(() => {
    if (pdfDoc && currentPage >= 1 && currentPage <= totalPages) {
      renderPage(currentPage)
    }
  }, [pdfDoc, currentPage, renderPage, totalPages])

  // ─── Accept manual selection → start search ───────────────
  const acceptManualSelection = () => {
    const opt = manualOptions[selectedManualIdx]
    if (!opt) return
    setManualUrl(opt.url)
    setStep('viewing')
  }

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

  // ─── Polygon drawing handlers ─────────────────────────────
  const toggleDrawingMode = () => {
    if (drawingMode) {
      // Cancel
      setDrawingMode(false)
      setPolyPoints([])
      setPolyClosed(false)
      setHoverPoint(null)
      setNearFirstPoint(false)
    } else {
      setDrawingMode(true)
      setPolyPoints([])
      setPolyClosed(false)
      setHoverPoint(null)
      setNearFirstPoint(false)
    }
  }

  const undoLastPoint = () => {
    if (polyClosed) {
      setPolyClosed(false)
    } else {
      setPolyPoints(prev => prev.slice(0, -1))
    }
  }

  const handleDrawClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawingMode || polyClosed || !drawLayerRef.current) return
    const layerRect = drawLayerRef.current.getBoundingClientRect()
    const x = e.clientX - layerRect.left
    const y = e.clientY - layerRect.top

    // Check if clicking near first point to close polygon
    if (polyPoints.length >= 3) {
      const first = polyPoints[0]
      if (first) {
        const dist = Math.sqrt((x - first.x) ** 2 + (y - first.y) ** 2)
        if (dist < CLOSE_THRESHOLD_PX) {
          setPolyClosed(true)
          setHoverPoint(null)
          setNearFirstPoint(false)
          return
        }
      }
    }

    setPolyPoints(prev => [...prev, { x, y }])
  }

  const handleDrawMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawingMode || polyClosed || !drawLayerRef.current) return
    const layerRect = drawLayerRef.current.getBoundingClientRect()
    const x = e.clientX - layerRect.left
    const y = e.clientY - layerRect.top
    setHoverPoint({ x, y })

    // Check proximity to first point
    if (polyPoints.length >= 3) {
      const first = polyPoints[0]
      if (first) {
        const dist = Math.sqrt((x - first.x) ** 2 + (y - first.y) ** 2)
        setNearFirstPoint(dist < CLOSE_THRESHOLD_PX)
      }
    } else {
      setNearFirstPoint(false)
    }
  }

  const handleDrawLeave = () => {
    setHoverPoint(null)
    setNearFirstPoint(false)
  }

  // ─── Save polygon annotation ──────────────────────────────
  const saveAnnotation = useCallback(async () => {
    if (polyPoints.length < 3 || !polyClosed || !canvasRef.current || !manualUrl) return
    setSavingAnnotation(true)

    const canvas = canvasRef.current
    const cw = canvas.width
    const ch = canvas.height

    // Normalizar puntos a 0-1
    const normalizedPoints = polyPoints.map(p => ({
      x: p.x / cw,
      y: p.y / ch,
    }))

    const vinculo: VinculoManual = {
      id: `vinc_${Date.now()}`,
      pagina: currentPage,
      machineId: machine.id,
      manualUrl,
      puntos: normalizedPoints,
      forma: 'poligono',
      color: 'rgba(34, 197, 94, 0.4)',
      descripcion: `${repuesto.codigoBaader || repuesto.codigoSAP} — ${repuesto.textoBreve || 'Repuesto'}`,
    }

    try {
      const repuestoRef = doc(db, `machines/${machine.id}/repuestos`, repuesto.id)
      await updateDoc(repuestoRef, {
        vinculosManual: arrayUnion(vinculo),
        updatedAt: Timestamp.now(),
      })
      // Limpiar dibujo y re-render
      setDrawingMode(false)
      setPolyPoints([])
      setPolyClosed(false)
      renderPage(currentPage)
    } catch (err) {
      console.error('Error saving annotation:', err)
    } finally {
      setSavingAnnotation(false)
    }
  }, [polyPoints, polyClosed, manualUrl, currentPage, machine.id, repuesto.id, repuesto.codigoBaader, repuesto.codigoSAP, repuesto.textoBreve, renderPage])

  // ─── Derived state ─────────────────────────────────────────
  const currentMatchInfo = results.find(r => r.page === currentPage) ?? null
  const isMatchPage = matchPages.has(currentPage)

  // Build SVG polygon points string for the drawing
  const buildPolyStr = () => {
    const pts = [...polyPoints]
    if (!polyClosed && hoverPoint) pts.push(hoverPoint)
    return pts.map(p => `${p.x},${p.y}`).join(' ')
  }

  // ─── JSX: Step 1 — Select manual ──────────────────────────
  if (step === 'select-manual') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-purple-500" />
              Buscar en Manual
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground">
              Buscando <span className="font-mono font-bold text-purple-400">{searchCode || repuesto.codigoSAP}</span> en manual de{' '}
              <span className="font-semibold text-foreground">{machine.nombre}</span>
            </div>

            {loadingManuals ? (
              <div className="flex items-center justify-center py-8 gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Cargando manuales...</span>
              </div>
            ) : noManual ? (
              <div className="flex flex-col items-center py-6 gap-3 text-center">
                <AlertTriangle className="h-8 w-8 text-amber-500/60" />
                <p className="text-sm font-medium">No hay manual cargado</p>
                <p className="text-xs text-muted-foreground">
                  Sube un PDF del manual de <span className="font-semibold">{machine.nombre}</span> primero.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Selecciona el manual:</label>
                  <div className="space-y-1.5">
                    {manualOptions.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedManualIdx(i)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                          selectedManualIdx === i
                            ? 'bg-purple-500/15 border-purple-500/50 text-foreground ring-1 ring-purple-500/30'
                            : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <FileText className={`h-4 w-4 shrink-0 ${selectedManualIdx === i ? 'text-purple-400' : 'text-muted-foreground'}`} />
                          <span className="truncate">{opt.label}</span>
                          {selectedManualIdx === i && (
                            <span className="ml-auto text-[10px] text-purple-400 font-medium shrink-0">Seleccionado</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                  <Button onClick={acceptManualSelection} className="gap-2">
                    <Search className="h-4 w-4" />
                    Buscar
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // ─── JSX: Step 2 — Viewing PDF ─────────────────────────────
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

        {/* Info bar */}
        <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-y border-border shrink-0">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-foreground">
              {initialVinculo ? 'Ubicación de' : 'Buscando'}{' '}
              <span className="font-mono font-bold text-purple-400">{searchCode || repuesto.codigoSAP}</span>{' '}
              en <span className="font-semibold">{manualOptions[selectedManualIdx]?.label || 'manual'}</span>
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {repuesto.textoBreve || 'Repuesto'}
              {repuesto.codigoSAP && <span className="ml-2 opacity-50">(SAP: {repuesto.codigoSAP})</span>}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
          {searching ? (
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

                {/* Match navigation */}
                {results.length > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-[11px] text-foreground">
                      <span className="font-bold text-green-400">{results.length}</span> pág.
                    </span>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1"
                      onClick={goPrevMatch} title="Coincidencia anterior"
                    ><ChevronLeft className="h-3 w-3" /> Ant.</Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1"
                      onClick={goNextMatch} title="Coincidencia siguiente"
                    >Sig. <ChevronRight className="h-3 w-3" /></Button>
                  </div>
                ) : (
                  <span className="text-[11px] text-muted-foreground">Sin coincidencias para &quot;{searchCode}&quot;</span>
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
                  <MousePointerClick className="h-3.5 w-3.5" />
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
                    <span className="font-semibold text-green-400">Modo marcado</span> — haz click para colocar puntos.
                    {polyPoints.length === 0 && ' Coloca el primer punto.'}
                    {polyPoints.length > 0 && polyPoints.length < 3 && ` Punto ${polyPoints.length}/${polyPoints.length} — necesitas al menos 3 puntos.`}
                    {polyPoints.length >= 3 && !polyClosed && ' Haz click en el primer punto (verde) para cerrar la figura.'}
                    {polyClosed && ' ¡Figura cerrada! Puedes guardar.'}
                  </span>

                  <div className="ml-auto flex items-center gap-1.5">
                    {polyPoints.length > 0 && !polyClosed && (
                      <Button variant="ghost" size="sm"
                        className="h-6 px-2 text-[11px] gap-1 text-yellow-400 hover:text-yellow-300"
                        onClick={undoLastPoint}
                      >
                        <Undo2 className="h-3 w-3" /> Deshacer punto
                      </Button>
                    )}
                    {polyClosed && (
                      <>
                        <Button variant="ghost" size="sm"
                          className="h-6 px-2 text-[11px] gap-1 text-yellow-400 hover:text-yellow-300"
                          onClick={undoLastPoint}
                        >
                          <Undo2 className="h-3 w-3" /> Reabrir
                        </Button>
                        <Button variant="outline" size="sm"
                          className="h-6 px-2 text-[11px] gap-1 border-green-500/40 text-green-400 hover:bg-green-500/10"
                          onClick={saveAnnotation} disabled={savingAnnotation}
                        >
                          {savingAnnotation ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          Guardar marcado
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Existing annotation info */}
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

              {/* Code match info bar */}
              {isMatchPage && currentMatchInfo && !drawingMode && (
                <div className="shrink-0 px-4 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 text-xs flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                  <span className="text-foreground">
                    Pág. <span className="font-bold">{currentPage}</span>
                    {' — '}{currentMatchInfo.matchCount} coincidencia{currentMatchInfo.matchCount > 1 ? 's' : ''}
                  </span>
                  <span className="text-muted-foreground italic ml-2 truncate hidden sm:inline">
                    &quot;...{highlightCode(currentMatchInfo.textSnippet, searchCode)}...&quot;
                  </span>
                </div>
              )}

              {/* Quick match page pills */}
              {results.length > 0 && !drawingMode && (
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

              {/* PDF Canvas + polygon drawing layer */}
              <div ref={scrollContainerRef} className="flex-1 overflow-auto min-h-0 bg-neutral-800/50">
                <div className="flex justify-center p-4">
                  <div className="relative inline-block shadow-xl">
                    {rendering && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-20 rounded">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    )}
                    <canvas ref={canvasRef} className="block max-w-none" />
                    {/* Highlight overlay */}
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
                        cursor: drawingMode
                          ? (nearFirstPoint ? 'pointer' : 'crosshair')
                          : 'default',
                        pointerEvents: drawingMode ? 'auto' : 'none',
                      }}
                      onClick={handleDrawClick}
                      onMouseMove={handleDrawMove}
                      onMouseLeave={handleDrawLeave}
                    >
                      {/* SVG for polygon drawing */}
                      <svg
                        ref={svgRef}
                        className="absolute top-0 left-0"
                        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
                      >
                        {/* Polygon shape (dashed when open, solid when closed) */}
                        {polyPoints.length >= 2 && (
                          <polygon
                            points={polyClosed ? polyPoints.map(p => `${p.x},${p.y}`).join(' ') : buildPolyStr()}
                            fill={polyClosed ? 'rgba(34, 197, 94, 0.18)' : 'rgba(34, 197, 94, 0.08)'}
                            stroke={polyClosed ? 'rgba(34, 197, 94, 0.9)' : 'rgba(34, 197, 94, 0.6)'}
                            strokeWidth={polyClosed ? 3 : 2}
                            strokeDasharray={polyClosed ? 'none' : '6 3'}
                          />
                        )}
                        {/* Line from last point to hover (when open) */}
                        {polyPoints.length >= 1 && !polyClosed && hoverPoint && (
                          <line
                            x1={polyPoints[polyPoints.length - 1]?.x ?? 0}
                            y1={polyPoints[polyPoints.length - 1]?.y ?? 0}
                            x2={hoverPoint.x}
                            y2={hoverPoint.y}
                            stroke="rgba(34, 197, 94, 0.5)"
                            strokeWidth="1.5"
                            strokeDasharray="4 3"
                          />
                        )}
                        {/* Point dots */}
                        {polyPoints.map((p, i) => (
                          <circle
                            key={i}
                            cx={p.x}
                            cy={p.y}
                            r={i === 0 && nearFirstPoint ? 8 : 5}
                            fill={i === 0
                              ? (nearFirstPoint ? 'rgba(34, 197, 94, 1)' : 'rgba(34, 197, 94, 0.8)')
                              : 'rgba(255, 255, 255, 0.9)'
                            }
                            stroke={i === 0 ? '#fff' : 'rgba(34, 197, 94, 0.9)'}
                            strokeWidth={i === 0 ? 2.5 : 2}
                            style={{ transition: 'r 0.15s ease' }}
                          />
                        ))}
                        {/* Point labels */}
                        {polyPoints.map((p, i) => (
                          <text
                            key={`label-${i}`}
                            x={p.x}
                            y={p.y - 10}
                            textAnchor="middle"
                            fill="white"
                            fontSize="10"
                            fontWeight="bold"
                            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
                          >
                            {i + 1}
                          </text>
                        ))}
                      </svg>
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

// ─── Helpers ────────────────────────────────────────────────

function createHighlightDiv(rect: TextRect): HTMLDivElement {
  const div = document.createElement('div')
  div.style.position = 'absolute'
  div.style.left = `${rect.x - 2}px`
  div.style.top = `${rect.y - 2}px`
  div.style.width = `${rect.width + 4}px`
  div.style.height = `${rect.height + 4}px`
  div.style.borderRadius = '3px'
  div.style.pointerEvents = 'none'
  div.style.mixBlendMode = 'multiply'
  div.style.backgroundColor = 'rgba(250, 204, 21, 0.4)'
  div.style.border = '2px solid rgba(250, 204, 21, 0.9)'
  return div
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
