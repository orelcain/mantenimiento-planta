/**
 * ManualSearchModal — Busca un código de fabricante dentro del manual PDF de la máquina
 *
 * Funcionalidades:
 *  - Busca el código en todas las páginas del PDF y resalta las coincidencias (amarillo)
 *  - Detecta el número de posición del repuesto en la lista del manual
 *  - Permite buscar la posición en los diagramas técnicos (resaltado azul)
 *  - Permite navegar libremente por todas las páginas del manual
 *  - Zoom ajustable para ver detalles de diagramas y listas
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BookOpen, Search, Loader2, FileText,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ExternalLink, AlertTriangle, ZoomIn, ZoomOut, Maximize2,
  Crosshair,
} from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { ref, listAll, getDownloadURL } from 'firebase/storage'
import { storage } from '@/services/firebase'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
} from '@/components/ui'
import type { Machine, Repuesto } from '@/types/repuestos'

// Worker PDF.js
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
}

interface ManualSearchModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  machine: Machine
  repuesto: Repuesto
}

interface SearchResult {
  page: number
  textSnippet: string
  matchCount: number
  /** Position number detected from the parts list (e.g., "55") */
  position: string | null
}

/** Rectangles that represent text positions on a PDF page */
interface TextRect {
  x: number
  y: number
  width: number
  height: number
}

type HighlightMode = 'code' | 'position'

const SCALE_STEPS = [1, 1.25, 1.5, 2, 2.5, 3]
const DEFAULT_SCALE_IDX = 2 // 1.5
/** How many pages before the parts-list page to look for diagrams */
const DIAGRAM_SEARCH_RANGE = 5

export function ManualSearchModal({
  open,
  onOpenChange,
  machine,
  repuesto,
}: ManualSearchModalProps) {
  const [loading, setLoading] = useState(true)
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

  // Position / diagram search state
  const [highlightMode, setHighlightMode] = useState<HighlightMode>('code')
  const [activePosition, setActivePosition] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const highlightLayerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const searchCode = repuesto.codigoBaader || ''
  const scale = SCALE_STEPS[scaleIdx] ?? 1.5

  // Detected position from the first result
  const detectedPosition = results.find(r => r.position)?.position ?? null

  // ─── Load manual URL from Storage ──────────────────────────
  const loadManual = useCallback(async () => {
    setLoading(true)
    setNoManual(false)
    setResults([])
    setMatchPages(new Set())
    setCurrentPage(1)
    setTotalPages(0)
    setScaleIdx(DEFAULT_SCALE_IDX)
    setHighlightMode('code')
    setActivePosition(null)

    if (machine.manuals && machine.manuals.length > 0) {
      setManualUrl(machine.manuals[0] ?? null)
      setLoading(false)
      return
    }

    try {
      const folderRef = ref(storage, `machines/${machine.id}/manuales`)
      const listResult = await listAll(folderRef)
      for (const item of listResult.items) {
        if (item.name.toLowerCase().endsWith('.pdf')) {
          const url = await getDownloadURL(item)
          setManualUrl(url)
          setLoading(false)
          return
        }
      }
    } catch {
      // No folder
    }

    setNoManual(true)
    setLoading(false)
  }, [machine])

  // ─── Search text in PDF ────────────────────────────────────
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

          // Extract position number: look for a 1-3 digit number before the code
          // Pattern in Baader manuals: "55 Schnittgegenlage ........ 519437"
          const positionNum = extractPositionNumber(beforeText)

          found.push({ page: i, textSnippet: snippet, matchCount, position: positionNum })
        }
      }

      setResults(found)
      setMatchPages(pages)
      if (found.length > 0 && found[0]) {
        setCurrentPage(found[0].page)
      }
    } catch (err) {
      console.error('Error searching PDF:', err)
    } finally {
      setSearching(false)
    }
  }, [searchCode])

  // ─── Find highlight rects for code on a page ──────────────
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

  // ─── Find highlight rects for position number (whole-word match) ──
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
      // Match standalone position number: exactly the number, or number at start/end of item
      // In diagrams, position numbers are often their own text item like "55"
      const isExactMatch = str === posNum
      const hasWordMatch = posRegex.test(item.str)
      if (!isExactMatch && !hasWordMatch) continue

      const tx = item.transform
      if (!tx) continue

      const fontSize = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3])
      const x = (tx[4] * viewport.scale)
      const y = viewport.height - (tx[5] * viewport.scale) - (fontSize * viewport.scale)
      // For exact matches, use a tighter box around the number
      const w = isExactMatch
        ? (item.width ?? posNum.length * fontSize * 0.7) * viewport.scale
        : posNum.length * fontSize * 0.7 * viewport.scale
      const h = fontSize * viewport.scale * 1.4

      rects.push({ x, y, width: w, height: h })
    }

    return rects
  }, [])

  // ─── Render page + highlights ──────────────────────────────
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

      // Draw highlight overlays
      if (highlightLayerRef.current) {
        const layer = highlightLayerRef.current
        layer.innerHTML = ''
        layer.style.width = `${viewport.width}px`
        layer.style.height = `${viewport.height}px`

        // Always highlight code matches (yellow) on match pages
        if (searchCode && matchPages.has(pageNum)) {
          const rects = await findHighlightRects(page, viewport, searchCode)
          for (const rect of rects) {
            layer.appendChild(createHighlightDiv(rect, 'yellow'))
          }
        }

        // Highlight position number (blue/cyan) when in position mode
        if (highlightMode === 'position' && activePosition) {
          const posRects = await findPositionRects(page, viewport, activePosition)
          for (const rect of posRects) {
            layer.appendChild(createHighlightDiv(rect, 'blue'))
          }
        }
      }
    } catch (err) {
      console.error('Error rendering page:', err)
    } finally {
      setRendering(false)
    }
  }, [pdfDoc, scale, searchCode, matchPages, findHighlightRects, findPositionRects, highlightMode, activePosition])

  // ─── Lifecycle ─────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      loadManual()
    }
    return () => {
      setPdfDoc(null)
      setResults([])
      setManualUrl(null)
      setMatchPages(new Set())
    }
  }, [open, loadManual])

  useEffect(() => {
    if (manualUrl && !loading) {
      searchInPdf(manualUrl)
    }
  }, [manualUrl, loading, searchInPdf])

  useEffect(() => {
    if (pdfDoc && currentPage >= 1 && currentPage <= totalPages) {
      renderPage(currentPage)
    }
  }, [pdfDoc, currentPage, renderPage, totalPages])

  // ─── Page navigation helpers ───────────────────────────────
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
  const goToDiagram = (posNum: string) => {
    setActivePosition(posNum)
    setHighlightMode('position')
    // Jump to a few pages before the first match (where diagrams usually are)
    const firstMatch = results[0]
    if (firstMatch) {
      const targetPage = Math.max(1, firstMatch.page - DIAGRAM_SEARCH_RANGE)
      goToPage(targetPage)
    }
  }

  const exitPositionMode = () => {
    setHighlightMode('code')
    setActivePosition(null)
    // Go back to first code match
    const firstMatch = results[0]
    if (firstMatch) goToPage(firstMatch.page)
  }

  const currentMatchInfo = results.find(r => r.page === currentPage) ?? null
  const isMatchPage = matchPages.has(currentPage)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[95vh] flex flex-col overflow-hidden p-0">
        {/* ─── Header ─── */}
        <DialogHeader className="shrink-0 px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-purple-500" />
            Buscar en Manual
          </DialogTitle>
        </DialogHeader>

        {/* ─── Search info bar ─── */}
        <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-y border-border shrink-0">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-foreground">
              Buscando <span className="font-mono font-bold text-purple-400">{searchCode}</span> en manual de <span className="font-semibold">{machine.nombre}</span>
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {repuesto.textoBreve || 'Repuesto'}
              {repuesto.codigoSAP && <span className="ml-2 opacity-50">(SAP: {repuesto.codigoSAP})</span>}
            </div>
          </div>
          {/* Position badge */}
          {detectedPosition && (
            <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30">
              <Crosshair className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-xs font-bold text-cyan-400">Pos. {detectedPosition}</span>
            </div>
          )}
        </div>

        {/* ─── Content ─── */}
        <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Cargando manual...</span>
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
              {/* ─── Toolbar ─── */}
              <div className="shrink-0 px-3 py-2 border-b border-border bg-muted/20 flex flex-wrap items-center gap-2">
                {/* Page navigation */}
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                    disabled={currentPage <= 1} onClick={() => goToPage(1)}
                    title="Primera página"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                    disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}
                    title="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <div className="flex items-center gap-1 mx-1">
                    <Input
                      className="h-7 w-14 text-center text-xs font-mono px-1"
                      value={pageInput || currentPage}
                      onChange={(e) => setPageInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handlePageInputSubmit()}
                      onBlur={handlePageInputSubmit}
                      onFocus={() => setPageInput(String(currentPage))}
                    />
                    <span className="text-xs text-muted-foreground">/ {totalPages}</span>
                  </div>

                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                    disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)}
                    title="Página siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                    disabled={currentPage >= totalPages} onClick={() => goToPage(totalPages)}
                    title="Última página"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="h-5 w-px bg-border mx-1" />

                {/* Zoom */}
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                    disabled={scaleIdx <= 0}
                    onClick={() => setScaleIdx(Math.max(0, scaleIdx - 1))}
                    title="Reducir"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-[11px] font-mono text-muted-foreground w-10 text-center">
                    {Math.round(scale * 100)}%
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                    disabled={scaleIdx >= SCALE_STEPS.length - 1}
                    onClick={() => setScaleIdx(Math.min(SCALE_STEPS.length - 1, scaleIdx + 1))}
                    title="Ampliar"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                    onClick={() => setScaleIdx(DEFAULT_SCALE_IDX)}
                    title="Tamaño original"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
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
                          onClick={goPrevMatch} title="Coincidencia anterior"
                        >
                          <ChevronLeft className="h-3 w-3" /> Ant.
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1"
                          onClick={goNextMatch} title="Siguiente coincidencia"
                        >
                          Sig. <ChevronRight className="h-3 w-3" />
                        </Button>
                        {/* "Ver en diagrama" button */}
                        {detectedPosition && (
                          <>
                            <div className="h-5 w-px bg-border mx-1" />
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2.5 text-[11px] gap-1.5 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10"
                              onClick={() => goToDiagram(detectedPosition)}
                              title={`Buscar posición ${detectedPosition} en el diagrama`}
                            >
                              <Crosshair className="h-3.5 w-3.5" />
                              Ver pos. {detectedPosition} en diagrama
                            </Button>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Sin coincidencias para &quot;{searchCode}&quot;</span>
                    )}
                  </>
                ) : (
                  /* Position mode toolbar */
                  <div className="flex items-center gap-1.5">
                    <Crosshair className="h-3.5 w-3.5 text-cyan-400" />
                    <span className="text-[11px] text-cyan-300 font-medium">
                      Modo diagrama — buscando posición <span className="font-bold">{activePosition}</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px] gap-1 text-yellow-400 hover:text-yellow-300"
                      onClick={exitPositionMode}
                    >
                      ← Volver a código
                    </Button>
                  </div>
                )}

                {/* Open external */}
                {manualUrl && (
                  <>
                    <div className="flex-1" />
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] gap-1"
                      onClick={() => window.open(manualUrl, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" /> Abrir PDF
                    </Button>
                  </>
                )}
              </div>

              {/* Position mode info bar (blue) */}
              {highlightMode === 'position' && activePosition && (
                <div className="shrink-0 px-4 py-1.5 bg-cyan-500/10 border-b border-cyan-500/20 text-xs flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-foreground">
                    Buscando <span className="font-bold text-cyan-400">posición {activePosition}</span> en el diagrama
                  </span>
                  <span className="text-muted-foreground ml-1">
                    — navega por las páginas cercanas para encontrar el diagrama con la pieza marcada
                  </span>
                </div>
              )}

              {/* Code match info bar (yellow) */}
              {highlightMode === 'code' && isMatchPage && currentMatchInfo && (
                <div className="shrink-0 px-4 py-1.5 bg-yellow-500/10 border-b border-yellow-500/20 text-xs flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                  <span className="text-foreground">
                    Pág. <span className="font-bold">{currentPage}</span>
                    {' — '}{currentMatchInfo.matchCount} coincidencia{currentMatchInfo.matchCount > 1 ? 's' : ''}
                    {currentMatchInfo.position && (
                      <span className="ml-2 text-cyan-400 font-medium">
                        (Posición {currentMatchInfo.position})
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground italic ml-2 truncate hidden sm:inline">
                    &quot;...{highlightCode(currentMatchInfo.textSnippet, searchCode)}...&quot;
                  </span>
                </div>
              )}

              {/* Quick match page pills */}
              {results.length > 0 && highlightMode === 'code' && (
                <div className="shrink-0 px-3 py-1.5 border-b border-border flex flex-wrap items-center gap-1 bg-muted/10">
                  <span className="text-[10px] text-muted-foreground mr-1">Coincidencias en:</span>
                  {results.map((r) => (
                    <button
                      key={r.page}
                      onClick={() => goToPage(r.page)}
                      className={`
                        px-2 py-0.5 text-[11px] rounded-full transition-colors
                        ${r.page === currentPage
                          ? 'bg-yellow-500/30 text-yellow-300 font-bold ring-1 ring-yellow-500/50'
                          : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                        }
                      `}
                    >
                      p.{r.page}
                      {r.matchCount > 1 && <span className="ml-0.5 opacity-60">×{r.matchCount}</span>}
                    </button>
                  ))}
                </div>
              )}

              {/* ─── PDF Canvas ─── */}
              <div ref={scrollContainerRef} className="flex-1 overflow-auto min-h-0 bg-neutral-800/50">
                <div className="flex justify-center p-4">
                  <div className="relative inline-block shadow-xl">
                    {rendering && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-20 rounded">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    )}
                    <canvas ref={canvasRef} className="block max-w-none" />
                    <div
                      ref={highlightLayerRef}
                      className="absolute top-0 left-0 pointer-events-none"
                      style={{ zIndex: 10 }}
                    />
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

/** Create a highlight div for the overlay layer */
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

/**
 * Extract position number from text before the code match.
 * In Baader manuals, parts lists look like:
 *   "55 Schnittgegenlage ........... 519437"
 * So we look for a standalone 1-3 digit number followed by a letter (start of description).
 */
function extractPositionNumber(beforeText: string): string | null {
  // Look for the last occurrence of a 1-3 digit number followed by a space and letter
  // This is the part position in the list
  const matches = [...beforeText.matchAll(/(?:^|\s)(\d{1,3})\s+[A-Za-zÀ-ÿ]/g)]
  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1]
    if (lastMatch?.[1]) return lastMatch[1]
  }
  return null
}

/** Highlight the search code in a text snippet using bold/color */
function highlightCode(text: string, code: string): React.ReactNode {
  if (!code) return text
  const parts = text.split(new RegExp(`(${escapeRegex(code)})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === code.toLowerCase() ? (
      <span key={i} className="font-bold text-yellow-400 not-italic">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
