/**
 * Banco de pruebas del comparativo de período (formato C).
 *
 * Existe por la misma razón que el del turno: la vista real vive detrás de
 * login y con los datos del mes en curso, así que no sirve para ver cómo queda
 * la hoja cuando el mes mejora, cuando empeora o cuando tiene 30 turnos. Acá
 * cada caso arma el escenario a mano y dibuja el PNG real.
 *
 * Los casos NO son decorativos: cubren las cinco ramas del veredicto y los dos
 * modos de tabla. Si alguno deja de verse bien, el bug está en el modelo o en el
 * renderer, no en los datos de producción.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { PeriodShift } from '@/services/grader/graderShiftPeriod'
import { getShiftMeta } from '@/services/grader/graderShiftDisplay'
import { computePeriodMonthlyStats } from '@/services/grader/graderPeriodMonthlyStats'
import { buildPeriodSummary } from '@/services/grader/graderPeriodSummary'
import { exportPeriodSummaryPng } from '@/services/grader/graderPeriodSummaryPng'
import { exportPeriodSummaryPdf } from '@/services/grader/graderPeriodSummaryPdf'

const wall = (s: string) => new Date(`${s}.000Z`)

function machine(name: string, cycles: number, expected: number, runtime: number) {
  return {
    machineid: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    totalCycles: cycles,
    uptimeSec: Math.round(runtime * 7 * 3600),
    shiftRuntime: runtime,
    overallRatio: expected > 0 ? cycles / expected : 0,
    expectedTotalCycles: expected,
    breakdown: null,
    stateAggregates: null,
  } as PeriodShift['machines'][number]
}

/** Un turno del período. `stopped` mete una máquina en cero ciclos. */
function shift(
  dateKey: string,
  shiftId: string,
  cycles: number,
  uptimePct: number,
  opts: { stopped?: boolean; grader?: boolean } = {},
): PeriodShift {
  const expected = 8420
  const machines = opts.stopped
    ? [machine('Baader 1', cycles, expected, uptimePct / 100), machine('Baader 2', 0, expected, 0)]
    : [
        machine('Baader 1', Math.round(cycles * 0.6), expected, uptimePct / 100),
        machine('Baader 2', Math.round(cycles * 0.4), expected, uptimePct / 100),
      ]
  return {
    key: `${dateKey}__${shiftId}`,
    dateKey,
    shiftId,
    meta: getShiftMeta(shiftId),
    start: wall(`${dateKey}T08:00:00`),
    end: wall(`${dateKey}T16:00:00`),
    windowSource: 'effective',
    startDayOffset: 0,
    endDayOffset: 0,
    crossesMidnight: false,
    endDateKey: dateKey,
    durationMin: 480,
    cycles,
    uptimePct,
    expectedCycles: expected * machines.length,
    uptimeSec: Math.round((uptimePct / 100) * 8 * 3600),
    machines,
    pieces: null,
    p0Pieces: null,
    p0Pct: null,
    hasSlx: true,
    hasGrader: !!opts.grader,
    lowActivity: false,
    unscheduled: false,
    corregido: false,
    notaCorreccion: null,
  }
}

/** Genera N turnos con una rampa lineal de uptime entre dos valores. */
function ramp(n: number, from: number, to: number, startDay = 1): PeriodShift[] {
  return Array.from({ length: n }, (_, i) => {
    const up = from + ((to - from) * i) / Math.max(1, n - 1)
    const day = String(startDay + Math.floor(i / 2)).padStart(2, '0')
    return shift(`2026-08-${day}`, i % 2 === 0 ? 'Turno 1' : 'Turno 2', Math.round(up * 60), up)
  })
}

const CASOS: ReadonlyArray<{
  key: string
  label: string
  shifts: PeriodShift[]
  reliability: Parameters<typeof buildPeriodSummary>[0]['reliability']
  breakdowns?: Map<string, number>
}> = [
  {
    key: 'pocos',
    label: '3 turnos (el mes real)',
    shifts: [
      shift('2026-08-01', 'Turno 2', 2397, 69, { grader: true }),
      shift('2026-08-03', 'Turno 1', 4013, 40, { stopped: true, grader: true }),
      shift('2026-08-03', 'Turno 2', 1880, 26, { grader: true }),
    ],
    reliability: { mttrMacroSec: 354, mtbfSec: 720, macroCount: 34, microCount: 142, microSec: 4320, shiftsWithData: 3 },
    breakdowns: new Map([
      ['2026-08-01__Turno 2', 4],
      ['2026-08-03__Turno 1', 19],
      ['2026-08-03__Turno 2', 11],
    ]),
  },
  {
    key: 'mejora',
    label: 'Mes que mejora',
    shifts: ramp(10, 48, 82),
    reliability: { mttrMacroSec: 300, mtbfSec: 1800, macroCount: 41, microCount: 96, microSec: 3100, shiftsWithData: 10 },
  },
  {
    key: 'cae',
    label: 'Mes que empeora',
    shifts: ramp(10, 84, 46),
    reliability: { mttrMacroSec: 1500, mtbfSec: 900, macroCount: 58, microCount: 210, microSec: 7400, shiftsWithData: 10 },
  },
  {
    // Mitades con el mismo promedio pero turnos que van de 80 % a 30 %: no hay
    // tendencia que reportar y sí un problema de estabilidad.
    key: 'dispar',
    label: 'Mes disparejo',
    shifts: [
      shift('2026-08-01', 'Turno 1', 4800, 80),
      shift('2026-08-01', 'Turno 2', 1800, 30, { stopped: true }),
      shift('2026-08-02', 'Turno 1', 4680, 78),
      shift('2026-08-02', 'Turno 2', 1920, 32),
    ],
    reliability: { mttrMacroSec: 480, mtbfSec: 1200, macroCount: 22, microCount: 74, microSec: 2400, shiftsWithData: 4 },
  },
  {
    key: 'largo',
    label: 'Mes largo (30 turnos)',
    shifts: ramp(30, 55, 62, 1),
    reliability: { mttrMacroSec: 420, mtbfSec: 2400, macroCount: 120, microCount: 380, microSec: 12600, shiftsWithData: 26 },
  },
  {
    key: 'vacio',
    label: 'Sin turnos',
    shifts: [],
    reliability: null,
  },
]

export default function ResumenPeriodoDevPage() {
  const [caso, setCaso] = useState(CASOS[0]!.key)
  const host = useRef<HTMLDivElement>(null)

  const activo = CASOS.find(c => c.key === caso)!
  const resumen = useMemo(() => buildPeriodSummary({
    shifts: activo.shifts,
    stats: computePeriodMonthlyStats(activo.shifts),
    monthDate: new Date(2026, 7, 1),
    areaLabel: 'P. Principal · Eviscerado',
    reliability: activo.reliability,
    breakdownsByShiftKey: activo.breakdowns,
    now: wall('2026-08-04T16:20:00'),
  }), [activo])

  useEffect(() => {
    const el = host.current
    if (!el) return
    el.innerHTML = ''
    const canvas = exportPeriodSummaryPng({ summary: resumen, returnCanvas: true })
    canvas.style.width = '100%'
    canvas.style.height = 'auto'
    canvas.style.boxShadow = '0 2px 4px rgba(0,0,0,.14), 0 12px 34px rgba(0,0,0,.18)'
    canvas.setAttribute('data-testid', 'png-preview')
    el.appendChild(canvas)
  }, [resumen])

  const btn = (on: boolean) => cn(
    'px-3 py-1.5 text-xs font-mono rounded-md border transition-colors',
    on ? 'bg-primary text-primary-foreground border-primary font-semibold'
       : 'bg-card text-muted-foreground border-border hover:bg-accent',
  )

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-[1000px] mx-auto flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <span className="text-[11px] font-mono uppercase tracking-widest text-primary">
            Banco de pruebas · solo dev
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Comparativo de período</h1>
          <p className="text-sm text-muted-foreground max-w-[65ch]">
            La hoja que contesta “¿vamos mejor?”, que un turno aislado no puede responder.
            Cada caso cubre una rama distinta del veredicto.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-border">
          {CASOS.map(c => (
            <button key={c.key} className={btn(c.key === caso)} onClick={() => setCaso(c.key)}>
              {c.label}
            </button>
          ))}
          <span className="flex-1" />
          <button
            className={btn(false)}
            onClick={() => exportPeriodSummaryPng({ summary: resumen, filenameSuffix: caso })}
          >
            Descargar PNG
          </button>
          <button
            className={btn(false)}
            onClick={() => exportPeriodSummaryPdf({ summary: resumen, filenameSuffix: caso })}
          >
            Descargar PDF
          </button>
        </div>

        <div ref={host} />

        <div className="rounded-md border border-border bg-card p-4 text-xs font-mono
                        flex flex-col gap-1 text-muted-foreground">
          <span className="uppercase tracking-wider text-[10px]">Modelo detrás del dibujo</span>
          <span data-testid="modelo-meta">
            tendencia: <b className="text-foreground">{resumen.trend}</b> ·
            severidad: <b className="text-foreground">{resumen.severity}</b> ·
            tabla: <b className="text-foreground">{resumen.rowsMode}</b> ·
            filas: <b className="text-foreground">{resumen.rows.length}</b> ·
            KPIs: <b className="text-foreground">{resumen.kpis.length}</b>
          </span>
          <span>veredicto: <b className="text-foreground">{resumen.verdict}</b></span>
          <span>cierre: <b className="text-foreground">{resumen.ask}</b></span>
        </div>
      </div>
    </div>
  )
}
