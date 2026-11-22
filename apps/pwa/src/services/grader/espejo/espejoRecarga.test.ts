import { describe, it, expect } from 'vitest'
import { fraseRecarga, leidoHastaDelLector, msDeFechaPlanta, type EstadoLector } from './espejoEstado'

const base: EstadoLector = {
  equipo: 'CH-MANT-P07',
  linea: 'chonchi',
  ultimoLatidoMs: 0,
  leidoEn: '2026-11-21T14:05:00-03:00',
  informe: 'pieza',
  estado: { error: '', parcial: false, pendientes: 0, rango: ['2026-11-21 00:00:00', '2026-11-23 00:00:00'] },
}
const conEstado = (e: Partial<EstadoLector['estado']>): EstadoLector => ({ ...base, estado: { ...base.estado, ...e } })

describe('msDeFechaPlanta', () => {
  it('lee la hora del PC de planta como wall-clock-as-UTC', () => {
    expect(msDeFechaPlanta('2026-11-21 14:05:00')).toBe(Date.parse('2026-11-21T14:05:00.000Z'))
    expect(msDeFechaPlanta('21-11-2026 14:05')).toBeNull()
    expect(msDeFechaPlanta(undefined)).toBeNull()
  })
})

describe('leidoHastaDelLector', () => {
  it('lectura completa con el rango de hoy: la hora de la lectura', () => {
    expect(leidoHastaDelLector(base)).toBe(Date.parse('2026-11-21T14:05:00.000Z'))
  })
  it('nunca pasa el fin del rango de Matrix (rango viejo tras una recarga)', () => {
    const e = conEstado({ rango: ['2026-11-17 00:00:00', '2026-11-19 00:00:00'], recarga: 'terminada 34145 2026-11-17 00:00:01 a 2026-11-18 23:59:58' })
    expect(leidoHastaDelLector(e)).toBe(Date.parse('2026-11-19T00:00:00.000Z'))
  })
  it('fechas fijas vencidas: corta en el fin del rango, no en la hora de lectura', () => {
    expect(leidoHastaDelLector(conEstado({ rango: ['2026-11-20 00:00:00', '2026-11-21 06:00:00'] }))).toBe(Date.parse('2026-11-21T06:00:00.000Z'))
  })
  it('recarga en curso (parcial), error o tramo pendiente: nada se da por leído', () => {
    expect(leidoHastaDelLector(conEstado({ parcial: true, recarga: 'leyendo 4000/34145 4000' }))).toBeNull()
    expect(leidoHastaDelLector(conEstado({ error: 'recarga-con-limite', recarga: 'con-limite' }))).toBeNull()
    expect(leidoHastaDelLector(conEstado({ pendientes: 12 }))).toBeNull()
    expect(leidoHastaDelLector(null)).toBeNull()
    expect(leidoHastaDelLector({ ...base, leidoEn: null })).toBeNull()
  })
  it('sin rango legible: la hora de la lectura (como antes de e1.6)', () => {
    expect(leidoHastaDelLector(conEstado({ rango: [] }))).toBe(Date.parse('2026-11-21T14:05:00.000Z'))
  })
})

describe('fraseRecarga', () => {
  const hoy = ['2026-11-21 00:00:00', '2026-11-23 00:00:00']
  const viejo = ['2026-11-17 00:00:00', '2026-11-19 00:00:00']
  const ahora = new Date(2026, 10, 21, 14, 5, 0)
  it('sin recarga: nada', () => {
    expect(fraseRecarga(undefined, hoy, ahora)).toBeNull()
    expect(fraseRecarga('', hoy, ahora)).toBeNull()
  })
  it('leyendo: avance con punto de miles y sin aviso', () => {
    expect(fraseRecarga('leyendo 12000/34145 11980', viejo, ahora)).toEqual({
      texto: 'leyendo · 12.000 de 34.145 filas · 11.980 piezas enviadas',
      aviso: null,
    })
  })
  it('con «Limitar» marcada: lo dice en la ficha; el aviso lo da el error recarga-con-limite', () => {
    expect(fraseRecarga('con-limite', viejo, ahora)).toEqual({ texto: 'esperando · «Limitar» marcada', aviso: null })
  })
  it('terminada con el rango viejo: pide volver el rango de Matrix a hoy', () => {
    const f = fraseRecarga('terminada 34145 2026-11-17 00:00:01 a 2026-11-18 23:59:58', viejo, ahora)
    expect(f?.texto).toBe('terminada · 34.145 piezas (17-11 00:00 a 18-11 23:59)')
    expect(f?.aviso).toMatch(/rango de hoy/)
  })
  it('terminada y el rango ya volvió a hoy: sin aviso', () => {
    expect(fraseRecarga('terminada 34145 2026-11-17 00:00:01 a 2026-11-18 23:59:58', hoy, ahora)?.aviso).toBeNull()
  })
  it('terminada sin filas y cancelada', () => {
    expect(fraseRecarga('terminada 0', viejo, ahora)?.texto).toMatch(/rango estaba vacío/)
    const c = fraseRecarga('cancelada 4000', viejo, ahora)
    expect(c?.texto).toBe('cancelada · 4.000 piezas enviadas')
    expect(c?.aviso).toMatch(/Recarga cancelada/)
  })
  it('un texto que la PWA no conoce se muestra tal cual', () => {
    expect(fraseRecarga('otra-cosa', hoy, ahora)).toEqual({ texto: 'otra-cosa', aviso: null })
  })
})

describe('COMANDO_RECARGA', () => {
  it('crea RECARGA en la carpeta del lector (la misma del registro)', async () => {
    const { COMANDO_RECARGA } = await import('./espejoEstado')
    expect(COMANDO_RECARGA).toBe('New-Item -ItemType File -Force "$env:LOCALAPPDATA' + String.fromCharCode(92) + 'espejo-grader' + String.fromCharCode(92) + 'RECARGA"')
  })
})
