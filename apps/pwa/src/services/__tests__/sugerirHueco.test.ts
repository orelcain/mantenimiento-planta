import { describe, it, expect } from 'vitest'
import { aplicarSugerencia, sugerirHuecos } from '../sugerirHueco'
import {
  SLOTS_POR_DIA,
  capaOportunidad,
  contarDia,
  diaVacio,
  maquinaNueva,
  pintarHoras,
  slotAHora,
  slotDeHora,
  type MaquinaRueda,
} from '../ruedaVentanas'

const HORA = 12

function maquina(rangos: Array<[number, number, string]>, mant: Array<[number, number]> = []): MaquinaRueda {
  let areas = '0'.repeat(SLOTS_POR_DIA)
  let m = '0'.repeat(SLOTS_POR_DIA)
  for (const [h1, h2, v] of rangos) areas = pintarHoras(areas, slotDeHora(h1), slotDeHora(h2), v)
  for (const [h1, h2] of mant) m = pintarHoras(m, slotDeHora(h1), slotDeHora(h2), '1')
  const base = maquinaNueva('a', 'A')
  return { ...base, semana: base.semana.map(() => ({ areas, mant: m })) }
}

describe('sugerirHuecos', () => {
  it('propone un hueco donde la máquina está libre', () => {
    const s = sugerirHuecos(maquina([[8, 20, 'P']]), { minutos: 60, requiereDetencion: true })
    expect(s.length).toBeGreaterThan(0)
    expect(s[0]!.condicion).toBe('limpia')
  })

  it('NO propone donde ya hay otra intervención puesta', () => {
    // Libre de 0 a 8, pero las 0-8 ya están ocupadas por otra tarea.
    const m = maquina([[8, 24, 'P']], [[0, 8]])
    const s = sugerirHuecos(m, { minutos: 60, requiereDetencion: true })
    expect(s).toHaveLength(0)
  })

  it('respeta lo ya puesto y ofrece el resto del hueco', () => {
    const m = maquina([[8, 24, 'P']], [[0, 3]]) // libre 0-8, ocupado 0-3
    const s = sugerirHuecos(m, { minutos: 60, requiereDetencion: true })
    expect(slotAHora(s[0]!.inicio)).toBe('03:00')
  })

  it('nunca sugiere sobre higiene, ni para trabajo que admite máquina en marcha', () => {
    const m = maquina([[0, 24, 'H']])
    expect(sugerirHuecos(m, { minutos: 30, requiereDetencion: false })).toHaveLength(0)
  })

  it('un trabajo que exige detención no se sugiere con la línea corriendo', () => {
    const m = maquina([[0, 24, 'P']])
    expect(sugerirHuecos(m, { minutos: 30, requiereDetencion: true })).toHaveLength(0)
    expect(sugerirHuecos(m, { minutos: 30, requiereDetencion: false }).length).toBeGreaterThan(0)
  })

  it('prefiere la máquina libre antes que la colación', () => {
    // 02-03 libre (1 h) y 13-15 en colación (2 h): gana el libre pese a ser más corto.
    const m = maquina([[0, 2, 'P'], [3, 13, 'P'], [13, 15, 'C'], [15, 24, 'P']])
    const s = sugerirHuecos(m, { minutos: 45, requiereDetencion: true })
    expect(s[0]!.condicion).toBe('limpia')
    expect(slotAHora(s[0]!.inicio)).toBe('02:00')
  })

  it('a igual condición, prefiere el hueco que deja más aire', () => {
    // Dos huecos limpios el mismo día: 1 h y 4 h. Para 30 min gana el de 4 h.
    const m = maquina([[0, 1, 'P'], [2, 8, 'P'], [12, 24, 'P']])
    const s = sugerirHuecos(m, { minutos: 30, requiereDetencion: true })
    expect(s[0]!.holguraMin).toBeGreaterThan(60)
  })

  it('propone una sola posición por hueco, no todos los desplazamientos', () => {
    // Un hueco de 4 h para una tarea de 30 min daría decenas de posiciones
    // válidas; todas son la misma oportunidad.
    const m = maquina([[8, 24, 'P']])
    const s = sugerirHuecos(m, { minutos: 30, requiereDetencion: true }, 10)
    const porDia = new Set(s.map((x) => x.dia))
    expect(s.length).toBe(porDia.size) // como mucho una por día
  })

  it('no devuelve más de las pedidas', () => {
    const s = sugerirHuecos(maquina([]), { minutos: 30, requiereDetencion: true }, 3)
    expect(s).toHaveLength(3)
  })

  it('un trabajo más largo que el día no rompe nada', () => {
    expect(sugerirHuecos(maquina([]), { minutos: 60 * 25, requiereDetencion: true })).toHaveLength(0)
  })

  it('la duración se redondea hacia arriba al tramo de 5 min', () => {
    const s = sugerirHuecos(maquina([]), { minutos: 46, requiereDetencion: true })
    expect(s[0]!.largo).toBe(10) // 50 min
  })
})

describe('aplicarSugerencia', () => {
  it('marca la intervención sin tocar la ocupación', () => {
    const m = maquina([[8, 20, 'P']])
    const s = sugerirHuecos(m, { minutos: 60, requiereDetencion: true })[0]!
    const nuevo = aplicarSugerencia(m, s)
    expect(contarDia(nuevo.semana[s.dia]!).intervencion).toBe(1 * HORA)
    expect(nuevo.semana[s.dia]!.areas).toBe(m.semana[s.dia]!.areas)
  })

  it('solo toca el día de la sugerencia', () => {
    const m = maquina([[8, 20, 'P']])
    const s = sugerirHuecos(m, { minutos: 60, requiereDetencion: true })[0]!
    const nuevo = aplicarSugerencia(m, s)
    const otro = s.dia === 0 ? 1 : 0
    expect(nuevo.semana[otro]!.mant).toBe(m.semana[otro]!.mant)
  })

  it('tras aplicarla, esa franja deja de ofrecerse como oportunidad', () => {
    const m = maquina([[8, 20, 'P']])
    const s = sugerirHuecos(m, { minutos: 60, requiereDetencion: true })[0]!
    const nuevo = aplicarSugerencia(m, s)
    const oportunidad = capaOportunidad(nuevo.semana[s.dia]!)
    expect(oportunidad[s.inicio]).toBe('0')
  })
})

describe('capaOportunidad', () => {
  it('marca lo libre sin plan y no lo que ya tiene plan', () => {
    const m = maquina([[8, 24, 'P']], [[0, 2]])
    const cap = capaOportunidad(m.semana[0]!)
    expect(cap[slotDeHora(1)]).toBe('0') // ya planificado
    expect(cap[slotDeHora(4)]).toBe('1') // libre y sin plan
    expect(cap[slotDeHora(10)]).toBe('0') // la línea corriendo no es oportunidad
  })

  it('un día entero libre y sin plan es oportunidad completa', () => {
    expect(capaOportunidad(diaVacio()).split('').filter((c) => c === '1')).toHaveLength(SLOTS_POR_DIA)
  })

  it('la colación sin higiene sí cuenta como oportunidad', () => {
    const m = maquina([[0, 13, 'P'], [13, 14, 'C'], [14, 24, 'P']])
    expect(capaOportunidad(m.semana[0]!)[slotDeHora(13, 30)]).toBe('1')
  })

  it('la colación que toma higiene NO cuenta', () => {
    const m = maquina([[0, 13, 'P'], [13, 14, 'X'], [14, 24, 'P']])
    expect(capaOportunidad(m.semana[0]!)[slotDeHora(13, 30)]).toBe('0')
  })
})
