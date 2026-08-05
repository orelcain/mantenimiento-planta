import { describe, it, expect } from 'vitest'
import { drawExecutivePdfPage, type PdfDoc } from '../graderExecutivePdfPage'
import { buildExecutiveSummary } from '../graderExecutiveSummary'
import type { GraderDailySummary } from '@/services/grader/types'
import type { UpstreamLineSnapshot, UpstreamMachineShift } from '@/services/shoplogix/types'

const wall = (s: string) => new Date(`${s}.000Z`)

/**
 * Doble de jsPDF que registra todo lo dibujado. Permite verificar QUÉ dice la
 * página y en qué orden, sin depender de jsPDF ni de un navegador — y sin
 * mirar un PDF a ojo, que es donde se cuelan los errores.
 */
function fakeDoc() {
  const texts: Array<{ text: string; x: number; y: number }> = []
  const rects: Array<{ x: number; y: number; w: number; h: number }> = []
  let pages = 1
  const doc = {
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    setFont() {}, setFontSize() {}, setTextColor() {}, setDrawColor() {},
    setFillColor() {}, setLineWidth() {},
    text(t: string | string[], x: number, y: number) {
      const arr = Array.isArray(t) ? t : [t]
      for (const one of arr) texts.push({ text: one, x, y })
    },
    line() {},
    rect(x: number, y: number, w: number, h: number) { rects.push({ x, y, w, h }) },
    splitTextToSize(text: string, maxWidth: number) {
      // Partición aproximada: ~2.1 mm por carácter a los tamaños que usa la hoja.
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
    addPage() { pages++ },
  }
  return {
    doc: doc as unknown as PdfDoc,
    texts,
    rects,
    get pages() { return pages },
    all: () => texts.map(t => t.text).join(' | '),
  }
}

function machine(name: string, cycles: number, expected: number, runtime: number): UpstreamMachineShift {
  return {
    machineid: name, machineName: name, machineType: 'baader_142',
    dateKey: '2026-08-03', shiftId: 'Turno 1',
    shiftStart: wall('2026-08-03T00:06:00'), shiftEnd: wall('2026-08-03T07:15:00'),
    totalCycles: cycles, expectedTotalCycles: expected, totalPieces: 0, actualRuntime: runtime,
  } as unknown as UpstreamMachineShift
}

const summary = {
  id: '2026-08-03__Turno 1', dateKey: '2026-08-03', shiftId: 'Turno 1',
  totalPieces: 0, pointZeroPieces: 0, pointZeroPct: 0, updatedBy: 't', updatedAt: '',
} as GraderDailySummary

/** El turno real del 3-ago: Baader 2 en cero. */
const resumen = buildExecutiveSummary({
  summary,
  upstream: {
    dateKey: '2026-08-03', shiftId: 'Turno 1',
    machines: [
      machine('Baader 1', 3452, 8420, 0.73),
      machine('Baader 2', 0, 8420, 0),
      machine('Baader 3', 268, 8420, 0.48),
    ],
  } as unknown as UpstreamLineSnapshot,
  shiftLabel: 'Turno 1',
  start: wall('2026-08-03T00:06:00'),
  end: wall('2026-08-03T07:15:00'),
  reliability: { mttrMacroSec: 354, mtbfSec: 720, macroCount: 19, microCount: 69, microSec: 1890 },
  uptimePct: 39,
  now: wall('2026-08-04T16:20:00'),
})

describe('página ejecutiva del PDF', () => {
  it('dibuja las cuatro secciones, en orden', () => {
    const f = fakeDoc()
    drawExecutivePdfPage(f.doc, resumen)
    const orden = ['RESULTADO DEL TURNO', 'DE DÓNDE SALIÓ LA PÉRDIDA',
                   'LO QUE HIZO MANTENCIÓN', 'LO QUE SE NECESITA']
    const posiciones = orden.map(t => f.texts.findIndex(x => x.text === t))
    expect(posiciones.every(p => p >= 0)).toBe(true)
    // Cada sección aparece después de la anterior: es el orden en que se leen.
    expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b))
  })

  it('el veredicto nombra la máquina parada', () => {
    const f = fakeDoc()
    drawExecutivePdfPage(f.doc, resumen)
    expect(f.all()).toContain('Baader 2')
    expect(f.all()).toContain('no produjo un solo ciclo')
  })

  it('cuantifica el aporte de Mantención', () => {
    const f = fakeDoc()
    drawExecutivePdfPage(f.doc, resumen)
    const t = f.all()
    expect(t).toContain('19')
    expect(t).toContain('5,9 min')
    expect(t).toContain('69')
  })

  it('nada se sale del ancho de la hoja', () => {
    const f = fakeDoc()
    drawExecutivePdfPage(f.doc, resumen)
    // A4 = 210 mm. Los textos alineados a la derecha terminan EN el margen.
    for (const t of f.texts) expect(t.x).toBeLessThanOrEqual(210 - 14)
    for (const r of f.rects) expect(r.x + r.w).toBeLessThanOrEqual(210 - 14 + 0.01)
  })

  it('cabe en UNA página: no llama a addPage ni se pasa del alto', () => {
    const f = fakeDoc()
    const endY = drawExecutivePdfPage(f.doc, resumen)
    expect(f.pages).toBe(1)
    expect(endY).toBeLessThan(297 - 14)
  })

  it('declara la fuente en vez de dejarla implícita', () => {
    const f = fakeDoc()
    drawExecutivePdfPage(f.doc, resumen)
    expect(f.all()).toContain('sin Excel del Grader')
  })

  it('un turno sin datos de máquinas tampoco rompe el layout', () => {
    const vacio = buildExecutiveSummary({
      summary, upstream: null, shiftLabel: 'Turno 2',
      start: null, end: null, reliability: null, uptimePct: null,
      now: wall('2026-08-04T16:20:00'),
    })
    const f = fakeDoc()
    const endY = drawExecutivePdfPage(f.doc, vacio)
    expect(f.pages).toBe(1)
    expect(endY).toBeLessThan(297 - 14)
    expect(f.all()).toContain('RESULTADO DEL TURNO')
  })
})
