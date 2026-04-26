/**
 * MachineManualPanel — Gestión de manuales PDF por máquina
 * 
 * Permite:
 * - Ver manuales ya subidos para la máquina actual
 * - Subir nuevos manuales PDF
 * - Abrir manual en visor con búsqueda por código de fabricante
 * - Listar todos los PDFs disponibles en Storage
 * - Indicador sutil de precarga de PDFs (barra/badge)
 * - Botón para limpiar caché de PDFs
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { FileText, Upload, Trash2, BookOpen, Loader2, ExternalLink, HardDriveDownload, CheckCircle2, RefreshCw } from 'lucide-react'
import { ref, listAll, getDownloadURL, deleteObject } from 'firebase/storage'
import { doc, updateDoc, Timestamp, arrayUnion, arrayRemove } from 'firebase/firestore'
import { storage, db } from '@/services/firebase'
import { useStorage } from '@/hooks/repuestos/useStorage'
import { useIsAdmin } from '@/store/authStore'
import { Button } from '@/components/ui'
import { preloadMachinePdfsWithProgress, preloadPdf, clearPdfCache, isCached } from '@/services/pdfCache'
import type { Machine } from '@/types/repuestos'
import { logger } from '@/lib/logger'

interface MachineManualPanelProps {
  machine?: Machine
  /** ID alternativo para almacenar manuales (ej: nodo SAP sin vincular) */
  storageId?: string
  /** Nombre para mostrar cuando no hay machine */
  displayName?: string
  className?: string
}

interface ManualFile {
  name: string
  url: string
  fullPath: string
}

export function MachineManualPanel({ machine, storageId, displayName, className = '' }: MachineManualPanelProps) {
  const effectiveId = machine?.id || storageId
  const effectiveName = machine?.nombre || displayName || 'este equipo'
  // Ruta de storage: machines/{id}/manuales para máquinas, equipment/{id}/manuales para nodos SAP
  const storagePath = machine ? `machines/${machine.id}/manuales` : `equipment/${storageId}/manuales`
  const isAdmin = useIsAdmin()
  const { uploadManualPDF, uploading, progress } = useStorage(effectiveId || null, storagePath)
  const [manuals, setManuals] = useState<ManualFile[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  // ─── PDF Cache state ─────────────────────────────────────
  const [cacheState, setCacheState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [cacheLoaded, setCacheLoaded] = useState(0)
  const [cacheTotal, setCacheTotal] = useState(0)
  const [clearingCache, setClearingCache] = useState(false)
  const preloadAbortRef = useRef(false)

  // Cargar lista de manuales desde Storage
  const loadManuals = useCallback(async () => {
    setLoading(true)
    try {
      const folderRef = ref(storage, storagePath)
      const listResult = await listAll(folderRef)

      const files: ManualFile[] = []
      for (const item of listResult.items) {
        try {
          const url = await getDownloadURL(item)
          files.push({
            name: item.name.replace(/_\d+\.pdf$/i, '.pdf').replace(/_/g, ' '),
            url,
            fullPath: item.fullPath,
          })
        } catch {
          // Skip files that can't be read
        }
      }
      setManuals(files)
    } catch {
      // No manuals folder yet — that's fine
      setManuals([])
    } finally {
      setLoading(false)
    }
  }, [storagePath])

  useEffect(() => { loadManuals() }, [loadManuals])

  // ─── Preload PDFs con progreso ───────────────────────────
  useEffect(() => {
    preloadAbortRef.current = false
    setCacheState('idle')
    setCacheLoaded(0)
    setCacheTotal(0)

    // Esperar a que los manuales se listen antes de precargar
    if (loading || !effectiveId) return

    const runPreload = async () => {
      setCacheState('loading')
      try {
        if (machine) {
          await preloadMachinePdfsWithProgress(machine, ({ loaded, total, done }) => {
            if (preloadAbortRef.current) return
            setCacheLoaded(loaded)
            setCacheTotal(total)
            if (done) setCacheState('done')
          })
        } else {
          // Para nodos SAP sin machine: precargar desde las URLs ya listadas
          const total = manuals.length
          setCacheTotal(total)
          if (total === 0) { setCacheState('done'); return }
          let loaded = 0
          for (const m of manuals) {
            if (preloadAbortRef.current) return
            try { await preloadPdf(m.url) } catch { /* skip */ }
            loaded++
            setCacheLoaded(loaded)
          }
          if (!preloadAbortRef.current) setCacheState('done')
        }
      } catch {
        if (!preloadAbortRef.current) setCacheState('idle')
      }
    }

    runPreload()

    return () => { preloadAbortRef.current = true }
  }, [machine, effectiveId, loading, manuals])

  // ─── Clear cache handler ─────────────────────────────────
  const handleClearCache = async () => {
    setClearingCache(true)
    try {
      await clearPdfCache()
      setCacheState('idle')
      setCacheLoaded(0)
      setCacheTotal(0)
      // Re-trigger preload
      preloadAbortRef.current = false
      await loadManuals()
    } catch {
      setCacheState('idle')
    } finally {
      setClearingCache(false)
    }
  }

  // Upload handler
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !effectiveId) return

    const baseName = file.name.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9áéíóúñ\s-]/gi, '')
    try {
      const url = await uploadManualPDF(file, baseName)
      if (machine) {
        // Guardar en machine.manuals array para acceso rápido
        const machineRef = doc(db, 'machines', machine.id)
        await updateDoc(machineRef, {
          manuals: arrayUnion(url),
          updatedAt: Timestamp.now(),
        })
      } else if (storageId) {
        // Guardar referencia en hierarchy/{nodeId}.manuals
        const nodeRef = doc(db, 'hierarchy', storageId)
        await updateDoc(nodeRef, {
          manuals: arrayUnion(url),
          actualizadoEn: Timestamp.now(),
        })
      }
      await loadManuals()
    } catch (err) {
      logger.error('Error uploading manual', err instanceof Error ? err : new Error(String(err)))
    }
    // Reset input
    e.target.value = ''
  }

  // Delete handler
  const handleDelete = async (manual: ManualFile) => {
    if (!confirm(`¿Eliminar "${manual.name}"?`)) return
    setDeleting(manual.fullPath)
    try {
      const fileRef = ref(storage, manual.fullPath)
      await deleteObject(fileRef)
      if (machine) {
        const machineRef = doc(db, 'machines', machine.id)
        await updateDoc(machineRef, {
          manuals: arrayRemove(manual.url),
          updatedAt: Timestamp.now(),
        })
      } else if (storageId) {
        const nodeRef = doc(db, 'hierarchy', storageId)
        await updateDoc(nodeRef, {
          manuals: arrayRemove(manual.url),
          actualizadoEn: Timestamp.now(),
        })
      }
      await loadManuals()
    } catch (err) {
      logger.error('Error deleting manual', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setDeleting(null)
    }
  }

  // Open manual in new tab
  const handleOpen = (url: string) => {
    window.open(url, '_blank')
  }

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-muted-foreground text-sm py-3 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando manuales...
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-purple-500" />
          <span className="text-sm font-semibold text-foreground">Manuales de la máquina</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {manuals.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Cache clear button */}
          {cacheState === 'done' && cacheTotal > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearCache}
              disabled={clearingCache}
              title="Limpiar caché de manuales (se volverán a descargar)"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-orange-500"
            >
              {clearingCache ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          {isAdmin && (
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 text-xs"
                disabled={uploading}
                asChild
              >
                <span>
                  {uploading ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {progress}%
                    </>
                  ) : (
                    <>
                      <Upload className="h-3 w-3" />
                      Subir PDF
                    </>
                  )}
                </span>
              </Button>
            </label>
          )}
        </div>
      </div>

      {/* Cache progress indicator */}
      {cacheTotal > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                cacheState === 'done'
                  ? 'bg-emerald-500'
                  : 'bg-blue-500 animate-pulse'
              }`}
              style={{ width: `${cacheTotal > 0 ? (cacheLoaded / cacheTotal) * 100 : 0}%` }}
            />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {cacheState === 'loading' ? (
              <>
                <HardDriveDownload className="h-3 w-3 text-blue-500 animate-pulse" />
                <span className="text-[10px] text-blue-500 font-medium">
                  Precargando {cacheLoaded}/{cacheTotal}
                </span>
              </>
            ) : cacheState === 'done' ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                <span className="text-[10px] text-emerald-500 font-medium">
                  {cacheTotal} {cacheTotal === 1 ? 'manual listo' : 'manuales listos'}
                </span>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Manual list */}
      {manuals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground border border-dashed rounded-lg bg-muted/10 gap-2">
          <FileText className="h-8 w-8 text-muted-foreground/30" />
          <span className="text-xs">No hay manuales cargados para {effectiveName}</span>
          {isAdmin && (
            <span className="text-[10px] text-muted-foreground/60">
              Sube un PDF para habilitar la búsqueda por código de fabricante
            </span>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {manuals.map((manual) => (
            <div
              key={manual.fullPath}
              className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted/30 transition-colors group"
            >
              <div className="relative shrink-0">
                <FileText className="h-5 w-5 text-red-500/80" />
                {isCached(manual.url) && (
                  <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-background" title="En caché — acceso instantáneo" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{manual.name}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpen(manual.url)}
                  title="Abrir en nueva pestaña"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(manual)}
                    disabled={deleting === manual.fullPath}
                    title="Eliminar manual"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  >
                    {deleting === manual.fullPath ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
