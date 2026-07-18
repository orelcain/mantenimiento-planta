import type { Dispatch, SetStateAction } from 'react'
import { Badge, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import { InfoTooltip } from '@/components/ui'
import { cn } from '@/lib/utils'
import { getGradingBelt, GRADING_BELT_DEFAULT_MPS } from '@/services/grader/graderBeltHelpers'
import { GAP_THRESHOLDS } from '@/services/grader/graderThresholds'
import type { GraderPhysicalConfig } from '@/services/grader/types'
import { labelForField, type ConfigChangeEntry } from '@/services/grader/graderConfigChangeLog.service'
import { SuggestionsPanel } from '@/components/grader/SuggestionsPanel'
import type { PointZeroSuggestion } from '@/services/grader/suggestions/types'
import { SPECIES_ALLOMETRY, BeltVisualizer, AutoField, BatchStatsCard, type BatchStats } from './GatesConfigShared'

interface ProductoTabProps {
  physicalConfig: GraderPhysicalConfig
  setPhysicalConfig: Dispatch<SetStateAction<GraderPhysicalConfig>>
  batchStats: BatchStats | null
  historicalMedianG: {
    value: number
    dateKey: string
    shiftId: string
    fromCalendar: boolean
    totalPieces: number
    durationMinutes?: number
    productionRatePerHour?: number
  } | null
  medianWeightG: number | null
  manualMedianG: number | undefined
  setManualMedianG: (v: number | undefined) => void
  medianSource: 'excel' | 'manual' | 'historical' | null
  suggestedDimensions: { lengthCm: number; widthCm: number; medianWeightG: number } | null
  suggestions: PointZeroSuggestion[]
  changeLog: ConfigChangeEntry[]
  changeLogLoading: boolean
  productoSubTab: 'resumen' | 'flipper' | 'analisis' | 'sugerencias' | 'historial'
  onOpenZ2Capture?: () => void
}

export function ProductoTab({
  physicalConfig,
  setPhysicalConfig,
  batchStats,
  historicalMedianG,
  medianWeightG,
  manualMedianG,
  setManualMedianG,
  medianSource,
  suggestedDimensions,
  suggestions,
  changeLog,
  changeLogLoading,
  productoSubTab,
  onOpenZ2Capture,
}: ProductoTabProps) {
  // Cálculos compartidos entre Hero, Equipo y Diagnóstico
  const mainBelt = getGradingBelt(physicalConfig)
  const speedMps = mainBelt?.speedMps ?? GRADING_BELT_DEFAULT_MPS
  const salmonLengthM = physicalConfig.avgSalmonLengthCm / 100
  const cadenceFromHistorical = historicalMedianG?.productionRatePerHour
    ? historicalMedianG.productionRatePerHour / 60
    : historicalMedianG?.durationMinutes && historicalMedianG.durationMinutes > 0
      ? historicalMedianG.totalPieces / historicalMedianG.durationMinutes
      : null
  const cadenceObserved = batchStats?.throughputPzPerMin ?? cadenceFromHistorical
  const pocketCycleSec = 3.0
  const cadenceTheoretical = (physicalConfig.pocketCount * 60) / pocketCycleSec
  const cadencePiecesPerMin = cadenceObserved ?? cadenceTheoretical
  const cadenceSource: 'excel' | 'historical' | 'theoretical' =
    batchStats?.throughputPzPerMin ? 'excel'
    : cadenceFromHistorical ? 'historical'
    : 'theoretical'
  const spacingM = speedMps * (60 / cadencePiecesPerMin)
  const gapM = Math.max(0, spacingM - salmonLengthM)
  const lengthToSpacingRatio = salmonLengthM / spacingM
  const overlapping = lengthToSpacingRatio >= GAP_THRESHOLDS.ratioCritical
  const pocketCountAlt = physicalConfig.pocketCount === 4 ? 3 : 4
  const cadenceAlt = cadencePiecesPerMin * (pocketCountAlt / physicalConfig.pocketCount)
  const spacingAlt = speedMps * (60 / cadenceAlt)
  const minOpenTimeSec = physicalConfig.flipperPaddleLengthMm
    ? (physicalConfig.flipperPaddleLengthMm / 1000) / speedMps
    : null
  const salmonPassTimeSec = salmonLengthM / speedMps
  const verdictColor = overlapping
    ? 'bg-red-500/20 text-red-400 border-red-500/40'
    : lengthToSpacingRatio > GAP_THRESHOLDS.ratioWarn
      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
  const verdictEmoji = overlapping ? '🔴' : lengthToSpacingRatio > GAP_THRESHOLDS.ratioWarn ? '🟡' : '🟢'
  const verdictText = overlapping
    ? 'Solapamiento — peces se pisan'
    : lengthToSpacingRatio > GAP_THRESHOLDS.ratioWarn
      ? `Gap estrecho (${(gapM * 100).toFixed(0)} cm)`
      : `OK · gap libre ${(gapM * 100).toFixed(0)} cm`

  return (
    <>
      {/* ── SUB-TAB RESUMEN ── */}
      {productoSubTab === 'resumen' && (
      <div className="space-y-4">
      {/* ══ HERO ════════════════════════════════════════════ */}
      <div className="space-y-3">
        {/* Fila 1: Especie + Peso mediano */}
        <div className="flex items-center gap-3 flex-wrap">
          <Label className="text-xs whitespace-nowrap">Especie</Label>
          <Select
            value={physicalConfig.species ?? ''}
            onValueChange={(v) => setPhysicalConfig((p) => ({ ...p, species: v as 'salar' | 'coho' }))}
          >
            <SelectTrigger className="h-8 text-xs w-48">
              <SelectValue placeholder="Seleccionar especie…" />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(SPECIES_ALLOMETRY) as [keyof typeof SPECIES_ALLOMETRY, typeof SPECIES_ALLOMETRY[keyof typeof SPECIES_ALLOMETRY]][]).map(([key, s]) => (
                <SelectItem key={key} value={key} className="text-xs">{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {physicalConfig.species && (
            <>
              <Label className="text-xs whitespace-nowrap">Peso mediano (g)</Label>
              <Input
                type="number"
                step="50"
                min="100"
                max="15000"
                value={medianWeightG ?? manualMedianG ?? (historicalMedianG?.value ?? '')}
                onChange={(e) => setManualMedianG(e.target.value ? Number(e.target.value) : undefined)}
                disabled={medianWeightG != null}
                placeholder="ej: 3500"
                className={cn('h-8 text-xs w-28 font-mono', medianWeightG != null && 'opacity-70')}
              />
              {medianSource === 'excel' && (
                <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-1.5 py-0">
                  Excel · {(medianWeightG! / 1000).toFixed(2)} kg
                </Badge>
              )}
              {medianSource === 'manual' && (
                <Badge className="text-[10px] bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 px-1.5 py-0">
                  Manual
                </Badge>
              )}
              {medianSource === 'historical' && historicalMedianG && (
                <Badge className={cn(
                  'text-[10px] px-1.5 py-0',
                  historicalMedianG.fromCalendar
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                )}>
                  {historicalMedianG.fromCalendar ? '📅 ' : ''}{historicalMedianG.dateKey} {historicalMedianG.shiftId}
                </Badge>
              )}
              {medianSource === null && (
                <span className="text-[10px] text-muted-foreground">Ingresa peso o carga Excel</span>
              )}
            </>
          )}
        </div>

        {physicalConfig.species && !medianWeightG && historicalMedianG && !historicalMedianG.fromCalendar && (
          <p className="text-[10px] text-muted-foreground">
            💡 Haz click en una tarjeta de turno del calendario para usar datos específicos.
          </p>
        )}

        {/* Fila 2: Largo / Ancho / Pockets (compactos) */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          <AutoField
            label="Largo prom. (cm)"
            value={physicalConfig.avgSalmonLengthCm}
            onChange={(v) => setPhysicalConfig((p) => ({ ...p, avgSalmonLengthCm: v }))}
            auto={physicalConfig.autoSuggestions?.avgSalmonLengthCm ?? false}
            onAutoChange={(v) => setPhysicalConfig((p) => ({ ...p, autoSuggestions: { ...p.autoSuggestions, avgSalmonLengthCm: v } }))}
            suggested={suggestedDimensions?.lengthCm ?? null}
            hint="Máx. 110 cm"
            step={1}
            min={20}
            max={120}
            unit="cm"
          />
          <AutoField
            label="Ancho prom. (cm)"
            value={physicalConfig.avgSalmonWidthCm ?? ''}
            onChange={(v) => setPhysicalConfig((p) => ({ ...p, avgSalmonWidthCm: v || undefined }))}
            auto={physicalConfig.autoSuggestions?.avgSalmonWidthCm ?? false}
            onAutoChange={(v) => setPhysicalConfig((p) => ({ ...p, autoSuggestions: { ...p.autoSuggestions, avgSalmonWidthCm: v } }))}
            suggested={suggestedDimensions?.widthCm ?? null}
            hint="Máx. 29 cm"
            step={0.5}
            min={5}
            max={40}
            placeholder="—"
            unit="cm"
          />
          <div>
            <Label className="text-xs">Pockets activos</Label>
            <Input
              type="number"
              step="1"
              min="1"
              max="8"
              value={physicalConfig.pocketCount}
              onChange={(e) => setPhysicalConfig((p) => ({ ...p, pocketCount: Number(e.target.value) }))}
              className="mt-1 font-mono"
            />
          </div>
        </div>

        {/* BeltVisualizer arriba */}
        <BeltVisualizer
          speedMps={speedMps}
          salmonLengthM={salmonLengthM}
          spacingM={spacingM}
          cadencePiecesPerMin={cadencePiecesPerMin}
          overlapping={overlapping}
        />

        {/* Pill verdict */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border',
            verdictColor,
          )}>
            {verdictEmoji} {verdictText}
          </span>
          <span className="text-[10px] text-muted-foreground">
            ratio pez/paso: <span className="font-mono">{lengthToSpacingRatio.toFixed(2)}</span>
            {cadenceSource === 'excel' && <span className="text-emerald-500 ml-1">· cadencia Excel</span>}
            {cadenceSource === 'historical' && <span className="text-amber-500 ml-1">· cadencia histórica</span>}
            {cadenceSource === 'theoretical' && <span className="ml-1">· cadencia teórica</span>}
          </span>
        </div>
      </div>

      </div>
      )}

      {/* ── SUB-TAB FLIPPER ── */}
      {productoSubTab === 'flipper' && (
      <div>
        <p className="text-xs text-muted-foreground mb-3">
          Tiempos de ciclo software (Z2), reset mecánico del cilindro y dimensiones de la paleta.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Sub-card A: Ciclo software Z2 */}
          {(() => {
            const delayOpen  = physicalConfig.flipperDelayOpenMs    ?? 150
            const minOpen    = physicalConfig.flipperMinOpenTimeMs   ?? 350
            const delayClose = physicalConfig.flipperDelayCloseMs    ?? 150
            const cycleTotal = delayOpen + minOpen + delayClose
            return (
              <div className="rounded-lg border border-border bg-muted dark:border-slate-700/50 dark:bg-slate-950/60 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-sky-400">Ciclo flipper software Z2</p>
                  {onOpenZ2Capture && (
                    <button
                      type="button"
                      onClick={onOpenZ2Capture}
                      className="inline-flex items-center gap-1 text-[10px] border border-sky-500/30 text-sky-700 dark:text-sky-400 rounded px-1.5 py-0.5 hover:bg-sky-500/10 transition-colors"
                    >
                      📟 Leer Z2
                    </button>
                  )}
                </div>
                <div className="space-y-1.5 text-xs">
                  {([
                    { label: 'Delay apertura',    field: 'flipperDelayOpenMs',   val: delayOpen,  z2: 'delayFlipperOpen' },
                    { label: 'Mín. tiempo abierto', field: 'flipperMinOpenTimeMs', val: minOpen,   z2: 'minFlipperOpenTime' },
                    { label: 'Delay cierre',      field: 'flipperDelayCloseMs',  val: delayClose, z2: 'delayFlipperClose' },
                  ] as const).map(({ label, field, val }) => (
                    <div key={field} className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground whitespace-nowrap">{label}</span>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          step="10"
                          min="0"
                          max="2000"
                          value={val}
                          onChange={(e) => setPhysicalConfig((p) => ({ ...p, [field]: Number(e.target.value) }))}
                          className="h-6 w-16 text-xs font-mono px-1.5 py-0"
                        />
                        <span className="text-muted-foreground text-[10px]">ms</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-slate-700/50 pt-1.5 mt-1">
                    <span className="font-semibold text-foreground text-xs">Ciclo total</span>
                    <span className="font-mono font-bold text-sky-400 text-xs">{cycleTotal} ms</span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/60">
                  Z2: delayFlipperOpen / minFlipperOpenTime / delayFlipperClose
                </p>
              </div>
            )
          })()}

          {/* Sub-card B: Reset mecánico cilindro */}
          <div className="rounded-lg border border-border bg-muted dark:border-slate-700/50 dark:bg-slate-950/60 p-3 space-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs font-semibold text-amber-400">Reset mecánico cilindro</p>
              <span className="inline-flex items-center rounded border px-1 py-0.5 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 whitespace-nowrap">⚠ Estimado</span>
            </div>
            <div>
              <Label className="text-xs">Tiempo reset (s)</Label>
              <Input
                type="number"
                step="0.05"
                min="0.1"
                max="2.0"
                value={physicalConfig.flipperResetTimeSec ?? 0.45}
                onChange={(e) => setPhysicalConfig((p) => ({ ...p, flipperResetTimeSec: Number(e.target.value) }))}
                className="mt-1 font-mono h-8"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Cronometrar con cámara slow-mo en{' '}
              <span className="font-mono text-foreground text-[10px]">Servicio → Probar salidas [8620]</span>
            </p>
          </div>

          {/* Sub-card C: Paleta flipper física */}
          <div className="rounded-lg border border-border bg-muted dark:border-slate-700/50 dark:bg-slate-950/60 p-3 space-y-2">
            <p className="text-xs font-semibold text-violet-400">Paleta flipper física</p>
            <div>
              <Label className="text-xs">Largo paleta (mm)</Label>
              <Input
                type="number"
                step="1"
                min="50"
                max="600"
                value={physicalConfig.flipperPaddleLengthMm ?? ''}
                onChange={(e) => setPhysicalConfig((p) => ({ ...p, flipperPaddleLengthMm: e.target.value ? Number(e.target.value) : undefined }))}
                placeholder="Medir en terreno"
                className="mt-1 font-mono h-8"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Medido: 475 mm. Desde eje hasta extremo.</p>
            </div>
            {minOpenTimeSec != null && (
              <div className="text-[10px] text-muted-foreground pt-1 border-t border-slate-700/50">
                Apertura mínima calculada:{' '}
                <span className="font-mono text-foreground">{minOpenTimeSec.toFixed(3)} s</span>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* ── SUB-TAB ANÁLISIS ── */}
      {productoSubTab === 'analisis' && (
      <div className="space-y-3 text-xs">
          <BatchStatsCard stats={batchStats} />

          {/* Timing flipper */}
          {minOpenTimeSec != null && (
            <div className="p-3 rounded-lg bg-sky-500/15 border border-sky-500/20 space-y-1">
              <p className="font-medium text-sky-700 dark:text-sky-300">Timing flipper calculado</p>
              <p className="text-muted-foreground">
                Apertura mínima (paleta pasa):{' '}
                <span className="font-mono font-medium text-foreground">{minOpenTimeSec.toFixed(3)} s</span>
              </p>
              <p className="text-muted-foreground">
                Tiempo pez {physicalConfig.avgSalmonLengthCm} cm en pasar:{' '}
                <span className="font-mono font-medium text-foreground">{salmonPassTimeSec.toFixed(3)} s</span>
              </p>
              <p className="text-muted-foreground">
                Ventana cierre mínima:{' '}
                <span className="font-mono font-medium text-foreground">
                  {Math.max(0, salmonPassTimeSec - minOpenTimeSec).toFixed(3)} s
                </span>
              </p>
            </div>
          )}

          {/* Análisis pockets */}
          <div className="p-3 rounded-lg bg-sky-500/15 border border-sky-500/20 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-medium text-sky-700 dark:text-sky-300">
                Análisis pockets ({physicalConfig.pocketCount} activos)
              </p>
              <InfoTooltip
                title="Flujo real del alimentado"
                text={`4 clasificadoras manuales operan los pockets: cada una toma una pieza, presiona el bot\u00f3n de calidad y deposita la pieza en su pocket. El Static Weighing pesa y descarga a la cinta Z.\n\nLa cadencia NO es te\u00f3rica sino limitada por la velocidad humana. T\u00edpico m\u00e1ximo observado: 66\u201370 pz/min en salida Z-belt.`}
                example="Turno saludable: 40–55 pz/min promedio · picos 65–70"
                position="top"
              />
              {cadenceSource === 'excel' && <span className="text-[10px] text-emerald-500">· cadencia real del Excel</span>}
              {cadenceSource === 'historical' && (
                <span className="text-[10px] text-amber-500">
                  · histórico {historicalMedianG?.dateKey} {historicalMedianG?.shiftId}
                </span>
              )}
              {cadenceSource === 'theoretical' && <span className="text-[10px] text-muted-foreground">· cadencia teórica</span>}
            </div>
            <p className="text-muted-foreground">
              Cadencia promedio:{' '}
              <span className="font-mono font-medium text-foreground">{cadencePiecesPerMin.toFixed(0)} pz/min</span>
              {batchStats?.peakPzPerMin != null && (
                <span className="text-[10px]">
                  {' '}· pico: <span className="font-mono font-medium text-foreground">{batchStats.peakPzPerMin} pz/min</span>
                </span>
              )}
            </p>
            <p className="text-muted-foreground">
              Gap libre entre peces:{' '}
              <span className={cn(
                'font-mono font-medium',
                overlapping ? 'text-red-500' : lengthToSpacingRatio > GAP_THRESHOLDS.ratioWarn ? 'text-amber-500' : 'text-emerald-500',
              )}>
                {(gapM * 100).toFixed(0)} cm
              </span>
              <span className="text-[10px] text-muted-foreground">
                {' '}· Pez {physicalConfig.avgSalmonLengthCm} cm + aire = paso {(spacingM * 100).toFixed(0)} cm
              </span>
              <InfoTooltip
                title="Cómo se calcula"
                text={`1) La cadencia dice cu\u00e1ntos peces pasan por minuto.\n2) Paso total = velocidad \u00d7 tiempo entre peces (centro a centro).\n3) Gap libre = paso total \u2212 largo del pez.\n\nSi el gap es \u2264 0, dos peces se solapan y la fotoc\u00e9lula los ve como uno solo \u2192 marca "fuera de l\u00edmites".`}
                formula={`tiempo entre peces = 60 / ${cadencePiecesPerMin.toFixed(0)} = ${(60 / cadencePiecesPerMin).toFixed(2)} s\npaso total = ${speedMps.toFixed(2)} m/s \u00d7 ${(60 / cadencePiecesPerMin).toFixed(2)} s = ${spacingM.toFixed(2)} m\ngap libre = ${spacingM.toFixed(2)} \u2212 ${salmonLengthM.toFixed(2)} = ${gapM.toFixed(2)} m\nratio pez/paso = ${salmonLengthM.toFixed(2)} / ${spacingM.toFixed(2)} = ${lengthToSpacingRatio.toFixed(2)}`}
                position="top"
              />
            </p>
            {overlapping && (
              <p className="text-[10px] text-red-500">
                ⚠ El pez ({physicalConfig.avgSalmonLengthCm} cm) es más largo que el paso ({(spacingM * 100).toFixed(0)} cm) → peces se solapan.
                Con {pocketCountAlt} pockets el gap sube a {Math.max(0, spacingAlt - salmonLengthM).toFixed(2)} m.
              </p>
            )}
            {!overlapping && lengthToSpacingRatio > GAP_THRESHOLDS.ratioWarn && (
              <p className="text-[10px] text-amber-500">
                ⚠ Gap libre estrecho. Con {pocketCountAlt} pockets sube a {Math.max(0, spacingAlt - salmonLengthM).toFixed(2)} m.
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Alternativa {pocketCountAlt} pockets: {cadenceAlt.toFixed(0)} pz/min · gap {Math.max(0, spacingAlt - salmonLengthM).toFixed(2)} m · ratio {(salmonLengthM / spacingAlt).toFixed(2)}
            </p>
          </div>

          {/* Fórmula FishBase */}
          {physicalConfig.species && (() => {
            const s = SPECIES_ALLOMETRY[physicalConfig.species]
            const fishBaseId = physicalConfig.species === 'salar' ? 236 : 245
            const scientific = physicalConfig.species === 'salar' ? 'Salmo salar' : 'Oncorhynchus kisutch'
            return (
              <div className="p-2 rounded bg-muted border border-border dark:bg-slate-800/60 dark:border-slate-700/40 text-[10px] space-y-1">
                <p className="font-medium text-muted-foreground">
                  {s.label} · {scientific} · FishBase ID {fishBaseId}
                </p>
                <p className="font-mono text-foreground">W(g) = {s.a} × L(cm)^{s.b}</p>
                <p className="text-muted-foreground">
                  Ancho ≈ {(s.widthRatio * 100).toFixed(0)}% × largo (empírico — validar en planta)
                </p>
                {suggestedDimensions && (
                  <p className="text-muted-foreground font-mono">
                    L = ({suggestedDimensions.medianWeightG}/{s.a})^(1/{s.b}) = {suggestedDimensions.lengthCm} cm
                  </p>
                )}
                <p className="text-muted-foreground/60">
                  Froese, Thorson & Reyes 2014 · J. Applied Ichthyology 30(1):78-85
                </p>
              </div>
            )
          })()}
      </div>
      )}

      {/* ── SUB-TAB SUGERENCIAS ── */}
      {productoSubTab === 'sugerencias' && (
      <SuggestionsPanel suggestions={suggestions} />
      )}

      {/* ── SUB-TAB HISTORIAL ── */}
      {productoSubTab === 'historial' && (
      <div className="space-y-1">
        {changeLogLoading && (
          <p className="text-xs text-muted-foreground">Cargando historial…</p>
        )}
        {changeLog.length === 0 && !changeLogLoading && (
          <p className="text-xs text-muted-foreground italic">Sin cambios registrados aún.</p>
        )}
        {changeLog.map((entry) => {
          const when = new Date(entry.changedAt)
          const timeStr = when.toLocaleString('es-CL', {
            day: '2-digit', month: '2-digit',
            hour: '2-digit', minute: '2-digit',
          })
          const pv = entry.prevValue
          const nv = entry.nextValue
          const fmt = (v: unknown): string => {
            if (v === undefined || v === null) return '—'
            if (typeof v === 'number') return String(Math.round(v * 1000) / 1000)
            if (typeof v === 'boolean') return v ? 'sí' : 'no'
            if (typeof v === 'string') return v
            return JSON.stringify(v).slice(0, 40)
          }
          return (
            <div key={entry.id} className="flex items-center gap-2 text-[11px] py-1 border-b border-muted/50 last:border-0">
              <span className="text-[10px] text-muted-foreground font-mono tabular-nums min-w-[80px]">
                {timeStr}
              </span>
              <span className="font-medium text-xs flex-1 truncate" title={entry.field}>
                {labelForField(entry.field)}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {fmt(pv)} → <span className="text-foreground">{fmt(nv)}</span>
              </span>
              {entry.reason && (
                <Badge variant="outline" className="text-[9px]">{entry.reason}</Badge>
              )}
            </div>
          )
        })}
      </div>
      )}
    </>
  )
}

