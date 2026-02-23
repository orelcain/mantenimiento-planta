/**
 * ManualSearchModal — Busca un código de fabricante dentro del manual PDF de la máquina
 * 
 * Usa pdf.js para extraer texto de cada página y buscar coincidencias.
 * Muestra la/las páginas donde aparece el código con highlight.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { BookOpen, Search, Loader2, FileText, ChevronLeft, ChevronRight, ExternalLink, AlertTriangle } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ref, listAll, getDownloadURL } from 'firebase/storage'
import { storage } from '@/services/firebase'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
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
}

export function ManualSearchModal({
  open,
  onOpenChange,
  machine,
  repuesto,
}: ManualSearchModalProps) {
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [manualUrl, setManualUrl] = useState<string | null>(null)
  const [manualName, setManualName] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [noManual, setNoManual] = useState(false)
  const [currentResultIdx, setCurrentResultIdx] = useState(0)
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [rendering, setRendering] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const searchCode = repuesto.codigoBaader || ''

  // Load manual URL from Storage
  const loadManual = useCallback(async () => {
    setLoading(true)
    setNoManual(false)
    setResults([])

    // First check machine.manuals array
    if (machine.manuals && machine.manuals.length > 0) {
      setManualUrl(machine.manuals[0])
      setManualName('Manual principal')
      setLoading(false)
      return
    }

    // Fallback: search in Storage
    try {
      const folderRef = ref(storage, `machines/${machine.id}/manuales`)
      const listResult = await listAll(folderRef)
      for (const item of listResult.items) {
        if (item.name.toLowerCase().endsWith('.pdf')) {
          const url = await getDownloadURL(item)
          setManualUrl(url)
          setManualName(item.name)
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

  // Search text in PDF
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

      const found: SearchResult[] = []
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
          // Extract snippet around match
          const matchIdx = lowerText.indexOf(searchLower)
          const start = Math.max(0, matchIdx - 40)
          const end = Math.min(pageText.length, matchIdx + searchCode.length + 40)
          const snippet = pageText.substring(start, end)

          found.push({
            page: i,
            textSnippet: snippet,
            matchCount,
          })
        }
      }

      setResults(found)
      setCurrentResultIdx(0)
    } catch (err) {
      console.error('Error searching PDF:', err)
    } finally {
      setSearching(false)
    }
  }, [searchCode])

  // Render page to canvas
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc || !canvasRef.current) return
    setRendering(true)
    try {
      const page = await pdfDoc.getPage(pageNum)
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const viewport = page.getViewport({ scale: 1.5 })
      canvas.height = viewport.height
      canvas.width = viewport.width

      await page.render({
        canvasContext: ctx,
        viewport,
      }).promise
    } catch (err) {
      console.error('Error rendering page:', err)
    } finally {
      setRendering(false)
    }
  }, [pdfDoc])

  // Trigger load on open
  useEffect(() => {
    if (open) {
      loadManual()
    }
    return () => {
      setPdfDoc(null)
      setResults([])
      setManualUrl(null)
    }
  }, [open, loadManual])

  // Search once manual is loaded
  useEffect(() => {
    if (manualUrl && !loading) {
      searchInPdf(manualUrl)
    }
  }, [manualUrl, loading, searchInPdf])

  // Render current result page
  useEffect(() => {
    if (results.length > 0 && results[currentResultIdx]) {
      renderPage(results[currentResultIdx].page)
    }
  }, [results, currentResultIdx, renderPage])

  const currentResult = results[currentResultIdx] || null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-purple-500" />
            Buscar en Manual
          </DialogTitle>
        </DialogHeader>

        {/* Search info bar */}
        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border shrink-0">
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Cargando manual...</span>
            </div>
          ) : noManual ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <AlertTriangle className="h-10 w-10 text-amber-500/60" />
              <div>
                <p className="text-sm font-medium text-foreground">No hay manual cargado</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Sube un PDF del manual de <span className="font-semibold">{machine.nombre}</span> para habilitar la búsqueda por código de fabricante.
                </p>
              </div>
            </div>
          ) : searching ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              <span className="text-sm text-muted-foreground">Buscando "{searchCode}" en el PDF...</span>
              <span className="text-xs text-muted-foreground">Esto puede tomar unos segundos</span>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Search className="h-10 w-10 text-muted-foreground/30" />
              <div>
                <p className="text-sm font-medium text-foreground">Sin resultados</p>
                <p className="text-xs text-muted-foreground mt-1">
                  El código "<span className="font-mono">{searchCode}</span>" no se encontró en {manualName || 'el manual'}.
                </p>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Verifica que el código sea correcto o abre el manual para buscar manualmente.
                </p>
              </div>
              {manualUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(manualUrl, '_blank')}
                  className="gap-1.5 mt-2"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir manual completo
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Result navigation */}
              <div className="flex items-center justify-between p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-foreground">
                    <span className="font-bold text-green-400">{results.length}</span> página{results.length > 1 ? 's' : ''} con coincidencias
                  </span>
                </div>
                {results.length > 1 && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentResultIdx(Math.max(0, currentResultIdx - 1))}
                      disabled={currentResultIdx === 0}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs tabular-nums font-mono text-muted-foreground px-1">
                      {currentResultIdx + 1}/{results.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCurrentResultIdx(Math.min(results.length - 1, currentResultIdx + 1))}
                      disabled={currentResultIdx === results.length - 1}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Current result info */}
              {currentResult && (
                <div className="p-2 bg-muted/30 rounded-lg text-xs">
                  <span className="text-muted-foreground">Página </span>
                  <span className="font-bold text-foreground">{currentResult.page}</span>
                  <span className="text-muted-foreground"> — {currentResult.matchCount} coincidencia{currentResult.matchCount > 1 ? 's' : ''}</span>
                  <div className="mt-1 text-muted-foreground italic line-clamp-2">
                    "...{highlightCode(currentResult.textSnippet, searchCode)}..."
                  </div>
                </div>
              )}

              {/* PDF Page render */}
              <div className="relative rounded-lg border border-border overflow-hidden bg-white">
                {rendering && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  className="w-full h-auto"
                />
              </div>

              {/* Quick page links */}
              {results.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-[10px] text-muted-foreground mr-1 self-center">Páginas:</span>
                  {results.map((r, idx) => (
                    <button
                      key={r.page}
                      onClick={() => setCurrentResultIdx(idx)}
                      className={`
                        px-2 py-0.5 text-[11px] rounded-full transition-colors
                        ${idx === currentResultIdx
                          ? 'bg-purple-500/20 text-purple-400 font-bold'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                        }
                      `}
                    >
                      p.{r.page}
                      {r.matchCount > 1 && <span className="ml-0.5 opacity-60">×{r.matchCount}</span>}
                    </button>
                  ))}
                </div>
              )}

              {/* Open full manual */}
              {manualUrl && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(manualUrl, '_blank')}
                    className="gap-1.5 text-xs"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Abrir manual completo
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Highlight the search code in the snippet using bold/color */
function highlightCode(text: string, code: string): React.ReactNode {
  if (!code) return text
  const parts = text.split(new RegExp(`(${escapeRegex(code)})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === code.toLowerCase() ? (
      <span key={i} className="font-bold text-purple-400 not-italic">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
