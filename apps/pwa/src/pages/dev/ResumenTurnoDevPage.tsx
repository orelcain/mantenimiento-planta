/**
 * Banco de pruebas del resumen ejecutivo. SOLO DEV.
 *
 * Dibuja el PNG real con datos reales de turnos conocidos, sin Firestore ni
 * login. Existe porque el entregable se manda a gerencia: hay que MIRARLO antes
 * de que salga, y la página real vive detrás de autenticación.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildExecutiveSummary, type BuildExecutiveSummaryInput,
} from '@/services/grader/graderExecutiveSummary'
import { exportExecutiveSummaryPng } from '@/services/grader/graderExecutiveSummaryPng'
import { exportTurnToPDF } from '@/services/grader/graderTurnToPDF'
import type { GraderDailySummary } from '@/services/grader/types'
import type { UpstreamLineSnapshot, UpstreamMachineShift } from '@/services/shoplogix/types'
import { cn } from '@/lib/utils'

const wall = (s: string) => new Date(`${s}.000Z`)

function machine(name: string, cycles: number, expected: number, runtime: number): UpstreamMachineShift {
  return {
    machineid: name, machineName: name, machineType: 'baader_142',
    dateKey: '2026-08-03', shiftId: 'Turno 1',
    shiftStart: wall('2026-08-03T00:06:00'), shiftEnd: wall('2026-08-03T07:15:00'),
    totalCycles: cycles, expectedTotalCycles: expected, totalPieces: 0,
    actualRuntime: runtime,
  } as unknown as UpstreamMachineShift
}
const snap = (m: UpstreamMachineShift[]) =>
  ({ dateKey: '2026-08-03', shiftId: 'Turno 1', machines: m } as unknown as UpstreamLineSnapshot)

const baseSummary = {
  id: '2026-08-03__Turno 1', dateKey: '2026-08-03', shiftId: 'Turno 1',
  totalPieces: 0, pointZeroPieces: 0, pointZeroPct: 0, updatedBy: 'dev', updatedAt: '',
} as GraderDailySummary

/** Turnos REALES de la app. El primero es el que motivó el formato. */
const CASOS: ReadonlyArray<{ key: string; label: string; input: BuildExecutiveSummaryInput }> = [
  {
    key: 'parada',
    label: '3-ago · Baader 2 parada (real)',
    input: {
      summary: baseSummary, shiftLabel: 'Turno 1',
      upstream: snap([
        machine('Baader 1', 3452, 8420, 0.73),
        machine('Baader 2', 0, 8420, 0),
        machine('Baader 3', 268, 8420, 0.48),
      ]),
      start: wall('2026-08-03T00:06:00'), end: wall('2026-08-03T07:15:00'),
      reliability: { mttrMacroSec: 354, mtbfSec: 720, macroCount: 19, microCount: 69, microSec: 1890 },
      uptimePct: 39,
    },
  },
  {
    key: 'lento',
    label: 'Línea disponible pero lenta',
    input: {
      summary: baseSummary, shiftLabel: 'Turno 2',
      upstream: snap([
        machine('Baader 1', 3000, 8000, 0.92),
        machine('Baader 2', 2800, 8000, 0.9),
        machine('Baader 3', 3100, 8000, 0.91),
      ]),
      start: wall('2026-08-01T08:10:00'), end: wall('2026-08-01T14:52:00'),
      reliability: { mttrMacroSec: 420, mtbfSec: 5400, macroCount: 4, microCount: 12, microSec: 600 },
      uptimePct: 91,
    },
  },
  {
    key: 'sano',
    label: 'Turno sano (no debe dramatizar)',
    input: {
      summary: { ...baseSummary, totalPieces: 21400, pointZeroPieces: 430, pointZeroPct: 2 },
      shiftLabel: 'Turno 2',
      upstream: snap([
        machine('Baader 1', 7600, 8000, 0.95),
        machine('Baader 2', 7400, 8000, 0.94),
        machine('Baader 3', 7500, 8000, 0.96),
      ]),
      start: wall('2026-08-01T08:00:00'), end: wall('2026-08-01T16:00:00'),
      reliability: { mttrMacroSec: 300, mtbfSec: 7200, macroCount: 2, microCount: 3, microSec: 240 },
      uptimePct: 95,
    },
  },
]

export default function ResumenTurnoDevPage() {
  const [caso, setCaso] = useState(CASOS[0]!.key)
  const host = useRef<HTMLDivElement>(null)

  const activo = CASOS.find(c => c.key === caso)!
  const resumen = useMemo(
    () => buildExecutiveSummary({ ...activo.input, now: wall('2026-08-04T16:20:00') }),
    [activo],
  )

  useEffect(() => {
    const el = host.current
    if (!el) return
    el.innerHTML = ''
    const canvas = exportExecutiveSummaryPng({ summary: resumen, returnCanvas: true })
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
          <h1 className="text-2xl font-semibold tracking-tight">Resumen ejecutivo del turno</h1>
          <p className="text-sm text-muted-foreground max-w-[65ch]">
            El PNG real, dibujado con los mismos datos que usa la app. Es lo que se manda por
            Telegram y lo que va como página 1 del PDF.
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
            onClick={() => exportExecutiveSummaryPng({ summary: resumen, filenameSuffix: caso })}
          >
            Descargar PNG
          </button>
          <button
            className={btn(false)}
            onClick={() => exportTurnToPDF({
              summary: activo.input.summary,
              pauses: [],
              upstreamSnapshot: activo.input.upstream ?? null,
              shiftStart: activo.input.start ?? null,
              shiftEnd: activo.input.end ?? null,
            })}
          >
            Descargar PDF completo
          </button>
        </div>

        <div ref={host} />

        <div className="rounded-md border border-border bg-card p-4 text-xs font-mono
                        flex flex-col gap-1 text-muted-foreground">
          <span className="uppercase tracking-wider text-[10px]">Modelo detrás del dibujo</span>
          <span>severidad: <b className="text-foreground">{resumen.severity}</b> ·
            pérdida: <b className="text-foreground">{resumen.lossDriver}</b> ·
            KPIs: <b className="text-foreground">{resumen.kpis.length}</b></span>
          <span>veredicto: <b className="text-foreground">{resumen.verdict}</b></span>
          <span>pedido: <b className="text-foreground">{resumen.ask}</b></span>
        </div>
      </div>
    </div>
  )
}
