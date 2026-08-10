/**
 * GraderQuickChangePage — vista mobile para registrar cambio de gate rápido.
 *
 * URL fija: /analisis-grader/quick-change
 * Uso: el QR pegado en la máquina apunta aquí. El supervisor escanea,
 * registra el cambio que control de producción acaba de indicar, listo.
 *
 * Detecta automáticamente el turno vivo. Si no hay turno activo,
 * muestra un estado vacío con link al landing.
 */

import { useMemo, useState, useCallback, useEffect } from 'react'
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, Button, Badge } from '@/components/ui'
import { Activity, AlertCircle, ArrowLeft, CheckCircle2, Clock, GitBranch, SlidersHorizontal, History } from 'lucide-react'
import { usePermissionsStore } from '@/store'
import { GateChangeModal } from '@/components/grader/modals/GateChangeModal'
import { computeShiftTimeWindow, nowAsWallClockUTC } from '@/services/grader/graderShiftStatus'
import { DEFAULT_SHIFT_SCHEDULE } from '@/services/grader/graderShiftSchedule'
import { listSnapshots } from '@/services/grader/graderConfigSnapshot.service'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import { getPlantLineConfig } from '@/config/plantLines'

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

export function GraderQuickChangePage() {
  const { canSee } = usePermissionsStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [snapshots, setSnapshots] = useState<GateConfigSnapshot[]>([])
  const [savedCount, setSavedCount] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)

  // ?turno=YYYY-MM-DD__Turno+día → registro retroactivo de un turno específico
  const paramTurno = searchParams.get('turno')

  // Detectar turno vivo solo si no hay override por query param
  const liveShift = useMemo(() => {
    if (paramTurno) return null
    const today = todayKey()
    // wall-clock-as-UTC: igual que CurrentShiftChip, para no clasificar mal el
    // turno vivo por el offset del huso fuera de UTC (ver nowAsWallClockUTC).
    const now = nowAsWallClockUTC()
    for (const sched of DEFAULT_SHIFT_SCHEDULE) {
      const win = computeShiftTimeWindow(today, sched.shiftId, DEFAULT_SHIFT_SCHEDULE, now)
      if (win.status === 'live') {
        return { shiftId: sched.shiftId, dateKey: today, window: win }
      }
    }
    return null
  }, [paramTurno])

  // Derivar display info desde el param override (formato: YYYY-MM-DD__Turno día)
  const overrideDisplay = useMemo(() => {
    if (!paramTurno) return null
    const sep = paramTurno.indexOf('__')
    if (sep === -1) return null
    const dateKey = paramTurno.slice(0, sep)
    const shiftId = paramTurno.slice(sep + 2)
    return { dateKey, shiftId }
  }, [paramTurno])

  const shiftDocId = paramTurno ?? (liveShift ? `${liveShift.dateKey}__${liveShift.shiftId}` : null)

  // Cargar el último snapshot para mostrar config actual
  const reloadSnapshots = useCallback(() => {
    if (!shiftDocId) return
    listSnapshots(shiftDocId)
      .then(setSnapshots)
      .catch(() => {})
  }, [shiftDocId])

  useEffect(() => { reloadSnapshots() }, [reloadSnapshots])

  const handleSaved = useCallback(() => {
    setSavedCount(c => c + 1)
    reloadSnapshots()
  }, [reloadSnapshots])

  if (!canSee('analisisGrader')) return <Navigate to="/" replace />

  // Cambio rápido solo aplica a plantas con gates clasificadoras (Chonchi).
  // Yal eviscera sin clasificar — no hay gates que cambiar.
  const plantLineCfg = getPlantLineConfig(searchParams.get('linea'))
  const isClassificationPlant = plantLineCfg.isClassificationPlant !== false

  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null
  const activeGates = latest?.gates.filter(g => g.active) ?? []

  const activeDisplay = overrideDisplay ?? (liveShift ? { dateKey: liveShift.dateKey, shiftId: liveShift.shiftId } : null)
  const shortShift = activeDisplay?.shiftId.includes('día') ? 'día' : 'noche'
  const shiftStart = liveShift?.window.startAt
    ? new Date(liveShift.window.startAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="container mx-auto p-4 max-w-md space-y-4">

      {/* Header compacto */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/analisis-grader')}
          className="gap-1 text-muted-foreground -ml-1"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs">Grader</span>
        </Button>
        <span className="text-sm font-semibold ml-auto">Cambio rápido</span>
      </div>

      {/* Cambio rápido no aplica a plantas sin clasificación (Yal) */}
      {!isClassificationPlant ? (
        <Card className="border-amber-500/[0.25] bg-amber-500/[0.15]">
          <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="w-8 h-8 text-amber-400" />
            <p className="font-medium">Cambio de gate no aplica</p>
            <p className="text-sm text-muted-foreground">
              <b>{plantLineCfg.label}</b> es planta de eviscerado simplificado — sus
              gates físicas alimentan las 3 Baaders pero no clasifican producto. No hay
              gates de calibre/calidad que reconfigurar.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/analisis-grader?linea=${plantLineCfg.id}`)}
              className="mt-1 gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver a Análisis de Turno
            </Button>
          </CardContent>
        </Card>
      ) : activeDisplay ? (
        <>
          {/* Banner: EN VIVO (turno activo) o RETROACTIVO (override por param) */}
          {overrideDisplay ? (
            <Card className="border-amber-500/[0.25] bg-amber-500/[0.15]">
              <CardContent className="p-4 flex items-center gap-3">
                <History className="w-5 h-5 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold capitalize">Turno {shortShift}</span>
                    <Badge className="bg-amber-500/[0.15] text-amber-400 border-amber-500/[0.25] text-caption">RETROACTIVO</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {overrideDisplay.dateKey}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs shrink-0"
                  onClick={() => navigate(`/analisis-grader/turno/${shiftDocId}`)}
                >
                  Ver turno
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-red-500/[0.25] bg-red-500/[0.15]">
              <CardContent className="p-4 flex items-center gap-3">
                <Activity className="w-5 h-5 text-red-400 animate-pulse shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold capitalize">Turno {shortShift}</span>
                    <Badge className="bg-red-500/[0.15] text-ink-crit border-red-500/[0.25] text-caption">EN VIVO</Badge>
                  </div>
                  {shiftStart && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Clock className="w-3 h-3" />
                      Desde {shiftStart}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs shrink-0"
                  onClick={() => navigate(`/analisis-grader/turno/${shiftDocId}`)}
                >
                  Ver turno
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Feedback de cambios guardados */}
          {savedCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-card bg-emerald-500/[0.15] border border-emerald-500/[0.25] text-sm text-ink-ok">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {savedCount === 1
                ? 'Cambio registrado exitosamente'
                : `${savedCount} cambios registrados en este turno`}
            </div>
          )}

          {/* Botón principal — CTA grande para mobile */}
          <div className="pt-2">
            <Button
              className="w-full h-14 text-base gap-2"
              onClick={() => setModalOpen(true)}
            >
              <GitBranch className="w-5 h-5" />
              Registrar cambio de gate
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-2">
              {overrideDisplay
                ? 'El cambio se registra con la hora actual como timestamp retroactivo'
                : 'El cambio queda marcado en el timeline con hora exacta'}
            </p>
          </div>

          <GateChangeModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            shiftDocId={shiftDocId!}
            configSnapshots={snapshots}
            onSaved={() => { setModalOpen(false); handleSaved() }}
            plantLineId={searchParams.get('linea') ?? undefined}
          />

          {/* Config actual compacta — los gates activos del último snapshot */}
          {activeGates.length > 0 && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Config actual ({activeGates.length} gates activas)
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {activeGates
                    .sort((a, b) => a.gateNumber - b.gateNumber)
                    .map(g => (
                      <div key={g.gateNumber} className="flex items-center gap-2 py-0.5 text-xs border-b border-border/20 last:border-0">
                        <span className="font-semibold w-7 shrink-0 text-muted-foreground">G{g.gateNumber}</span>
                        <span className="truncate text-foreground/80">{g.assignedCalibre}</span>
                        <span className="shrink-0 text-muted-foreground">{g.assignedQuality}</span>
                      </div>
                    ))}
                </div>
                {latest?.changedBy?.name && (
                  <p className="text-caption text-muted-foreground/50 pt-1">
                    Última config por {latest.changedBy.name}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        /* Sin turno activo */
        <Card className="border-dashed">
          <CardContent className="p-8 flex flex-col items-center gap-3 text-center">
            <Clock className="w-8 h-8 text-muted-foreground/40" />
            <p className="font-medium">No hay turno activo ahora</p>
            <p className="text-sm text-muted-foreground">
              Esta página es para registrar cambios durante un turno en vivo.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/analisis-grader')}
              className="mt-1 gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver a Análisis de Turno
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
