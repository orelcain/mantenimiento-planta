/**
 * CurrentShiftChip — atajo siempre visible al turno en proceso de la planta.
 *
 * Itera sobre el schedule de la planta (default + override Firestore), prueba
 * dateKey=hoy y dateKey=ayer para cada entry, y elige el turno cuyo
 * `computeShiftTimeWindow` retorne `status === 'live'`.
 *
 * Click → navega a /analisis-grader/turno/<dateKey>__<shiftId>?linea=<id>.
 * Auto-refresh cada 60s. Si no hay turno activo, muestra etiqueta sutil.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, ChevronRight, Sun, Moon, Sunrise, Sunset, Clock, PauseCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPlantLineConfig, DEFAULT_PLANT_LINE_ID, type PlantLineId } from '@/config/plantLines'
import { DEFAULT_SHIFT_SCHEDULE, normalizeShiftSchedule } from '@/services/grader/graderShiftSchedule'
import { computeShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import { getModuleRanges } from '@/services/grader/graderModuleConfig.service'
import { getShiftMeta } from '@/services/grader/graderShiftDisplay'
import { useUpstreamLineSnapshot } from '@/hooks/useUpstreamLineSnapshot'
import type { GraderShiftSchedule } from '@/services/grader/types'

/** Snapshot considerado "stale" después de N minutos sin sync. */
const ACTIVITY_MAX_AGE_MIN = 30

interface CurrentShiftChipProps {
  plantLineId: PlantLineId
  className?: string
}

/** dateKey en zona local del navegador (mismas convenciones wall-clock que el resto del módulo). */
function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function previousDateKey(d: Date): string {
  const prev = new Date(d)
  prev.setDate(prev.getDate() - 1)
  return localDateKey(prev)
}

function fmtElapsed(min: number): string {
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function CurrentShiftChip({ plantLineId, className }: CurrentShiftChipProps) {
  const navigate = useNavigate()
  const cfg = getPlantLineConfig(plantLineId)
  const baseSchedule = cfg.defaultShiftSchedule ?? DEFAULT_SHIFT_SCHEDULE

  // Schedule efectivo: defaults + overrides guardados en Firestore (admin/supervisor)
  const [schedule, setSchedule] = useState<GraderShiftSchedule[]>(baseSchedule)
  useEffect(() => {
    let cancelled = false
    getModuleRanges(plantLineId)
      .then((c) => {
        if (cancelled) return
        const merged = normalizeShiftSchedule(c?.shiftSchedule, baseSchedule)
        setSchedule(merged)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [plantLineId, baseSchedule])

  // Tick cada 60s para mantener "elapsed" y la detección live↔closed actualizados.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Nomenclatura preferida por planta — Yal y otras plantas no-clasificadoras
  // operan con turnos numerados (T1/T2/T3) que vienen de Shoplogix; Chonchi
  // (clasificadora) usa Día/Noche del Excel del Grader.
  // El `defaultShiftSchedule` de Yal incluye ambas variantes por compatibilidad,
  // así que filtramos solo las preferidas para no caer en "Turno noche" cuando
  // el operador-real está en "Turno 2".
  const preferredShiftIds = useMemo(() => {
    return cfg.isClassificationPlant === false
      ? ['Turno 1', 'Turno 2', 'Turno 3']
      : ['Turno día', 'Turno noche']
  }, [cfg.isClassificationPlant])

  // Encontrar el turno con status === 'live' entre los preferidos (prueba hoy
  // y ayer por turnos que cruzan medianoche).
  // Nota: el módulo usa convención wall-clock-as-UTC (los startHour/endHour se
  // interpretan como UTC aunque representen hora local). Para que la comparación
  // sea consistente, convertimos `now` a un Date que represente la hora local
  // como si fuera UTC. Sin esto, las 16:40 local en Chile (UTC-4) se comparan
  // contra "19:00 UTC end" y el turno día queda erróneamente como `closed`.
  const live = useMemo(() => {
    const nowWallUTC = new Date(Date.UTC(
      now.getFullYear(), now.getMonth(), now.getDate(),
      now.getHours(), now.getMinutes(), now.getSeconds(),
    ))
    const todayKey = localDateKey(now)
    const ydayKey = previousDateKey(now)
    const filtered = schedule.filter((s) => preferredShiftIds.includes(s.shiftId))
    for (const dateKey of [todayKey, ydayKey]) {
      for (const s of filtered) {
        const tw = computeShiftTimeWindow(dateKey, s.shiftId, schedule, nowWallUTC)
        if (tw.status === 'live') {
          return { dateKey, shiftId: s.shiftId, tw }
        }
      }
    }
    return null
  }, [now, schedule, preferredShiftIds])

  // Cargar snapshot Shoplogix del turno candidato para verificar producción real.
  // El hook acepta null/undefined → no fetchea cuando no hay turno candidato.
  const upstream = useUpstreamLineSnapshot(
    live?.dateKey ?? null,
    live?.shiftId ?? null,
    cfg.plantSlug,
  )

  // ¿Hay evidencia de producción REAL ahora mismo?
  //   - Fuente debe ser Firestore (no 'demo' sintético, no 'none')
  //   - Total de ciclos > 0 en las máquinas del snapshot
  //   - El último sync no debe ser viejo (planta puede estar en horario pero
  //     parada físicamente → no decimos "En curso" si nadie reporta hace > 30 min)
  const hasActivity = useMemo(() => {
    if (!upstream.snapshot || upstream.source !== 'firestore') return false
    const totalCycles = upstream.snapshot.machines.reduce((s, m) => s + (m.totalCycles ?? 0), 0)
    if (totalCycles <= 0) return false
    if (!upstream.syncedAt) return false
    const ageMin = (Date.now() - upstream.syncedAt.getTime()) / 60_000
    return ageMin <= ACTIVITY_MAX_AGE_MIN
  }, [upstream.snapshot, upstream.source, upstream.syncedAt])

  if (!cfg.shoplogixEnabled && !cfg.hasGraderData) return null

  // Sin turno activo — etiqueta sutil. No es error, simplemente fuera de ventana operativa.
  if (!live) {
    return (
      <div className={cn(
        'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-border/40 bg-muted/30 text-muted-foreground',
        className,
      )}>
        <Clock className="h-3 w-3 shrink-0" />
        <span>Sin turno activo ahora</span>
      </div>
    )
  }

  const meta = getShiftMeta(live.shiftId)
  const ShiftIcon = meta.iconName === 'Sun' ? Sun
    : meta.iconName === 'Sunset' ? Sunset
    : meta.iconName === 'Moon' ? Moon
    : meta.iconName === 'Sunrise' ? Sunrise
    : Activity

  const linea = plantLineId !== DEFAULT_PLANT_LINE_ID
    ? `?linea=${encodeURIComponent(plantLineId)}`
    : ''
  const href = `/analisis-grader/turno/${live.dateKey}__${encodeURIComponent(live.shiftId)}${linea}`

  const elapsedLabel = fmtElapsed(live.tw.elapsedMin)
  const progressPct = live.tw.progressPct != null ? Math.round(live.tw.progressPct) : 0

  // Estado ámbar: horario nominal del turno está activo PERO no hay producción real.
  // Frecuente en temporada baja, paros prolongados o plantas sin datos sincronizados.
  // El chip queda clicable (lleva al detalle) pero deja claro que no hay actividad.
  if (!hasActivity) {
    return (
      <button
        type="button"
        onClick={() => navigate(href)}
        className={cn(
          'group inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10 transition-colors text-left',
          className,
        )}
        title={`El horario del ${meta.label} (${live.dateKey}) está activo pero no hay producción registrada en Shoplogix en los últimos ${ACTIVITY_MAX_AGE_MIN} min. Click para ver el detalle igual.`}
      >
        <span className="flex items-center gap-1 shrink-0">
          <PauseCircle className="h-3 w-3 text-amber-400/80" />
          <ShiftIcon className={cn('h-3.5 w-3.5 opacity-70', meta.textColorClass)} />
        </span>
        <span className="flex flex-col leading-tight min-w-0">
          <span className="text-xs font-medium text-amber-200/90">
            Programado · {meta.label}
          </span>
          <span className="text-[10px] text-amber-300/70">
            {upstream.loading ? 'Verificando producción…' : 'Sin actividad detectada'}
          </span>
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-amber-400/40 group-hover:text-amber-400 transition-colors shrink-0" />
      </button>
    )
  }

  // Estado verde: horario activo + datos reales recientes + ciclos > 0
  return (
    <button
      type="button"
      onClick={() => navigate(href)}
      className={cn(
        'group inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15 transition-colors text-left',
        className,
      )}
      title={`Turno en curso · click para ver el detalle (${live.dateKey})`}
    >
      <span className="flex items-center gap-1 shrink-0">
        <Activity className="h-3 w-3 text-emerald-400 animate-pulse" />
        <ShiftIcon className={cn('h-3.5 w-3.5', meta.textColorClass)} />
      </span>
      <span className="flex flex-col leading-tight min-w-0">
        <span className="text-xs font-medium text-emerald-100">
          En curso · {meta.label}
        </span>
        <span className="text-[10px] text-emerald-300/80 tabular-nums">
          {elapsedLabel} transcurridos · {progressPct}%
        </span>
      </span>
      <ChevronRight className="h-3.5 w-3.5 text-emerald-400/60 group-hover:text-emerald-400 transition-colors shrink-0" />
    </button>
  )
}
