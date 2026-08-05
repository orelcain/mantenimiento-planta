/**
 * Banco de pruebas de la Matriz de turnos. SOLO DEV — la ruta no se registra
 * en producción (ver App.tsx).
 *
 * Monta `GraderShiftPeriodMatrix` con el fixture de datos REALES exportado por
 * `scripts/export-shift-period-fixture.js`, sin Firestore y sin login. Existe
 * para poder mirar la vista mientras se construye: la página real vive detrás
 * de autenticación, y verificar un cambio visual no debería exigir credenciales.
 */
import { useMemo, useState } from 'react'
import { GraderShiftPeriodView } from '@/components/grader/GraderShiftPeriodView'
import { buildPeriodSummary } from '@/services/grader/graderPeriodSummary'
import { computePeriodMonthlyStats } from '@/services/grader/graderPeriodMonthlyStats'
import { exportPeriodSummaryPng } from '@/services/grader/graderPeriodSummaryPng'
import { exportPeriodSummaryPdf } from '@/services/grader/graderPeriodSummaryPdf'
import {
  buildPeriodShifts, periodShiftRows, periodDayKeys, indexPeriodShifts,
  formatShiftWindow, type PeriodShift,
} from '@/services/grader/graderShiftPeriod'
import { getSlxShiftCandidates } from '@/services/shoplogix/shoplogixShift.service'
import type { ShoplogixShiftParent } from '@/services/shoplogix/shoplogixShift.service'
import type { GraderDailySummary } from '@/services/grader/types'
import fixture from '@/services/grader/__tests__/fixtures/shiftPeriod.real.json'
import { cn } from '@/lib/utils'

type FixtureKey = 'yal_2026_07' | 'chonchi_2026_07'

const DATASETS: ReadonlyArray<{ key: FixtureKey; label: string; slug: 'yal' | 'chonchi' }> = [
  { key: 'yal_2026_07', label: 'Yal · julio 2026', slug: 'yal' },
  { key: 'chonchi_2026_07', label: 'Chonchi · julio 2026', slug: 'chonchi' },
]

function revive(raw: (typeof fixture)['yal_2026_07']['parents']): ShoplogixShiftParent[] {
  const d = (s: string | null) => (s ? new Date(s) : null)
  return raw.map(p => ({
    ...p,
    scheduledStart: d(p.scheduledStart), scheduledEnd: d(p.scheduledEnd),
    effectiveStart: d(p.effectiveStart), effectiveEnd: d(p.effectiveEnd),
    officialStart: d(p.officialStart), officialEnd: d(p.officialEnd),
    lastSyncAt: null,
    machines: p.machines.map(m => ({ ...m, stateAggregates: undefined })),
  })) as unknown as ShoplogixShiftParent[]
}

export default function MatrizTurnosDevPage() {
  const [dsKey, setDsKey] = useState<FixtureKey>('yal_2026_07')
  const [selected, setSelected] = useState<PeriodShift | null>(null)

  const ds = DATASETS.find(d => d.key === dsKey)!

  const shifts = useMemo(() => buildPeriodShifts({
    parents: revive(fixture[dsKey].parents),
    summaries: fixture[dsKey].summaries as unknown as GraderDailySummary[],
    plantSlug: ds.slug,
    getCandidates: getSlxShiftCandidates,
  }), [dsKey, ds.slug])

  const rows = useMemo(() => periodShiftRows(shifts), [shifts])
  const byKey = useMemo(() => indexPeriodShifts(shifts), [shifts])
  const days = useMemo(() => periodDayKeys(2026, 6), [])   // julio 2026

  const cruzan = shifts.filter(s => s.crossesMidnight || s.startDayOffset > 0)
  const stats = useMemo(() => computePeriodMonthlyStats(shifts), [shifts])

  const btn = (active: boolean) => cn(
    'px-3 py-1.5 text-xs font-mono rounded-md border transition-colors',
    active ? 'bg-primary text-primary-foreground border-primary font-semibold'
           : 'bg-card text-muted-foreground border-border hover:bg-accent',
  )

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <span className="text-[11px] font-mono uppercase tracking-widest text-primary">
            Banco de pruebas · solo dev
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Matriz de turnos</h1>
          <p className="text-sm text-muted-foreground max-w-[65ch]">
            Datos reales exportados de Firestore. Un turno = una celda, anclada al día en que
            arranca — cruce o no cruce la medianoche.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-border">
          <div className="flex gap-1.5">
            {DATASETS.map(d => (
              <button key={d.key} className={btn(d.key === dsKey)}
                      onClick={() => { setDsKey(d.key); setSelected(null) }}>
                {d.label}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <button
            className={btn(false)}
            onClick={() => document.documentElement.classList.toggle('dark')}
          >
            claro / oscuro
          </button>
        </div>

        {/* `onExport` se pasa con los MISMOS datos reales del fixture: así los
            botones del comparativo se pueden ver y usar sin sesión, que es la
            única forma de comprobar que existen y descargan algo. */}
        <GraderShiftPeriodView
          shifts={shifts} rows={rows} days={days} byKey={byKey}
          selectedKey={selected?.key ?? null}
          onSelect={s => setSelected(prev => (prev?.key === s.key ? null : s))}
          onExport={format => {
            const summary = buildPeriodSummary({
              shifts,
              stats: computePeriodMonthlyStats(shifts),
              monthDate: shifts[0]?.start ?? new Date(),
              areaLabel: 'P. Principal · Eviscerado',
              reliability: null,
            })
            if (format === 'png') exportPeriodSummaryPng({ summary, filenameSuffix: 'fixture' })
            else exportPeriodSummaryPdf({ summary, filenameSuffix: 'fixture' })
          }}
        />

        <div className="rounded-md border border-border bg-card p-4 text-sm flex flex-col gap-2">
          <b className="text-xs uppercase tracking-wider font-mono text-muted-foreground">
            Comprobaciones sobre estos datos
          </b>
          <div className="grid gap-1 font-mono text-xs">
            <span>turnos con datos: <b>{shifts.length}</b> · filas: <b>{rows.length}</b> ({rows.join(', ')})</span>
            <span>que ocurren en otro día que su columna: <b>{cruzan.length}</b></span>
          </div>
          {cruzan.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs text-muted-foreground">
              {cruzan.slice(0, 6).map(s => (
                <li key={s.key}>
                  · {s.dateKey} <b className="text-foreground">{s.shiftId}</b> — {formatShiftWindow(s)}
                  {' '}({s.cycles.toLocaleString('es-CL')} cic)
                </li>
              ))}
            </ul>
          )}
          {stats && (
            <div className="mt-2 pt-2 border-t border-border font-mono text-xs flex flex-col gap-0.5">
              <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
                Stats del panel mensual (portadas del calendario retirado)
              </span>
              <span>ciclos: <b>{stats.totalCycles.toLocaleString('es-CL')}</b> · uptime prom:{' '}
                <b>{stats.avgUptimePct.toFixed(1)}%</b> · turnos: <b>{stats.turnosWithData}</b>{' '}
                (D {stats.dayShiftsWithData} / N {stats.nightShiftsWithData}) · días: <b>{stats.daysWithData}</b></span>
              <span>mejor: <b>{stats.bestShift?.shiftId} {stats.bestShift?.dateKey}</b>{' '}
                ({stats.bestShift?.uptimePct.toFixed(0)}%) · peor: <b>{stats.worstShift?.shiftId} {stats.worstShift?.dateKey}</b>{' '}
                ({stats.worstShift?.uptimePct.toFixed(0)}%)</span>
              <span>fuera de turno: <b>{stats.unscheduled.cycles.toLocaleString('es-CL')}</b> cic en{' '}
                {stats.unscheduled.daysWithData} día(s)</span>
              {stats.perMachineMonth.map(m => (
                <span key={m.machineid} className="text-muted-foreground">
                  · {m.name}: {m.totalCycles.toLocaleString('es-CL')} cic · {m.avgUptimePct.toFixed(0)}% ·{' '}
                  {m.shiftCount} turnos
                </span>
              ))}
            </div>
          )}
          {selected && (
            <div className="mt-2 pt-2 border-t border-border font-mono text-xs">
              seleccionado: <b>{selected.shiftId}</b> · {selected.dateKey} ·{' '}
              {formatShiftWindow(selected)} · fuente <b>{selected.windowSource}</b>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
