/**
 * P1) Carga de archivos Excel Pieza-Pieza
 *
 * Drag&Drop múltiples xlsx pieza-pieza. Se pueden agregar varios archivos
 * durante el turno; el sistema los fusiona automáticamente y muestra
 * el rango de tiempo (turno) detectado.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  X,
  Loader2,
  Info,
  ChevronRight,
  ChevronLeft,
  Clock,
  Plus,
  Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'
import { parseFile, mergeParsedData } from '@/services/grader/graderExcelParser'
import { getModuleRanges } from '@/services/grader/graderModuleConfig.service'
import { deleteDailySummary } from '@/services/grader/graderDailySummary.service'
import { listGraderUploads, saveGraderUpload, updateGraderUpload, uploadGraderFile } from '@/services/grader/graderUpload.service'
import { DEFAULT_SHIFT_SCHEDULE, inferShiftIdFromSchedule, normalizeShiftSchedule, shiftIdToKey } from '@/services/grader/graderShiftSchedule'
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

const SHIFT_OPTIONS = ['Turno día', 'Turno noche'] as const

function buildUploadId(sessionDate: string, shiftId: string | undefined, kind: MatrixFileKind): string {
  const shiftKey = shiftIdToKey(shiftId)
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

const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']

function getDaysInMonth(date: Date): (Date | null)[] {
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startDayOfWeek = firstDay.getDay()

  const days: (Date | null)[] = []
  for (let i = 0; i < startDayOfWeek; i += 1) days.push(null)
  for (let i = 1; i <= daysInMonth; i += 1) days.push(new Date(year, month, i))
  return days
}

function isToday(date: Date): boolean {
  const today = new Date()
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  )
}

/* ─── Calendario inline para archivos guardados ─── */
interface InlineCalendarProps {
  uploads: GraderUpload[]
  shiftSchedule: Parameters<typeof inferShiftIdFromSchedule>[1]
  currentTurnoDate: string | null
  currentTurnoShift: string
  onSelectTurno: (date: string, shift: string) => void
  onLoadTurno: () => void
  loadingTurno: boolean
}

function GraderInlineCalendar({ uploads, shiftSchedule, currentTurnoDate, currentTurnoShift, onSelectTurno, onLoadTurno, loadingTurno }: InlineCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (currentTurnoDate) return new Date(currentTurnoDate + 'T00:00:00')
    return new Date()
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(currentTurnoDate)

  const days = getDaysInMonth(currentMonth)

  const uploadsByDate = useMemo(() => {
    const map = new Map<string, GraderUpload[]>()
    for (const u of uploads) {
      const key = u.sessionDate || toDateKey(u.inferred?.startAt)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(u)
    }
    return map
  }, [uploads])

  const selectedUploads = useMemo(() => {
    if (!selectedDate) return []
    return uploadsByDate.get(selectedDate) || []
  }, [selectedDate, uploadsByDate])

  const turnosForDay = useMemo(() => {
    const map = new Map<string, GraderUpload[]>()
    for (const u of selectedUploads) {
      const shift = u.shiftId || inferShiftIdFromSchedule(u.inferred?.startAt, shiftSchedule)
      if (!map.has(shift)) map.set(shift, [])
      map.get(shift)!.push(u)
    }
    return map
  }, [selectedUploads, shiftSchedule])

  const handleDateClick = (dayKey: string) => {
    setSelectedDate(dayKey)
    // Auto-select first available turno
    const dayUploads = uploadsByDate.get(dayKey) || []
    if (dayUploads.length > 0) {
      const shift = dayUploads[0].shiftId || inferShiftIdFromSchedule(dayUploads[0].inferred?.startAt, shiftSchedule)
      onSelectTurno(dayKey, shift)
    }
  }

  const handleTurnoClick = (dateKey: string, shiftId: string) => {
    onSelectTurno(dateKey, shiftId)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Calendario de Archivos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Calendario */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">
                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {dayNames.map((day) => (
                <div key={day} className="text-center text-[10px] font-medium text-muted-foreground py-1">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                if (!day) return <div key={`empty-${index}`} className="h-14" />
                const dayKey = day.toISOString().slice(0, 10)
                const dayUploads = uploadsByDate.get(dayKey) || []
                const turnosCount = new Set(dayUploads.map((u) => u.shiftId || inferShiftIdFromSchedule(u.inferred?.startAt, shiftSchedule))).size

                return (
                  <button
                    key={dayKey}
                    className={cn(
                      'h-14 p-1 border rounded-md text-left transition-colors text-xs',
                      isToday(day) && 'bg-primary/5 border-primary',
                      selectedDate === dayKey && 'ring-2 ring-primary',
                      dayUploads.length > 0 && 'hover:bg-muted/50',
                    )}
                    onClick={() => handleDateClick(dayKey)}
                  >
                    <div className="flex items-start justify-between">
                      <span className={cn('text-xs font-medium', isToday(day) && 'text-primary')}>
                        {day.getDate()}
                      </span>
                      {dayUploads.length > 0 && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1">
                          {dayUploads.length}
                        </Badge>
                      )}
                    </div>
                    {turnosCount > 0 && (
                      <div className="text-[9px] text-muted-foreground mt-0.5">
                        {turnosCount} turno(s)
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Panel lateral de resumen del día seleccionado */}
          <div className="border-l border-muted/60 pl-4">
            {selectedDate ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">Resumen {selectedDate}</p>
                {selectedUploads.length === 0 && (
                  <p className="text-xs text-muted-foreground">No hay archivos para este día.</p>
                )}
                {Array.from(turnosForDay.entries()).map(([shiftId, items]) => {
                  const minStart = items
                    .map((i) => i.inferred?.startAt)
                    .filter(Boolean)
                    .sort()[0]
                  const maxEnd = items
                    .map((i) => i.inferred?.endAt)
                    .filter(Boolean)
                    .sort()
                    .slice(-1)[0]
                  const isSelected = currentTurnoDate === selectedDate && currentTurnoShift === shiftId

                  return (
                    <div
                      key={shiftId}
                      className={cn(
                        'border rounded-lg p-3 space-y-2 transition-colors',
                        isSelected ? 'border-primary bg-primary/5' : 'border-muted/60',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{shiftId}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {items.length} archivo(s)
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant={isSelected ? 'default' : 'outline'}
                            className="h-7 text-xs"
                            onClick={() => handleTurnoClick(selectedDate, shiftId)}
                          >
                            Seleccionar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={loadingTurno}
                            onClick={() => {
                              onSelectTurno(selectedDate, shiftId)
                              setTimeout(onLoadTurno, 50)
                            }}
                          >
                            {loadingTurno ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Cargar'}
                          </Button>
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {minStart && maxEnd
                          ? `${new Date(minStart).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} - ${new Date(maxEnd).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`
                          : 'Horario no detectado'}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Selecciona un día en el calendario.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
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
  const piezaPiezaCount = files.filter((f) => f.fileMeta.kind === 'PIEZA_PIEZA').length
  const canContinue = hasPiezaPieza

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
        const inferredDate = toDateKey(inferred?.startAt)
        const inferredShift = inferShiftIdFromSchedule(inferred?.startAt, shiftSchedule)
        const sessionDate = currentTurnoDate || inferredDate
        const shiftId = currentTurnoDate ? currentTurnoShift : inferredShift
        const uploadId = buildUploadId(sessionDate, shiftId, result.fileMeta.kind)
        result.fileMeta.id = uploadId
        // Aceptar solo pieza-pieza; advertir si se carga otro tipo
        if (result.fileMeta.kind !== 'PIEZA_PIEZA') {
          result.fileMeta.warnings.push(
            `Tipo "${KIND_LABELS[result.fileMeta.kind]}" detectado — solo se requiere Pieza-Pieza`,
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
          if (result.fileMeta.kind === 'PIEZA_PIEZA') {
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
      const previous = uploadsById.get(id)
      await updateGraderUpload(id, patch)
      if (previous?.fileMeta.kind === 'PIEZA_PIEZA') {
        const previousDate = previous.sessionDate || toDateKey(previous.inferred?.startAt)
        const previousShift = previous.shiftId || inferShiftIdFromSchedule(previous.inferred?.startAt, shiftSchedule)
        const nextDate = patch.sessionDate || previousDate
        const nextShift = patch.shiftId || previousShift
        try {
          await deleteDailySummary(previousDate, previousShift)
          if (nextDate !== previousDate || nextShift !== previousShift) {
            await deleteDailySummary(nextDate, nextShift)
          }
        } catch {
          // Evitar bloquear actualizacion si no hay permisos para invalidar el resumen.
        }
      }
      setUploads((prev) => {
        const next = prev.map((u) => (u.id === id ? { ...u, ...patch } : u))
        return normalizeUploads(next, shiftSchedule)
      })
    } catch {
      setUploadError('No se pudo actualizar el calendario.')
    }
  }

  const handleContinue = () => {
    const filtered = files.filter((f) => {
      const inferred = f.partialData.inferred
      const upload = uploadsById.get(f.fileMeta.id)
      const sessionDate = upload?.sessionDate || toDateKey(inferred?.startAt)
      const shiftId = upload?.shiftId || inferShiftIdFromSchedule(inferred?.startAt, shiftSchedule)
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

  return (
    <div className="space-y-3">
      {/* Info banner + Drop zone compacto */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-start gap-2 text-xs text-blue-600 dark:text-blue-400">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Solo archivos Pieza-Pieza. Puedes agregar varios durante el turno; se fusionan automáticamente.
            </span>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors',
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50',
            )}
          >
            <div className="flex items-center justify-center gap-3">
              {files.length === 0 ? (
                <FileSpreadsheet className="h-8 w-8 text-muted-foreground shrink-0" />
              ) : (
                <Plus className="h-7 w-7 text-muted-foreground shrink-0" />
              )}
              <div className="text-left">
                <p className="text-sm font-medium">
                  {files.length === 0
                    ? 'Arrastra el archivo Pieza-Pieza aquí o haz clic para seleccionar'
                    : 'Agregar otro archivo Pieza-Pieza del turno'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Archivos .xlsx exportados desde Matrix
                </p>
              </div>
            </div>
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
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">Turno objetivo</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Fecha</span>
              <input
                type="date"
                value={currentTurnoDate || ''}
                onChange={(e) => setCurrentTurnoDate(e.target.value)}
                className="h-7 text-xs rounded border border-muted-foreground/30 bg-background px-2"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Turno</span>
              <Select value={currentTurnoShift} onValueChange={setCurrentTurnoShift}>
                <SelectTrigger className="h-7 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIFT_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Los archivos del mismo día y turno se agrupan automáticamente.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={handleLoadTurno}
              disabled={loadingTurno || !currentTurnoDate || !currentTurnoShift}
            >
              {loadingTurno ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Cargar turno
            </Button>
          </div>
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
                const shiftId = upload?.shiftId || inferShiftIdFromSchedule(inferred?.startAt, shiftSchedule)
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
                      <Select value={shiftId} onValueChange={(v) => handleUpdateUpload(f.fileMeta.id, { shiftId: v })}>
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SHIFT_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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

      {/* Status + Continue */}
      <div className="flex items-center justify-between">
        {!hasPiezaPieza && files.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 opacity-30" />
            <span>Carga al menos un archivo Pieza-Pieza para continuar</span>
          </div>
        ) : <div />}
        <Button onClick={handleContinue} disabled={!canContinue} size="sm">
          Continuar a Configuración de Gates
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Calendario visual de uploads */}
      {uploads.length > 0 && (
        <GraderInlineCalendar
          uploads={uploads}
          shiftSchedule={shiftSchedule}
          currentTurnoDate={currentTurnoDate}
          currentTurnoShift={currentTurnoShift}
          onSelectTurno={(date, shift) => {
            setCurrentTurnoDate(date)
            setCurrentTurnoShift(shift)
          }}
          onLoadTurno={handleLoadTurno}
          loadingTurno={loadingTurno}
        />
      )}
    </div>
  )
}
