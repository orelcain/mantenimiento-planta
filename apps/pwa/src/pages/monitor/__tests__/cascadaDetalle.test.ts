/**
 * Tests de `detalleCascada`: cada vista reparte el total de su fila y CIERRA.
 * Si la fila dice −270, las máquinas suman 270, las causas 270 y las horas 270.
 */
import { describe, it, expect } from 'vitest'

import { construirCascada, contenedorDe } from '../cascadaTurno'
import { detalleCascada, repartir } from '../cascadaDetalle'
import type { PublicMonitorLive } from '@/services/shoplogix/publicShiftMonitor.service'

const maquinas = [
  { id: 'a', name: 'Evisceradora 1', model: 'Baader 142', targetCpm: 19 },
  { id: 'b', name: 'Evisceradora 2', model: 'Baader 142', targetCpm: 16 },
  { id: 'c', name: 'Evisceradora 3', model: 'Baader 142', targetCpm: 16 },
]

/* 08:00 → 10:30, 18 pz/min. 30 min detenidos (25 de detención + 5 micro). */
const live = (over: Partial<PublicMonitorLive> = {}): PublicMonitorLive => ({
  totalPieces: 1800,
  shiftPieces: 1800,
  effectiveStart: '2026-10-27T08:00:00.000Z',
  series: [
    { t: '2026-10-27T08:00:00.000Z', pieces: 900 },
    { t: '2026-10-27T10:25:00.000Z', pieces: 900 },
  ],
  machines: maquinas,
  timeBreakdown: {
    windowMin: 150, producingMin: 120, plannedMin: 0, recoverableMin: 30,
    planned: [],
    recoverable: [
      { reason: 'CUCHILLOS / GUILLOTINAS', min: 15, count: 1, lineMin: 15, machineMin: 45, equivMin: 15 },
      { reason: 'FALTA DE MATERIA PRIMA', min: 4, count: 1, lineMin: 4, machineMin: 12, equivMin: 4 },
      { reason: 'Detencion', min: 6, count: 2, lineMin: 6, machineMin: 18, equivMin: 6 },
      { reason: 'Micro Detencion', min: 5, count: 30, lineMin: 5, machineMin: 15, equivMin: 5 },
    ],
  },
  stopReasons: ['CUCHILLOS / GUILLOTINAS', 'FALTA DE MATERIA PRIMA', 'Detencion', 'Micro Detencion'],
  stopMachines: ['a', 'b', 'c'],
  stopEvents: [
    { r: 0, f: '2026-10-27T08:50:00.000Z', s: 900, m: 1 },
    { r: 1, f: '2026-10-27T09:10:00.000Z', s: 240, m: 0 },
    { r: 2, f: '2026-10-27T09:58:00.000Z', s: 240, m: 2 },
    { r: 2, f: '2026-10-27T10:10:00.000Z', s: 120, m: 2 },
    { r: 3, f: '2026-10-27T08:20:00.000Z', s: 20, m: 0 },
    { r: 3, f: '2026-10-27T09:20:00.000Z', s: 10, m: 1 },
  ],
  ...over,
} as unknown as PublicMonitorLive)

/* Serie minuto a minuto: cada máquina 2 pz bajo su esperado cuando anda. */
const serieMinuto = {
  desde: '2026-10-27T08:00:00.000Z',
  maquinas: maquinas.map((m, k) => ({
    id: m.id, esperado: m.targetCpm,
    cycles: Array.from({ length: 150 }, (_, i) => (i % 10 === k ? 0 : m.targetCpm - 2 - k)),
  })),
}

const suma = (xs: Array<{ piezas: number }> | null | undefined) => (xs ?? []).reduce((a, x) => a + x.piezas, 0)
const fila = (c: ReturnType<typeof construirCascada>, k: string) => -(c!.pasos.find((p) => p.clave === k)?.piezas ?? 0)

describe('repartir', () => {
  it('cierra al entero con resto mayor', () => {
    expect(repartir(10, [1, 1, 1])).toEqual([4, 3, 3])
    expect(repartir(7, [0, 0])).toBeNull()
  })
})

describe('contenedorDe', () => {
  it('carros en la Baader 142, silletas en la 200', () => {
    expect(contenedorDe(maquinas)).toBe('carro')
    expect(contenedorDe([{ name: 'Fileteadora 1', model: 'Baader 200' }])).toBe('silleta')
    expect(contenedorDe([{ name: 'Evisceradora 1', model: '' }])).toBe('carro')
    expect(contenedorDe([])).toBe('silleta')
  })
  it('la etiqueta de la cascada sigue al modelo', () => {
    const c = construirCascada({ live: live(), ritmoMaquina: 18 })!
    expect(c.pasos.find((p) => p.clave === 'vacias')?.etiqueta).toBe('Carros vacíos')
  })
})

describe('detalleCascada', () => {
  const c = construirCascada({ live: live(), ritmoMaquina: 18 })!
  const d = detalleCascada({ live: live(), cascada: c, serieMinuto })

  it('cada vista suma exacto su fila', () => {
    const det = fila(c, 'detenciones'); const mic = fila(c, 'micro'); const vac = fila(c, 'vacias')
    expect(suma(d.detenciones!.maquina)).toBe(det)
    expect(suma(d.detenciones!.causa)).toBe(det)
    expect(suma(d.detenciones!.hora)).toBe(det)
    expect(suma(d.micro!.maquina)).toBe(mic)
    expect(suma(d.micro!.hora)).toBe(mic)
    expect(suma(d.vacias!.maquina)).toBe(vac)
    expect(suma(d.vacias!.hora)).toBe(vac)
  })

  it('la banda de responsables suma lo no hecho', () => {
    const r = d.responde
    expect(r.mantencion + r.externo + r.sinImputar + r.micro + r.vacias).toBe(r.total)
    expect(r.total).toBe(c.perdido)
    expect(r.mantencion).toBe(Math.round((15 / 25) * fila(c, 'detenciones')))
    expect(r.sinImputar).toBeGreaterThan(0)
  })

  it('las partes por dueño de cada máquina suman su fila', () => {
    for (const m of d.detenciones!.maquina!) {
      expect(Object.values(m.partes ?? {}).reduce((a, x) => a + (x ?? 0), 0)).toBe(m.piezas)
    }
  })

  it('la última hora es parcial y lo dice', () => {
    const h = d.detenciones!.hora!
    expect(h.map((x) => x.hora)).toEqual(['08', '09', '10'])
    expect(h[2]!.parcialMin).toBe(30)
  })

  it('sin causa de vacías: no se inventa', () => {
    expect(d.vacias!.causa).toBeNull()
  })

  it('sin stopEvents ni serie: sin dato, no ceros', () => {
    const l = live({ stopEvents: undefined, stopMachines: undefined })
    const d2 = detalleCascada({ live: l, cascada: construirCascada({ live: l, ritmoMaquina: 18 })!, serieMinuto: null })
    expect(d2.detenciones!.maquina).toBeNull()
    expect(d2.detenciones!.hora).toBeNull()
    expect(suma(d2.detenciones!.causa)).toBe(fila(c, 'detenciones'))
    expect(d2.vacias!.maquina).toBeNull()
  })
})
