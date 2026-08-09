/**
 * ParoEtapaCapture — registro MANUAL de paros de etapa de la línea (Fase B OEE).
 *
 * Captura detenciones de las etapas NO instrumentadas (bombeo, chiller, cintas,
 * Marel, corte…) con duración + causa, para cuantificar la DISPONIBILIDAD del
 * área sin telemetría. El Pareto "¿qué etapa para más la línea?" es el mapa de
 * oportunidades. Ver docs/OEE_AREA_ROADMAP.md.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PauseCircle, Loader2, CheckCircle2, AlertTriangle, Trash2, BarChart3 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Badge } from '@/components/ui'
import { SpeechTextarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'
import { addParo, getParosByPlantLine, deleteParo } from '@/services/paros'
import { getPlantLineConfig } from '@/config/plantLines'
import type { ParoEtapa } from '@/types'

interface ParoEtapaCaptureProps {
  plantLineId: string
  areaLabel?: string
  /**
   * Se llama cuando se agrega o borra un paro. El OEE de área depende de estos
   * minutos y vive en OTRA card: sin este aviso, registrar un paro no movía el
   * número hasta recargar la página.
   */
  onChanged?: () => void
  className?: string
}

/**
 * Etapas frecuentes del eviscerado. Las líneas que declaran
 * `stagesWithoutSensor` en `plantLines.ts` usan las suyas (Filete: la GEA, las
 * cintas…). "Otra" siempre permite texto libre.
 */
const ETAPAS_EVISCERADO = [
  'Bombeo', 'Chiller', 'Desangrador', 'Cinta elevadora', 'Marel',
  'Baader', 'Corte cabeza', 'Grader', 'Etiquetado',
]
const OTRA = '__otra__'

function currentShiftId(): string {
  const h = new Date().getHours()
  return h >= 7 && h < 19 ? 'Turno día' : 'Turno noche'
}
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function fromLocalInput(s: string): Date {
  const d = new Date(s)
  return isNaN(d.getTime()) ? new Date() : d
}
function fmtDur(min: number): string {
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
function fmtFecha(d: Date): string {
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) +
    ' · ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

export function ParoEtapaCapture({ plantLineId, areaLabel, onChanged, className }: ParoEtapaCaptureProps) {
  const user = useAuthStore((s) => s.user)
  const lineCfg = getPlantLineConfig(plantLineId)
  const ETAPAS = lineCfg.stagesWithoutSensor ?? ETAPAS_EVISCERADO
  const isAdmin = user?.rol === 'admin'

  const [etapaSel, setEtapaSel] = useState<string>('')
  const [etapaCustom, setEtapaCustom] = useState('')
  const [duracion, setDuracion] = useState('')
  const [causa, setCausa] = useState('')
  const [fecha, setFecha] = useState(() => toLocalInput(new Date()))
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [paros, setParos] = useState<ParoEtapa[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setParos(await getParosByPlantLine(plantLineId)) }
    catch { setParos([]) }
    finally { setLoading(false) }
  }, [plantLineId])
  useEffect(() => { load() }, [load])

  // Pareto del mes: qué etapa para más (suma de minutos) + cantidad.
  const pareto = useMemo(() => {
    const now = new Date()
    const mes = paros.filter((p) => p.fecha.getMonth() === now.getMonth() && p.fecha.getFullYear() === now.getFullYear())
    const byEtapa = new Map<string, { min: number; n: number }>()
    for (const p of mes) {
      const e = byEtapa.get(p.etapa) ?? { min: 0, n: 0 }
      e.min += p.duracionMin
      e.n += 1
      byEtapa.set(p.etapa, e)
    }
    const rows = [...byEtapa.entries()].map(([etapa, v]) => ({ etapa, ...v })).sort((a, b) => b.min - a.min)
    const totalMin = rows.reduce((a, r) => a + r.min, 0)
    return { rows, totalMin, totalN: mes.length }
  }, [paros])

  const etapaFinal = etapaSel === OTRA ? etapaCustom.trim() : etapaSel

  const handleSave = useCallback(async () => {
    const dur = Number(duracion)
    if (!etapaFinal) { setError('Elegí o escribí la etapa.'); return }
    if (!Number.isFinite(dur) || dur <= 0) { setError('Indicá la duración del paro (minutos).'); return }
    setSaving(true)
    setError(null)
    try {
      await addParo({
        plantLineId,
        etapa: etapaFinal,
        duracionMin: dur,
        causa: causa.trim(),
        fecha: fromLocalInput(fecha),
        tecnico: user ? `${user.nombre} ${user.apellido}`.trim() : undefined,
        shiftId: currentShiftId(),
      })
      setEtapaSel(''); setEtapaCustom(''); setDuracion(''); setCausa('')
      setFecha(toLocalInput(new Date()))
      setJustSaved(true); setTimeout(() => setJustSaved(false), 3000)
      await load()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el paro.')
    } finally {
      setSaving(false)
    }
  }, [duracion, etapaFinal, causa, fecha, plantLineId, user, load])

  const handleDelete = useCallback(async (id: string) => {
    if (!isAdmin || !window.confirm('¿Eliminar este paro?')) return
    try { await deleteParo(id); await load(); onChanged?.() } catch { /* noop */ }
  }, [isAdmin, load, onChanged])

  return (
    <Card className={cn('border-cat-5-tint/[0.25]', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <PauseCircle className="h-4 w-4 text-rose-400" />
          Paros de etapa (línea)
          {areaLabel && (
            <Badge variant="outline" className="ml-1 text-[10px] font-normal text-muted-foreground border-border/50">{areaLabel}</Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Registrá cuándo se detuvo una etapa que no mide Shoplogix (bombeo, chiller, cintas, Marel, corte…). Mide la disponibilidad del área.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Etapa */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">Etapa que se detuvo</label>
          <div className="flex flex-wrap gap-1.5">
            {/* Regla que mantiene defendible el OEE de area: si el paro de la
                etapa TAMBIEN detuvo la maquina instrumentada, ese tiempo ya lo
                midio el sensor y va como causa de ese paro, no aca. */}
            {ETAPAS.map((e) => (
              <button key={e} type="button" onClick={() => setEtapaSel(e)}
                className={cn('px-2.5 py-1 rounded-ctl border text-xs font-medium transition-colors',
                  etapaSel === e ? 'border-cat-5-tint/[0.25] bg-cat-5-tint/[0.15] text-cat-5-ink'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted')}>
                {e}
              </button>
            ))}
            <button type="button" onClick={() => setEtapaSel(OTRA)}
              className={cn('px-2.5 py-1 rounded-ctl border text-xs font-medium transition-colors',
                etapaSel === OTRA ? 'border-cat-5-tint/[0.25] bg-cat-5-tint/[0.15] text-cat-5-ink'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted')}>
              Otra…
            </button>
          </div>
          {etapaSel === OTRA && (
            <Input value={etapaCustom} onChange={(e) => setEtapaCustom(e.target.value)} placeholder="Nombre de la etapa" className="text-sm bg-background mt-1" />
          )}
        </div>

        {/* Duración + Fecha */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Duración (min)</label>
            <Input type="number" inputMode="numeric" value={duracion} onChange={(e) => setDuracion(e.target.value)} placeholder="ej. 25" className="text-sm bg-background" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Fecha y hora</label>
            <Input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className="text-sm bg-background" />
          </div>
        </div>

        {/* Causa */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">Causa <span className="text-muted-foreground/60">(opcional)</span></label>
          <SpeechTextarea value={causa} onChange={(e) => setCausa(e.target.value)} placeholder="Por qué se detuvo (podés dictar)…" rows={2} className="text-sm bg-background" />
        </div>

        {error && (
          <div className="flex items-start gap-2 text-xs text-red-600 bg-red-500/[0.15] border border-red-500/[0.25] rounded-ctl px-2.5 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span className="break-words">{error}</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="button" onClick={handleSave} disabled={saving} className="bg-rose-600 hover:bg-rose-700 text-white">
            {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Guardando…</> : <><CheckCircle2 className="h-4 w-4 mr-1.5" />Registrar paro</>}
          </Button>
          {justSaved && <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium"><CheckCircle2 className="h-3.5 w-3.5" /> Registrado</span>}
        </div>

        {/* Pareto: qué etapa para más */}
        <div className="pt-2 border-t border-border/40 space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> ¿Qué etapa para más la línea? · este mes
            {pareto.totalN > 0 && <span className="text-muted-foreground/60">({pareto.totalN} paros · {fmtDur(pareto.totalMin)} total)</span>}
          </p>
          {loading ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…</p>
          ) : pareto.rows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">Sin paros registrados este mes. El primero aparecerá acá con su ranking.</p>
          ) : (
            <div className="space-y-1.5">
              {pareto.rows.map((r, i) => {
                const wpct = pareto.rows[0]!.min > 0 ? (r.min / pareto.rows[0]!.min) * 100 : 0
                return (
                  <div key={r.etapa} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={cn('font-medium', i === 0 ? 'text-cat-5-ink' : 'text-foreground')}>{i + 1}. {r.etapa}</span>
                      <span className="tabular-nums text-muted-foreground">{fmtDur(r.min)} · {r.n} paro{r.n !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full', i === 0 ? 'bg-rose-500' : 'bg-cat-5-tint/[0.15]')} style={{ width: `${wpct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Lista reciente */}
        {!loading && paros.length > 0 && (
          <ul className="space-y-1 max-h-48 overflow-y-auto pr-1 pt-1">
            {paros.slice(0, 15).map((p) => (
              <li key={p.id} className="flex items-start gap-2 text-[11px] rounded-ctl border border-border bg-background px-2 py-1.5">
                <span className="font-medium text-cat-5-ink shrink-0">{p.etapa}</span>
                <span className="text-muted-foreground tabular-nums shrink-0">{fmtDur(p.duracionMin)}</span>
                <span className="text-foreground/80 min-w-0 flex-1 break-words">{p.causa || '—'}</span>
                <span className="text-muted-foreground/60 shrink-0 hidden sm:inline">{fmtFecha(p.fecha)}</span>
                {isAdmin && (
                  <button type="button" onClick={() => handleDelete(p.id)} title="Eliminar" className="shrink-0 text-muted-foreground/60 hover:text-red-400">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
