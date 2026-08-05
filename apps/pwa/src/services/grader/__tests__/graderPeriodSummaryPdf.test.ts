/**
 * Tests del PDF del período.
 *
 * Lo que se verifica es que la hoja QUEPA y que diga lo mismo que el PNG. Un
 * PDF que se pasa de la página no falla: sigue de largo y el pie desaparece —
 * se descubre cuando ya lo entregaste.
 */
import { describe, it, expect } from 'vitest'
import { drawPeriodPdfPage } from '../graderPeriodSummaryPdf'
import type { PdfDoc } from '../graderExecutivePdfPage'
import { buildPeriodSummary } from '../graderPeriodSummary'
import { computePeriodMonthlyStats } from '../graderPeriodMonthlyStats'
import { getShiftMeta } from '../graderShiftDisplay'
import type { PeriodShift } from '../graderShiftPeriod'

const wall = (s: string) => new Date(`${s}.000Z`)
const PAGE_H = 297
const PAGE_W = 210

/** Doble de jsPDF que registra lo dibujado, para no mirar un PDF a ojo. */
function fakeDoc() {
  const texts: Array<{ text: string; x: number; y: number }> = []
  const rects: Array<{ x: number; y: number; w: number; h: number }> = []
  const doc = {
    internal: { pageSize: { getWidth: () => PAGE_W, getHeight: () => PAGE_H } },
    setFont() {}, setFontSize() {}, setTextColor() {}, setDrawColor() {},
    setFillColor() {}, setLineWidth() {},
    text(t: string | string[], x: number, y: number) {
      for (const one of Array.isArray(t) ? t : [t]) texts.push({ text: one, x, y })
    },
    line() {},
    rect(x: number, y: number, w: number, h: number) { rects.push({ x, y, w, h }) },
    splitTextToSize(text: string, maxWidth: number) {
      const perLine = Math.max(10, Math.floor(maxWidth / 2.1))
      const words = text.split(' ')
      const lines: string[] = []
      let cur = ''
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w
        if (next.length > perLine && cur) { lines.push(cur); cur = w } else cur = next
      }
      if (cur) lines.push(cur)
      return lines
    },
    addPage() {},
  }
  return {
    doc: doc as unknown as PdfDoc,
    texts, rects,
    all: () => texts.map(t => t.text).join(' | '),
    maxY: () => Math.max(...texts.map(t => t.y), ...rects.map(r => r.y + r.h)),
    maxX: () => Math.max(...texts.map(t => t.x), ...rects.map(r => r.x + r.w)),
  }
}

function machine(name: string, cycles: number, runtime: number) {
  return {
    machineid: name, name, totalCycles: cycles, uptimeSec: 0, shiftRuntime: runtime,
    overallRatio: 0, expectedTotalCycles: 8420, breakdown: null, stateAggregates: null,
  } as PeriodShift['machines'][number]
}

function shift(dateKey: string, shiftId: string, cycles: number, uptimePct: number): PeriodShift {
  return {
    key: `${dateKey}__${shiftId}`, dateKey, shiftId, meta: getShiftMeta(shiftId),
    start: wall(`${dateKey}T08:00:00`), end: wall(`${dateKey}T16:00:00`),
    windowSource: 'effective', startDayOffset: 0, endDayOffset: 0, crossesMidnight: false,
    endDateKey: dateKey, durationMin: 480, cycles, uptimePct, expectedCycles: 16840,
    uptimeSec: 0,
    machines: [machine('Baader 1', cycles / 2, uptimePct / 100), machine('Baader 2', cycles / 2, uptimePct / 100)],
    pieces: null, p0Pieces: null, p0Pct: null,
    hasSlx: true, hasGrader: false, lowActivity: false, unscheduled: false,
  }
}

function summaryOf(n: number) {
  const shifts = Array.from({ length: n }, (_, i) => {
    const up = 45 + (35 * i) / Math.max(1, n - 1)
    return shift(`2026-08-${String(1 + Math.floor(i / 2)).padStart(2, '0')}`,
      i % 2 === 0 ? 'Turno 1' : 'Turno 2', Math.round(up * 60), up)
  })
  return buildPeriodSummary({
    shifts, stats: computePeriodMonthlyStats(shifts), monthDate: new Date(2026, 7, 1),
    areaLabel: 'P. Principal · Eviscerado',
    reliability: { mttrMacroSec: 354, mtbfSec: 720, macroCount: 34, microCount: 142, microSec: 4320, shiftsWithData: n },
    now: wall('2026-08-20T12:00:00'),
  })
}

describe('drawPeriodPdfPage', () => {
  it('cabe en una hoja A4 con la tabla llena (12 turnos)', () => {
    const f = fakeDoc()
    const end = drawPeriodPdfPage(f.doc, summaryOf(12))
    expect(end).toBeLessThan(PAGE_H - 10)
    expect(f.maxY()).toBeLessThan(PAGE_H)
  })

  it('cabe con la tabla agregada (30 turnos)', () => {
    const f = fakeDoc()
    expect(drawPeriodPdfPage(f.doc, summaryOf(30))).toBeLessThan(PAGE_H - 10)
  })

  it('nada se sale del ancho de la hoja', () => {
    const f = fakeDoc()
    drawPeriodPdfPage(f.doc, summaryOf(12))
    expect(f.maxX()).toBeLessThanOrEqual(PAGE_W)
  })

  it('dibuja las secciones en el orden en que se leen', () => {
    const f = fakeDoc()
    const s = summaryOf(6)
    drawPeriodPdfPage(f.doc, s)
    const orden = ['TENDENCIA DEL PERÍODO', 'AVERÍAS RESUELTAS', s.tableTitle, 'LO QUE MUESTRAN LOS DATOS']
    const pos = orden.map(t => f.texts.findIndex(x => x.text === t))
    expect(pos.every(p => p >= 0)).toBe(true)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
  })

  it('cuenta lo mismo que el modelo: el veredicto y el cierre van completos', () => {
    const f = fakeDoc()
    const s = summaryOf(10)
    drawPeriodPdfPage(f.doc, s)
    // El texto se parte en líneas, así que se compara sin espacios.
    const plano = f.all().replace(/\s*\|\s*/g, ' ').replace(/\s+/g, ' ')
    expect(plano).toContain(s.verdict.replace(/\s+/g, ' '))
    expect(plano).toContain(s.ask.slice(0, 40))
    expect(plano).toContain(s.sourceNote)
  })

  it('la hoja sin datos no dibuja tabla ni KPIs vacíos', () => {
    const s = buildPeriodSummary({
      shifts: [], stats: null, monthDate: new Date(2026, 7, 1),
      areaLabel: 'x', reliability: null, now: wall('2026-08-20T12:00:00'),
    })
    const f = fakeDoc()
    drawPeriodPdfPage(f.doc, s)
    expect(f.all()).not.toContain('TURNOS DEL PERÍODO')
    expect(f.all()).not.toContain('AVERÍAS RESUELTAS')
    expect(f.all()).toContain('Sin turnos con producción registrada en el período.')
  })
})
