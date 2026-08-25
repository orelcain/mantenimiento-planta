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
import { fmt } from '@/lib/format'
import { useAuthStore } from '@/store'
import { parseFile, mergeParsedData } from '@/services/grader/graderExcelParser'
import { getModuleRanges } from '@/services/grader/graderModuleConfig.service'
import { deleteDailySummary } from '@/services/grader/graderDailySummary.service'
import { listGraderUploads, saveGraderUpload, updateGraderUpload, uploadGraderFile, deleteGraderUpload } from '@/services/grader/graderUpload.service'
import { DEFAULT_SHIFT_SCHEDULE, inferShiftIdFromSchedule, normalizeShiftSchedule, shiftIdToKey } from '@/services/grader/graderShiftSchedule'
import { getPlantLineConfig, DEFAULT_PLANT_LINE_ID, type PlantLineId } from '@/config/plantLines'
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
  /** Si true, renderiza solo un botón compacto (sin calendario ni zona drag-drop) */
  compact?: boolean
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
  PIEZA_PIEZA: 'bg-primary/[0.15] text-primary',
  PUERTA_0: 'bg-red-500/[0.15] text-ink-crit',
  PORC_CALIDAD: 'bg-green-500/[0.15] text-ink-ok',
  TOTALES_PRODUCCION: 'bg-cat-6-tint/[0.15] text-cat-6-ink',
  TOTAL_PIEZAS_POR_FOLIO: 'bg-amber-500/[0.15] text-ink-warn',
  UNKNOWN: 'bg-muted-foreground/[0.10] text-muted-foreground',
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


export function AnalisisGraderUploadPage({ onComplete, initialFiles, onFilesChange, compact = false }: Props) {
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
  const lineId = (searchParams.get('linea') as PlantLineId | null) ?? DEFAULT_PLANT_LINE_ID
  const lineConfig = getPlantLineConfig(lineId)

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
    getModuleRanges(lineId)
      .then((cfg) => {
        const schedule = normalizeShiftSchedule(cfg?.shiftSchedule, lineConfig.defaultShiftSchedule)
        setShiftSchedule(schedule)
      })
      .catch(() => {
        setShiftSchedule(lineConfig.defaultShiftSchedule ?? DEFAULT_SHIFT_SCHEDULE)
      })
  }, [lineId, lineConfig.defaultShiftSchedule])

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

    // Un export de varios dias se leia como un turno de 5 horas: la linea
    // mostraba SOLO la fecha del primer registro y dos horas de reloj, asi que
    // un archivo de 15 dias con 277.841 piezas se anunciaba como
    // "15-07-2025 01:19-06:05". Cuando el archivo cruza el dia, se dice.
    const dias = Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1
    return {
      start: fmt(startDate),
      end: fmt(endDate),
      date: fmtDate(startDate),
      endDate: fmtDate(endDate),
      dias,
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
            plantLineId: lineId,
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
              await deleteDailySummary(sessionDate, shiftId, lineId)
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
  }, [files])

  if (compact) return (
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={parsing}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-ctl border text-sm font-medium transition-colors',
            'border-primary/[0.25] text-primary hover:bg-primary/[0.15]',
            parsing && 'opacity-60 cursor-wait',
          )}
        >
          {parsing
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <FileSpreadsheet className="h-4 w-4" />
          }
          Cargar Excel
          {files.length > 0 && (
            <Badge className={cn('text-caption h-4 px-1 ml-0.5', files.length > 0 ? 'bg-primary/[0.15] text-primary' : '')}>
              {files.length}
            </Badge>
          )}
        </button>
        {/* Botón cancelar: limpia archivos en cola sin guardar. Útil cuando
            el wizard detecta mal el formato o subiste el archivo equivocado. */}
        {files.length > 0 && !parsing && (
          <button
            type="button"
            onClick={() => {
              updateFiles(() => [])
              setError(null)
              if (inputRef.current) inputRef.current.value = ''
            }}
            className="flex items-center gap-1 px-2 py-1.5 rounded-ctl border border-red-500/[0.25] text-red-500 text-xs font-medium hover:bg-red-500/[0.15] transition-colors"
            title="Cancelar — limpia los archivos en cola"
          >
            <X className="h-3 w-3" />
            Cancelar
          </button>
        )}
        {turnoRange && (
          <span className="text-xs text-muted-foreground">
            {turnoRange.dias > 1
              ? `${turnoRange.date} ${turnoRange.start} → ${turnoRange.endDate} ${turnoRange.end} · ${turnoRange.dias} días`
              : `${turnoRange.date} · ${turnoRange.start}–${turnoRange.end}`}
            {' · '}{fmt(turnoRange.totalPieces)} pzs
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>
  )

  return (
    <div className="space-y-3">
      {/* El calendario histórico se retiró: lo reemplazó la matriz de turnos
          del Wizard (PR #349). Este bloque ya era inalcanzable — el Wizard es
          el único que monta esta página y siempre con `compact`. */}
      {/* Zona de carga */}
      <div>
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
              'border-2 border-dashed rounded-card p-5 lg:p-8 text-center cursor-pointer transition-all duration-200 group',
              dragOver
                ? 'border-primary bg-primary/10 scale-[1.02] shadow-lg shadow-primary/10'
                : 'border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/10',
            )}
          >
            <div className={cn(
              'h-10 w-10 lg:h-12 lg:w-12 mx-auto mb-2 lg:mb-3 rounded-full flex items-center justify-center transition-colors',
              dragOver ? 'bg-primary/20' : 'bg-muted group-hover:bg-primary/10',
            )}>
              <FileSpreadsheet className={cn('h-5 w-5 lg:h-6 lg:w-6', dragOver ? 'text-primary' : 'text-muted-foreground group-hover:text-primary/70')} />
            </div>
            <p className="text-sm font-semibold">
              {parsing ? 'Procesando...' : 'Arrastra los Excel de Matrix aquí'}
            </p>
            <p className="text-caption lg:text-xs text-muted-foreground mt-1">.xlsx o .xls (grader Pieza-Pieza / Punto Cero)</p>
            {!parsing && (
              <p className="text-caption text-primary/60 mt-2 hidden lg:block">o haz clic para seleccionar archivos</p>
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
                <div key={f.fileMeta.id} className="flex items-center gap-2 bg-muted rounded-ctl px-2 py-1.5 text-xs">
                  <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <Badge className={cn('text-caption h-4 px-1 shrink-0', KIND_COLORS[f.fileMeta.kind])}>
                    {KIND_LABELS[f.fileMeta.kind]}
                  </Badge>
                  <span className="truncate flex-1">{f.fileMeta.name}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {f.fileMeta.kind === 'PIEZA_PIEZA'
                      ? `${fmt(f.partialData.pieceRecords?.length ?? 0)} reg`
                      : f.fileMeta.kind === 'PUERTA_0'
                        ? `${fmt(f.partialData.gate0Records?.length ?? 0)} reg P0`
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
            <div className="flex items-center gap-3 flex-wrap text-xs bg-emerald-500/[0.15] border border-emerald-500/[0.25] rounded-ctl px-3 py-2">
              <CheckCircle className="h-3.5 w-3.5 text-ink-ok shrink-0" />
              <span className="font-medium">{turnoRange.date} · {turnoRange.start}–{turnoRange.end}</span>
              <span className="text-muted-foreground">{turnoRange.durationMin} min · {turnoRange.totalPieces.toLocaleString('es-CL')} piezas</span>
            </div>
          )}

          {/* Aviso Puerta 0 faltante */}
          {hasPiezaPieza && files.filter((f) => f.fileMeta.kind === 'PUERTA_0').length === 0 && (
            <p className="text-caption text-ink-warn flex items-center gap-1">
              <Info className="h-3 w-3" />
              Sin Puerta 0: el desglose de errores será inferido desde los pesos
            </p>
          )}
        </CardContent>
      </Card>
      </div>

      {/* Errores */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
      {uploadError && (
        <div className="flex items-center gap-2 text-xs text-ink-warn">
          <AlertCircle className="h-3.5 w-3.5" />
          {uploadError}
        </div>
      )}

    </div>
  )
}
