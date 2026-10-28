import { describe, expect, it } from 'vitest'
import {
  calcularRitmoVivo,
  cronometro,
  etiquetaMaquina,
  hayBandaParada,
  llenadoDe,
  maquinaQueBaja,
  paradaEnCurso,
  SEL_LINEA,
  segundosCubiertos,
  tendenciaDe,
  tonoDe,
  unidadDeMaquinas,
  vaciosTurnoDe,
  vistaDeSerie,
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
  it('detenida cuando los últimos 3 minutos son cero (antes decía «Estable · 0 → 0»)', () => {
    const t = tendenciaDe([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 51)!
    expect(t.dir).toBe('detenida')
    expect(t.ceros).toBe(14)
    expect(tendenciaDe([40, 38, 36, 30, 0, 0, 0], 51)!.dir).toBe('detenida')
  })
  it('dos minutos en cero todavía no es detenida', () => {
    expect(tendenciaDe([40, 40, 40, 40, 0, 0], 51)!.dir).not.toBe('detenida')
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

describe('la serie por máquina, con SU esperado', () => {
  const e = entrada([maq('1', planas(19), 19), maq('2', [...planas(16, 13), 8], 16), maq('3', planas(12), 16)], {
    stopEvents: [], stopMachines: ['1', '2', '3'],
    acumulado: { '1': 19 * 14 + 10, '2': 16 * 13 + 8 + 6, '3': 12 * 14 + 4 },
  })
  const r = calcularRitmoVivo(e, 'carros')!

  it('cada Baader trae su tira de 14 minutos cerrados, su esperado y su minuto en curso', () => {
    expect(r.porMaquina.map((m) => [m.id, m.esperado, m.minutos.length, m.curso])).toEqual([['1', 19, 14, 10], ['2', 16, 14, 6], ['3', 16, 14, 4]])
  })

  it('las series por máquina suman la de la línea, minuto a minuto', () => {
    r.minutos.forEach((m, i) => expect(r.porMaquina.reduce((a, x) => a + x.minutos[i]!.piezas, 0)).toBe(m.piezas))
    expect(r.curso).toBe(20)
  })

  it('el tono de cada minuto se juzga contra el esperado de ESA máquina, no el de la línea', () => {
    expect(r.porMaquina[2]!.minutos[0]!.tono).toBe('bien') // 12 de 16 = 75 %
    expect(r.porMaquina[1]!.minutos[13]!.tono).toBe('atento') // 8 de 16 = 50 %
    expect(r.minutos[13]!.tono).toBe('bien') // 19+8+12 = 39 de 51 = 76 %
  })

  it('vistaDeSerie: «línea» es la suma; una máquina, la suya con su esperado; un id que no existe vuelve a la línea', () => {
    const linea = vistaDeSerie(r, SEL_LINEA)
    expect([linea.esperado, linea.ahora, linea.ahoraPct]).toEqual([51, 39, 76])
    const ev2 = vistaDeSerie(r, '2')
    expect([ev2.nombre, ev2.esperado, ev2.ahora, ev2.ahoraPct, ev2.curso]).toEqual(['Evisceradora 2', 16, 8, 50, 6])
    expect(vistaDeSerie(r, 'nadie').sel).toBe(SEL_LINEA)
  })
})

describe('etiqueta corta de máquina', () => {
  it('sale del nombre real: «Evisceradora 2» es «Ev 2»', () => {
    expect(etiquetaMaquina('Evisceradora 2')).toBe('Ev 2')
    expect(etiquetaMaquina('  Evisceradora 3 ')).toBe('Ev 3')
    expect(etiquetaMaquina('fileteadora-1')).toBe('Fi 1')
  })
  it('un nombre que no es «palabra + número» va tal cual, acotado', () => {
    expect(etiquetaMaquina('Baader')).toBe('Baader')
    expect(etiquetaMaquina('Línea 1')).toBe('Línea 1')
    expect(etiquetaMaquina('Baader 2')).toBe('Baader 2')
    expect(etiquetaMaquina('Máquina de filete grande')).toBe('Máquina d…')
  })
})

describe('micro detenciones con su duración real', () => {
  const cae = [16, 16, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5]
  const e = entrada([maq('1', planas(15)), maq('2', cae)], {
    stopMachines: ['1', '2'],
    stopReasons: ['Micro Detencion', 'Detencion'],
    stopEvents: [
      { r: 0, f: iso(10, 5), s: 3, m: 1 },
      { r: 0, f: iso(12, 20), s: 41, m: 1 },
      { r: 1, f: iso(6, 0), s: 20, m: 1 }, // detención común: no es micro
      { r: 0, f: iso(4, 30), s: 7, m: 0 },
    ],
  })
  const { lineas } = llenadoDe(e, 0, 14)

  it('cada micro lleva su inicio y los segundos que publica Shoplogix, por máquina', () => {
    expect(lineas[1]!.microsDetalle.map((m) => [m.i, m.duracionS])).toEqual([[10, 3], [12, 41]])
    expect(lineas[0]!.microsDetalle.map((m) => [m.i, m.duracionS])).toEqual([[4, 7]])
    expect(lineas[1]!.microsDetalle[0]!.inicioMs).toBe(T0 + 10 * 60_000 + 5000)
  })

  it('las micros de otra razón no entran; `micros` marca todo minuto que toca (la de 41 s cruza al 13) y el detalle, el de su inicio', () => {
    expect(lineas[1]!.microsDetalle).toHaveLength(2)
    expect(lineas[1]!.micros).toEqual([10, 12, 13])
  })

  it('una micro que cae fuera de la tira no se cuenta; sin `m` no se sabe de qué máquina fue', () => {
    const fuera = entrada([maq('1', planas(15))], { stopMachines: ['1'], stopReasons: ['Micro Detencion'], stopEvents: [{ r: 0, f: iso(-30), s: 5, m: 0 }] })
    expect(llenadoDe(fuera, 0, 14).lineas[0]!.microsDetalle).toEqual([])
    const viejo = entrada([maq('1', planas(15))], { stopMachines: ['1'], stopReasons: ['Micro Detencion'], stopEvents: [{ r: 0, f: iso(3), s: 5 }] })
    expect(llenadoDe(viejo, 0, 14).lineas[0]!.microsDetalle).toEqual([])
  })
})

describe('la máquina que baja', () => {
  const cae = [16, 16, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5]
  const cae2 = [16, 16, 16, 16, 15, 14, 14, 13, 13, 12, 11, 11, 10, 10]
  const sana = planas(15)
  const base = { stopEvents: [], stopMachines: ['1', '2', '3'] }

  it('con una sola que baja, es esa', () => {
    const r = calcularRitmoVivo(entrada([maq('1', sana), maq('2', cae), maq('3', sana)], base), 'carros')!
    expect(maquinaQueBaja(r.lineas)?.id).toBe('2')
  })

  it('con dos que bajan, la de mayor caída', () => {
    const r = calcularRitmoVivo(entrada([maq('1', cae2), maq('2', cae), maq('3', sana)], base), 'carros')!
    expect(r.lineas[0]!.baja && r.lineas[1]!.baja).toBe(true)
    expect(maquinaQueBaja(r.lineas)?.id).toBe('2')
  })

  it('si ninguna baja, ninguna: no se resalta a nadie por inventar', () => {
    const r = calcularRitmoVivo(entrada([maq('1', sana), maq('2', sana), maq('3', sana)], base), 'carros')!
    expect(maquinaQueBaja(r.lineas)).toBeNull()
  })
})

describe('la parada en curso: micro o detención lo dice Shoplogix', () => {
  const m = (razon: string | null, extra: Partial<MaquinaVivo> = {}): MaquinaVivo => ({
    id: '1', nombre: 'Evisceradora 1', status: 'detenida', razon, desdeMs: T0, programada: false, ...extra,
  })

  it('hayBandaParada: es la misma regla que la banda (hay parada en curso y el turno no terminó): la franja no repite la causa que la banda ya dice', () => {
    expect(hayBandaParada([m('Detencion')])).toBe(true)
    expect(hayBandaParada([m('KNURO')])).toBe(true)
    expect(hayBandaParada([m('Detencion')], true)).toBe(false)
    expect(hayBandaParada([m(null, { status: 'produciendo', desdeMs: null })])).toBe(false)
    expect(hayBandaParada([])).toBe(false)
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

describe('carros vacíos del turno (estimación: velocidad seteada × tiempo andando − lo contado)', () => {
  /* Dos Baader de 16 y 20 por minuto. Minutos: 0 y 1 andando completos; 2 con Ev A parada 40 s (20 s andando < 30: no cuenta);
     3 con la LÍNEA entera en cero (no se distingue de una parada pactada); 4 con Ev B parada 15 s (45 s andando). */
  const A = maq('A', [14, 16, 0, 0, 12], 16)
  const B = maq('B', [18, 20, 5, 0, 15], 20)
  const paradas = {
    stopEvents: [
      { r: 0, f: iso(2, 20), s: 40, m: 0 },
      { r: 0, f: iso(4, 0), s: 15, m: 1 },
    ],
    stopReasons: ['Detencion'],
    stopMachines: ['A', 'B'],
    enCurso: [],
  }

  it('cuenta solo los minutos válidos: ≥ 30 s andando y la línea no entera en cero', () => {
    const v = vaciosTurnoDe({ desde: iso(0), maquinas: [A, B] }, 5, paradas)
    const [a, b] = v.maquinas
    /* A: minutos 0, 1 y 4 (el 2 anduvo 20 s, el 3 es línea en cero) → 16 + 16 + 16 = 48 pasaron; contó 14 + 16 + 12 = 42. */
    expect(a).toMatchObject({ id: 'A', pasaron: 48, conPieza: 42, vacios: 6 })
    expect(a!.pct).toBeCloseTo(87.5, 6)
    /* B: minutos 0, 1, 2 (andando todo el 2: la parada fue de A) y 4 (45 s): 20 + 20 + 20 + 15 = 75 pasaron; contó 18 + 20 + 5 + 15 = 58. */
    expect(b).toMatchObject({ id: 'B', pasaron: 75, conPieza: 58, vacios: 17 })
    expect(v.minutos).toBe(4)
  })

  it('la línea es la SUMA de sus Baader (ya redondeadas) y su % sale de esas sumas', () => {
    const v = vaciosTurnoDe({ desde: iso(0), maquinas: [A, B] }, 5, paradas)
    expect(v.linea.pasaron).toBe(48 + 75)
    expect(v.linea.conPieza).toBe(42 + 58)
    expect(v.linea.vacios).toBe(6 + 17)
    expect(v.linea.pct).toBeCloseTo((100 / 123) * 100, 6)
  })

  it('«vacíos» no baja de 0: una Baader que contó más de lo que daba su velocidad seteada no resta carros', () => {
    const rapida = maq('R', [20, 20], 16)
    const v = vaciosTurnoDe({ desde: iso(0), maquinas: [rapida] }, 2)
    expect(v.maquinas[0]).toMatchObject({ pasaron: 32, conPieza: 40, vacios: 0 })
    expect(v.maquinas[0]!.pct).toBe(100)
    expect(v.linea.vacios).toBe(0)
  })

  it('una Baader sin esperado no entra (no hay vara), y un minuto que su serie aún no tiene no es un cero', () => {
    const sin = maq('S', [10, 10], null)
    const corta = maq('C', [16], 16)
    const largaB = maq('B', [16, 16], 16)
    const v = vaciosTurnoDe({ desde: iso(0), maquinas: [sin, corta, largaB] }, 2)
    expect(v.maquinas.map((m) => m.id)).toEqual(['C', 'B'])
    expect(v.maquinas[0]).toMatchObject({ pasaron: 16, conPieza: 16, vacios: 0 })
    expect(v.maquinas[1]).toMatchObject({ pasaron: 32, conPieza: 32, vacios: 0 })
  })

  it('sin paradas por máquina se supone andando todo el minuto; sin minutos válidos no hay % (null, no 0)', () => {
    const v = vaciosTurnoDe({ desde: iso(0), maquinas: [maq('A', [8, 8], 16)] }, 2)
    expect(v.maquinas[0]).toMatchObject({ pasaron: 32, conPieza: 16, vacios: 16 })
    const nada = vaciosTurnoDe({ desde: iso(0), maquinas: [maq('A', [0, 0], 16)] }, 2)
    expect(nada.maquinas[0]).toMatchObject({ pasaron: 0, conPieza: 0, vacios: 0, pct: null })
    expect(nada.linea.pct).toBeNull()
    expect(nada.minutos).toBe(0)
  })

  it('referencia medida a las 10:12: cada Baader y la Línea cuadran a la vista (Σ = Línea)', () => {
    /* Un minuto con esperado = pasaron reproduce las cifras medidas sin fabricar una serie de 300 minutos. */
    const un = (id: string, pasaron: number, conto: number) => maq(id, [conto], pasaron)
    const ev = vaciosTurnoDe({ desde: iso(0), maquinas: [un('1', 2727, 2198), un('2', 2367, 1881), un('3', 2564, 2224)] }, 1)
    expect(ev.maquinas.map((m) => [m.pasaron, m.conPieza, m.vacios])).toEqual([[2727, 2198, 529], [2367, 1881, 486], [2564, 2224, 340]])
    expect(ev.maquinas[0]!.pct).toBeCloseTo(80.6, 1)
    expect(ev.linea).toMatchObject({ pasaron: 7658, conPieza: 6303, vacios: 1355 })
    expect(ev.linea.pct!).toBeCloseTo(82.3, 1)
    const fi = vaciosTurnoDe({ desde: iso(0), maquinas: [un('F', 2373, 1589)] }, 1)
    expect(fi.linea).toMatchObject({ pasaron: 2373, conPieza: 1589, vacios: 784 })
    expect(fi.linea.pct!).toBeCloseTo(67.0, 1)
  })

  it('una Baader que cuenta más de lo que su velocidad permite no compensa a las otras: la Línea suma los vacíos de cada una', () => {
    const v = vaciosTurnoDe({ desde: iso(0), maquinas: [maq('A', [20], 16), maq('B', [20], 32)] }, 1)
    expect(v.maquinas.map((m) => m.vacios)).toEqual([0, 12])
    expect(v.linea).toMatchObject({ pasaron: 48, conPieza: 40, vacios: 12 })
    expect(v.linea.pasaron - v.linea.conPieza).toBe(8)
  })

  it('con la parada en curso de una Baader, el minuto en que ya estaba detenida no entra', () => {
    const v = vaciosTurnoDe({ desde: iso(0), maquinas: [maq('A', [16, 16, 16], 16)] }, 3, { stopEvents: null, stopReasons: null, stopMachines: null, enCurso: [{ id: 'A', desdeMs: T0 + 2 * 60_000 }] })
    expect(v.maquinas[0]).toMatchObject({ pasaron: 32, conPieza: 32 })
  })
})
