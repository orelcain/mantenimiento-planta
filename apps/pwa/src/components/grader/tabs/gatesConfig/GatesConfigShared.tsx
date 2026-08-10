import { AlertTriangle, Check, HelpCircle } from 'lucide-react'
import { Badge, Input, Label, Switch } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { CalibrationStatus } from '@/services/grader/types'

/**
 * Coeficientes alométricos Length-Weight Relationship (LWR): W(g) = a × L(cm)^b
 *
 * Fuente oficial: FishBase — Bayesian LWR de Froese, Thorson & Reyes (2014)
 *   "A Bayesian approach for estimating length-weight relationships in fishes"
 *   Journal of Applied Ichthyology, 30(1): 78-85.
 *
 * Valores para LONGITUD TOTAL (TL, en cm) y peso en gramos:
 *   - Salmo salar (Atlántico): a=0.00977, b=3.05  [FishBase ID 236, n=17 studies]
 *     https://www.fishbase.se/popdyn/LWRelationshipList.php?ID=236
 *   - Oncorhynchus kisutch (Coho): a=0.00933, b=3.04  [FishBase ID 245, n=12 studies]
 *     https://www.fishbase.se/popdyn/LWRelationshipList.php?ID=245
 *
 * widthRatio = ancho máximo (espesor lateral) / longitud total.
 * Rango típico en salmónidos: 0.15-0.22. Valor empírico — confirmar con medición en planta.
 *   - Salar adultos: ~0.20 (cuerpos más cilíndricos)
 *   - Coho adultos: ~0.18 (cuerpos más esbeltos)
 */
export const SPECIES_ALLOMETRY = {
  salar: { label: 'Salmón Atlántico (Salar)', a: 0.00977, b: 3.05, widthRatio: 0.20 },
  coho:  { label: 'Salmón Coho',              a: 0.00933, b: 3.04, widthRatio: 0.18 },
} as const

/** Badge de estado de calibración para parámetros físicos */
export function CalibBadge({ status }: { status: CalibrationStatus | undefined }) {
  if (status === 'verified')
    return <Badge className="text-caption bg-green-500/[0.15] text-ink-ok whitespace-nowrap gap-1"><Check className="h-3 w-3" />Verificado</Badge>
  if (status === 'estimated')
    return <Badge className="text-caption bg-amber-500/[0.15] text-ink-warn whitespace-nowrap gap-1"><AlertTriangle className="h-3 w-3" />Estimado</Badge>
  return <Badge className="text-caption bg-muted-foreground/[0.10] text-muted-foreground whitespace-nowrap gap-1"><HelpCircle className="h-3 w-3" />Falta</Badge>
}

/**
 * Diagrama técnico estático de la cinta: 2 peces con cotas acotadas
 * al estilo plano de ingeniería. Las proporciones se ajustan en tiempo
 * real cuando cambian los parámetros (largo pez, cadencia, velocidad).
 */
export function BeltVisualizer({
  speedMps,
  salmonLengthM,
  spacingM,
  cadencePiecesPerMin,
  overlapping,
}: {
  speedMps: number
  salmonLengthM: number
  spacingM: number
  cadencePiecesPerMin: number
  overlapping: boolean
}) {
  if (spacingM <= 0 || salmonLengthM <= 0) return null
  const gapM = Math.max(0, spacingM - salmonLengthM)
  const secondsBetweenFish = 60 / Math.max(cadencePiecesPerMin, 0.01)

  // Layout: el SVG representa exactamente "paso + 1 pez" para encajar 2 peces en el viewbox.
  // Así, el pez #1 arranca al inicio y el pez #2 arranca en posición `spacingM`.
  // El ancho total visualmente ocupado es spacingM + salmonLengthM (paso + largo pez final).
  const svgW = 640
  const marginX = 40
  const totalMeters = spacingM + salmonLengthM
  const scale = (svgW - marginX * 2) / totalMeters
  const fishLenPx = salmonLengthM * scale
  const spacingPx = spacingM * scale
  const gapPx = Math.max(0, spacingPx - fishLenPx)

  const svgH = 180
  const beltY = 72
  const beltH = 26
  const fishCY = beltY + beltH / 2
  const fishRy = beltH / 2 - 2

  const fish1X = marginX
  const fish2X = marginX + spacingPx

  // Colores de estado
  const gapColor = overlapping ? '#ef4444' : gapM < salmonLengthM * 0.5 ? '#f59e0b' : '#10b981'
  const gapBg = overlapping ? 'rgba(239,68,68,0.15)' : gapM < salmonLengthM * 0.5 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.12)'

  // Escala métrica: ticks cada 50 cm
  const maxCm = Math.ceil(totalMeters * 100 / 50) * 50
  const ticks = Array.from({ length: Math.floor(maxCm / 50) + 1 }, (_, i) => i * 50)

  return (
    <div className="mt-3 p-3 rounded-card bg-muted-foreground/[0.10] border border-muted-foreground/[0.10]">
      <div className="flex items-center justify-between mb-2 text-caption text-muted-foreground">
        <span className="font-medium text-ink-info">Diagrama de distancias (escala real)</span>
        <span>cinta <span className="font-mono text-foreground">{speedMps.toFixed(2)} m/s</span> · tiempo entre peces <span className="font-mono text-foreground">{secondsBetweenFish.toFixed(2)} s</span></span>
      </div>
      <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="bv-belt" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="50%" stopColor="#334155" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="bv-fish" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#c2410c" />
          </linearGradient>
          <linearGradient id="bv-fish-warn" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#991b1b" />
          </linearGradient>
          <marker id="bv-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
          <marker id="bv-arrow-orange" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#fb923c" />
          </marker>
          <marker id="bv-arrow-gap" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={gapColor} />
          </marker>
        </defs>

        {/* Fondo resaltando el gap */}
        {gapPx > 0 && (
          <rect
            x={fish1X + fishLenPx}
            y={beltY - 3}
            width={gapPx}
            height={beltH + 6}
            fill={gapBg}
            rx="2"
          />
        )}

        {/* ═══ Cota superior: paso completo (centro-a-centro) ═══ */}
        <g>
          {/* línea guía desde cada pez hacia la cota */}
          <line x1={fish1X + fishLenPx / 2} y1={fishCY - fishRy - 2} x2={fish1X + fishLenPx / 2} y2={36} stroke="#64748b" strokeWidth="0.5" strokeDasharray="2 2" />
          <line x1={fish2X + fishLenPx / 2} y1={fishCY - fishRy - 2} x2={fish2X + fishLenPx / 2} y2={36} stroke="#64748b" strokeWidth="0.5" strokeDasharray="2 2" />
          {/* línea de cota con flechas */}
          <line x1={fish1X + fishLenPx / 2} y1={36} x2={fish2X + fishLenPx / 2} y2={36} stroke="#94a3b8" strokeWidth="1" markerStart="url(#bv-arrow)" markerEnd="url(#bv-arrow)" />
          <rect x={fish1X + fishLenPx / 2 + spacingPx / 2 - 52} y={22} width="104" height="14" fill="#0f172a" rx="2" />
          <text x={fish1X + fishLenPx / 2 + spacingPx / 2} y={32} textAnchor="middle" fontSize="10" fill="#cbd5e1" fontWeight="600">
            paso {(spacingM * 100).toFixed(0)} cm (centro a centro)
          </text>
        </g>

        {/* ═══ Cinta ═══ */}
        <rect x="0" y={beltY} width={svgW} height={beltH} fill="url(#bv-belt)" />
        <line x1="0" y1={beltY} x2={svgW} y2={beltY} stroke="#475569" strokeWidth="1" />
        <line x1="0" y1={beltY + beltH} x2={svgW} y2={beltY + beltH} stroke="#475569" strokeWidth="1" />

        {/* ═══ Pez 1 + ojito ═══ */}
        <ellipse
          cx={fish1X + fishLenPx / 2}
          cy={fishCY}
          rx={fishLenPx / 2}
          ry={fishRy}
          fill={overlapping ? 'url(#bv-fish-warn)' : 'url(#bv-fish)'}
        />
        <circle cx={fish1X + fishLenPx * 0.82} cy={fishCY - 2} r="1.8" fill="#1f2937" />
        <path d={`M ${fish1X + 2} ${fishCY} Q ${fish1X - 6} ${fishCY - 5} ${fish1X - 8} ${fishCY} Q ${fish1X - 6} ${fishCY + 5} ${fish1X + 2} ${fishCY} Z`} fill={overlapping ? '#991b1b' : '#c2410c'} />

        {/* ═══ Pez 2 + ojito ═══ */}
        <ellipse
          cx={fish2X + fishLenPx / 2}
          cy={fishCY}
          rx={fishLenPx / 2}
          ry={fishRy}
          fill={overlapping ? 'url(#bv-fish-warn)' : 'url(#bv-fish)'}
        />
        <circle cx={fish2X + fishLenPx * 0.82} cy={fishCY - 2} r="1.8" fill="#1f2937" />
        <path d={`M ${fish2X + 2} ${fishCY} Q ${fish2X - 6} ${fishCY - 5} ${fish2X - 8} ${fishCY} Q ${fish2X - 6} ${fishCY + 5} ${fish2X + 2} ${fishCY} Z`} fill={overlapping ? '#991b1b' : '#c2410c'} />

        {/* Flecha de dirección de movimiento sobre la cinta */}
        <g transform={`translate(${svgW - 52}, ${beltY - 8})`}>
          <line x1="0" y1="0" x2="35" y2="0" stroke="#38bdf8" strokeWidth="1.5" markerEnd="url(#bv-arrow)" />
          <text x="40" y="3" fontSize="9" fill="#38bdf8">cinta</text>
        </g>

        {/* ═══ Cota inferior 1: largo pez (bajo el pez 1) ═══ */}
        <g>
          <line x1={fish1X} y1={fishCY + fishRy + 2} x2={fish1X} y2={beltY + beltH + 18} stroke="#fb923c" strokeWidth="0.5" strokeDasharray="2 2" />
          <line x1={fish1X + fishLenPx} y1={fishCY + fishRy + 2} x2={fish1X + fishLenPx} y2={beltY + beltH + 18} stroke="#fb923c" strokeWidth="0.5" strokeDasharray="2 2" />
          <line x1={fish1X} y1={beltY + beltH + 18} x2={fish1X + fishLenPx} y2={beltY + beltH + 18} stroke="#fb923c" strokeWidth="1" markerStart="url(#bv-arrow-orange)" markerEnd="url(#bv-arrow-orange)" />
          <text x={fish1X + fishLenPx / 2} y={beltY + beltH + 32} textAnchor="middle" fontSize="10" fill="#fb923c" fontWeight="600">
            pez {(salmonLengthM * 100).toFixed(0)} cm
          </text>
        </g>

        {/* ═══ Cota inferior 2: gap libre (entre pez 1 cola y pez 2 cabeza) ═══ */}
        {gapPx > 20 && (
          <g>
            <line x1={fish1X + fishLenPx} y1={fishCY + fishRy + 2} x2={fish1X + fishLenPx} y2={beltY + beltH + 42} stroke={gapColor} strokeWidth="0.5" strokeDasharray="2 2" />
            <line x1={fish2X} y1={fishCY + fishRy + 2} x2={fish2X} y2={beltY + beltH + 42} stroke={gapColor} strokeWidth="0.5" strokeDasharray="2 2" />
            <line x1={fish1X + fishLenPx} y1={beltY + beltH + 42} x2={fish2X} y2={beltY + beltH + 42} stroke={gapColor} strokeWidth="1.2" markerStart="url(#bv-arrow-gap)" markerEnd="url(#bv-arrow-gap)" />
            <text x={fish1X + fishLenPx + gapPx / 2} y={beltY + beltH + 56} textAnchor="middle" fontSize="10" fill={gapColor} fontWeight="700">
              gap libre {(gapM * 100).toFixed(0)} cm
            </text>
          </g>
        )}
        {/* Cuando el gap es muy chico o negativo, mostrarlo como advertencia */}
        {gapPx <= 20 && gapPx > 0 && (
          <text x={fish1X + fishLenPx + gapPx / 2} y={beltY + beltH + 56} textAnchor="middle" fontSize="10" fill={gapColor} fontWeight="700">
            gap {(gapM * 100).toFixed(0)} cm
          </text>
        )}
        {gapPx <= 0 && (
          <text x={fish1X + fishLenPx} y={beltY + beltH + 56} textAnchor="middle" fontSize="10" fill="#ef4444" fontWeight="700">
            solapamiento — peces se pisan
          </text>
        )}

        {/* ═══ Escala métrica al fondo (ticks cada 50 cm) ═══ */}
        <g transform={`translate(${marginX}, ${svgH - 14})`}>
          <line x1="0" y1="0" x2={totalMeters * scale} y2="0" stroke="#475569" strokeWidth="0.5" />
          {ticks.map((cm) => {
            const x = (cm / 100) * scale
            if (x > totalMeters * scale) return null
            return (
              <g key={cm}>
                <line x1={x} y1="-2" x2={x} y2="2" stroke="#64748b" strokeWidth="0.5" />
                <text x={x} y="10" textAnchor="middle" fontSize="7" fill="#64748b">{cm}</text>
              </g>
            )
          })}
          <text x={totalMeters * scale + 10} y="3" fontSize="7" fill="#64748b">cm</text>
        </g>
      </svg>
    </div>
  )
}

export interface BatchStats {
  n: number
  p10: number
  p50: number
  p90: number
  cv: number
  dominantCalibre: string
  throughputPzPerMin: number | null
  peakPzPerMin: number | null
  windowMinutes: number | null
}

export function BatchStatsCard({ stats }: { stats: BatchStats | null }) {
  if (!stats) return null
  return (
    <div className="mb-4 p-3 rounded-card bg-muted/50 border grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs">
      <div className="text-center">
        <p className="text-muted-foreground">Piezas</p>
        <p className="font-mono font-medium">{stats.n.toLocaleString('es-CL')}</p>
      </div>
      <div className="text-center">
        <p className="text-muted-foreground">p10 / med / p90 kg</p>
        <p className="font-mono font-medium">{stats.p10.toFixed(2)} · {stats.p50.toFixed(2)} · {stats.p90.toFixed(2)}</p>
      </div>
      <div className="text-center">
        <p className="text-muted-foreground">CV%</p>
        <p className="font-mono font-medium">{stats.cv.toFixed(1)}%</p>
      </div>
      <div className="text-center">
        <p className="text-muted-foreground">Calibre dominante</p>
        <p className="font-mono font-medium truncate">{stats.dominantCalibre}</p>
      </div>
      {stats.throughputPzPerMin != null && (
        <div className="text-center">
          <p className="text-muted-foreground">Throughput</p>
          <p className="font-mono font-medium">{stats.throughputPzPerMin.toFixed(1)} pz/min</p>
        </div>
      )}
      {stats.windowMinutes != null && (
        <div className="text-center">
          <p className="text-muted-foreground">Ventana</p>
          <p className="font-mono font-medium">{Math.round(stats.windowMinutes)} min</p>
        </div>
      )}
    </div>
  )
}

interface AutoFieldProps {
  label: string
  value: number | string
  onChange: (v: number) => void
  auto: boolean
  onAutoChange: (v: boolean) => void
  suggested: number | null
  hint?: string
  step?: number
  min?: number
  max?: number
  placeholder?: string
  unit?: string
}

export function AutoField({ label, value, onChange, auto, onAutoChange, suggested, hint, step, min, max, placeholder, unit }: AutoFieldProps) {
  const hasData = suggested !== null
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs">{label}</Label>
        <div
          className={cn('flex items-center gap-1', !hasData && 'opacity-40')}
          title={!hasData ? 'Requiere datos cargados' : undefined}
        >
          <Switch
            checked={auto && hasData}
            onCheckedChange={hasData ? onAutoChange : undefined}
            disabled={!hasData}
            className="scale-75 origin-right"
          />
          <span className="text-caption text-muted-foreground">Auto</span>
        </div>
      </div>
      <div className="relative">
        <Input
          type="number"
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={auto && hasData}
          placeholder={placeholder}
          className={cn('mt-1 font-mono', auto && hasData && 'opacity-60 pr-14')}
        />
        {auto && hasData && (
          <Badge className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5 text-caption bg-emerald-500/[0.15] text-ink-ok px-1.5 py-0 pointer-events-none">
            Auto
          </Badge>
        )}
      </div>
      {!auto && suggested !== null && (
        <p className="text-caption mt-1 flex items-center gap-1">
          <span className="text-ink-info">Sugerido: ~{suggested}{unit ? ` ${unit}` : ''}</span>
          {Number(value) !== suggested && (
            <button
              type="button"
              onClick={() => onChange(suggested)}
              className="underline text-primary hover:text-ink-info"
            >
              Aplicar
            </button>
          )}
        </p>
      )}
      {hint && !auto && suggested === null && (
        <p className="text-caption text-muted-foreground mt-1">{hint}</p>
      )}
    </div>
  )
}
