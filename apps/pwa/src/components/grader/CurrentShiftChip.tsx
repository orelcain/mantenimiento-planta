/**
 * CurrentShiftChip — atajo siempre visible al turno en proceso de la planta.
 *
 * FUENTE DE VERDAD: los docs Shoplogix del día (hoy + ayer) con sus horarios
 * REALES (scheduledStart/End). Shoplogix indica qué turno está en curso; los
 * horarios los define Shoplogix y CAMBIAN (decisión PR #157). El schedule
 * configurado/hardcodeado queda como FALLBACK cuando aún no hay docs (ej.
 * primer sync del turno pendiente, Firestore frío).
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
import { computeShiftTimeWindow, nowAsWallClockUTC } from '@/services/grader/graderShiftStatus'
import { getModuleRanges } from '@/services/grader/graderModuleConfig.service'
import { getShiftMeta } from '@/services/grader/graderShiftDisplay'
import { useUpstreamLineSnapshot } from '@/hooks/useUpstreamLineSnapshot'
import { listShiftInfosForDay, type ShoplogixShiftDayInfo } from '@/services/shoplogix/shoplogixShift.service'
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

  // Nomenclatura preferida por planta — SOLO para el fallback por schedule
  // (cuando aún no hay docs Shoplogix del día). La detección primaria usa los
  // nombres REALES que emite Shoplogix, sean cuales sean.
  const preferredShiftIds = useMemo(() => {
    return cfg.isClassificationPlant === false
      ? ['Turno 1', 'Turno 2', 'Turno 3']
      : ['Turno día', 'Turno noche']
  }, [cfg.isClassificationPlant])

  // Docs Shoplogix de hoy + ayer con horarios reales (ayer cubre turnos que
  // cruzan medianoche, ej. chonchi "Turno 1" 21:30→05:45). Re-descubre cada
  // 5 min: el doc de un turno nuevo aparece a los pocos minutos del primer sync.
  const [dayInfos, setDayInfos] = useState<ShoplogixShiftDayInfo[]>([])
  useEffect(() => {
    if (!cfg.shoplogixEnabled) { setDayInfos([]); return }
    let cancelled = false
    const load = () => {
      const nowD = new Date()
      const todayKey = localDateKey(nowD)
      const ydayKey = previousDateKey(nowD)
      Promise.all([
        listShiftInfosForDay(ydayKey, cfg.plantSlug),
        listShiftInfosForDay(todayKey, cfg.plantSlug),
      ])
        .then(([yday, today]) => { if (!cancelled) setDayInfos([...yday, ...today]) })
        .catch(() => { /* fallback por schedule sigue funcionando */ })
    }
    load()
    const id = setInterval(load, 5 * 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [cfg.plantSlug, cfg.shoplogixEnabled])

  // Encontrar el turno en curso.
  //
  // 1) VERDAD SHOPLOGIX: doc del día cuyo horario real contiene `now`. Como
  //    en un turno EN CURSO el scheduledEnd crece con cada sync (se deriva del
  //    último interval), toleramos un rezago de sync de 30 min.
  // 2) FALLBACK: iterar el schedule configurado (comportamiento histórico),
  //    para cuando el primer sync del turno aún no escribe el doc.
  //
  // Nota: el módulo usa convención wall-clock-as-UTC (los startHour/endHour se
  // interpretan como UTC aunque representen hora local). Para que la comparación
  // sea consistente, convertimos `now` a un Date que represente la hora local
  // como si fuera UTC vía `nowAsWallClockUTC`. Sin esto, las 16:40 local en Chile
  // (UTC-4) se comparan contra "19:00 UTC end" y el turno día queda erróneamente
  // como `closed`.
  const live = useMemo(() => {
    const nowWallUTC = nowAsWallClockUTC(now)
    const nowMs = nowWallUTC.getTime()
    const todayKey = localDateKey(now)
    const ydayKey = previousDateKey(now)

    // 1) Docs reales — iterar del más reciente al más viejo (si T2 recién cerró
    //    y T3 recién abrió, ambos caen en la tolerancia → gana el que arrancó último).
    const SYNC_LAG_MS = 30 * 60_000
    for (let i = dayInfos.length - 1; i >= 0; i--) {
      const info = dayInfos[i]!
      if (info.shiftId === 'Unscheduled') continue  // no es un turno real
      if (!info.scheduledStart || !info.scheduledEnd) continue
      const startMs = info.scheduledStart.getTime()
      const endMs   = info.scheduledEnd.getTime()
      if (startMs > nowMs || nowMs > endMs + SYNC_LAG_MS) continue

      // Para progreso/restante preferir la ventana del schedule si reconoce el
      // turno Y ya está en rango (tiene la hora de fin PLANEADA; el doc solo
      // conoce el fin hasta el último sync). Si el schedule no lo reconoce o
      // discrepa, usar los bounds reales extendidos hasta `now` — y en ese
      // caso el fin planeado es desconocido → progreso/restante = null (si no,
      // marcarían 100%/0 durante todo el turno). elapsed sí es correcto.
      const schedTw = computeShiftTimeWindow(info.dateKey, info.shiftId, schedule, nowWallUTC)
      let tw = schedTw
      if (schedTw.status !== 'live') {
        tw = computeShiftTimeWindow(info.dateKey, info.shiftId, schedule, nowWallUTC, {
          startAt: info.scheduledStart,
          endAt: new Date(Math.max(endMs, nowMs)),
        })
        if (endMs < nowMs) tw = { ...tw, progressPct: null, remainingMin: null }
      }
      // scheduledStart REAL (no tw.startAt, que en la rama live puede ser la
      // hora del schedule) → getShiftMeta deriva el período por la hora real.
      return { dateKey: info.dateKey, shiftId: info.shiftId, tw, scheduledStart: info.scheduledStart }
    }

    // 2) Fallback por schedule configurado/hardcodeado (sin doc real → sin
    //    scheduledStart; getShiftMeta cae al nombre, coherente con el schedule).
    const filtered = schedule.filter((s) => preferredShiftIds.includes(s.shiftId))
    for (const dateKey of [todayKey, ydayKey]) {
      for (const s of filtered) {
        const tw = computeShiftTimeWindow(dateKey, s.shiftId, schedule, nowWallUTC)
        if (tw.status === 'live') {
          return { dateKey, shiftId: s.shiftId, tw, scheduledStart: null as Date | null }
        }
      }
    }
    return null
  }, [now, schedule, preferredShiftIds, dayInfos])

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
        'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-ctl border border-border/40 bg-muted/30 text-muted-foreground',
        className,
      )}>
        <Clock className="h-3 w-3 shrink-0" />
        <span>Sin turno activo ahora</span>
      </div>
    )
  }

  const meta = getShiftMeta(live.shiftId, live.scheduledStart)
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
  // null = fin planeado desconocido (turno detectado por datos reales cuyo
  // nombre no está en el schedule) → se omite el % en vez de inventar 0/100.
  const progressPct = live.tw.progressPct != null ? Math.round(live.tw.progressPct) : null

  // Estado ámbar: horario nominal del turno está activo PERO no hay producción real.
  // Frecuente en temporada baja, paros prolongados o plantas sin datos sincronizados.
  // El chip queda clicable (lleva al detalle) pero deja claro que no hay actividad.
  if (!hasActivity) {
    return (
      <button
        type="button"
        onClick={() => navigate(href)}
        className={cn(
          'group inline-flex items-center gap-2 px-2.5 py-1.5 rounded-ctl border border-amber-500/[0.25] bg-amber-500/[0.15] hover:bg-amber-500/[0.15] transition-colors text-left',
          className,
        )}
        title={`El horario del ${meta.label} (${live.dateKey}) está activo pero no hay producción registrada en Shoplogix en los últimos ${ACTIVITY_MAX_AGE_MIN} min. Click para ver el detalle igual.`}
      >
        <span className="flex items-center gap-1 shrink-0">
          <PauseCircle className="h-3 w-3 text-ink-warn/80" />
          <ShiftIcon className={cn('h-3.5 w-3.5 opacity-70', meta.textColorClass)} />
        </span>
        <span className="flex flex-col leading-tight min-w-0">
          <span className="text-xs font-medium text-ink-warn/90">
            Programado · {meta.label}
          </span>
          <span className="text-caption text-ink-warn/80 dark:text-ink-warn/70">
            {upstream.loading ? 'Verificando producción…' : 'Sin actividad detectada'}
          </span>
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-ink-warn/40 group-hover:text-ink-warn transition-colors shrink-0" />
      </button>
    )
  }

  // Estado verde: horario activo + datos reales recientes + ciclos > 0
  return (
    <button
      type="button"
      onClick={() => navigate(href)}
      className={cn(
        'group inline-flex items-center gap-2 px-2.5 py-1.5 rounded-ctl border border-emerald-500/[0.25] bg-emerald-500/[0.15] hover:bg-emerald-500/[0.15] transition-colors text-left',
        className,
      )}
      title={`Turno en curso · click para ver el detalle (${live.dateKey})`}
    >
      <span className="flex items-center gap-1 shrink-0">
        <Activity className="h-3 w-3 text-ink-ok animate-pulse" />
        <ShiftIcon className={cn('h-3.5 w-3.5', meta.textColorClass)} />
      </span>
      <span className="flex flex-col leading-tight min-w-0">
        <span className="text-xs font-medium text-ink-ok">
          En curso · {meta.label}
        </span>
        <span className="text-caption text-ink-ok/90 dark:text-ink-ok/80 tabular-nums">
          {elapsedLabel} transcurridos{progressPct != null ? ` · ${progressPct}%` : ''}
        </span>
      </span>
      <ChevronRight className="h-3.5 w-3.5 text-ink-ok/60 group-hover:text-ink-ok transition-colors shrink-0" />
    </button>
  )
}
