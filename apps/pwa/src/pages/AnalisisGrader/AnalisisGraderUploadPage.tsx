/**
 * P1) Carga de archivos Excel Pieza-Pieza
 *
 * Drag&Drop múltiples xlsx pieza-pieza. Se pueden agregar varios archivos
 * durante el turno; el sistema los fusiona automáticamente y muestra
 * el rango de tiempo (turno) detectado.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  X,
  Loader2,
  Info,
  ChevronRight,
  Clock,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'
import { parseFile, mergeParsedData } from '@/services/grader/graderExcelParser'
import { listGraderUploads, saveGraderUpload, updateGraderUpload, uploadGraderFile } from '@/services/grader/graderUpload.service'
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

function inferShiftId(startAt?: string): string {
  if (!startAt) return 'Turno noche'
  const d = new Date(startAt)
  const hour = d.getHours()
  return hour >= 7 && hour < 19 ? 'Turno día' : 'Turno noche'
}

function toDateKey(iso?: string): string {
  if (!iso) return new Date().toISOString().slice(0, 10)
  return iso.slice(0, 10)
}

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
  const inputRef = useRef<HTMLInputElement>(null)
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
  const piezaPiezaCount = files.filter((f) => f.fileMeta.kind === 'PIEZA_PIEZA').length
  const canContinue = hasPiezaPieza

  useEffect(() => {
    listGraderUploads().then(setUploads).catch(() => {})
  }, [])

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
    const fmt = (d: Date) => d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    const fmtDate = (d: Date) => d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })

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
        const sessionDate = toDateKey(inferred?.startAt)
        const shiftId = inferShiftId(inferred?.startAt)
        // Aceptar solo pieza-pieza; advertir si se carga otro tipo
        if (result.fileMeta.kind !== 'PIEZA_PIEZA') {
          result.fileMeta.warnings.push(
            `Tipo "${KIND_LABELS[result.fileMeta.kind]}" detectado — solo se requiere Pieza-Pieza`,
          )
        }
        // Persistir upload para calendario (si hay usuario)
        if (user) {
          const upload = await saveGraderUpload({
            id: result.fileMeta.id,
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
          setUploads((prev) => [upload, ...prev])
        }
        if (!currentTurnoDate) setCurrentTurnoDate(sessionDate)
        if (!currentTurnoShift) setCurrentTurnoShift(shiftId)
        parsed.push({ ...result, file })
      }
      updateFiles((prev) => [...prev, ...parsed])
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
  }, [updateFiles, user])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles],
  )

  const handleRemoveFile = (id: string) => {
    updateFiles((prev) => prev.filter((f) => f.fileMeta.id !== id))
  }

  const uploadsById = useMemo(() => {
    const map = new Map<string, GraderUpload>()
    for (const u of uploads) map.set(u.id, u)
    return map
  }, [uploads])

  const handleUpdateUpload = async (id: string, patch: Partial<GraderUpload>) => {
    try {
      await updateGraderUpload(id, patch)
      setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)))
    } catch {
      setUploadError('No se pudo actualizar el calendario.')
    }
  }

  const handleContinue = () => {
    const filtered = files.filter((f) => {
      const inferred = f.partialData.inferred
      const upload = uploadsById.get(f.fileMeta.id)
      const sessionDate = upload?.sessionDate || toDateKey(inferred?.startAt)
      const shiftId = upload?.shiftId || inferShiftId(inferred?.startAt)
      if (!currentTurnoDate || !currentTurnoShift) return true
      return sessionDate === currentTurnoDate && shiftId === currentTurnoShift
    })
    if (filtered.length === 0) {
      setError('No hay archivos para el turno seleccionado.')
      return
    }
    const merged = mergeParsedData(filtered)
    onComplete(merged)
  }

  const handleLoadTurno = async () => {
    if (!currentTurnoDate || !currentTurnoShift) return
    setLoadingTurno(true)
    setUploadError(null)
    try {
      const turnoUploads = uploads.filter((u) => {
        const dateKey = u.sessionDate || toDateKey(u.inferred?.startAt)
        const shift = u.shiftId || inferShiftId(u.inferred?.startAt)
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
      onComplete(merged)
    } catch {
      setUploadError('Error al cargar archivos del calendario.')
    } finally {
      setLoadingTurno(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <Card className="border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-800 dark:text-blue-300">
              <p className="font-medium">Solo archivos Pieza-Pieza</p>
              <p className="text-xs mt-0.5 text-blue-600 dark:text-blue-400">
                Puedes agregar varios archivos pieza-pieza durante el turno.
                Se fusionan automáticamente para dar una visión completa del período.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Drop zone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-5 w-5" />
            {files.length === 0
              ? 'Cargar Archivo Pieza-Pieza'
              : 'Agregar más Archivos Pieza-Pieza'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50',
            )}
          >
            {files.length === 0 ? (
              <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            ) : (
              <Plus className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            )}
            <p className="text-sm font-medium">
              {files.length === 0
                ? 'Arrastra el archivo Pieza-Pieza aquí o haz clic para seleccionar'
                : 'Agregar otro archivo Pieza-Pieza del turno'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Archivos .xlsx exportados desde Matrix
            </p>
            {parsing && (
              <div className="flex items-center justify-center gap-2 mt-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Parseando archivos...</span>
              </div>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          {error && (
            <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          {uploadError && (
            <div className="mt-2 flex items-center gap-2 text-xs text-amber-700">
              <AlertCircle className="h-3.5 w-3.5" />
              {uploadError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Turno range info */}
      {turnoRange && (
        <Card className="border-green-200 dark:border-green-800/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Clock className="h-5 w-5 text-green-600 dark:text-green-400" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  Turno detectado: {turnoRange.date}
                </p>
                <p className="text-xs text-muted-foreground">
                  {turnoRange.start} – {turnoRange.end}
                  {' · '}
                  {turnoRange.durationMin} min
                  {' · '}
                  {turnoRange.totalPieces.toLocaleString()} piezas totales
                </p>
              </div>
              {piezaPiezaCount > 1 && (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  {piezaPiezaCount} archivos fusionados
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Turno objetivo (para agrupar archivos) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Turno objetivo</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Fecha</span>
            <input
              type="date"
              value={currentTurnoDate || ''}
              onChange={(e) => setCurrentTurnoDate(e.target.value)}
              className="h-8 text-xs rounded border border-muted-foreground/30 bg-background px-2"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Turno</span>
            <input
              value={currentTurnoShift}
              onChange={(e) => setCurrentTurnoShift(e.target.value)}
              className="h-8 text-xs rounded border border-muted-foreground/30 bg-background px-2 w-32"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Los archivos del mismo día y turno se agruparán aunque el horario no coincida.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={handleLoadTurno}
            disabled={loadingTurno || !currentTurnoDate || !currentTurnoShift}
          >
            {loadingTurno ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Cargar turno desde calendario
          </Button>
        </CardContent>
      </Card>

      {/* Files list */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Archivos Cargados ({files.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {files.map((f) => (
              (() => {
                const upload = uploadsById.get(f.fileMeta.id)
                const inferred = upload?.inferred || f.partialData.inferred
                const sessionDate = upload?.sessionDate || toDateKey(inferred?.startAt)
                const shiftId = upload?.shiftId || inferShiftId(inferred?.startAt)
                const timeRange = inferred?.startAt && inferred?.endAt
                  ? `${new Date(inferred.startAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} – ${new Date(inferred.endAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`
                  : '—'
                return (
              <div
                key={f.fileMeta.id}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg',
                  f.fileMeta.kind === 'PIEZA_PIEZA'
                    ? 'bg-muted/50'
                    : 'bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-800/30',
                )}
              >
                <FileSpreadsheet className="h-5 w-5 text-green-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.fileMeta.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge className={cn('text-xs', KIND_COLORS[f.fileMeta.kind])}>
                      {KIND_LABELS[f.fileMeta.kind]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {(f.fileMeta.sizeBytes / 1024).toFixed(0)} KB
                    </span>
                    {f.fileMeta.kind === 'PIEZA_PIEZA' && f.partialData.pieceRecords && (
                      <span className="text-xs text-muted-foreground">
                        · {f.partialData.pieceRecords.length.toLocaleString()} registros
                      </span>
                    )}
                    {f.fileMeta.warnings.length > 0 && (
                      <span className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {f.fileMeta.warnings.length} aviso(s)
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    <span>Horario: {timeRange}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Fecha</span>
                      <input
                        type="date"
                        value={sessionDate}
                        onChange={(e) => handleUpdateUpload(f.fileMeta.id, { sessionDate: e.target.value })}
                        className="h-7 text-xs rounded border border-muted-foreground/30 bg-background px-2"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Turno</span>
                      <input
                        value={shiftId}
                        onChange={(e) => handleUpdateUpload(f.fileMeta.id, { shiftId: e.target.value })}
                        className="h-7 text-xs rounded border border-muted-foreground/30 bg-background px-2 w-28"
                      />
                    </div>
                  </div>
                  {f.fileMeta.warnings.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {f.fileMeta.warnings.map((w, i) => (
                        <p key={i} className="text-xs text-amber-600">{w}</p>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveFile(f.fileMeta.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
                )
              })()
            ))}

            {/* Hint: not pieza-pieza files */}
            {files.some((f) => f.fileMeta.kind !== 'PIEZA_PIEZA') && (
              <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Los archivos que no son Pieza-Pieza serán ignorados en el análisis.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Status: waiting for file */}
      {!hasPiezaPieza && files.length === 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 opacity-30" />
              <span>Carga al menos un archivo Pieza-Pieza para continuar</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Continue button */}
      <div className="flex justify-end">
        <Button onClick={handleContinue} disabled={!canContinue}>
          Continuar a Configuración de Gates
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Calendario de uploads */}
      {uploads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Calendario de Archivos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[...new Map(uploads.map((u) => [u.sessionDate || toDateKey(u.inferred?.startAt), u])).keys()]
              .sort((a, b) => b.localeCompare(a))
              .map((dateKey) => {
                const dayUploads = uploads.filter((u) => (u.sessionDate || toDateKey(u.inferred?.startAt)) === dateKey)
                return (
                  <div key={dateKey} className="border border-muted/60 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{dateKey}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {dayUploads.length} archivo(s)
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-1">
                      {dayUploads.map((u) => (
                        <div key={u.id} className="text-xs text-muted-foreground flex items-center justify-between">
                          <span className="truncate">{u.fileMeta.name}</span>
                          <span>{u.shiftId || 'Turno'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
