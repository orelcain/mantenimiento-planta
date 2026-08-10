/**
 * ShiftQuotaCard — barra de progreso del turno actual hacia su cuota objetivo.
 *
 * Fuente única de verdad: el Grader (Marelec) — pesa físicamente cada pieza.
 * Shoplogix se usa SOLO como proxy live cuando aún no hay Excel del Grader
 * cargado (summary vacío), con etiqueta "estimado".
 *
 * Cuando hay datos en ambas fuentes y discrepan más del umbral, se muestra
 * un badge de alerta: las piezas que Shoplogix dice que entraron al Grader
 * pero el Grader no reportó son piezas no contabilizadas (pérdida potencial).
 *
 * - Cuota editable inline desde la propia card (admin/supervisor).
 * - La card se ve SIEMPRE, con o sin cuota y con o sin permiso: si se oculta,
 *   la función entera parece no existir. Sin permiso muestra el estado y quién
 *   puede definirla, pero no el botón.
 * - Color barra: rojo <50%, ámbar 50-89%, verde ≥90%, esmeralda ≥100%.
 */
import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, Input } from '@/components/ui'
import { Target, TrendingUp, CheckCircle2, Pencil, X, Loader2, AlertTriangle, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GraderDailySummary, ShiftQuota } from '@/services/grader/types'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'

/** Umbral de discrepancia Shoplogix vs Grader antes de levantar bandera. */
const DISCREPANCY_PCT_THRESHOLD = 5

interface ShiftQuotaCardProps {
  quota?: ShiftQuota
  summary: GraderDailySummary
  shiftWindow: ShiftTimeWindow
  /** Suma de ciclos Baader (Σmachines.totalCycles) si hay snapshot Shoplogix. */
  shoplogixCycles?: number | null
  /** Si true, muestra botón editar + CTA cuando no hay cuota. */
  allowEdit?: boolean
  /** Persiste la cuota (o la borra si null). Retorna promesa para mostrar spinner. */
  onSave?: (next: ShiftQuota | null) => Promise<void>
}

function fmt(value: number, unit: 'kg' | 'pieces'): string {
  const rounded = Math.round(value)
  const text = rounded.toLocaleString('es-CL')
  return unit === 'kg' ? `${text} kg` : `${text} pz`
}

export function ShiftQuotaCard({
  quota,
  summary,
  shiftWindow,
  shoplogixCycles,
  allowEdit = false,
  onSave,
}: ShiftQuotaCardProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draftValue, setDraftValue] = useState<string>('')
  const [draftUnit, setDraftUnit] = useState<'kg' | 'pieces'>('pieces')

  useEffect(() => {
    if (editing) {
      setDraftValue(quota?.value ? String(quota.value) : '')
      setDraftUnit(quota?.unit ?? 'pieces')
    }
  }, [editing, quota])

  const view = useMemo(() => {
    if (!quota || !quota.value || quota.value <= 0) return null

    // ¿Grader tiene datos para esta unidad?
    const graderValue = quota.unit === 'kg'
      ? (summary.totalWeightKg ?? 0)
      : summary.totalPieces
    const graderHasData = graderValue > 0

    // Fuente actual: Grader si tiene datos, si no Shoplogix (solo para pieces).
    let current: number
    let usingFallback = false
    if (graderHasData) {
      current = graderValue
    } else if (quota.unit === 'pieces' && shoplogixCycles != null && shoplogixCycles > 0) {
      current = shoplogixCycles
      usingFallback = true
    } else {
      current = 0
    }

    const target = quota.value
    const progressPct = target > 0 ? Math.min(999, (current / target) * 100) : 0
    const remaining = Math.max(0, target - current)

    // Proyección lineal (solo si live + datos suficientes)
    let projected: number | null = null
    let projectedPct: number | null = null
    let willHit: boolean | null = null

    if (shiftWindow.status === 'live' && shiftWindow.remainingMin != null && shiftWindow.elapsedMin > 0) {
      const remainingH = shiftWindow.remainingMin / 60
      const elapsedH = shiftWindow.elapsedMin / 60
      if (usingFallback && shoplogixCycles != null && elapsedH > 0) {
        const cyclesPerHour = shoplogixCycles / elapsedH
        projected = current + cyclesPerHour * remainingH
      } else if (quota.unit === 'pieces' && summary.productionRatePerHour) {
        projected = current + summary.productionRatePerHour * remainingH
      } else if (quota.unit === 'kg' && summary.totalWeightKg != null && elapsedH > 0) {
        const kgPerHour = summary.totalWeightKg / elapsedH
        projected = current + kgPerHour * remainingH
      }
      if (projected != null && target > 0) {
        projectedPct = (projected / target) * 100
        willHit = projected >= target
      }
    }

    // Discrepancia: solo cuando ambas fuentes tienen datos y la unidad es pieces.
    // Si Shoplogix dice que pasaron N piezas y Grader reportó M < N, hay
    // (N − M) piezas no contabilizadas (potencial pérdida o Excel parcial).
    let discrepancy: { missing: number; pct: number; shopTotal: number } | null = null
    if (!usingFallback && quota.unit === 'pieces' && graderHasData && shoplogixCycles != null && shoplogixCycles > 0) {
      const missing = shoplogixCycles - graderValue
      const pct = (Math.abs(missing) / shoplogixCycles) * 100
      if (pct > DISCREPANCY_PCT_THRESHOLD) {
        discrepancy = { missing, pct, shopTotal: shoplogixCycles }
      }
    }

    return { current, target, progressPct, remaining, projected, projectedPct, willHit, usingFallback, discrepancy }
  }, [quota, summary, shiftWindow, shoplogixCycles])

  const handleSave = async () => {
    if (!onSave) return
    const num = Number(draftValue)
    if (!Number.isFinite(num) || num <= 0) return
    setSaving(true)
    try {
      await onSave({ value: Math.round(num), unit: draftUnit })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave(null)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  // Sin cuota — la card SIEMPRE se muestra (pedido de Orel 2026-08-03: "que la
  // card de cuota se vea siempre"). Antes se ocultaba cuando el usuario no
  // podía editar, y el resultado era que la función parecía haber desaparecido
  // de la app: nadie sabía que existía una cuota por turno.
  //
  // Sin permiso NO se ofrece el botón —sería un callejón sin salida— pero sí se
  // dice qué falta y quién puede hacerlo.
  if (!view) {
    if (!allowEdit) {
      return (
        <Card className="border border-dashed border-border">
          <CardContent className="p-3 flex items-center gap-2 flex-wrap">
            <Target className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">
              Sin cuota definida para este turno.
            </span>
            <span className="ml-auto text-caption text-muted-foreground">
              La define un supervisor
            </span>
          </CardContent>
        </Card>
      )
    }
    if (!editing) {
      return (
        <Card className="border border-dashed border-border">
          <CardContent className="p-3 flex items-center gap-2 flex-wrap">
            <Target className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">Sin cuota definida para este turno.</span>
            <button
              onClick={() => setEditing(true)}
              className="ml-auto text-caption px-2 py-0.5 rounded-ctl border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
            >
              Definir cuota
            </button>
          </CardContent>
        </Card>
      )
    }
    return (
      <Card className="border-2 border-primary/40">
        <CardContent className="p-4">
          <QuotaEditor
            draftValue={draftValue}
            draftUnit={draftUnit}
            saving={saving}
            onChangeValue={setDraftValue}
            onChangeUnit={setDraftUnit}
            onCancel={() => setEditing(false)}
            onSave={handleSave}
            canClear={false}
            onClear={handleClear}
          />
        </CardContent>
      </Card>
    )
  }

  const { current, target, progressPct, remaining, projected, projectedPct, willHit, usingFallback, discrepancy } = view

  const barClass =
    progressPct >= 100 ? 'bg-emerald-500'
    : progressPct >= 90 ? 'bg-emerald-400'
    : progressPct >= 50 ? 'bg-amber-400'
    : 'bg-red-400'

  const verdictTextClass =
    progressPct >= 100 ? 'text-emerald-400'
    : progressPct >= 90 ? 'text-ink-ok'
    : progressPct >= 50 ? 'text-ink-warn'
    : 'text-ink-crit'

  const isClosed = shiftWindow.status === 'closed'
  const cumplio = isClosed && progressPct >= 100

  return (
    <Card className="border-2 border-border">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Target className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-medium">Cuota del turno</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            Meta {fmt(target, quota!.unit)}
          </span>
          {usingFallback && (
            <span
              className="flex items-center gap-1 text-caption px-1.5 py-0.5 rounded-ctl bg-emerald-500/[0.15] text-ink-ok border border-emerald-500/[0.25] cursor-help"
              title="No hay Excel del Grader cargado aún. Se muestra avance estimado desde ciclos Baader (Shoplogix), que será reemplazado por la cifra real cuando se cargue el Excel."
            >
              <Radio className="w-2.5 h-2.5 animate-pulse" />
              Estimado · sin Excel
            </span>
          )}
          {cumplio && (
            <span className="flex items-center gap-1 text-caption px-1.5 py-0.5 rounded-ctl bg-emerald-500/[0.15] text-ink-ok border border-emerald-500/[0.25]">
              <CheckCircle2 className="w-2.5 h-2.5" />
              Cumplido
            </span>
          )}
          {allowEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="ml-auto text-muted-foreground/50 hover:text-foreground transition-colors"
              title="Editar cuota"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>

        {editing ? (
          <QuotaEditor
            draftValue={draftValue}
            draftUnit={draftUnit}
            saving={saving}
            onChangeValue={setDraftValue}
            onChangeUnit={setDraftUnit}
            onCancel={() => setEditing(false)}
            onSave={handleSave}
            canClear
            onClear={handleClear}
          />
        ) : (
          <>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={cn('text-3xl font-bold tabular-nums leading-none', verdictTextClass)}>
                {progressPct.toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {fmt(current, quota!.unit)} de {fmt(target, quota!.unit)}
              </span>
            </div>

            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', barClass)}
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>

            <div className="flex items-center gap-3 flex-wrap text-caption">
              {remaining > 0 ? (
                <span className="text-muted-foreground tabular-nums">
                  Faltan <span className="text-foreground font-medium">{fmt(remaining, quota!.unit)}</span>
                </span>
              ) : (
                <span className="text-emerald-400 font-medium">Meta alcanzada</span>
              )}

              {projected != null && projectedPct != null && shiftWindow.status === 'live' && (
                <span
                  className={cn(
                    'flex items-center gap-1 ml-auto cursor-help',
                    willHit ? 'text-emerald-400' : 'text-amber-400',
                  )}
                  title="Proyección al final del turno asumiendo el ritmo actual."
                >
                  <TrendingUp className="w-3 h-3" />
                  <span className="text-muted-foreground">Proyectado:</span>
                  <span className="tabular-nums font-semibold">{fmt(projected, quota!.unit)}</span>
                  <span className="text-muted-foreground tabular-nums">({projectedPct.toFixed(0)}%)</span>
                </span>
              )}
            </div>

            {/* Bandera de discrepancia — SOLO cuando faltan piezas.
                Antes también saltaba al revés (Grader > Baader) y marcaba en
                ámbar "774 piezas extra vs Shoplogix · 102,0% delta", con un
                tooltip que describía el caso contrario. Esa diferencia es la
                línea manual: ni anomalía ni sorpresa, y ya se explica en la
                producción del turno. Repetirla acá como alarma hacía dudar de
                un dato que está bien. */}
            {discrepancy && discrepancy.missing > 0 && (
              <div
                className="flex items-start gap-2 rounded-ctl bg-amber-500/[0.15] border border-amber-500/[0.25] px-2.5 py-1.5"
                title="Shoplogix reporta más ciclos en las Baader que piezas pesadas en el Grader. Como todas las piezas deberían pasar por el Grader, la diferencia puede ser: Excel parcial, fallas de registro del Marelec, o pérdidas físicas."
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-px" />
                <div className="text-caption text-ink-warn leading-tight">
                  <span className="font-semibold tabular-nums">
                    {Math.round(discrepancy.missing).toLocaleString('es-CL')} piezas sin confirmar
                  </span>
                  <span className="text-amber-400/70"> · </span>
                  <span className="tabular-nums">{discrepancy.pct.toFixed(1)}% delta</span>
                  <span className="block text-amber-400/70 mt-0.5">
                    Shoplogix: {discrepancy.shopTotal.toLocaleString('es-CL')} ciclos · Grader: {Math.round(current).toLocaleString('es-CL')} pz
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

interface QuotaEditorProps {
  draftValue: string
  draftUnit: 'kg' | 'pieces'
  saving: boolean
  onChangeValue: (v: string) => void
  onChangeUnit: (v: 'kg' | 'pieces') => void
  onCancel: () => void
  onSave: () => void | Promise<void>
  canClear: boolean
  onClear: () => void | Promise<void>
}

function QuotaEditor({
  draftValue, draftUnit, saving,
  onChangeValue, onChangeUnit,
  onCancel, onSave, canClear, onClear,
}: QuotaEditorProps) {
  const numValid = Number.isFinite(Number(draftValue)) && Number(draftValue) > 0

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          type="number"
          min={0}
          step={draftUnit === 'kg' ? 100 : 50}
          placeholder="Meta del turno"
          value={draftValue}
          onChange={(e) => onChangeValue(e.target.value)}
          className="h-8 w-36 text-sm tabular-nums"
          autoFocus
          disabled={saving}
        />
        <select
          value={draftUnit}
          onChange={(e) => onChangeUnit(e.target.value === 'kg' ? 'kg' : 'pieces')}
          disabled={saving}
          className="h-8 px-2 text-sm rounded-ctl border border-input bg-background"
          aria-label="Unidad"
        >
          <option value="pieces">piezas</option>
          <option value="kg">kg</option>
        </select>
        <span className="text-caption text-muted-foreground">contra Grader (Marelec)</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => void onSave()}
          disabled={saving || !numValid}
          className="flex items-center gap-1 text-xs px-3 py-1 rounded-ctl border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          Guardar
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-ctl border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
        >
          <X className="w-3 h-3" />
          Cancelar
        </button>
        {canClear && (
          <button
            onClick={() => void onClear()}
            disabled={saving}
            className="ml-auto text-caption text-muted-foreground/60 hover:text-destructive transition-colors disabled:opacity-40"
            title="Quitar cuota del turno"
          >
            Quitar cuota
          </button>
        )}
      </div>
    </div>
  )
}
