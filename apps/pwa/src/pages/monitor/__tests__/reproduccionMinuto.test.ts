/**
 * Tests de la cola de reproducción (spec `docs/SPEC_MONITOR_EN_VIVO_COLA.md`, §1 y §2). Lo que no se puede romper:
 *   · todo minuto cerrado entra a la cola y se reproduce EN ORDEN, ninguno se salta (secuencias de llegada 0/2/2/0, 1/1/1, 3 seguidos);
 *   · desfase: arranca con 2 min en cola; velocidad ×1 hasta 186 s de atraso, ×1,12 y ×1,25 con rampas, sin escalones;
 *   · solo se salta con atraso > 8 min, otra serie, otra recarga o contador que baja;
 *   · cola vacía = reloj CONGELADO, sin inventar piezas; «atrasado» solo pasado un pulso (60 s); minuto en 0 = «detenida»;
 *   · al cierre de cada minuto cada Baader vale EXACTAMENTE Σ cycles y la línea la suma; nunca por encima del contador vivo;
 *   · reparto parejo dentro de los segundos andando, y las horas de planta no se mezclan con el UTC real.
 * Cada test nuevo se rompió a propósito una vez (ver «Rotura a propósito» al final del archivo).
 */
import { describe, expect, it } from 'vitest'
import { aWallClockMs } from '../contadorCrudo'
import {
  ATRASO_SALTO_S, COLA_INICIAL_MIN, GRACIA_ATRASADO_MS, MIN_MS, acumuladoHasta, armarEntradaRep, armarTope, atrasoS, avanzar, cuadroRep,
  desdeUltimaLectura, detenidaRep, factorVelocidad, finCola, horaDeWall, horaPlantaDeUtc, horarioPiezas, minutoEn, minutosCerrados,
  paradasPorMaquina, piezasEncendidas, posicion, proximoCambioMs, registrarSerie, repInicial, reproduciendo, segundosAndando,
  toparContadores, totalEnReposo, tramosAndando, type CuadroRep, type EntradaRep, type MaquinaRep, type Tope,
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


// ── La cola, minuto a minuto ─────────────────────────────────────────────────

const IDS = ['A', 'B', 'C']
const BASES = [12, 14, 16]
/** `n` minutos de producción de 3 Baader (12–20 pz por minuto cada una, ~45 la línea): determinista, sin azar. */
const seriesDe = (n: number): number[][] => BASES.map((b, k) => Array.from({ length: n }, (_, i) => b + ((i * 7 + k * 3) % 5)))
const entradaN = (n: number, ms = 0, extra: Partial<EntradaRep> = {}): EntradaRep =>
  entrada(seriesDe(n).map((c, k) => maq(IDS[k]!, c)), { pulsoAtMs: PULSO + ms, ...extra })
/** Σ de la línea en los minutos 0..j (j incluido) de la serie de `seriesDe`. */
const acumLinea = (j: number) => (j < 0 ? 0 : sum(seriesDe(j + 1).map((c) => sum(c))))
const PASO_MS = 250

interface Paso { ms: number; c: CuadroRep }

/**
 * Simula el reloj: arranca con `inicial` minutos cerrados y, cada 60 s, llega el pulso con `llegadas[p]` minutos más
 * (0 = el pulso no trajo nada). Muestrea cada 250 ms, como lo haría el reloj de pantalla. Devuelve lo que se vio.
 */
function simular(o: { inicial: number; llegadas: number[]; extraS?: number; limite?: Tope | null; entrada?: (n: number, ms: number) => EntradaRep }) {
  const arma = o.entrada ?? ((n: number, ms: number) => entradaN(n, ms))
  let largo = o.inicial
  let est = registrarSerie(repInicial(), arma(largo, 0), 0)
  const pasos: Paso[] = []
  const fin = (o.llegadas.length * 60 + (o.extraS ?? 0)) * 1000
  for (let ms = 0; ms <= fin; ms += PASO_MS) {
    if (ms > 0 && ms % MIN_MS === 0) {
      const n = o.llegadas[ms / MIN_MS - 1] ?? 0
      if (n > 0) { largo += n; est = registrarSerie(est, arma(largo, ms), ms) }
    }
    est = avanzar(est, ms)
    pasos.push({ ms, c: cuadroRep(est, o.limite ?? null, ms) })
  }
  return { pasos, est, largo }
}

/** Lo que tiene que cumplirse en CADA cuadro, pase lo que pase: línea = Σ Baader y nada baja ni salta más de una pieza. */
function revisaContinuidad(pasos: Paso[]) {
  for (let i = 1; i < pasos.length; i++) {
    const a = pasos[i - 1]!.c, b = pasos[i]!.c
    expect(b.total).toBe(sum(b.porMaquina.map((m) => m.valor)))
    expect(b.total).toBeGreaterThanOrEqual(a.total)
    b.porMaquina.forEach((m, k) => {
      expect(m.valor - a.porMaquina[k]!.valor).toBeGreaterThanOrEqual(0)
      expect(m.valor - a.porMaquina[k]!.valor).toBeLessThanOrEqual(1)
    })
    expect(b.minutoIdx - a.minutoIdx).toBeGreaterThanOrEqual(0)
    expect(b.minutoIdx - a.minutoIdx).toBeLessThanOrEqual(1)
  }
}

/** Al pasar de un minuto al siguiente, el contador de cada Baader vale EXACTAMENTE Σ cycles hasta ese minuto. */
function revisaCuadreAlCierre(pasos: Paso[]) {
  let cierres = 0
  for (let i = 1; i < pasos.length; i++) {
    const a = pasos[i - 1]!.c, b = pasos[i]!.c
    if (b.minutoIdx === a.minutoIdx + 1) {
      cierres++
      expect(b.total).toBe(acumLinea(a.minutoIdx))
      b.porMaquina.forEach((m, k) => expect(m.valor).toBe(acumuladoHasta(seriesDe(a.minutoIdx + 1)[k]!, a.minutoIdx)))
    }
  }
  return cierres
}

describe('la cola: llegadas a ráfagas, en orden y sin saltarse ningún minuto', () => {
  it('al cargar parte en el total del minuto «último cerrado − 2» con esos 2 en cola (desfase), sin animar el turno entero', () => {
    const s = registrarSerie(repInicial(), entradaN(120), 5000)
    expect(s.cerrados).toBe(120)
    expect(s.saltos).toBe(0)
    expect(atrasoS(s)).toBe(COLA_INICIAL_MIN * 60)
    const c = cuadroRep(s, null, 5000)
    expect(c.total).toBe(acumLinea(117))
    expect(c.minutoIdx).toBe(118)
    expect(c.estado).toBe('vivo')
    expect(c.factor).toBe(1)
    expect(c.animando).toBe(true)
  })

  it('una serie de un solo minuto: parte en el inicio del turno con ese minuto en cola', () => {
    const s = registrarSerie(repInicial(), entradaN(1), 0)
    expect(s.tMs).toBe(DESDE)
    expect(cuadroRep(s, null, 0).total).toBe(0)
    expect(cuadroRep(s, null, 60_000).total).toBe(acumLinea(0))
  })

  it('secuencia 0/2/2/0: los 2 minutos de golpe no caen enteros ni se salta ninguno; cada Baader sube de a una pieza', () => {
    const { pasos, est } = simular({ inicial: 8, llegadas: [0, 2, 2, 0, 1, 1, 0, 0] })
    revisaContinuidad(pasos)
    expect(est.saltos).toBe(0)
    /* todos los minutos pasan por el cabezal en orden: el índice recorre un rango sin huecos */
    const vistos = [...new Set(pasos.map((p) => p.c.minutoIdx))]
    expect(vistos).toEqual(Array.from({ length: vistos.length }, (_, i) => vistos[0]! + i))
    expect(revisaCuadreAlCierre(pasos)).toBeGreaterThanOrEqual(5)
    expect(pasos[pasos.length - 1]!.c.total).toBeGreaterThan(pasos[0]!.c.total)
  })

  it('secuencia 1/1/1: régimen parejo, factor ×1 todo el tiempo y estado «vivo»', () => {
    const { pasos, est } = simular({ inicial: 8, llegadas: [1, 1, 1, 1, 1, 1] })
    revisaContinuidad(pasos)
    expect(est.saltos).toBe(0)
    expect(pasos.every((p) => p.c.factor === 1 && p.c.estado === 'vivo')).toBe(true)
    expect(Math.max(...pasos.map((p) => p.c.atrasoS))).toBeLessThanOrEqual(120)
    expect(revisaCuadreAlCierre(pasos)).toBe(6)
  })

  it('3 minutos seguidos de golpe: «poniéndose al día» (×1,12 y luego ×1,25 si hace falta), sin saltar nada, y vuelve a ×1', () => {
    const { pasos, est } = simular({ inicial: 8, llegadas: [3, 3, 0, 0, 0, 0, 0, 0, 0, 0] })
    revisaContinuidad(pasos)
    expect(est.saltos).toBe(0)
    const pon = pasos.filter((p) => p.c.estado === 'poniendose')
    expect(pon.length).toBeGreaterThan(0)
    expect(Math.max(...pasos.map((p) => p.c.factor))).toBeGreaterThan(1.12)
    expect(Math.max(...pasos.map((p) => p.c.factor))).toBeLessThanOrEqual(1.25)
    /* mientras corre más rápido el atraso baja; y cuando llega a 186 s el factor vuelve a ×1 */
    const trasPico = pasos.slice(pasos.findIndex((p) => p.c.estado === 'poniendose'))
    const vueltaA1 = trasPico.find((p) => p.c.estado === 'vivo')
    expect(vueltaA1).toBeDefined()
    expect(vueltaA1!.c.atrasoS).toBeLessThanOrEqual(186)
    expect(vueltaA1!.c.factor).toBe(1)
    expect(revisaCuadreAlCierre(pasos)).toBeGreaterThanOrEqual(7)
  })

  it('el factor no tiene escalones: ×1 hasta 186 s, ×1,12 desde ~198 s, ×1,25 desde ~252 s, continuo y creciente', () => {
    expect(factorVelocidad(0)).toBe(1)
    expect(factorVelocidad(186)).toBe(1)
    expect(factorVelocidad(192)).toBeGreaterThan(1)
    expect(factorVelocidad(192)).toBeLessThan(1.12)
    expect(factorVelocidad(200)).toBeCloseTo(1.12, 10)
    expect(factorVelocidad(239)).toBeCloseTo(1.12, 10)
    expect(factorVelocidad(245)).toBeGreaterThan(1.12)
    expect(factorVelocidad(245)).toBeLessThan(1.25)
    expect(factorVelocidad(300)).toBe(1.25)
    expect(factorVelocidad(479)).toBe(1.25)
    let previo = factorVelocidad(0)
    for (let a = 0.5; a <= 500; a += 0.5) {
      const f = factorVelocidad(a)
      expect(f).toBeGreaterThanOrEqual(previo)
      expect(f - previo).toBeLessThan(0.02)
      previo = f
    }
  })

  it('hueco de 9 minutos sin pulsos: la cola se vacía y se congela; al volver, atraso > 8 min = salto al total «último − 2»', () => {
    const { pasos, est } = simular({ inicial: 5, llegadas: [0, 0, 0, 0, 0, 0, 0, 0, 0, 9], extraS: 30 })
    expect(est.saltos).toBe(1)
    expect(est.cerrados).toBe(14)
    const antes = pasos.filter((p) => p.ms >= 120_000 && p.ms < 600_000)
    expect(antes.every((p) => p.c.total === acumLinea(4))).toBe(true)
    const justo = pasos.find((p) => p.ms === 600_000)!
    expect(justo.c.total).toBe(acumLinea(11))
    expect(justo.c.atrasoS).toBe(COLA_INICIAL_MIN * 60)
    expect(540).toBeGreaterThan(ATRASO_SALTO_S)
  })

  it('un hueco de 5 minutos (atraso 300 s, menos de 8 min) NO salta: se pone al día a ×1,25', () => {
    const { pasos, est } = simular({ inicial: 5, llegadas: [0, 0, 0, 0, 5], extraS: 120 })
    expect(est.saltos).toBe(0)
    revisaContinuidad(pasos)
    const tras = pasos.filter((p) => p.ms >= 300_000 && p.ms <= 305_000)
    expect(Math.max(...tras.map((p) => p.c.factor))).toBe(1.25)
  })

  it('el contador baja (reconciliación de Shoplogix): salta, no anima hacia atrás', () => {
    const s0 = registrarSerie(repInicial(), entradaN(8), 0)
    const baja = entrada(seriesDe(9).map((c, k) => maq(IDS[k]!, c.map((v, i) => (i < 4 ? Math.floor(v / 2) : v)))), { pulsoAtMs: PULSO + 60_000 })
    const s1 = registrarSerie(s0, baja, 60_000)
    expect(s1.saltos).toBe(1)
    expect(s1.tMs).toBe(DESDE + 7 * MIN_MS)
    expect(atrasoS(s1)).toBe(120)
  })

  it('otro turno (cambia el inicio de la serie) o cambian las Baader: salta', () => {
    const s0 = registrarSerie(repInicial(), entradaN(8), 0)
    expect(registrarSerie(s0, entradaN(9, 60_000, { desdeMs: DESDE + 24 * 3_600_000 }), 60_000).saltos).toBe(1)
    const otras = entrada([maq('A', seriesDe(9)[0]!), maq('Z', seriesDe(9)[1]!)], { pulsoAtMs: PULSO + 60_000 })
    expect(registrarSerie(s0, otras, 60_000).saltos).toBe(1)
  })

  it('recarga a mitad de turno: estado nuevo con 200 minutos arranca como al cargar, no cuenta el turno entero', () => {
    const s = registrarSerie(repInicial(), entradaN(200), 123_456)
    expect(s.saltos).toBe(0)
    expect(cuadroRep(s, null, 123_456).total).toBe(acumLinea(197))
    /* a los 2 min de reloj ya reprodujo los 2 minutos en cola y quedó en el total cerrado */
    expect(cuadroRep(s, null, 123_456 + 120_000).total).toBe(acumLinea(199))
  })

  it('una lectura repetida (mismo minuto cerrado, otra hora de pulso) no reinicia ni mueve nada', () => {
    const e = entradaN(6)
    const s = registrarSerie(repInicial(), e, 1000)
    expect(registrarSerie(s, { ...e, pulsoAtMs: PULSO + 60_000 }, 61_000)).toBe(s)
    expect(registrarSerie(s, { ...e, pulsoAtMs: PULSO + 120_000 }, 121_000)).toBe(s)
  })

  it('la serie sin minutos cerrados no cambia nada', () => {
    const s = registrarSerie(repInicial(), entradaN(3), 1000)
    expect(registrarSerie(s, entrada([maq('A', [])]), 2000)).toBe(s)
    expect(registrarSerie(repInicial(), entrada([]), 2000).cerrados).toBe(0)
  })
})

describe('el reloj: congelado con la cola vacía, estados expuestos', () => {
  it('cola vacía = reloj congelado en el total de lo llegado, sin inventar piezas', () => {
    const { pasos } = simular({ inicial: 4, llegadas: [], extraS: 600 })
    const fin = pasos[pasos.length - 1]!.c
    expect(fin.total).toBe(acumLinea(3))
    expect(fin.animando).toBe(false)
    expect(fin.atrasoS).toBe(0)
    for (const p of pasos) expect(p.c.total).toBeLessThanOrEqual(acumLinea(3))
    const congelados = pasos.filter((p) => p.ms >= 130_000)
    expect(congelados.every((p) => p.c.total === acumLinea(3) && p.c.tMs === DESDE + 4 * MIN_MS)).toBe(true)
  })

  it('«atrasado» solo pasado un pulso entero (60 s) con la cola vacía; antes sigue «vivo»', () => {
    const { pasos } = simular({ inicial: 4, llegadas: [], extraS: 600 })
    /* con 4 min cargados parte 2 min atrás: la cola se vacía a los 120 s exactos */
    const en = (ms: number) => pasos.find((p) => p.ms === ms)!.c
    expect(en(119_750).estado).toBe('vivo')
    expect(en(150_000).estado).toBe('vivo')
    expect(en(179_750).estado).toBe('vivo')
    expect(en(180_000).estado).toBe('atrasado')
    expect(en(180_000).atrasada).toBe(true)
    expect(GRACIA_ATRASADO_MS).toBe(60_000)
  })

  it('si llega el minuto antes del pulso de gracia, nunca pasa por «atrasado»', () => {
    const { pasos } = simular({ inicial: 4, llegadas: [0, 0, 2, 0, 0] })
    expect(pasos.some((p) => p.c.estado === 'atrasado')).toBe(false)
  })

  it('al volver a llegar un minuto, el reloj reanuda desde donde quedó congelado (no salta ni retrocede)', () => {
    const { pasos } = simular({ inicial: 4, llegadas: [0, 0, 0, 0, 1, 0, 0] })
    const congelado = pasos.find((p) => p.ms === 299_750)!.c
    const despues = pasos.find((p) => p.ms === 300_000)!.c
    expect(congelado.estado).toBe('atrasado')
    expect(despues.total).toBe(congelado.total)
    expect(despues.estado).toBe('vivo')
    expect(despues.atrasoS).toBe(60)
  })

  it('el estado trae la hora de la última lectura: la del pulso REAL convertida a hora de planta', () => {
    const s = registrarSerie(repInicial(), entradaN(4), 0)
    expect(cuadroRep(s, null, 0).ultimaLecturaHHMM).toBe('00:56')
    expect(desdeUltimaLectura(s)).toBe('00:56')
    expect(desdeUltimaLectura(registrarSerie(repInicial(), entrada([maq('A', [10])], { pulsoAtMs: null }), 0))).toBe('00:51')
    expect(desdeUltimaLectura(repInicial())).toBeNull()
  })

  it('un minuto que llega con 0 piezas: «detenida», el reloj sigue corriendo y la cifra no sube', () => {
    const arma = (n: number, ms: number) => {
      const c = seriesDe(n).map((v) => v.map((x, i) => (i === 11 ? 0 : x)))
      return entrada(c.map((v, k) => maq(IDS[k]!, v)), { pulsoAtMs: PULSO + ms })
    }
    /* 12 minutos cargados: el reloj parte en el 10; el 11 llega con 0 piezas y el 12 vuelve a producir */
    const { pasos } = simular({ inicial: 12, llegadas: [1, 1, 1, 1, 1, 1], entrada: arma })
    const en11 = pasos.filter((p) => p.c.minutoIdx === 11)
    expect(en11.length).toBeGreaterThan(200)
    expect(en11.every((p) => p.c.estado === 'detenida')).toBe(true)
    expect(new Set(en11.map((p) => p.c.total)).size).toBe(1)
    expect(en11[en11.length - 1]!.c.tMs).toBeGreaterThan(en11[0]!.c.tMs + 55_000)
    const en10 = pasos.filter((p) => p.c.minutoIdx === 10)
    expect(en10.every((p) => p.c.estado === 'vivo')).toBe(true)
    expect(pasos.find((p) => p.c.minutoIdx === 12)!.c.estado).not.toBe('detenida')
  })

  it('«detenida» de la línea (para Camino a la meta) pide el minuto que corre y el anterior en 0', () => {
    const cero = entrada(IDS.map((id, k) => maq(id, seriesDe(8)[k]!.map((x, i) => (i === 4 || i === 5 ? 0 : x)))))
    const s = registrarSerie(repInicial(), cero, 0)
    expect(detenidaRep(s)).toBe(false)
    expect(detenidaRep({ ...s, tMs: DESDE + 4.5 * MIN_MS })).toBe(false)
    expect(detenidaRep({ ...s, tMs: DESDE + 5.5 * MIN_MS })).toBe(true)
    expect(detenidaRep({ ...s, tMs: DESDE + 6.5 * MIN_MS })).toBe(false)
  })

  it('el estado «poniéndose al día» expone el atraso en segundos y el factor', () => {
    const { pasos } = simular({ inicial: 8, llegadas: [3], extraS: 10 })
    const p = pasos.find((q) => q.ms === 60_000)!.c
    expect(p.atrasoS).toBe(60 + 180)
    expect(p.estado).toBe('poniendose')
    expect(p.factor).toBeGreaterThanOrEqual(1.12)
  })

  it('proximoCambioMs avisa cuánto falta para «atrasado» solo con la cola vacía', () => {
    const s = registrarSerie(repInicial(), entradaN(4), 0)
    expect(proximoCambioMs(s, 60_000)).toBeNull()
    expect(proximoCambioMs(s, 120_000)).toBe(60_000)
    expect(proximoCambioMs(s, 150_000)).toBe(30_000)
    expect(proximoCambioMs(s, 180_000)).toBeNull()
    expect(reproduciendo(s, 60_000)).toBe(true)
    expect(reproduciendo(s, 121_000)).toBe(false)
  })
})

describe('el cuadro: una sola cifra para toda la pantalla', () => {
  it('el total es la suma de las Baader en todo momento y al cerrar cada minuto cuadra exacto con la serie', () => {
    const { pasos } = simular({ inicial: 8, llegadas: [1, 2, 0, 1, 1, 0] })
    revisaContinuidad(pasos)
    expect(revisaCuadreAlCierre(pasos)).toBeGreaterThan(4)
  })

  it('totalPiso y totalFinal son los del minuto que corre, y el total nunca sale de [piso, final]', () => {
    const { pasos } = simular({ inicial: 8, llegadas: [1, 1, 1] })
    for (const { c } of pasos) {
      expect(c.total).toBeGreaterThanOrEqual(c.totalPiso)
      expect(c.total).toBeLessThanOrEqual(c.totalFinal)
      expect(c.totalPiso).toBe(acumLinea(c.minutoIdx - 1))
      expect(c.totalFinal).toBe(acumLinea(c.minutoIdx))
    }
  })

  it('hechas por Baader y total vienen del MISMO instante: tMs es inicio del minuto + frac', () => {
    const { pasos } = simular({ inicial: 8, llegadas: [1, 1] })
    for (const { c } of pasos) expect(c.tMs).toBeCloseTo(DESDE + (c.minutoIdx + c.frac) * MIN_MS, 3)
  })

  it('pedir el cuadro dos veces con el mismo instante da lo mismo (cualquier consumidor ve la misma cifra)', () => {
    const s = registrarSerie(repInicial(), entradaN(8), 0)
    expect(cuadroRep(s, null, 37_000)).toEqual(cuadroRep(s, null, 37_000))
    expect(cuadroRep(avanzar(s, 20_000), null, 37_000)).toEqual(cuadroRep(s, null, 37_000))
  })

  it('cada Baader trae su cadencia (s por pieza del último minuto cerrado) y su progreso dentro del minuto', () => {
    const s = registrarSerie(repInicial(), entradaN(10), 0)
    const c = cuadroRep(s, null, 30_000)
    const j = c.minutoIdx
    c.porMaquina.forEach((m, k) => {
      const piezas = seriesDe(10)[k]![j - 1]!
      expect(m.piezasMinutoCerrado).toBe(piezas)
      expect(m.cadenciaS).toBeCloseTo(60 / piezas, 10)
      expect(m.progreso).toBeCloseTo(c.frac, 10)
    })
    expect(c.frac).toBeCloseTo(0.5, 6)
  })

  it('una Baader en 0 en el minuto anterior: cadencia «—» (null); sin minuto cerrado antes, también', () => {
    const e = entrada([maq('A', [0, 12]), maq('B', [16, 15])])
    const s = registrarSerie(repInicial(), e, 0)
    expect(s.tMs).toBe(DESDE)
    expect(cuadroRep(s, null, 0).porMaquina.map((m) => m.cadenciaS)).toEqual([null, null])
    const c1 = cuadroRep(s, null, 90_000)
    expect(c1.porMaquina[0]!.cadenciaS).toBeNull()
    expect(c1.porMaquina[1]!.cadenciaS).toBeCloseTo(60 / 16, 10)
  })

  it('«reducir movimiento» no entra aquí: el conteo es dato y sigue pieza a pieza (la UI apaga solo el adorno)', () => {
    /* `cuadroRep` ni siquiera recibe la preferencia: el contador avanza igual con o sin ella */
    const { pasos } = simular({ inicial: 8, llegadas: [1, 1] })
    /* ~95 piezas en 2 min; el total sube de a 2 o 3 cuando dos Baader coinciden en el mismo cuadro de 250 ms */
    expect(new Set(pasos.map((p) => p.c.total)).size).toBeGreaterThan(40)
    revisaContinuidad(pasos)
  })
})

describe('nunca supera lo registrado', () => {
  it('el total jamás pasa del contador vivo y las Baader siguen sumando el total', () => {
    const limite = armarTope(acumLinea(6), null)
    const { pasos } = simular({ inicial: 8, llegadas: [1, 1, 1], limite })
    for (const { c } of pasos) {
      expect(c.total).toBeLessThanOrEqual(acumLinea(6))
      expect(c.total).toBe(sum(c.porMaquina.map((m) => m.valor)))
    }
    expect(pasos[pasos.length - 1]!.c.total).toBe(acumLinea(6))
  })

  it('cada Baader tampoco pasa de lo que registra su contador', () => {
    const limite = armarTope(null, { A: 35, B: 1000, C: 1000 })
    const { pasos } = simular({ inicial: 8, llegadas: [1, 1], limite })
    for (const { c } of pasos) expect(c.porMaquina[0]!.valor).toBeLessThanOrEqual(35)
    expect(pasos[pasos.length - 1]!.c.porMaquina[0]!.valor).toBe(35)
  })

  it('el exceso sobre el contador de la línea se descuenta de las Baader: total = Σ Baader aun topado', () => {
    expect(toparContadores(['A', 'B', 'C'], [50, 40, 30], armarTope(100, null))).toEqual([50, 40, 10])
    expect(toparContadores(['A', 'B', 'C'], [50, 40, 30], armarTope(70, null))).toEqual([50, 20, 0])
    expect(toparContadores(['A', 'B'], [50, 40], armarTope(null, { A: 10, B: 1000 }))).toEqual([10, 40])
    expect(toparContadores(['A', 'B'], [50, 40], null)).toEqual([50, 40])
  })

  it('con el contador por encima de lo reproducido no se toca nada: cuadra con la serie', () => {
    const s = registrarSerie(repInicial(), entradaN(8), 0)
    const c = cuadroRep(s, armarTope(99999, { A: 99999, B: 99999, C: 99999 }), 200_000)
    expect(c.total).toBe(acumLinea(7))
  })

  it('en reposo (cola vacía) la cifra es totalEnReposo: Σ de los minutos cerrados topada', () => {
    const e = entradaN(8)
    expect(totalEnReposo(e, null)).toBe(acumLinea(7))
    expect(totalEnReposo(e, armarTope(100, null))).toBe(100)
    expect(totalEnReposo(null, null)).toBeNull()
    const s = registrarSerie(repInicial(), e, 0)
    expect(cuadroRep(s, null, 500_000).total).toBe(totalEnReposo(e, null))
  })
})

describe('el reparto dentro del minuto, con paradas', () => {
  const paradaA = { A: [{ fMs: DESDE + 2 * MIN_MS + 20_000, s: 20 }] }

  it('una Baader que anduvo parte del minuto queda «parcial» y sus piezas caen solo en esos segundos', () => {
    const e = entrada([maq('A', [10, 12, 10])], { paradas: paradaA })
    const s = registrarSerie(repInicial(), e, 0)
    const m = minutoEn(s, 2)[0]!
    expect(m.estado).toBe('parcial')
    expect(m.segAndando).toBe(40)
    expect(m.horario).toEqual([2, 6, 10, 14, 18, 42, 46, 50, 54, 58])
  })

  it('a la mitad del tramo detenido el contador de esa Baader está quieto', () => {
    const e = entrada([maq('A', [10, 12, 10])], { paradas: paradaA })
    /* se coloca el cabezal al inicio de la serie para mirar el minuto 2 desde su segundo 0 */
    const s = { ...registrarSerie(repInicial(), e, 0), tMs: DESDE }
    const base = 22
    expect(cuadroRep(s, null, 2 * MIN_MS + 20_100).porMaquina[0]!.valor).toBe(base + 5)
    expect(cuadroRep(s, null, 2 * MIN_MS + 39_900).porMaquina[0]!.valor).toBe(base + 5)
    expect(cuadroRep(s, null, 3 * MIN_MS).porMaquina[0]!.valor).toBe(32)
  })

  it('una Baader en 0 queda quieta y «detenida»; las otras siguen contando', () => {
    const e = entrada([maq('A', [10, 12, 0]), maq('B', [16, 15, 16]), maq('C', [13, 14, 15])])
    const s = registrarSerie(repInicial(), e, 0)
    const fin = cuadroRep(s, null, 5 * MIN_MS)
    expect(minutoEn(s, 2)[0]).toMatchObject({ n: 0, horario: [], estado: 'detenida' })
    expect(fin.porMaquina[0]).toMatchObject({ valor: 22, encendidas: 0, estado: 'detenida' })
    expect(fin.porMaquina[1]!.valor).toBe(47)
    expect(fin.porMaquina[2]!.valor).toBe(42)
    expect(fin.total).toBe(22 + 47 + 42)
    expect(cuadroRep(s, null, 2 * MIN_MS + 30_000).porMaquina[0]!.valor).toBe(22)
  })
})

describe('Filete usa el mismo camino: una sola Baader 200 (silletas), esperado distinto', () => {
  it('una Baader 200 con la cola y las llegadas a ráfagas cuadra al ciclo, igual que Eviscerado', () => {
    const arma = (n: number, ms: number) => entrada([maq('B200', seriesDe(n)[0]!, { modelo: 'Baader 200', esperado: 18 })], { pulsoAtMs: PULSO + ms })
    const { pasos, est } = simular({ inicial: 10, llegadas: [0, 2, 1, 0, 2, 0, 0], entrada: arma })
    expect(est.saltos).toBe(0)
    let cierres = 0
    for (let i = 1; i < pasos.length; i++) {
      const a = pasos[i - 1]!.c, b = pasos[i]!.c
      expect(b.total).toBe(b.porMaquina[0]!.valor)
      expect(b.total - a.total).toBeGreaterThanOrEqual(0)
      expect(b.total - a.total).toBeLessThanOrEqual(1)
      if (b.minutoIdx === a.minutoIdx + 1) { cierres++; expect(b.total).toBe(sum(seriesDe(a.minutoIdx + 1)[0]!)) }
    }
    expect(cierres).toBeGreaterThanOrEqual(5)
    expect(minutoEn(est, 3)[0]!.modelo).toBe('Baader 200')
  })
})

describe('posición y bordes', () => {
  it('con la cola vacía el cabezal queda al final del último minuto (60 s) y nunca pasa del fin de la cola', () => {
    const s = avanzar(registrarSerie(repInicial(), entradaN(5), 0), 9_999_999)
    expect(s.tMs).toBe(finCola(s))
    expect(posicion(s)).toEqual({ j: 4, seg: 60 })
    expect(avanzar(s, 99_999_999)).toMatchObject({ tMs: finCola(s) })
  })

  it('el reloj no retrocede: pedir un instante anterior no mueve nada', () => {
    const s = avanzar(registrarSerie(repInicial(), entradaN(8), 0), 30_000)
    expect(avanzar(s, 10_000)).toBe(s)
    expect(cuadroRep(s, null, 10_000).tMs).toBe(s.tMs)
  })

  it('una pestaña dormida 3 min con 2 en cola: al volver, se vació y queda congelada en el total; sin saltos', () => {
    const s0 = registrarSerie(repInicial(), entradaN(8), 0)
    const c = cuadroRep(s0, null, 180_000)
    expect(c.total).toBe(acumLinea(7))
    expect(c.animando).toBe(false)
  })

  it('el estado recuerda el desfase aun con series cortas', () => {
    const s = registrarSerie(repInicial(), entradaN(2), 0)
    expect(s.tMs).toBe(DESDE)
    expect(atrasoS(s)).toBe(120)
    expect(minutosCerrados(entradaN(2))).toBe(2)
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

/*
 * Rotura a propósito (29-10-2026). Cada test nuevo se rompió UNA vez cambiando la regla que protege, y falló; después se restauró
 * el código. Mutación → tests que cayeron:
 *   M1  COLA_INICIAL_MIN = 0 (sin desfase al cargar)        → «al cargar parte en…», «un solo minuto», «recarga», «hueco de 9 min», «contador baja»,
 *                                                              MonitorV2 «detalle de Piezas», relojUnico «primer pintado» y «reducir movimiento» (24 en total)
 *   M2  factor sin rampas (escalón ×1,12 → ×1,25)             → «el factor no tiene escalones»
 *   M3  ATRASO_SALTO_S enorme (nunca salta)                   → «hueco de 9 minutos…»
 *   M4  el reloj pasa del fin de la cola (inventa piezas)     → «atrasado solo pasado un pulso», «reanuda desde donde quedó», «proximoCambioMs», «posición y bordes», hook «atrasado»
 *   M5  solo reproduce el último minuto (se salta los demás)  → «0/2/2/0», «1/1/1», «3 seguidos», «hueco de 5 minutos», «llega antes del pulso de gracia» (+7)
 *   M6  GRACIA_ATRASADO_MS = 0                                → «atrasado solo pasado un pulso», «antes de la gracia», «proximoCambioMs», hook «atrasado»
 *   M7  un minuto en 0 no marca «detenida»                    → «minuto con 0 piezas» (módulo y hook)
 *   M8  el exceso sobre el contador no se descuenta           → «jamás pasa del contador vivo», «el exceso… total = Σ Baader», «totalEnReposo», hook «contador vivo es el techo»
 *   M9  cadencia con el minuto que corre (no el anterior)     → «cadencia y progreso», «cadencia —», hook «lo que la UI necesita»
 *   M10 el contador que baja no salta                         → «el contador baja»
 *   M11 el total no se topa al contador vivo                  → «jamás pasa del contador vivo», hook «contador vivo es el techo»
 *   M12 otra serie no salta                                   → «otro turno o cambian las Baader»
 *   M13 el factor siempre ×1 (no se pone al día)              → «3 seguidos», «factor sin escalones», «hueco de 5 minutos», «poniéndose al día» (módulo y hook)
 *   M14 el hook sin temporizador de «atrasado»                → hook «con la cola vacía… atrasado (sin que llegue nada nuevo)»
 *   M15 el hook nunca avisa a React (versión fija)            → hook «arranca con 2 minutos…», «React se entera una vez por minuto»
 *   M16 CifraViva pinta el contador vivo en el 1.er frame     → relojUnico «CifraViva: el HTML inicial ya trae el valor del reloj»
 *   M17 PiezasBaader pinta el contador vivo en el 1.er frame  → relojUnico «PiezasBaader: el HTML inicial…»
 *   M18 Camino lee hechas + 1 (otro reloj)                    → relojUnico «total = Σ Baader = Camino = punta = Duelo = TV», cifrasDelCuadro (2)
 *   M19 el Modo TV lee el contador vivo                       → relojUnico «total = Σ Baader = … = TV», «primer pintado», «reducir movimiento»
 *   M20 el Duelo de celular dice otra cifra (+3)              → relojUnico «total = Σ Baader = … = Duelo (PC y celular)»
 *   M21 «Al cierre» sin el reloj (tween viejo)                → MonitorV2 «Al cierre = piezas del cuadro + lo que falta producir»
 *   M22 «Por máquina» del ampliado con cifra estática         → MonitorV2 «Por máquina… suman la cifra de Piezas del turno»
 *   M23 las barras no se limitan al minuto que corre          → GraficoRitmoVivo «las barras llegan solo hasta el minuto que corre» (+1)
 *   M24 sin barra del minuto en curso                         → GraficoRitmoVivo «el minuto que corre es su propia barra»
 * Hallazgo en la primera pasada: M16 y M17 NO rompían ningún test (la prueba leía el DOM después de que el efecto ya había escrito),
 * así que se agregó la prueba con `renderToString` (sin efectos) y volvieron a caer.
 */
