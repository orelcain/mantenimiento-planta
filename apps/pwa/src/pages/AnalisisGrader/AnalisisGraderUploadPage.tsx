/**
 * P1) Carga de archivos Excel Pieza-Pieza
 *
 * Drag&Drop múltiples xlsx pieza-pieza. Se pueden agregar varios archivos
 * durante el turno; el sistema los fusiona automáticamente y muestra
 * el rango de tiempo (turno) detectado.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, Badge } from '@/components/ui'
import {
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  X,
  Loader2,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'
import { parseFile, mergeParsedData } from '@/services/grader/graderExcelParser'
import { getModuleRanges } from '@/services/grader/graderModuleConfig.service'
import { deleteDailySummary } from '@/services/grader/graderDailySummary.service'
import { listGraderUploads, saveGraderUpload, updateGraderUpload, uploadGraderFile, deleteGraderUpload } from '@/services/grader/graderUpload.service'
import { DEFAULT_SHIFT_SCHEDULE, inferShiftIdFromSchedule, normalizeShiftSchedule, shiftIdToKey } from '@/services/grader/graderShiftSchedule'
import { GraderHistoricalCalendar } from '@/components/grader/GraderHistoricalCalendar'
import type {
  ParsedMatrixData,
  UploadedMatrixFile,
  MatrixFileKind,
  GraderUpload,
} from '@/services/grader/types'

interface Props {
  onComplete: (data: ParsedMatrixData) => void
  /** Archivos previamente parseados (para no perder al navegar atrás) */
  initialFiles?: FileParsed[]
  /** Callback para sincronizar archivos con el padre */
  onFilesChange?: (files: FileParsed[]) => void
}

export interface FileParsed {
  fileMeta: UploadedMatrixFile
  partialData: Partial<ParsedMatrixData>
  file: File
}

const KIND_LABELS: Record<MatrixFileKind, string> = {
  PIEZA_PIEZA: 'Pieza-Pieza',
  PUERTA_0: 'Puerta 0 / Punto Cero',
  PORC_CALIDAD: '% Calidad',
  TOTALES_PRODUCCION: 'Totales Producción',
  TOTAL_PIEZAS_POR_FOLIO: 'Total Piezas por Folio',
  UNKNOWN: 'No reconocido',
}

const KIND_COLORS: Record<MatrixFileKind, string> = {
  PIEZA_PIEZA: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  PUERTA_0: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  PORC_CALIDAD: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  TOTALES_PRODUCCION: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  TOTAL_PIEZAS_POR_FOLIO: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  UNKNOWN: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const ACCEPTED_KINDS: MatrixFileKind[] = ['PIEZA_PIEZA', 'PUERTA_0']

function buildUploadId(sessionDate: string, shiftId: string | undefined, kind: MatrixFileKind, filename?: string): string {
  const shiftKey = shiftIdToKey(shiftId)
  // Incluir nombre de archivo sanitizado para evitar colisiones cuando
  // se cargan 2 archivos del mismo kind (o cuando el parser los clasifica igual)
  if (filename) {
    const safeName = filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50)
    return `${sessionDate}__${shiftKey}__${kind}__${safeName}`
  }
  return `${sessionDate}__${shiftKey}__${kind}`
}

function getUploadTimestamp(upload: GraderUpload): number {
  const ts = upload.updatedAt || upload.createdAt || upload.fileMeta.parsedAt
  return ts ? new Date(ts).getTime() : 0
}

function normalizeUploads(list: GraderUpload[], schedule: Parameters<typeof inferShiftIdFromSchedule>[1]): GraderUpload[] {
  const map = new Map<string, GraderUpload>()
  for (const u of list) {
    const dateKey = u.sessionDate || toDateKey(u.inferred?.startAt)
    const shift = u.shiftId || inferShiftIdFromSchedule(u.inferred?.startAt, schedule)
    const key = buildUploadId(dateKey, shift, u.fileMeta.kind)
    const existing = map.get(key)
    if (!existing || getUploadTimestamp(u) >= getUploadTimestamp(existing)) {
      map.set(key, u)
    }
  }
  return Array.from(map.values())
}

function toDateKey(iso?: string): string {
  if (!iso) return new Date().toISOString().slice(0, 10)
  return iso.slice(0, 10)
}

/* Nota: el calendario inline fue reemplazado por `<GraderHistoricalCalendar />`
   que lee de `graderDailySummaries` (datos históricos unificados). Las helpers
   de fecha locales se eliminaron porque viven dentro del componente compartido. */


export function AnalisisGraderUploadPage({ onComplete, initialFiles, onFilesChange }: Props) {
  const [files, setFiles] = useState<FileParsed[]>(initialFiles || [])
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploads, setUploads] = useState<GraderUpload[]>([])
  const [currentTurnoDate, setCurrentTurnoDate] = useState<string | null>(null)
  const [currentTurnoShift, setCurrentTurnoShift] = useState<string>('Turno noche')
  const [loadingTurno, setLoadingTurno] = useState(false)
  const [shiftSchedule, setShiftSchedule] = useState(DEFAULT_SHIFT_SCHEDULE)
  const inputRef = useRef<HTMLInputElement>(null)
  const [searchParams] = useSearchParams()
  const autoLoadRef = useRef(false)
  const user = useAuthStore((s) => s.user)

  // Sincronizar con el padre cuando cambian los archivos
  const updateFiles = useCallback((updater: (prev: FileParsed[]) => FileParsed[]) => {
    setFiles((prev) => {
      const next = updater(prev)
      onFilesChange?.(next)
      return next
    })
  }, [onFilesChange])

  const hasPiezaPieza = files.some((f) => f.fileMeta.kind === 'PIEZA_PIEZA')

  useEffect(() => {
    listGraderUploads().then((list) => setUploads(normalizeUploads(list, DEFAULT_SHIFT_SCHEDULE))).catch(() => {})
  }, [])

  useEffect(() => {
    getModuleRanges()
      .then((cfg) => {
        const schedule = normalizeShiftSchedule(cfg?.shiftSchedule)
        setShiftSchedule(schedule)
      })
      .catch(() => {
        setShiftSchedule(DEFAULT_SHIFT_SCHEDULE)
      })
  }, [])

  useEffect(() => {
    if (uploads.length === 0) return
    setUploads((prev) => normalizeUploads(prev, shiftSchedule))
  }, [shiftSchedule, uploads.length])

  useEffect(() => {
    const dateParam = searchParams.get('date')
    const shiftParam = searchParams.get('shift')
    const auto = searchParams.get('autoload') === '1'
    if (dateParam) setCurrentTurnoDate(dateParam)
    if (shiftParam) setCurrentTurnoShift(decodeURIComponent(shiftParam))
    if (auto) autoLoadRef.current = true
  }, [searchParams])

  // Detectar rango de turno a partir de todos los pieza-pieza cargados
  const turnoRange = useMemo(() => {
    const piezas = files.filter((f) => f.fileMeta.kind === 'PIEZA_PIEZA')
    if (piezas.length === 0) return null

    let minTs: string | undefined
    let maxTs: string | undefined
    let totalPieces = 0

    for (const p of piezas) {
      const records = p.partialData.pieceRecords || []
      for (const r of records) {
        totalPieces += r.pieces
        if (!minTs || r.ts < minTs) minTs = r.ts
        if (!maxTs || r.ts > maxTs) maxTs = r.ts
      }
    }

    if (!minTs || !maxTs) return null

    const startDate = new Date(minTs)
    const endDate = new Date(maxTs)
    const fmt = (d: Date) => d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
    const fmtDate = (d: Date) => d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })

    return {
      start: fmt(startDate),
      end: fmt(endDate),
      date: fmtDate(startDate),
      durationMin: Math.round((endDate.getTime() - startDate.getTime()) / 60000),
      totalPieces,
    }
  }, [files])

  const handleFiles = useCallback(async (newFiles: FileList | File[]) => {
    setParsing(true)
    setError(null)
    setUploadError(null)

    const fileArray = Array.from(newFiles).filter(
      (f) => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'),
    )

    if (fileArray.length === 0) {
      setError('Solo se aceptan archivos .xlsx o .xls')
      setParsing(false)
      return
    }

    try {
      const parsed: FileParsed[] = []
      for (const file of fileArray) {
        const result = await parseFile(file)
        const inferred = result.partialData.inferred
        const inferredDate = toDateKey(inferred?.startAt)
        const inferredShift = inferShiftIdFromSchedule(inferred?.startAt, shiftSchedule)
        const sessionDate = currentTurnoDate || inferredDate
        const shiftId = currentTurnoDate ? currentTurnoShift : inferredShift
        const uploadId = buildUploadId(sessionDate, shiftId, result.fileMeta.kind, file.name)
        result.fileMeta.id = uploadId
        // Aceptar pieza-pieza y puerta 0; advertir si se carga otro tipo
        if (!ACCEPTED_KINDS.includes(result.fileMeta.kind)) {
          result.fileMeta.warnings.push(
            `Tipo "${KIND_LABELS[result.fileMeta.kind]}" detectado — solo se requiere Pieza-Pieza y Puerta 0`,
          )
        }
        // Persistir upload para calendario (si hay usuario)
        if (user) {
          const upload = await saveGraderUpload({
            id: uploadId,
            fileMeta: result.fileMeta,
            inferred,
            sessionDate,
            shiftId,
            createdBy: user.id,
          })
          // Subir archivo a Storage
          try {
            const storageInfo = await uploadGraderFile(file, upload.id)
            await updateGraderUpload(upload.id, {
              fileMeta: {
                ...upload.fileMeta,
                storagePath: storageInfo.storagePath,
                downloadURL: storageInfo.downloadURL,
              },
            })
            upload.fileMeta.storagePath = storageInfo.storagePath
            upload.fileMeta.downloadURL = storageInfo.downloadURL
          } catch {
            setUploadError('No se pudo subir el archivo a Storage.')
          }
          setUploads((prev) => normalizeUploads([upload, ...prev], shiftSchedule))
          if (result.fileMeta.kind === 'PIEZA_PIEZA' || result.fileMeta.kind === 'PUERTA_0') {
            try {
              await deleteDailySummary(sessionDate, shiftId)
            } catch {
              // Evitar bloquear carga si no hay permisos para invalidar el resumen.
            }
          }
        }
        if (!currentTurnoDate) setCurrentTurnoDate(sessionDate)
        if (!currentTurnoShift) setCurrentTurnoShift(shiftId)
        parsed.push({ ...result, file })
      }
      updateFiles((prev) => {
        const map = new Map<string, FileParsed>()
        for (const item of prev) map.set(item.fileMeta.id, item)
        for (const item of parsed) map.set(item.fileMeta.id, item)
        return Array.from(map.values())
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al parsear archivo')
      if (!user) {
        setUploadError('No se pudo guardar el archivo en calendario: usuario no autenticado.')
      } else {
        setUploadError('No se pudo guardar el archivo en calendario.')
      }
    } finally {
      setParsing(false)
    }
  }, [updateFiles, user, shiftSchedule, currentTurnoDate, currentTurnoShift])

  const handleRemoveFile = useCallback(async (id: string) => {
    // Eliminar de Firestore + Storage si existe en uploads
    const upload = uploads.find((u) => u.id === id)
    if (upload) {
      try {
        await deleteGraderUpload(upload)
        setUploads((prev) => prev.filter((u) => u.id !== id))
      } catch {
        setUploadError('No se pudo eliminar el archivo del servidor.')
      }
    }
    updateFiles((prev) => prev.filter((f) => f.fileMeta.id !== id))
  }, [uploads, updateFiles])

  // handleDeleteUpload fue removido junto con el GraderInlineCalendar local.
  // Si más adelante se necesita borrar un upload desde el Wizard, se puede
  // pasar un `onDeleteUpload` opcional al GraderHistoricalCalendar.

  const handleLoadTurno = useCallback(async () => {
    if (!currentTurnoDate || !currentTurnoShift) return
    setLoadingTurno(true)
    setUploadError(null)
    try {
      const turnoUploads = uploads.filter((u) => {
        const dateKey = u.sessionDate || toDateKey(u.inferred?.startAt)
        const shift = u.shiftId || inferShiftIdFromSchedule(u.inferred?.startAt, shiftSchedule)
        return dateKey === currentTurnoDate && shift === currentTurnoShift
      })

      if (turnoUploads.length === 0) {
        setUploadError('No hay archivos en el calendario para ese turno.')
        return
      }

      const parsed: FileParsed[] = []
      for (const u of turnoUploads) {
        if (!u.fileMeta.downloadURL) continue
        const res = await fetch(u.fileMeta.downloadURL)
        const blob = await res.blob()
        const file = new File([blob], u.fileMeta.name, {
          type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        const result = await parseFile(file)
        result.fileMeta.id = u.id
        result.fileMeta.name = u.fileMeta.name
        result.fileMeta.sizeBytes = u.fileMeta.sizeBytes
        result.fileMeta.storagePath = u.fileMeta.storagePath
        result.fileMeta.downloadURL = u.fileMeta.downloadURL
        parsed.push({ ...result, file })
      }

      if (parsed.length === 0) {
        setUploadError('No se pudieron cargar archivos del calendario (sin URL).')
        return
      }

      updateFiles(() => parsed)
      const merged = mergeParsedData(parsed)
      // Guardar último turno analizado para restaurar al recargar
      try {
        localStorage.setItem('grader_last_session', JSON.stringify({
          date: currentTurnoDate,
          shiftId: currentTurnoShift,
        }))
      } catch { /* localStorage no disponible */ }
      onComplete(merged)
    } catch {
      setUploadError('Error al cargar archivos del calendario.')
    } finally {
      setLoadingTurno(false)
    }
  }, [currentTurnoDate, currentTurnoShift, uploads, shiftSchedule, updateFiles, onComplete])

  useEffect(() => {
    if (!autoLoadRef.current) return
    if (!currentTurnoDate || !currentTurnoShift) return
    if (uploads.length === 0) return
    if (loadingTurno) return
    autoLoadRef.current = false
    handleLoadTurno()
  }, [uploads.length, currentTurnoDate, currentTurnoShift, loadingTurno, handleLoadTurno])

  // Auto-análisis: cada vez que cambian los archivos y hay PIEZA_PIEZA, disparar análisis
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])
  useEffect(() => {
    const hasPP = files.some((f) => f.fileMeta.kind === 'PIEZA_PIEZA')
    if (!hasPP) return
    const merged = mergeParsedData(files)
    onCompleteRef.current(merged)
  }, [files]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      {/* Zona de carga unificada */}
      <Card className="lg:border-l-4 lg:border-l-blue-500/40 lg:hover:shadow-md lg:transition-shadow">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={cn('text-xs', KIND_COLORS.PIEZA_PIEZA)}>Pieza-Pieza</Badge>
            <Badge className={cn('text-xs', KIND_COLORS.PUERTA_0)}>Puerta 0</Badge>
            <span className="text-xs text-muted-foreground">
              Arrastra uno o ambos archivos — se detectan automáticamente
            </span>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-5 lg:p-8 text-center cursor-pointer transition-all duration-200 group',
              dragOver
                ? 'border-primary bg-primary/10 scale-[1.02] shadow-lg shadow-primary/10'
                : 'border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/[0.02]',
            )}
          >
            <div className={cn(
              'h-10 w-10 lg:h-12 lg:w-12 mx-auto mb-2 lg:mb-3 rounded-full flex items-center justify-center transition-colors',
              dragOver ? 'bg-primary/20' : 'bg-muted/50 group-hover:bg-primary/10',
            )}>
              <FileSpreadsheet className={cn('h-5 w-5 lg:h-6 lg:w-6', dragOver ? 'text-primary' : 'text-muted-foreground group-hover:text-primary/70')} />
            </div>
            <p className="text-sm font-semibold">
              {parsing ? 'Procesando...' : 'Arrastra los Excel de Matrix aquí'}
            </p>
            <p className="text-[11px] lg:text-xs text-muted-foreground mt-1">.xlsx o .xls (grader Pieza-Pieza / Punto Cero)</p>
            {!parsing && (
              <p className="text-[10px] text-primary/60 mt-2 hidden lg:block">o haz clic para seleccionar archivos</p>
            )}
            {parsing && <Loader2 className="h-4 w-4 animate-spin mx-auto mt-2 text-muted-foreground" />}
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />

          {/* Archivos cargados */}
          {files.length > 0 && (
            <div className="space-y-1.5">
              {files.map((f) => (
                <div key={f.fileMeta.id} className="flex items-center gap-2 bg-muted/50 rounded px-2 py-1.5 text-xs">
                  <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <Badge className={cn('text-[9px] h-4 px-1 shrink-0', KIND_COLORS[f.fileMeta.kind])}>
                    {KIND_LABELS[f.fileMeta.kind]}
                  </Badge>
                  <span className="truncate flex-1">{f.fileMeta.name}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {f.fileMeta.kind === 'PIEZA_PIEZA'
                      ? `${(f.partialData.pieceRecords?.length ?? 0).toLocaleString()} reg`
                      : f.fileMeta.kind === 'PUERTA_0'
                        ? `${(f.partialData.gate0Records?.length ?? 0).toLocaleString()} reg P0`
                        : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(f.fileMeta.id)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    title="Eliminar"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Turno detectado */}
          {turnoRange && (
            <div className="flex items-center gap-3 flex-wrap text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="font-medium">{turnoRange.date} · {turnoRange.start}–{turnoRange.end}</span>
              <span className="text-muted-foreground">{turnoRange.durationMin} min · {turnoRange.totalPieces.toLocaleString()} piezas</span>
            </div>
          )}

          {/* Aviso Puerta 0 faltante */}
          {hasPiezaPieza && files.filter((f) => f.fileMeta.kind === 'PUERTA_0').length === 0 && (
            <p className="text-[11px] text-amber-600 flex items-center gap-1">
              <Info className="h-3 w-3" />
              Sin Puerta 0: el desglose de errores será inferido desde los pesos
            </p>
          )}
        </CardContent>
      </Card>

      {/* Errores */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
      {uploadError && (
        <div className="flex items-center gap-2 text-xs text-amber-700">
          <AlertCircle className="h-3.5 w-3.5" />
          {uploadError}
        </div>
      )}

      {/* Calendario histórico unificado. Muestra `graderDailySummaries` con
          P0% por día, KPIs por turno y top causas. El botón "Cargar" navega
          al home con `?date=…&shift=…&autoload=1`; el efecto de `searchParams`
          (arriba) detecta los params y dispara handleLoadTurno vía autoLoadRef
          → reusa archivos ya guardados en Storage.
          Acepta `?goto=YYYY-MM-DD` para saltar a un día específico (desde el
          gráfico de tendencia en `/analisis-grader/periodo`). */}
      <div data-grader-calendar>
        <GraderHistoricalCalendar />
      </div>
    </div>
  )
}
