/**
 * Tests de la reproducción del último minuto. Las reglas que no se pueden romper:
 * reparto parejo dentro de los segundos andando, cuadre exacto al cerrar cada minuto, avance por minuto cerrado (no por
 * lectura repetida), nunca por encima del contador vivo, congelado y aviso si la lectura se atrasa, salto (sin animar)
 * si el contador baja o hay un hueco, una Baader en 0 queda quieta, y las horas de planta no se mezclan con el UTC real.
 */
import { describe, expect, it } from 'vitest'
import { aWallClockMs } from '../contadorCrudo'
import { INTERVALO_DEFECTO_MS, TOPE_INTERVALO_MS } from '../relojDeDatos'
import {
  MIN_MS, acumuladoHasta, armarEntradaRep, armarTope, cuadroRep, desdeUltimaLectura, detenidaRep, fraccionRep, horaDeWall,
  horaPlantaDeUtc, horarioPiezas, paradasPorMaquina, piezasEncendidas, registrarSerie, repAtrasada, repInicial,
  reproduciendo, segundosAndando, tramosAndando, type EntradaRep, type MaquinaRep,
} from '../reproduccionMinuto'

/** Inicio de la serie en hora de planta (la Z es falsa a propósito: así viene en el doc). */
const DESDE = Date.parse('2026-10-28T00:50:00.000Z')
/** Un pulso real (UTC) de las 03:56:05 = 00:56:05 en la planta (UTC−3 en octubre). */
const PULSO = Date.parse('2026-10-28T03:56:05.000Z')

function maq(id: string, cycles: number[], extra: Partial<MaquinaRep> = {}): MaquinaRep {
  return { id, nombre: `Evisceradora ${id}`, modelo: 'Baader 142', esperado: 16, cycles, ...extra }
}
function entrada(maquinas: MaquinaRep[], extra: Partial<EntradaRep> = {}): EntradaRep {
  return { desdeMs: DESDE, maquinas, paradas: {}, pulsoAtMs: PULSO, ...extra }
}
const sum = (v: number[]) => v.reduce((a, b) => a + b, 0)

describe('tramos andando', () => {
  it('sin paradas, el minuto entero', () => {
    expect(tramosAndando([], DESDE)).toEqual([[0, 60]])
  })

  it('una parada en medio parte el minuto en dos', () => {
    const t = tramosAndando([{ fMs: DESDE + 20_000, s: 20 }], DESDE)
    expect(t).toEqual([[0, 20], [40, 60]])
    expect(segundosAndando(t)).toBe(40)
  })

  it('una parada que empezó antes y sigue después recorta solo el cruce', () => {
    expect(tramosAndando([{ fMs: DESDE - 30_000, s: 50 }], DESDE)).toEqual([[20, 60]])
    expect(tramosAndando([{ fMs: DESDE + 50_000, s: 600 }], DESDE)).toEqual([[0, 50]])
  })

  it('una parada fuera del minuto no cambia nada', () => {
    expect(tramosAndando([{ fMs: DESDE + 70_000, s: 10 }, { fMs: DESDE - 100_000, s: 30 }], DESDE)).toEqual([[0, 60]])
  })

  it('paradas solapadas no dejan tramos fantasma', () => {
    const t = tramosAndando([{ fMs: DESDE + 10_000, s: 20 }, { fMs: DESDE + 20_000, s: 20 }], DESDE)
    expect(t).toEqual([[0, 10], [40, 60]])
  })
})

describe('reparto de las piezas dentro del minuto', () => {
  it('cae en el segundo andando U·(j+0,5)/n: parejo y centrado', () => {
    expect(horarioPiezas(4, [[0, 60]])).toEqual([7.5, 22.5, 37.5, 52.5])
    expect(horarioPiezas(1, [[0, 60]])).toEqual([30])
  })

  it('salta los segundos detenida: ninguna pieza cae en la trama', () => {
    const tramos = tramosAndando([{ fMs: DESDE + 20_000, s: 20 }], DESDE)
    const h = horarioPiezas(10, tramos)
    expect(h).toEqual([2, 6, 10, 14, 18, 42, 46, 50, 54, 58])
    for (const t of h) expect(t < 20 || t > 40).toBe(true)
  })

  it('son crecientes, n exactas y siempre dentro del minuto', () => {
    for (const n of [1, 2, 7, 16, 19, 25]) {
      const h = horarioPiezas(n, tramosAndando([{ fMs: DESDE + 33_000, s: 9 }], DESDE))
      expect(h).toHaveLength(n)
      for (let i = 1; i < h.length; i++) expect(h[i]!).toBeGreaterThan(h[i - 1]!)
      expect(h[0]!).toBeGreaterThan(0)
      expect(h[h.length - 1]!).toBeLessThan(60)
    }
  })

  it('con n = 0 no hay piezas', () => {
    expect(horarioPiezas(0, [[0, 60]])).toEqual([])
  })

  it('con menos de 1 s andando y piezas, usa el minuto entero (no se pierde ninguna ni se amontonan en el 1er segundo)', () => {
    const h = horarioPiezas(4, [[10, 10.4]])
    expect(h).toEqual([7.5, 22.5, 37.5, 52.5])
  })

  it('piezasEncendidas cuenta las que cayeron hasta ese segundo (incluida la del borde)', () => {
    const h = [7.5, 22.5, 37.5, 52.5]
    expect([0, 7.4, 7.5, 30, 60].map((s) => piezasEncendidas(h, s))).toEqual([0, 0, 1, 2, 4])
  })
})

describe('paradas por Baader · el orden de stopEvents.m', () => {
  const ev = [
    { f: '2026-10-28T00:52:20.000Z', s: 20, m: 0 },
    { f: '2026-10-28T00:52:30.000Z', s: 5, m: 1 },
    { f: '2026-10-28T00:52:40.000Z', s: 5 },
    { f: '2026-10-28T00:52:41.000Z', s: 0, m: 0 },
    { f: '2026-10-28T00:52:42.000Z', s: 5, m: 9 },
  ]

  it('cruza por id con live.stopMachines, aunque venga en otro orden que live.machines', () => {
    const r = paradasPorMaquina(ev, ['B', 'A'], ['A', 'B'])
    expect(r.B).toEqual([{ fMs: Date.parse('2026-10-28T00:52:20.000Z'), s: 20 }])
    expect(r.A).toEqual([{ fMs: Date.parse('2026-10-28T00:52:30.000Z'), s: 5 }])
  })

  it('sin stopMachines (doc viejo) cae al orden de live.machines', () => {
    const r = paradasPorMaquina(ev, undefined, ['A', 'B'])
    expect(r.A!).toHaveLength(1)
    expect(r.A![0]!.s).toBe(20)
    expect(r.B![0]!.s).toBe(5)
  })

  it('descarta la parada sin máquina, de duración cero o de una máquina que no existe', () => {
    const r = paradasPorMaquina(ev, ['A', 'B'], ['A', 'B'])
    expect(r.A).toHaveLength(1)
    expect(r.B).toHaveLength(1)
    expect(paradasPorMaquina(undefined, undefined, ['A'])).toEqual({ A: [] })
  })
})

describe('relojes: hora de planta (Z falsa) contra UTC real', () => {
  it('el pulso real de las 03:56:05Z es 00:56 en la planta en octubre (UTC−3) y 23:56 del día anterior en julio (UTC−4)', () => {
    expect(horaPlantaDeUtc(Date.parse('2026-10-28T03:56:05.000Z'))).toBe('00:56')
    expect(horaPlantaDeUtc(Date.parse('2026-07-15T03:56:05.000Z'))).toBe('23:56')
  })

  it('el UTC real convertido cae en la misma base que serieMinuto.desde y stopEvents.f', () => {
    const wall = aWallClockMs('2026-10-28T03:56:05.000Z')!
    expect(wall).toBe(Date.parse('2026-10-28T00:56:05.000Z'))
    /* El minuto 00:53 de la serie (Z falsa) ya estaba cerrado a esa hora; en UTC crudo parecería futuro (03:53 ≠ 00:53). */
    const cierre = DESDE + 4 * MIN_MS
    expect(cierre).toBeLessThan(wall)
    expect(cierre).toBeGreaterThan(PULSO - 4 * 3_600_000)
    expect(horaDeWall(cierre)).toBe('00:54')
  })

  it('sin hora devuelve null', () => {
    expect(horaPlantaDeUtc(null)).toBeNull()
    expect(horaPlantaDeUtc(NaN)).toBeNull()
  })

  it('una parada (hora de planta) y un minuto de la serie (hora de planta) se cruzan sin convertir', () => {
    const dentro = tramosAndando([{ fMs: Date.parse('2026-10-28T00:52:10.000Z'), s: 10 }], DESDE + 2 * MIN_MS)
    expect(dentro).toEqual([[0, 10], [20, 60]])
    /* Si por error se tratara como UTC real y se restara el huso, la parada caería 3 h antes y no cruzaría. */
    const mal = tramosAndando([{ fMs: Date.parse('2026-10-28T00:52:10.000Z') - 3 * 3_600_000, s: 10 }], DESDE + 2 * MIN_MS)
    expect(mal).toEqual([[0, 60]])
  })
})

describe('registrar la serie y reproducir el minuto', () => {
  const A = [10, 12, 15, 14]
  const B = [16, 15, 16, 12]

  /** Estado tras ver la serie con `k` minutos cerrados, y luego llegar uno más a los 60 s. */
  function conMinutoNuevo(cerrados: number, dur = 60_000, extra: Partial<EntradaRep> = {}) {
    const e0 = entrada([maq('A', A.slice(0, cerrados)), maq('B', B.slice(0, cerrados))], extra)
    const s0 = registrarSerie(repInicial(), e0, 1000)
    const e1 = entrada([maq('A', A.slice(0, cerrados + 1)), maq('B', B.slice(0, cerrados + 1))], { ...extra, pulsoAtMs: PULSO + dur })
    return { s0, s1: registrarSerie(s0, e1, 1000 + dur), e1 }
  }

  it('la primera vista no se anima: cae entero (como la primera lectura del reloj de datos)', () => {
    const s = registrarSerie(repInicial(), entrada([maq('A', A), maq('B', B)]), 5000)
    expect(s.duracionMs).toBe(0)
    expect(fraccionRep(s, 5000, false)).toBe(1)
    const c = cuadroRep(s, null, 5000, false)
    expect(c.porMaquina.map((m) => m.valor)).toEqual([sum(A), sum(B)])
    expect(c.animando).toBe(false)
  })

  it('el minuto nuevo parte del total cerrado anterior y sube pieza a pieza', () => {
    const { s1 } = conMinutoNuevo(2)
    expect(s1.duracionMs).toBe(60_000)
    const t0 = s1.llegadaMs
    const c0 = cuadroRep(s1, null, t0, false)
    expect(c0.porMaquina.map((m) => m.valor)).toEqual([acumuladoHasta(A, 1), acumuladoHasta(B, 1)])
    expect(c0.animando).toBe(true)
    const medio = cuadroRep(s1, null, t0 + 30_000, false)
    expect(medio.porMaquina[0]!.valor).toBeGreaterThan(c0.porMaquina[0]!.valor)
    expect(medio.porMaquina[0]!.valor).toBeLessThan(acumuladoHasta(A, 2))
  })

  it('cada Baader cuenta de a una pieza: ningún cuadro salta más de 1 en la misma máquina', () => {
    const { s1 } = conMinutoNuevo(2)
    let previo = cuadroRep(s1, null, s1.llegadaMs, false).porMaquina.map((m) => m.valor)
    const subidas = [0, 0]
    for (let ms = 50; ms <= 60_000; ms += 50) {
      const v = cuadroRep(s1, null, s1.llegadaMs + ms, false).porMaquina.map((m) => m.valor)
      v.forEach((x, i) => {
        expect(x - previo[i]!).toBeGreaterThanOrEqual(0)
        expect(x - previo[i]!).toBeLessThanOrEqual(1)
        subidas[i]! += x - previo[i]!
      })
      previo = v
    }
    expect(subidas).toEqual([A[2], B[2]])
  })

  it('al cerrar el minuto cada Baader vale EXACTAMENTE Σ cycles y la línea es la suma (cuadra)', () => {
    for (let cerrados = 1; cerrados <= 3; cerrados++) {
      const { s1 } = conMinutoNuevo(cerrados)
      const c = cuadroRep(s1, null, s1.llegadaMs + 60_000, false)
      expect(c.porMaquina[0]!.valor).toBe(acumuladoHasta(A, cerrados))
      expect(c.porMaquina[1]!.valor).toBe(acumuladoHasta(B, cerrados))
      expect(c.total).toBe(acumuladoHasta(A, cerrados) + acumuladoHasta(B, cerrados))
      expect(c.totalFinal).toBe(c.total)
      expect(c.animando).toBe(false)
      /* y muy pasado el minuto sigue igual: ni una pieza de más */
      expect(cuadroRep(s1, null, s1.llegadaMs + 3_600_000, false).total).toBe(c.total)
    }
  })

  it('el total es la suma de las Baader en todo momento (un solo número)', () => {
    const { s1 } = conMinutoNuevo(2)
    for (let ms = 0; ms <= 60_000; ms += 1500) {
      const c = cuadroRep(s1, null, s1.llegadaMs + ms, false)
      expect(c.total).toBe(sum(c.porMaquina.map((m) => m.valor)))
    }
  })

  it('el minuto dura el intervalo medido entre llegadas, con tope de 90 s', () => {
    const { s1: a } = conMinutoNuevo(2, 75_000)
    expect(a.duracionMs).toBe(75_000)
    const { s1: b } = conMinutoNuevo(2, 150_000)
    expect(b.duracionMs).toBe(TOPE_INTERVALO_MS)
    /* con la mitad del intervalo corrido, la mitad de las piezas */
    const mitad = cuadroRep(a, null, a.llegadaMs + 37_500, false)
    expect(mitad.frac).toBeCloseTo(0.5, 10)
  })

  it('sin hora del pulso mide por la llegada; sin nada, el ritmo de sync de siempre', () => {
    const e0 = entrada([maq('A', A.slice(0, 2))], { pulsoAtMs: null })
    const s0 = registrarSerie(repInicial(), e0, 1000)
    const s1 = registrarSerie(s0, entrada([maq('A', A.slice(0, 3))], { pulsoAtMs: null }), 1000 + 70_000)
    expect(s1.duracionMs).toBe(70_000)
    const sInicial = registrarSerie(repInicial(), entrada([maq('A', A.slice(0, 2))], { pulsoAtMs: null }), 0)
    const s2 = registrarSerie(sInicial, entrada([maq('A', A.slice(0, 3))], { pulsoAtMs: null }), 5)
    expect(s2.duracionMs).toBe(INTERVALO_DEFECTO_MS)
  })

  it('con «reducir movimiento» el minuto cae entero al llegar, sin cuadro por cuadro', () => {
    const { s1 } = conMinutoNuevo(2)
    const c = cuadroRep(s1, null, s1.llegadaMs, true)
    expect(c.total).toBe(acumuladoHasta(A, 2) + acumuladoHasta(B, 2))
    expect(c.frac).toBe(1)
    expect(reproduciendo(s1, s1.llegadaMs, true)).toBe(false)
    expect(reproduciendo(s1, s1.llegadaMs + 10, false)).toBe(true)
  })
})

describe('avanza por minuto CERRADO, no por lectura', () => {
  it('una lectura repetida (mismo minuto cerrado, otra hora de pulso) no reinicia ni mueve nada', () => {
    const e = entrada([maq('A', [10, 12, 15])])
    const s = registrarSerie(repInicial(), e, 1000)
    expect(registrarSerie(s, { ...e, pulsoAtMs: PULSO + 60_000 }, 61_000)).toBe(s)
    expect(registrarSerie(s, { ...e, pulsoAtMs: PULSO + 120_000 }, 121_000)).toBe(s)
  })

  it('tras lecturas repetidas, el minuto nuevo dura lo medido (tope 90 s), no 0', () => {
    const e2 = entrada([maq('A', [10, 12])])
    const s0 = registrarSerie(repInicial(), e2, 1000)
    registrarSerie(s0, { ...e2, pulsoAtMs: PULSO + 60_000 }, 61_000)
    const s1 = registrarSerie(s0, entrada([maq('A', [10, 12, 15])], { pulsoAtMs: PULSO + 120_000 }), 121_000)
    expect(s1.duracionMs).toBe(TOPE_INTERVALO_MS)
    expect(s1.cerrados).toBe(3)
  })

  it('si llegan varios minutos de golpe, solo el último se reproduce y los anteriores saltan a su total', () => {
    const s0 = registrarSerie(repInicial(), entrada([maq('A', [10, 12])]), 1000)
    const s1 = registrarSerie(s0, entrada([maq('A', [10, 12, 15, 14])], { pulsoAtMs: PULSO + 120_000 }), 121_000)
    expect(s1.cerrados).toBe(4)
    expect(s1.piso).toEqual([10 + 12 + 15])
    expect(s1.minuto[0]!.n).toBe(14)
    expect(s1.duracionMs).toBeGreaterThan(0)
    expect(cuadroRep(s1, null, s1.llegadaMs, false).total).toBe(37)
    expect(cuadroRep(s1, null, s1.llegadaMs + 90_000, false).total).toBe(51)
  })

  it('el minuto que llega antes de que termine el anterior: lo que faltaba salta a su total, sin ráfaga', () => {
    const s0 = registrarSerie(repInicial(), entrada([maq('A', [10, 12])]), 1000)
    const s1 = registrarSerie(s0, entrada([maq('A', [10, 12, 15])], { pulsoAtMs: PULSO + 60_000 }), 61_000)
    const medio = cuadroRep(s1, null, 61_000 + 20_000, false).total
    expect(medio).toBeGreaterThan(22)
    const s2 = registrarSerie(s1, entrada([maq('A', [10, 12, 15, 14])], { pulsoAtMs: PULSO + 90_000 }), 61_000 + 30_000)
    /* arranca en el total CERRADO del minuto anterior (37), no en una mezcla */
    expect(cuadroRep(s2, null, s2.llegadaMs, false).total).toBe(37)
  })
})

describe('nunca supera lo registrado', () => {
  const e = entrada([maq('A', [10, 12, 15]), maq('B', [16, 15, 16])])
  const s0 = registrarSerie(repInicial(), entrada([maq('A', [10, 12]), maq('B', [16, 15])]), 1000)
  const s1 = registrarSerie(s0, { ...e, pulsoAtMs: PULSO + 60_000 }, 61_000)

  it('el total jamás pasa del contador vivo, ni durante ni después del minuto', () => {
    const tope = armarTope(80, null)
    for (let ms = 0; ms <= 120_000; ms += 1000) expect(cuadroRep(s1, tope, 61_000 + ms, false).total).toBeLessThanOrEqual(80)
    expect(cuadroRep(s1, tope, 61_000 + 90_000, false).total).toBe(80)
  })

  it('cada Baader tampoco pasa de lo que registra su contador', () => {
    const tope = armarTope(null, { A: 35, B: 1000 })
    const c = cuadroRep(s1, tope, 61_000 + 60_000, false)
    expect(c.porMaquina[0]!.valor).toBe(35)
    expect(c.porMaquina[1]!.valor).toBe(47)
  })

  it('con el contador por encima de lo reproducido, no se toca nada: cuadra con la serie', () => {
    const c = cuadroRep(s1, armarTope(9999, { A: 9999, B: 9999 }), 61_000 + 60_000, false)
    expect(c.total).toBe(37 + 47)
  })
})

describe('lectura atrasada', () => {
  const s = registrarSerie(registrarSerie(repInicial(), entrada([maq('A', [10, 12])]), 1000), entrada([maq('A', [10, 12, 15])], { pulsoAtMs: PULSO + 60_000 }), 61_000)

  it('se queda quieta en el total cerrado y no avisa hasta pasar 1,5 veces el intervalo', () => {
    const t = s.llegadaMs
    expect(repAtrasada(s, t + 60_000)).toBe(false)
    expect(repAtrasada(s, t + 89_000)).toBe(false)
    expect(repAtrasada(s, t + 91_000)).toBe(true)
    expect(cuadroRep(s, null, t + 300_000, false).total).toBe(37)
    expect(cuadroRep(s, null, t + 300_000, false).atrasada).toBe(true)
  })

  it('el aviso dice desde qué hora de planta: la del pulso REAL convertido, no el UTC crudo', () => {
    expect(desdeUltimaLectura(s)).toBe('00:57')
    expect(desdeUltimaLectura(registrarSerie(repInicial(), entrada([maq('A', [10])], { pulsoAtMs: null }), 0))).toBe('00:51')
  })

  it('antes de ver cualquier minuto no hay atraso que avisar', () => {
    expect(repAtrasada(repInicial(), 1e9)).toBe(false)
  })
})

describe('el contador baja, otra serie o un hueco: salta sin animar', () => {
  const e = entrada([maq('A', [10, 12, 15])])
  const s = registrarSerie(repInicial(), e, 1000)

  it('contador que baja (reconciliación de Shoplogix)', () => {
    const baja = registrarSerie(s, entrada([maq('A', [10, 9, 3, 4])], { pulsoAtMs: PULSO + 60_000 }), 61_000)
    expect(baja.duracionMs).toBe(0)
    expect(cuadroRep(baja, null, 61_000, false).total).toBe(26)
    expect(cuadroRep(baja, null, 61_000, false).animando).toBe(false)
  })

  it('otro turno (cambia el inicio de la serie)', () => {
    const otro = registrarSerie(s, entrada([maq('A', [5, 6, 7, 8])], { desdeMs: DESDE + 24 * 3_600_000, pulsoAtMs: PULSO + 60_000 }), 61_000)
    expect(otro.duracionMs).toBe(0)
    expect(cuadroRep(otro, null, 61_000, false).total).toBe(26)
  })

  it('cambian las Baader de la línea', () => {
    const otra = registrarSerie(s, entrada([maq('A', [10, 12, 15, 1]), maq('C', [1, 1, 1, 1])], { pulsoAtMs: PULSO + 60_000 }), 61_000)
    expect(otra.duracionMs).toBe(0)
  })

  it('hueco de más de 3 min de reloj entre llegadas (pestaña dormida)', () => {
    const hueco = registrarSerie(s, entrada([maq('A', [10, 12, 15, 14])], { pulsoAtMs: PULSO + 5 * MIN_MS }), 1000 + 5 * MIN_MS)
    expect(hueco.duracionMs).toBe(0)
    expect(cuadroRep(hueco, null, hueco.llegadaMs, false).total).toBe(51)
  })

  it('hueco de más de 3 minutos de serie', () => {
    const grande = registrarSerie(s, entrada([maq('A', [10, 12, 15, 1, 1, 1, 1])], { pulsoAtMs: PULSO + 90_000 }), 91_000)
    expect(grande.duracionMs).toBe(0)
  })

  it('la serie sin minutos cerrados no cambia nada', () => {
    expect(registrarSerie(s, entrada([maq('A', [])]), 2000)).toBe(s)
    expect(registrarSerie(repInicial(), entrada([]), 2000).cerrados).toBe(0)
  })
})

describe('una Baader en 0', () => {
  const base = entrada([maq('A', [10, 12, 0]), maq('B', [16, 15, 16]), maq('C', [13, 14, 15])])
  const s0 = registrarSerie(repInicial(), entrada([maq('A', [10, 12]), maq('B', [16, 15]), maq('C', [13, 14])]), 1000)
  const s1 = registrarSerie(s0, { ...base, pulsoAtMs: PULSO + 60_000 }, 61_000)

  it('queda quieta y «detenida»; las otras siguen contando', () => {
    const fin = cuadroRep(s1, null, 61_000 + 60_000, false)
    expect(s1.minuto[0]).toMatchObject({ n: 0, horario: [], estado: 'detenida' })
    expect(fin.porMaquina[0]).toMatchObject({ valor: 22, encendidas: 0, estado: 'detenida' })
    expect(fin.porMaquina[1]!.valor).toBe(47)
    expect(fin.porMaquina[2]!.valor).toBe(42)
    expect(fin.total).toBe(22 + 47 + 42)
    const medio = cuadroRep(s1, null, 61_000 + 30_000, false)
    expect(medio.porMaquina[0]!.valor).toBe(22)
  })

  it('un minuto en 0 de toda la línea: nada se mueve, y con dos seguidos la línea está detenida', () => {
    const cero = (n: number[]) => entrada([maq('A', n), maq('B', n)])
    const a = registrarSerie(repInicial(), cero([5, 6]), 0)
    const b = registrarSerie(a, { ...cero([5, 6, 0]), pulsoAtMs: PULSO + 60_000 }, 60_000)
    expect(detenidaRep(b)).toBe(false)
    expect(cuadroRep(b, null, 60_000 + 30_000, false).total).toBe(22)
    const c = registrarSerie(b, { ...cero([5, 6, 0, 0]), pulsoAtMs: PULSO + 120_000 }, 120_000)
    expect(detenidaRep(c)).toBe(true)
    expect(cuadroRep(c, null, 120_000 + 45_000, false).total).toBe(22)
  })

  it('una Baader que anduvo parte del minuto queda «parcial» y sus piezas caen solo en esos segundos', () => {
    const e = entrada([maq('A', [10, 12, 10])], { paradas: { A: [{ fMs: DESDE + 2 * MIN_MS + 20_000, s: 20 }] } })
    const s = registrarSerie(repInicial(), e, 0)
    expect(s.minuto[0]!.estado).toBe('parcial')
    expect(s.minuto[0]!.segAndando).toBe(40)
    expect(s.minuto[0]!.horario).toEqual([2, 6, 10, 14, 18, 42, 46, 50, 54, 58])
  })

  it('a la mitad del tramo detenido el contador está quieto', () => {
    const e0 = entrada([maq('A', [10, 12])], { paradas: { A: [{ fMs: DESDE + 2 * MIN_MS + 20_000, s: 20 }] } })
    const s0b = registrarSerie(repInicial(), e0, 0)
    const e1 = entrada([maq('A', [10, 12, 10])], { paradas: { A: [{ fMs: DESDE + 2 * MIN_MS + 20_000, s: 20 }] }, pulsoAtMs: PULSO + 60_000 })
    const s1b = registrarSerie(s0b, e1, 60_000)
    const en20 = cuadroRep(s1b, null, 60_000 + 20_100, false).porMaquina[0]!.valor
    const en39 = cuadroRep(s1b, null, 60_000 + 39_900, false).porMaquina[0]!.valor
    expect(en20).toBe(22 + 5)
    expect(en39).toBe(22 + 5)
  })
})

describe('armar la entrada desde el doc', () => {
  const serie = { desde: '2026-10-28T00:50:00.000Z', maquinas: [{ id: 'A', nombre: 'Línea 1', esperado: 20, cycles: [1, 2, 3] }] }

  it('lleva el modelo de cada máquina, las paradas por id y el pulso en ms', () => {
    const e = armarEntradaRep({
      serie, machines: [{ id: 'A', model: 'Baader 200' }],
      stopEvents: [{ f: '2026-10-28T00:52:00.000Z', s: 15, m: 0 }], stopMachines: ['A'], pulseAt: '2026-10-28T03:56:05.000Z',
    })!
    expect(e.maquinas[0]).toMatchObject({ id: 'A', modelo: 'Baader 200', esperado: 20 })
    expect(e.paradas.A).toEqual([{ fMs: Date.parse('2026-10-28T00:52:00.000Z'), s: 15 }])
    expect(e.pulsoAtMs).toBe(PULSO)
  })

  it('sin serie, sin Baader o sin minutos cerrados no hay reproducción', () => {
    expect(armarEntradaRep({ serie: null, machines: [] })).toBeNull()
    expect(armarEntradaRep({ serie: { desde: serie.desde, maquinas: [] }, machines: [] })).toBeNull()
    expect(armarEntradaRep({ serie: { desde: serie.desde, maquinas: [{ ...serie.maquinas[0]!, cycles: [] }] }, machines: [] })).toBeNull()
    expect(armarEntradaRep({ serie: { ...serie, desde: 'no es fecha' }, machines: [] })).toBeNull()
  })
})
