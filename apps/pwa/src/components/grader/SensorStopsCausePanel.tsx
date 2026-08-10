/**
 * SensorStopsCausePanel — la causa de cada paro que el sensor midió.
 *
 * El sensor de Shoplogix entrega CUÁNTO y CUÁNDO paró la máquina, pero no el
 * POR QUÉ: en el área Filete llegó el turno completo con `reason` vacío (o
 * "Planned Downtime"), sin comentarios de operador. Este panel lista esos paros
 * y deja que Mantención dicte la causa en el momento.
 *
 * META de la app: un paro sin causa es un minuto que nadie puede defender ni
 * mejorar. Con la causa anotada, esos minutos se vuelven un pareto por
 * responsable (mantención / operación / externo / planificado) — evidencia de
 * dónde se pierde el tiempo y de qué parte es nuestra.
 *
 * Las anotaciones van a `paros` con `origen: 'shoplogix'` y un id determinístico
 * por paro (`sensorStopKey`), así que re-anotar corrige en vez de duplicar. Esos
 * minutos NO se vuelven a descontar en el OEE de área (ver LineOeeCard).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, Loader2, Mic, Sparkles, Wrench, Users, CloudOff, CalendarClock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, SpeechTextarea, InfoTooltip } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'
import { annotateSensorStop, getParosByPlantLine, sensorStopKey } from '@/services/paros'
import { addMaintenanceLogEntry } from '@/services/maintenanceLog'
import { refineText } from '@/services/ai'
import { logger } from '@/lib/logger'
import { isMaintenanceState } from '@/services/grader/shoplogixMaintenance'
import { targetCpmFromIntervals } from '@/services/grader/plantKpiCompute'
import type { PlantLineId } from '@/config/plantLines'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import type { UpstreamLineSnapshot, UpstreamMachineState } from '@/services/shoplogix/types'
import type { ParoEtapa } from '@/types'
import { shortMachineName } from '@/services/grader/graderMachineNames'

/** Categorías de causa — definen a quién le pertenece el minuto perdido. */
const CATEGORIAS = [
  { id: 'mantencion',  label: 'Mantención', icon: Wrench,        cls: 'border-primary/50 bg-primary/15 text-primary' },
  { id: 'operacion',   label: 'Operación',  icon: Users,         cls: 'border-amber-500/[0.25] bg-amber-500/[0.15] text-ink-warn' },
  { id: 'externo',     label: 'Externo',    icon: CloudOff,      cls: 'border-muted-foreground/[0.10] bg-muted-foreground/[0.10] text-muted-foreground' },
  { id: 'planificado', label: 'Planificado', icon: CalendarClock, cls: 'border-emerald-500/[0.25] bg-emerald-500/[0.15] text-ink-ok' },
] as const

type Categoria = typeof CATEGORIAS[number]['id']

/** Paro relevante: mínimo de minutos para pedir una causa. */
const MIN_STOP_MIN = 3

/** Cuántos paros mostrar cuando ya están todos explicados (los más largos). */
const TOP_WHEN_ALL_EXPLAINED = 5

interface SensorStop {
  key: string
  machineid: string
  machineName: string
  startAt: Date
  durationMin: number
  /** Causa que ya trae el sensor (vacía = hay que anotarla). */
  sensorReason: string
  /** Piezas que dejó de producir, al objetivo de la máquina. null sin objetivo. */
  lostPieces: number | null
  isMaintenance: boolean
}

interface Props {
  snapshot: UpstreamLineSnapshot
  plantLineId: PlantLineId
  plantSlug: PlantSlug
  dateKey: string
  shiftId: string
  className?: string
}

/** ¿Este state es un paro real (no uptime ni el relleno post-turno del sensor)? */
function isRealStop(s: UpstreamMachineState): boolean {
  if (s.type === 'uptime') return false
  if (s.type === 'break') {
    const r = (s.reason || '').toLowerCase()
    // "Planned Downtime" es el relleno de la ventana de consulta fuera del
    // turno, no un paro que alguien deba explicar.
    if (r.includes('planned downtime') || r.includes('detencion programada') || r.includes('detención programada')) return false
  }
  return true
}

function fmtHora(d: Date): string {
  // Los timestamps de Shoplogix son wall-clock guardado como UTC: se leen en UTC
  // para mostrar la hora de planta (mismo criterio que el resto del módulo).
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export function SensorStopsCausePanel({
  snapshot, plantLineId, plantSlug, dateKey, shiftId, className,
}: Props) {
  const user = useAuthStore((s) => s.user)

  const [causas, setCausas] = useState<Map<string, ParoEtapa>>(new Map())
  const [loading, setLoading] = useState(true)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [categoria, setCategoria] = useState<Categoria>('mantencion')
  const [alHistorial, setAlHistorial] = useState(true)
  const [refining, setRefining] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verTodos, setVerTodos] = useState(false)

  // Paros del turno, ordenados por duración (el que más duele primero).
  const stops = useMemo<SensorStop[]>(() => {
    const out: SensorStop[] = []
    for (const m of snapshot.machines) {
      const targetCpm = targetCpmFromIntervals(m.intervals)
      for (const s of m.states) {
        if (!isRealStop(s)) continue
        const durationMin = s.durationSec / 60
        if (durationMin < MIN_STOP_MIN) continue
        out.push({
          key: sensorStopKey({ plantSlug, dateKey, shiftId, machineid: m.machineid, startAt: s.startAt }),
          machineid: m.machineid,
          machineName: m.machineName,
          startAt: s.startAt,
          durationMin,
          sensorReason: (s.reason || '').trim(),
          lostPieces: targetCpm != null ? Math.round(durationMin * targetCpm) : null,
          isMaintenance: isMaintenanceState(s),
        })
      }
    }
    return out.sort((a, b) => b.durationMin - a.durationMin)
  }, [snapshot, plantSlug, dateKey, shiftId])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await getParosByPlantLine(plantLineId)
      const byKey = new Map<string, ParoEtapa>()
      for (const p of all) if (p.stopKey) byKey.set(p.stopKey, p)
      setCausas(byKey)
    } catch (e) {
      logger.error('[SensorStopsCausePanel] no se pudieron cargar las causas', e instanceof Error ? e : new Error(String(e)))
      setCausas(new Map())
    } finally {
      setLoading(false)
    }
  }, [plantLineId])

  useEffect(() => { void load() }, [load])

  const abrir = (stop: SensorStop) => {
    const ya = causas.get(stop.key)
    setOpenKey(stop.key)
    setTexto(ya?.causa ?? '')
    setCategoria(ya?.categoria ?? (stop.isMaintenance ? 'mantencion' : 'operacion'))
    setAlHistorial(!ya)
    setError(null)
  }

  const limpiarConIA = async () => {
    if (!texto.trim()) return
    setRefining(true)
    try {
      setTexto(await refineText(texto))
    } catch (e) {
      logger.error('[SensorStopsCausePanel] refineText falló', e instanceof Error ? e : new Error(String(e)))
    } finally {
      setRefining(false)
    }
  }

  const guardar = async (stop: SensorStop) => {
    const causa = texto.trim()
    if (!causa) { setError('Escribí o dictá la causa antes de guardar.'); return }
    setSaving(true)
    setError(null)
    try {
      await annotateSensorStop({
        plantLineId, plantSlug, dateKey, shiftId,
        machineid: stop.machineid,
        machineName: stop.machineName,
        startAt: stop.startAt,
        durationMin: Math.round(stop.durationMin * 10) / 10,
        causa, categoria,
        tecnico: user?.nombre ?? user?.email ?? undefined,
      })
      // Solo las causas de Mantención entran al historial del equipo: meter ahí
      // una colación o una falta de materia prima ensuciaría el MTTR y la Lente
      // de Mantención con paros que no son nuestros.
      if (categoria === 'mantencion' && alHistorial) {
        await addMaintenanceLogEntry({
          equipmentId: `area:${plantLineId}`,
          fecha: stop.startAt,
          tipo: 'correctivo',
          hallazgo: `Paro de ${Math.round(stop.durationMin)} min en ${shortMachineName(stop.machineName)} (${fmtHora(stop.startAt)}): ${causa}`,
          severidad: stop.durationMin >= 15 ? 'rojo' : 'amarillo',
          tecnico: user?.nombre ?? user?.email ?? undefined,
          plantLineId,
          shiftId,
          origen: 'paro_sensor',
        })
      }
      setOpenKey(null)
      setTexto('')
      await load()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('[SensorStopsCausePanel] no se pudo guardar la causa', e instanceof Error ? e : new Error(msg))
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  if (stops.length === 0) return null

  const sinCausa = stops.filter((s) => !s.sensorReason && !causas.has(s.key))
  const minutosSinCausa = sinCausa.reduce((a, s) => a + s.durationMin, 0)
  const piezasSinCausa = sinCausa.reduce((a, s) => a + (s.lostPieces ?? 0), 0)

  // Por defecto se listan SOLO los paros que falta explicar. En Yal/Chonchi el
  // sensor ya clasifica casi todo (COLACION, FALTA MMPP, CUMPLIMIENTO CUOTA…) y
  // volcar los 20+ paros del turno acá competiría con el pareto de causas que ya
  // existe; el trabajo pendiente de Mantención son los que no tienen causa.
  const conCausa = stops.filter((s) => s.sensorReason || causas.has(s.key))
  // Si TODO está explicado, la card se queda con los más largos: 20+ filas de
  // colaciones ya clasificadas no aportan nada y esconden el resto de la vista.
  const visibles = verTodos
    ? stops
    : sinCausa.length > 0 ? sinCausa : stops.slice(0, TOP_WHEN_ALL_EXPLAINED)

  return (
    <Card className={cn('border-border', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Causa de los paros
            <InfoTooltip
              text={`El sensor mide cuánto y cuándo paró la máquina, pero no por qué. Cada causa anotada acá convierte minutos perdidos en un pareto por responsable — y las de Mantención quedan además en el historial del equipo.\n\nParos de menos de ${MIN_STOP_MIN} min no se listan (son micro-detenciones: se analizan como conjunto, no una por una).`}
              iconSize={11} position="top"
            />
          </CardTitle>
          {sinCausa.length > 0 && (
            <Badge variant="outline" className="text-caption border-amber-500/[0.25] text-ink-warn bg-amber-500/[0.15]">
              {sinCausa.length} sin causa · {Math.round(minutosSinCausa)} min
              {piezasSinCausa > 0 && ` · ≈${piezasSinCausa.toLocaleString('es-CL')} pz`}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-1.5 pb-3">
        {loading && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cargando causas anotadas…
          </p>
        )}

        {visibles.map((stop) => {
          const anotada = causas.get(stop.key)
          const causaTexto = anotada?.causa || stop.sensorReason
          const catMeta = CATEGORIAS.find((c) => c.id === anotada?.categoria)
          const abierto = openKey === stop.key

          return (
            <div
              key={stop.key}
              className={cn(
                'rounded-ctl border px-2.5 py-2 text-xs',
                causaTexto ? 'border-border bg-muted/50' : 'border-amber-500/[0.25] bg-amber-500/[0.06]',
              )}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono tabular-nums text-muted-foreground w-11">{fmtHora(stop.startAt)}</span>
                <span className="font-mono tabular-nums font-semibold w-16">
                  {stop.durationMin >= 10 ? Math.round(stop.durationMin) : stop.durationMin.toFixed(1)} min
                </span>
                {stop.lostPieces != null && stop.lostPieces > 0 && (
                  <span className="font-mono tabular-nums text-muted-foreground/80" title={`Al objetivo de la máquina: ${Math.round(stop.durationMin)} min sin producir`}>
                    ≈{stop.lostPieces.toLocaleString('es-CL')} pz
                  </span>
                )}
                {snapshot.machines.length > 1 && (
                  <span className="text-muted-foreground/70 truncate max-w-[8rem]">{shortMachineName(stop.machineName)}</span>
                )}

                <div className="flex-1" />

                {causaTexto ? (
                  <span className="flex items-center gap-1.5 min-w-0">
                    {catMeta && (
                      <Badge variant="outline" className={cn('text-caption px-1.5 py-0 h-4', catMeta.cls)}>
                        {catMeta.label}
                      </Badge>
                    )}
                    <span className="truncate max-w-[14rem]" title={causaTexto}>{causaTexto}</span>
                    {anotada && <CheckCircle2 className="w-3 h-3 text-ink-ok shrink-0" />}
                  </span>
                ) : (
                  <Badge variant="outline" className="text-caption px-1.5 py-0 h-4 border-amber-500/[0.25] text-ink-warn">
                    sin causa
                  </Badge>
                )}

                <Button
                  size="sm"
                  variant={causaTexto ? 'ghost' : 'outline'}
                  className={cn('h-6 px-2 text-caption', !causaTexto && 'border-primary/40 text-primary hover:bg-primary/10')}
                  onClick={() => (abierto ? setOpenKey(null) : abrir(stop))}
                >
                  {abierto
                    ? 'Cerrar'
                    : anotada
                      ? 'Editar'
                      : stop.sensorReason
                        ? 'Detallar'
                        : <><Mic className="w-3 h-3 mr-1" />Dictar causa</>}
                </Button>
              </div>

              {abierto && (
                <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
                  <SpeechTextarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    rows={2}
                    placeholder="Ej: se atascó una pieza en la cinta de salida, se destrabó y se revisó el sensor"
                    className="text-xs"
                  />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {CATEGORIAS.map((c) => {
                      const Icon = c.icon
                      const activa = categoria === c.id
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCategoria(c.id)}
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-ctl border text-caption transition-colors',
                            activa ? c.cls : 'border-border text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <Icon className="w-3 h-3" /> {c.label}
                        </button>
                      )
                    })}
                    <div className="flex-1" />
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-caption" onClick={limpiarConIA} disabled={refining || !texto.trim()}>
                      {refining ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                      Limpiar con IA
                    </Button>
                  </div>

                  {categoria === 'mantencion' && (
                    <label className="flex items-center gap-1.5 text-caption text-muted-foreground cursor-pointer">
                      <input type="checkbox" checked={alHistorial} onChange={(e) => setAlHistorial(e.target.checked)} className="accent-primary" />
                      Registrar también en el historial de Mantención del área
                    </label>
                  )}

                  {error && (
                    <p className="text-caption text-cat-5-ink">{error}</p>
                  )}

                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-caption" onClick={() => setOpenKey(null)} disabled={saving}>
                      Cancelar
                    </Button>
                    <Button size="sm" className="h-6 px-2.5 text-caption" onClick={() => guardar(stop)} disabled={saving || !texto.trim()}>
                      {saving ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Guardando…</> : 'Guardar causa'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {(verTodos || stops.length > visibles.length) && (
          <button
            type="button"
            onClick={() => setVerTodos((v) => !v)}
            className="text-caption text-muted-foreground hover:text-foreground underline decoration-dotted pt-0.5"
          >
            {verTodos
              ? (sinCausa.length > 0 ? 'Ver solo los paros sin causa' : `Ver solo los ${TOP_WHEN_ALL_EXPLAINED} paros más largos`)
              : sinCausa.length > 0
                ? `Ver también los ${conCausa.length} paros que el sensor ya clasificó`
                : `Ver los ${stops.length - visibles.length} paros más cortos`}
          </button>
        )}
      </CardContent>
    </Card>
  )
}
