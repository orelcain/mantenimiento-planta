import { describe, expect, it } from 'vitest'
import {
  calcularRitmoVivo,
  cronometro,
  llenadoDe,
  paradaEnCurso,
  segundosCubiertos,
  tendenciaDe,
  tonoDe,
  unidadDeMaquinas,
  type EntradaRitmoVivo,
  type MaquinaVivo,
} from '../ritmoVivo'

const T0 = Date.parse('2026-10-27T11:00:00.000Z')
const iso = (min: number, seg = 0) => new Date(T0 + min * 60_000 + seg * 1000).toISOString()

/** Una máquina con 16 pz/min de esperado y los ciclos dados. */
const maq = (id: string, cycles: number[], esperado: number | null = 16) => ({ id, nombre: `Evisceradora ${id}`, esperado, cycles })
const entrada = (maquinas: ReturnType<typeof maq>[], extra: Partial<EntradaRitmoVivo> = {}): EntradaRitmoVivo => ({
  serie: { desde: iso(0), maquinas },
  acumulado: null,
  enCurso: [],
  ...extra,
})
const planas = (v: number, n = 14) => Array.from({ length: n }, () => v)

describe('tono por minuto', () => {
  it('usa los cortes de Shoplogix: 75 y 50 % del esperado', () => {
    expect(tonoDe(0.75)).toBe('bien')
    expect(tonoDe(0.74)).toBe('atento')
    expect(tonoDe(0.5)).toBe('atento')
    expect(tonoDe(0.49)).toBe('mal')
  })
})

describe('tendencia', () => {
  it('baja cuando la recta pierde más del 6 % del esperado', () => {
    const t = tendenciaDe([51, 50, 49, 48, 46, 45, 43, 42, 40, 38, 36, 34, 32, 30], 51)!
    expect(t.dir).toBe('bajando')
    expect(t.desde).toBeGreaterThan(t.hasta)
    expect(t.n).toBe(14)
  })
  it('sube', () => {
    expect(tendenciaDe([20, 22, 24, 26, 28, 30, 32, 34], 51)!.dir).toBe('subiendo')
  })
  it('estable con oscilaciones chicas', () => {
    expect(tendenciaDe([50, 49, 51, 50, 49, 51, 50, 50, 49, 51, 50, 50], 51)!.dir).toBe('estable')
  })
  it('no opina con menos de 4 minutos', () => {
    expect(tendenciaDe([50, 40, 30], 51)).toBeNull()
  })
})

describe('llenado con y sin paradas superpuestas', () => {
  const ciclos = planas(8) // 8 de 16 = 50 % si el minuto fue entero andando

  it('sin paradas: piezas ÷ esperado', () => {
    const e = entrada([maq('a', ciclos)], { stopEvents: [], stopMachines: ['a'] })
    const { lineas, separaParadas } = llenadoDe(e, 0, 14)
    expect(separaParadas).toBe(true)
    expect(lineas[0]!.fills.every((v) => v === 50)).toBe(true)
  })

  it('una parada de 30 s dentro del minuto sube el llenado: se divide por lo que la máquina anduvo', () => {
    const e = entrada([maq('a', ciclos)], {
      stopEvents: [{ r: 0, f: iso(3, 10), s: 30, m: 0 }],
      stopReasons: ['Detencion'],
      stopMachines: ['a'],
    })
    const f = llenadoDe(e, 0, 14).lineas[0]!.fills
    expect(f[3]).toBe(100) // 8 / (16 × 30/60) = 100 %
    expect(f[2]).toBe(50)
  })

  it('con menos de 20 s andando el minuto queda sin dato, no como mal llenado', () => {
    const e = entrada([maq('a', ciclos)], {
      stopEvents: [{ r: 0, f: iso(5, 5), s: 50, m: 0 }],
      stopReasons: ['Detencion'],
      stopMachines: ['a'],
    })
    expect(llenadoDe(e, 0, 14).lineas[0]!.fills[5]).toBeNull()
  })

  it('la parada de OTRA máquina no toca a esta', () => {
    const e = entrada([maq('a', ciclos), maq('b', ciclos)], {
      stopEvents: [{ r: 0, f: iso(4), s: 60, m: 1 }],
      stopReasons: ['Detencion'],
      stopMachines: ['a', 'b'],
    })
    const l = llenadoDe(e, 0, 14).lineas
    expect(l[0]!.fills[4]).toBe(50)
    expect(l[1]!.fills[4]).toBeNull()
  })

  it('la parada EN CURSO (que no viaja en stopEvents) también se descuenta', () => {
    const e = entrada([maq('a', ciclos)], {
      stopEvents: [], stopMachines: ['a'],
      enCurso: [{ id: 'a', desdeMs: T0 + 12 * 60_000 }],
    })
    const f = llenadoDe(e, 0, 14).lineas[0]!.fills
    expect(f[11]).toBe(50)
    expect(f[12]).toBeNull()
    expect(f[13]).toBeNull()
  })

  it('docs viejos sin `m`: llenado sin corrección y se avisa que no separa paradas', () => {
    const e = entrada([maq('a', ciclos)], {
      stopEvents: [{ r: 0, f: iso(3, 10), s: 30 }],
      stopReasons: ['Detencion'],
    })
    const { lineas, separaParadas } = llenadoDe(e, 0, 14)
    expect(separaParadas).toBe(false)
    expect(lineas[0]!.fills[3]).toBe(50)
    const r = calcularRitmoVivo(e, 'carros')!
    expect(r.senales.some((s) => /sin separar paradas/i.test(s.texto))).toBe(true)
  })

  it('un minuto con toda la línea en cero no se pinta como mal llenado', () => {
    const c = planas(8)
    c[6] = 0
    const e = entrada([maq('a', c), maq('b', c)], { stopEvents: [], stopMachines: ['a', 'b'] })
    expect(llenadoDe(e, 0, 14).lineas[0]!.fills[6]).toBeNull()
  })

  it('segundosCubiertos recorta al minuto', () => {
    expect(segundosCubiertos([[T0 - 5_000, T0 + 12_000]], T0, T0 + 60_000)).toBe(12)
    expect(segundosCubiertos([[T0 + 50_000, Number.POSITIVE_INFINITY]], T0, T0 + 60_000)).toBe(10)
  })
})

describe('señales', () => {
  const cae = [16, 16, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5]
  const sana = planas(15)
  const base = { stopEvents: [], stopMachines: ['1', '2', '3'] }

  it('las tres bajan juntas: revisar alimentación o MMPP, sin afirmar la causa', () => {
    const r = calcularRitmoVivo(entrada([maq('1', cae), maq('2', cae), maq('3', cae)], base), 'carros')!
    expect(r.senales[0]!.texto).toMatch(/Bajan las 3 a la vez/)
    expect(r.senales[0]!.texto).toMatch(/alimentación o la MMPP/)
    expect(r.senales[0]!.texto).toMatch(/no confirma/)
  })

  it('solo una baja: nombra esa máquina', () => {
    const r = calcularRitmoVivo(entrada([maq('1', sana), maq('2', sana), maq('3', cae)], base), 'carros')!
    expect(r.senales[0]!.texto).toMatch(/Solo baja Evisceradora 3/)
    expect(r.lineas.map((l) => l.baja)).toEqual([false, false, true])
  })

  it('llenado que cae con micros seguidas es señal temprana', () => {
    const e = entrada([maq('1', sana), maq('2', sana), maq('3', cae)], {
      stopMachines: ['1', '2', '3'],
      stopReasons: ['Micro Detencion'],
      stopEvents: [
        { r: 0, f: iso(10, 5), s: 3, m: 2 },
        { r: 0, f: iso(12, 5), s: 3, m: 2 },
      ],
    })
    const r = calcularRitmoVivo(e, 'carros')!
    expect(r.lineas[2]!.microsRecientes).toBe(2)
    expect(r.senales.some((s) => /2 micro detenciones en 7 min/.test(s.texto) && /Señal temprana/.test(s.texto))).toBe(true)
  })
})

describe('tarjeta completa', () => {
  it('«Ahora» es el último minuto cerrado de la línea y el esperado es la suma de las máquinas', () => {
    const r = calcularRitmoVivo(entrada([maq('1', planas(15), 19), maq('2', planas(15), 16)], { stopEvents: [], stopMachines: ['1', '2'] }), 'carros')!
    expect(r.esperadoLinea).toBe(35)
    expect(r.ahora).toBe(30)
    expect(r.ahoraPct).toBe(86)
    expect(r.minutos).toHaveLength(14)
    expect(r.horaCurso).toBe('11:14')
  })

  it('las piezas del minuto en curso salen del acumulado menos la serie cerrada', () => {
    const e = entrada([maq('1', planas(15, 14)), maq('2', planas(14, 14))], { acumulado: { '1': 15 * 14 + 7, '2': 14 * 14 + 5 } })
    expect(calcularRitmoVivo(e, null)!.curso).toBe(12)
  })

  it('un parcial imposible no se dibuja', () => {
    const e = entrada([maq('1', planas(15))], { acumulado: { '1': 15 * 14 + 500 } })
    expect(calcularRitmoVivo(e, null)!.curso).toBeNull()
  })

  it('sin el esperado oficial de alguna máquina se calla', () => {
    expect(calcularRitmoVivo(entrada([{ ...maq('1', planas(15)), esperado: null }]), null)).toBeNull()
  })

  it('carros en la Baader 142 y silletas en la Baader 200, por modelo de máquina', () => {
    expect(unidadDeMaquinas([{ model: 'Baader 142', name: 'Evisceradora 1' }])).toBe('carros')
    expect(unidadDeMaquinas([{ model: 'Baader 200', name: 'B200' }])).toBe('silletas')
    expect(unidadDeMaquinas([{ model: '', name: 'Máquina X' }])).toBeNull()
  })
})

describe('la parada en curso: micro o detención lo dice Shoplogix', () => {
  const m = (razon: string | null, extra: Partial<MaquinaVivo> = {}): MaquinaVivo => ({
    id: '1', nombre: 'Evisceradora 1', status: 'detenida', razon, desdeMs: T0, programada: false, ...extra,
  })

  it('«Micro Detencion» es micro, sin mirar cuánto lleva: celeste aunque pase de 90 s', () => {
    const p = paradaEnCurso([m('Micro Detencion')])!
    expect(p.clase).toBe('micro')
    expect(p.faltaCausa).toBe(false)
  })

  it('el mismo estado con acentos distintos sigue siendo micro', () => {
    expect(paradaEnCurso([m('Micro Detención')])!.clase).toBe('micro')
    expect(paradaEnCurso([m('  micro detencion ')])!.clase).toBe('micro')
  })

  it('cuando Shoplogix la pasa a «Detencion» sin causa: detención y hay que anotar la causa', () => {
    const p = paradaEnCurso([m('Detencion')])!
    expect(p.clase).toBe('detencion')
    expect(p.faltaCausa).toBe(true)
    expect(p.causa).toBeNull()
  })

  it('con causa anotada es detención, pero ya no falta anotarla', () => {
    const p = paradaEnCurso([m('KNURO')])!
    expect(p.clase).toBe('detencion')
    expect(p.faltaCausa).toBe(false)
    expect(p.causa).toBe('KNURO')
  })

  it('una parada pactada no es alarma', () => {
    const p = paradaEnCurso([m('COLACION', { programada: true })])!
    expect(p.clase).toBe('programada')
    expect(p.faltaCausa).toBe(false)
  })

  it('con las tres paradas dice «La línea»; con una sola, su nombre', () => {
    const tres = ['1', '2', '3'].map((id) => m('Detencion', { id, nombre: `Evisceradora ${id}` }))
    expect(paradaEnCurso(tres)!.quien).toBe('La línea')
    const una = [tres[0]!, { ...tres[1]!, status: 'produciendo' as const }, { ...tres[2]!, status: 'produciendo' as const }]
    expect(paradaEnCurso(una)!.quien).toBe('Evisceradora 1')
  })

  it('manda la más grave: detención antes que micro', () => {
    const p = paradaEnCurso([m('Micro Detencion', { id: '1' }), m('Detencion', { id: '2', nombre: 'Evisceradora 2' }), m(null, { id: '3', status: 'produciendo' })])!
    expect(p.clase).toBe('detencion')
    expect(p.quien).toBe('Evisceradora 2 y 1 más')
  })

  it('sin máquinas detenidas no hay banda', () => {
    expect(paradaEnCurso([m(null, { status: 'produciendo' })])).toBeNull()
  })

  it('cronómetro mm:ss', () => {
    expect(cronometro(64)).toBe('1 min 04 s')
    expect(cronometro(795)).toBe('13 min 15 s')
    expect(cronometro(3725)).toBe('1 h 02 min')
    expect(cronometro(-3)).toBe('0 s')
  })
})
