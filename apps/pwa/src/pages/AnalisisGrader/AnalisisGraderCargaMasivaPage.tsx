/**
 * Carga masiva histórica del Grader.
 *
 * Flujo:
 *  1. El usuario sube 1-2 archivos Excel con datos de múltiples días
 *     (PIEZA_PIEZA y/o PUERTA_0 con N días de registros)
 *  2. La app parsea los archivos y segmenta automáticamente por día + turno
 *  3. Se muestra una tabla de previsualización con los segmentos encontrados
 *  4. El usuario confirma y los resúmenes se guardan en Firestore (batch)
 *  5. El calendario los muestra con color según P0%
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Button, Badge, Card, CardContent } from '@/components/ui'
import {
  Upload,
  FileSpreadsheet,
  X,
  Loader2,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissionsStore, useAuthStore } from '@/store'
import { parseFile } from '@/services/grader/graderExcelParser'
import { getModuleRanges } from '@/services/grader/graderModuleConfig.service'
import { DEFAULT_SHIFT_SCHEDULE, normalizeShiftSchedule, formatShiftTime, parseShiftTime } from '@/services/grader/graderShiftSchedule'
import {
  segmentByDayAndShift,
  computeShiftSummary,
  sortedSegmentEntries,
  dedupePieceRecords,
  dedupeGate0Records,
  type ShiftSegment,
} from '@/services/grader/graderSegmenter'
import { saveDailySummaryBatch, fetchExistingSummaryIds } from '@/services/grader/graderDailySummary.service'
import type { PieceRecord, Gate0Record, GraderShiftSchedule, GraderDailySummary } from '@/services/grader/types'

// ─── Tipos internos ────────────────────────────────────────────────────────────

interface SegmentPreview {
  key: string
  summary: GraderDailySummary
  segment: ShiftSegment
}

type PageState =
  | 'idle'
  | 'parsing'
  | 'preview'
  | 'saving'
  | 'done'
  | 'error'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function p0Color(pct: number): string {
  if (pct >= 3.5) return 'text-red-500'
  if (pct >= 2)   return 'text-amber-500'
  return 'text-emerald-600'
}

function p0BgColor(pct: number): string {
  if (pct >= 3.5) return 'bg-red-500/10 border-red-500/20'
  if (pct >= 2)   return 'bg-amber-500/10 border-amber-500/20'
  return 'bg-emerald-500/10 border-emerald-500/20'
}

function fmtDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-')
  const date = new Date(`${dateKey}T12:00:00`)
  const dayName = date.toLocaleDateString('es-CL', { weekday: 'short' })
  return `${dayName} ${d}/${m}/${y?.slice(2)}`
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ─── Componente principal ──────────────────────────────────────────────────────

export function AnalisisGraderCargaMasivaPage() {
  const { canSee } = usePermissionsStore()
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  const [pageState, setPageState] = useState<PageState>('idle')
  const [dragOver, setDragOver]   = useState(false)
  const [files, setFiles]         = useState<File[]>([])
  const [progress, setProgress]   = useState<string>('')
  const [segments, setSegments]   = useState<SegmentPreview[]>([])
  const [shiftSchedule, setShiftSchedule] = useState<GraderShiftSchedule[]>(DEFAULT_SHIFT_SCHEDULE)
  const [scheduleOpen, setScheduleOpen]   = useState(false)
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const [batchId]  = useState(() => crypto.randomUUID())
  // IDs de turnos que ya existen en Firestore → se mostrarán como "Reemplaza"
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set())
  // Estadísticas del dedupe aplicado antes de segmentar
  const [dedupeStats, setDedupeStats] = useState<{
    pieceRemoved: number
    gate0Removed: number
    pieceTotal: number
    gate0Total: number
  } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  // Cargar horarios del config guardado al montar
  useEffect(() => {
    getModuleRanges()
      .then((cfg) => {
        if (cfg?.shiftSchedule) setShiftSchedule(normalizeShiftSchedule(cfg.shiftSchedule))
      })
      .catch(() => {/* usa defaults */})
  }, [])

  // ─── Manejo de archivos ──────────────────────────────────────────────────────
  // IMPORTANTE: todos los useCallback deben ir ANTES del early return para no
  // violar react-hooks/rules-of-hooks.

  const handleFiles = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter((f) =>
      f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls'),
    )
    if (valid.length === 0) return
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name))
      return [...prev, ...valid.filter((f) => !names.has(f.name))]
    })
  }, [])

  const removeFile = useCallback((name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name))
    if (pageState === 'preview') setPageState('idle')
  }, [pageState])

  // ─── Procesamiento ───────────────────────────────────────────────────────────

  const processFiles = useCallback(async () => {
    if (files.length === 0) return
    setPageState('parsing')
    setErrorMsg(null)
    setDedupeStats(null)
    setExistingIds(new Set())

    try {
      const allPiece: PieceRecord[]  = []
      const allGate0: Gate0Record[]  = []
      const fileNames: string[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]!
        setProgress(`Parseando "${file.name}" (${i + 1} / ${files.length})…`)
        const { partialData } = await parseFile(file)
        fileNames.push(file.name)

        if (partialData.pieceRecords?.length) {
          for (let j = 0; j < partialData.pieceRecords.length; j++) allPiece.push(partialData.pieceRecords[j]!)
        }
        if (partialData.gate0Records?.length) {
          for (let j = 0; j < partialData.gate0Records.length; j++) allGate0.push(partialData.gate0Records[j]!)
        }
      }

      if (allPiece.length === 0 && allGate0.length === 0) {
        throw new Error('No se encontraron registros válidos. Verifique que los archivos sean PIEZA_PIEZA o PUERTA_0.')
      }

      // Dedupe entre archivos con rangos de fecha solapados (ej. Matrix exporta
      // el 15-ene en 2 archivos → el mismo evento aparecería 2 veces).
      setProgress(`Eliminando duplicados entre archivos…`)
      await new Promise<void>((res) => setTimeout(res, 20))
      const pieceBefore = allPiece.length
      const gate0Before = allGate0.length
      const pieceDedupe = dedupePieceRecords(allPiece)
      const gate0Dedupe = dedupeGate0Records(allGate0)
      const uniquePiece = pieceDedupe.unique
      const uniqueGate0 = gate0Dedupe.unique

      setDedupeStats({
        pieceRemoved: pieceDedupe.duplicatesRemoved,
        gate0Removed: gate0Dedupe.duplicatesRemoved,
        pieceTotal: pieceBefore,
        gate0Total: gate0Before,
      })

      setProgress(`Segmentando ${(uniquePiece.length + uniqueGate0.length).toLocaleString('es-CL')} registros por día y turno…`)
      await new Promise<void>((res) => setTimeout(res, 20))

      const segMap = segmentByDayAndShift(uniquePiece, uniqueGate0, shiftSchedule)
      const createdBy = user?.email || user?.id || 'unknown'

      const previews: SegmentPreview[] = sortedSegmentEntries(segMap).map(([key, seg]) => ({
        key,
        segment: seg,
        summary: computeShiftSummary(seg, batchId, fileNames, createdBy),
      }))

      // Consultar Firestore: qué turnos de los detectados ya están guardados
      setProgress(`Consultando turnos ya existentes…`)
      await new Promise<void>((res) => setTimeout(res, 20))
      try {
        const ids = previews.map((p) => p.summary.id)
        const existing = await fetchExistingSummaryIds(ids)
        setExistingIds(existing)
      } catch {
        // Si falla la consulta no bloqueamos — seguimos con el preview.
        setExistingIds(new Set())
      }

      setSegments(previews)
      setPageState('preview')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error desconocido al procesar archivos.')
      setPageState('error')
    }
  }, [files, shiftSchedule, user, batchId])

  const saveAll = useCallback(async () => {
    setPageState('saving')
    setProgress(`Guardando ${segments.length} turnos en historial…`)
    try {
      await saveDailySummaryBatch(segments.map((s) => s.summary))
      setSavedCount(segments.length)
      setPageState('done')
      // Navegar al calendario en el mes más reciente guardado
      const latestDate = segments
        .map((s) => s.summary.dateKey)
        .sort()
        .slice(-1)[0]
      if (latestDate) {
        setTimeout(() => navigate(`/analisis-grader/calendario?goto=${latestDate}`), 1200)
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al guardar en Firestore.')
      setPageState('error')
    }
  }, [segments, navigate])

  // ─── Estadísticas de previsualización ────────────────────────────────────────

  const previewStats = segments.length > 0 ? {
    days:   new Set(segments.map((s) => s.summary.dateKey)).size,
    pieces: segments.reduce((t, s) => t + s.summary.totalPieces, 0),
    avgP0:  segments.reduce((t, s) => t + s.summary.pointZeroPct, 0) / segments.length,
  } : null

  // Conteo de nuevos vs reemplazos (usado por el botón y el texto resumen)
  const replaceCount = segments.filter((s) => existingIds.has(s.summary.id)).length
  const newCount = segments.length - replaceCount

  // Guard de permisos — después de todos los hooks
  if (!canSee('analisisGrader')) return <Navigate to="/" replace />

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate('/analisis-grader')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Volver
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Carga masiva histórica
          </h1>
          <p className="text-sm text-muted-foreground">
            Sube Excel de múltiples días — la app los separa por turno automáticamente
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader/calendario')}>
          <Calendar className="h-4 w-4 mr-1" />
          Ver calendario
        </Button>
      </div>

      {/* Config de turnos — colapsable */}
      <Card>
        <button
          type="button"
          onClick={() => setScheduleOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors rounded-lg"
        >
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Horarios de turno
            <span className="text-xs font-normal text-muted-foreground">
              ({shiftSchedule.map((s) =>
                `${s.shiftId.replace('Turno ', '')}: ${formatShiftTime(s.startHour, s.startMinute)}–${formatShiftTime(s.endHour, s.endMinute)}`
              ).join(' · ')})
            </span>
          </span>
          {scheduleOpen
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
          }
        </button>
        {scheduleOpen && (
          <CardContent className="pt-0 pb-4">
            <p className="text-xs text-muted-foreground mb-3">
              Ajusta los cortes de turno según tu planta. El turno de noche puede cruzar medianoche.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {shiftSchedule.map((shift) => (
                <div key={shift.shiftId} className="space-y-1.5">
                  <p className="text-xs font-medium">{shift.shiftId}</p>
                  <div className="flex items-center gap-1.5 text-xs">
                    <input
                      type="time"
                      value={formatShiftTime(shift.startHour, shift.startMinute)}
                      onChange={(e) => {
                        const { hour, minute } = parseShiftTime(e.target.value)
                        setShiftSchedule((prev) => prev.map((s) =>
                          s.shiftId === shift.shiftId
                            ? { ...s, startHour: hour, startMinute: minute }
                            : s,
                        ))
                        if (pageState === 'preview') setPageState('idle')
                      }}
                      className="border rounded px-2 py-1 text-xs bg-background w-24"
                    />
                    <span className="text-muted-foreground">→</span>
                    <input
                      type="time"
                      value={formatShiftTime(shift.endHour, shift.endMinute)}
                      onChange={(e) => {
                        const { hour, minute } = parseShiftTime(e.target.value)
                        setShiftSchedule((prev) => prev.map((s) =>
                          s.shiftId === shift.shiftId
                            ? { ...s, endHour: hour, endMinute: minute }
                            : s,
                        ))
                        if (pageState === 'preview') setPageState('idle')
                      }}
                      className="border rounded px-2 py-1 text-xs bg-background w-24"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Drop zone */}
      {pageState !== 'done' && (
        <div
          role="button"
          tabIndex={0}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            handleFiles(Array.from(e.dataTransfer.files))
          }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          className={cn(
            'rounded-lg border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors',
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-muted/30',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
          />
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">
            Arrastra los archivos Excel aquí o haz clic para seleccionar
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Acepta PIEZA_PIEZA y PUERTA_0 — múltiples archivos — cualquier cantidad de días
          </p>
        </div>
      )}

      {/* Lista de archivos seleccionados */}
      {files.length > 0 && pageState !== 'done' && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Archivos seleccionados ({files.length})
          </p>
          {files.map((f) => (
            <div
              key={f.name}
              className="flex items-center justify-between gap-2 rounded border px-3 py-2 bg-background/60"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="text-sm truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {(f.size / 1024 / 1024).toFixed(1)} MB
                </span>
              </div>
              {pageState === 'idle' || pageState === 'error' ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeFile(f.name) }}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ))}

          {(pageState === 'idle' || pageState === 'error') && (
            <Button onClick={processFiles} disabled={files.length === 0} className="w-full mt-1">
              Analizar y segmentar
            </Button>
          )}
        </div>
      )}

      {/* Progress */}
      {(pageState === 'parsing' || pageState === 'saving') && (
        <div className="flex items-center gap-3 rounded border px-4 py-3 bg-background/60">
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
          <p className="text-sm">{progress}</p>
        </div>
      )}

      {/* Error */}
      {pageState === 'error' && errorMsg && (
        <div className="flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
        </div>
      )}

      {/* Preview tabla de segmentos */}
      {pageState === 'preview' && segments.length > 0 && (
        <div className="space-y-3">

          {/* Banner de dedupe de registros — sólo si se eliminaron duplicados entre archivos */}
          {dedupeStats && (dedupeStats.pieceRemoved > 0 || dedupeStats.gate0Removed > 0) && (
            <div className="rounded border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-xs">
              <p className="text-sky-700 dark:text-sky-300">
                <span className="font-medium">Duplicados entre archivos eliminados:</span>
                {dedupeStats.pieceRemoved > 0 && (
                  <span className="ml-2">
                    {dedupeStats.pieceRemoved.toLocaleString('es-CL')} registros PP
                    ({((dedupeStats.pieceRemoved / Math.max(dedupeStats.pieceTotal, 1)) * 100).toFixed(1)}%)
                  </span>
                )}
                {dedupeStats.gate0Removed > 0 && (
                  <span className="ml-2">
                    · {dedupeStats.gate0Removed.toLocaleString('es-CL')} registros P0
                    ({((dedupeStats.gate0Removed / Math.max(dedupeStats.gate0Total, 1)) * 100).toFixed(1)}%)
                  </span>
                )}
              </p>
              <p className="text-sky-600/80 dark:text-sky-400/80 mt-0.5">
                Tus archivos cubren rangos de fecha solapados — eventos idénticos se contaron una sola vez.
              </p>
            </div>
          )}

          {/* Resumen de lo encontrado */}
          {previewStats && (
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded border bg-background/60 px-4 py-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{previewStats.days}</p>
                <p className="text-xs text-muted-foreground">días</p>
              </div>
              <div className="rounded border bg-background/60 px-4 py-3 text-center">
                <p className="text-2xl font-bold tabular-nums">{segments.length}</p>
                <p className="text-xs text-muted-foreground">turnos</p>
              </div>
              <div className="rounded border bg-background/60 px-4 py-3 text-center">
                <p className="text-2xl font-bold tabular-nums">
                  {(previewStats.pieces / 1000).toFixed(1)}k
                </p>
                <p className="text-xs text-muted-foreground">piezas totales</p>
              </div>
              <div className="rounded border bg-background/60 px-4 py-3 text-center">
                <p className="text-2xl font-bold tabular-nums">
                  <span className="text-emerald-600">{newCount}</span>
                  {replaceCount > 0 && (
                    <span className="text-muted-foreground text-base font-normal">
                      {' '}+ <span className="text-amber-600 font-bold">{replaceCount}</span>
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {replaceCount > 0 ? 'nuevos + reemplazos' : 'nuevos'}
                </p>
              </div>
            </div>
          )}

          {/* Tabla de turnos */}
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Fecha</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Turno</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Estado</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Piezas</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">P0%</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Peso</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Duración</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">pz/h</th>
                  </tr>
                </thead>
                <tbody>
                  {segments.map(({ key, summary }) => {
                    const isReplace = existingIds.has(summary.id)
                    return (
                    <tr key={key} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 font-medium">{fmtDate(summary.dateKey)}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            summary.shiftId === 'Turno día'   && 'border-amber-500/40 text-amber-600',
                            summary.shiftId === 'Turno noche' && 'border-indigo-500/40 text-indigo-600',
                            summary.shiftId === 'Sin turno'   && 'border-muted text-muted-foreground',
                          )}
                        >
                          {summary.shiftId.replace('Turno ', '')}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {isReplace ? (
                          <Badge className="text-[10px] bg-amber-500/15 text-amber-700 border-amber-500/30 hover:bg-amber-500/15">
                            Reemplaza
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/15">
                            Nuevo
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {summary.totalPieces.toLocaleString('es-CL')}
                      </td>
                      <td className={cn('px-3 py-2 text-right tabular-nums font-semibold', p0Color(summary.pointZeroPct))}>
                        {summary.pointZeroPct}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground text-xs">
                        {summary.totalWeightKg != null
                          ? summary.totalWeightKg >= 1000
                            ? `${(summary.totalWeightKg / 1000).toFixed(1)} t`
                            : `${summary.totalWeightKg.toFixed(0)} kg`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground text-xs">
                        {summary.durationMinutes ? fmtDuration(summary.durationMinutes) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground text-xs">
                        {summary.productionRatePerHour != null
                          ? Math.round(summary.productionRatePerHour).toLocaleString('es-CL')
                          : '—'}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* P0 overview — miniatura visual */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
            {segments.map(({ key, summary }) => {
              const isReplace = existingIds.has(summary.id)
              return (
                <div
                  key={key}
                  className={cn(
                    'rounded border px-2 py-1.5 text-center text-xs relative',
                    p0BgColor(summary.pointZeroPct),
                    isReplace && 'ring-1 ring-amber-500/50',
                  )}
                >
                  {isReplace && (
                    <span
                      title="Reemplaza un turno ya guardado"
                      className="absolute top-0 right-0 text-[7px] px-1 bg-amber-500/80 text-white rounded-bl"
                    >
                      R
                    </span>
                  )}
                  <p className="font-medium truncate">{fmtDate(summary.dateKey)}</p>
                  <p className="text-xs text-muted-foreground">{summary.shiftId.replace('Turno ', '')}</p>
                  <p className={cn('font-bold tabular-nums mt-0.5', p0Color(summary.pointZeroPct))}>
                    {summary.pointZeroPct}%
                  </p>
                </div>
              )
            })}
          </div>

          {/* Botones de acción */}
          <div className="flex gap-3 flex-wrap">
            <Button onClick={saveAll} className="flex-1 sm:flex-none">
              Guardar {segments.length} turnos
              {replaceCount > 0
                ? ` (${newCount} nuevos · ${replaceCount} reemplazos)`
                : ''}
            </Button>
            <Button
              variant="outline"
              onClick={() => { setPageState('idle'); setSegments([]) }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Estado Done */}
      {pageState === 'done' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-4">
            <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                {savedCount} turnos guardados en el historial
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Los datos aparecen ahora en el calendario con colores según P0%.
                Puedes subir más archivos o ver el calendario.
              </p>
            </div>
          </div>

          {/* Miniatura P0 del lote guardado */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
            {segments.map(({ key, summary }) => (
              <div
                key={key}
                className={cn(
                  'rounded border px-2 py-1.5 text-center text-xs',
                  p0BgColor(summary.pointZeroPct),
                )}
              >
                <p className="font-medium truncate">{fmtDate(summary.dateKey)}</p>
                <p className="text-xs text-muted-foreground">{summary.shiftId.replace('Turno ', '')}</p>
                <p className={cn('font-bold tabular-nums mt-0.5', p0Color(summary.pointZeroPct))}>
                  {summary.pointZeroPct}%
                </p>
              </div>
            ))}
          </div>

          <div className="flex gap-3 flex-wrap">
            <Button onClick={() => navigate('/analisis-grader/calendario')}>
              <Calendar className="h-4 w-4 mr-1.5" />
              Ver en calendario
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setPageState('idle')
                setFiles([])
                setSegments([])
              }}
            >
              Cargar más datos
            </Button>
          </div>
        </div>
      )}

    </div>
  )
}
