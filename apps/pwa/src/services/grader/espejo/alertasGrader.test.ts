import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  UMBRALES_ALERTAS,
  evaluarAlertas,
  reglaGraderQuieto,
  reglaLectorCaido,
  reglaP0Alto,
  reglasPesoYCalibre,
  reglaAtasco,
  minutosAtasco,
  minutosCerrados,
  tramos15,
  type EntradaAlertas,
  type MinutosGrader,
} from './alertasGrader'

const T0 = Date.parse('2026-11-19T07:15:00.000Z')
const U = UMBRALES_ALERTAS

/** Grader parejo: `pz` piezas por minuto, 1,5 % a Gate 0, 4,1 kg cada una, todo 8-10 lb. */
function grader(n: number, pz = 36, opts: { kg?: number; calibre?: string; g0Cada?: number } = {}): MinutosGrader {
  const kg = opts.kg ?? 4.1
  const cal = opts.calibre ?? '8-10 lb'
  const g0 = Array.from({ length: n }, (_, i) => (opts.g0Cada && i % opts.g0Cada === 0 ? 1 : 0))
  return {
    pz: Array(n).fill(pz),
    g0,
    kgSalida: g0.map((g) => (pz - g) * kg),
    pzPeso: g0.map((g) => pz - g),
    calibre: g0.map((g) => ({ [cal]: pz - g })),
  }
}

function entrada(p: Partial<EntradaAlertas> & { grader: MinutosGrader }): EntradaAlertas {
  return {
    t0Ms: T0,
    baader: Array(p.grader.pz.length).fill(36),
    retrasoMin: 3,
    hastaMin: p.grader.pz.length,
    // Por omisión el lector leyó entero todo el eje.
    leidoHastaMin: p.hastaMin ?? p.grader.pz.length,
    minutosSinLatido: 2,
    turnoEnCurso: true,
    ...p,
  }
}

describe('el módulo de reglas se puede llevar a functions', () => {
  it('no importa nada (ni Firebase, ni React, ni alias @/)', () => {
    const src = readFileSync(path.join(__dirname, 'alertasGrader.ts'), 'utf8')
    expect(src).not.toMatch(/^\s*import\s/m)
    expect(src).not.toMatch(/require\(/)
  })
})

describe('regla 1: grader quieto con las Baader andando', () => {
  it('salta con 5 min sin piezas en el grader y las Baader contando en cada minuto', () => {
    const g = grader(100)
    for (let m = 95; m < 100; m++) g.pz[m] = 0
    const a = reglaGraderQuieto(entrada({ grader: g }), U)
    expect(a?.regla).toBe('grader-quieto')
    expect(a?.desdeMin).toBe(95)
    expect(a?.titulo).toBe('Grader sin piezas 5 min con las Baader andando')
    expect(a?.detalle).toContain('Desde las 08:50')
  })

  it('cuenta hacia atrás todo el hueco, no solo los 5 min', () => {
    const g = grader(100)
    for (let m = 88; m < 100; m++) g.pz[m] = 0
    expect(reglaGraderQuieto(entrada({ grader: g }), U)?.titulo).toContain('12 min')
  })

  it('con 4 min no salta', () => {
    const g = grader(100)
    for (let m = 96; m < 100; m++) g.pz[m] = 0
    expect(reglaGraderQuieto(entrada({ grader: g }), U)).toBeNull()
  })

  it('no salta si las Baader también pararon (detención aguas arriba)', () => {
    const g = grader(100)
    const b = Array(100).fill(36)
    for (let m = 90; m < 100; m++) { g.pz[m] = 0; b[m] = 0 }
    expect(reglaGraderQuieto(entrada({ grader: g, baader: b }), U)).toBeNull()
  })

  it('no salta en el borde de una detención: una Baader que se apaga deja minutos con 0 (caso real 19-11 09:58)', () => {
    // Real, minutos 160-168 del 19-11 T2 con Baader corrida 3: B 0,0,23,22,7,0,0,0,0 y grader 48,49,21,0,0,0,0,0,0.
    const g = grader(170)
    const b = Array(170).fill(36)
    const gv = [48, 49, 21, 0, 0, 0, 0, 0, 0, 0]
    const bv = [0, 0, 23, 22, 7, 0, 0, 0, 0, 0]
    for (let i = 0; i < 10; i++) { g.pz[160 + i] = gv[i]!; b[160 + i - 3] = bv[i]! }
    for (let h = 165; h <= 170; h++) expect(reglaGraderQuieto(entrada({ grader: g, baader: b, hastaMin: h }), U)).toBeNull()
  })

  it('aplica el retraso: el grader vacío 3 min DESPUÉS de que paran las Baader no es alerta', () => {
    const g = grader(100)
    const b = Array(100).fill(36)
    for (let m = 92; m < 100; m++) b[m] = 0 // Baader paran a los 92
    for (let m = 95; m < 100; m++) g.pz[m] = 0 // al grader le dejan de llegar a los 95
    expect(reglaGraderQuieto(entrada({ grader: g, baader: b }), U)).toBeNull()
  })

  it('con un retraso medido largo, el hueco del grader que sigue a una detención de las Baader no es alerta', () => {
    const g = grader(100)
    const b = Array(100).fill(36)
    for (let m = 80; m < 90; m++) b[m] = 0 // Baader paradas 10 min
    for (let m = 88; m < 98; m++) g.pz[m] = 0 // el hueco llega al grader 8 min después
    expect(reglaGraderQuieto(entrada({ grader: g, baader: b, retrasoMin: 8, hastaMin: 98 }), U)).toBeNull()
  })

  it('se evalúa hasta la última pieza leída: minutos aún no leídos no cuentan como «sin piezas»', () => {
    const g = grader(100)
    for (let m = 90; m < 100; m++) g.pz[m] = 0 // el lector aún no envía esos minutos
    expect(reglaGraderQuieto(entrada({ grader: g, hastaMin: 90 }), U)).toBeNull()
  })

  it('sin serie de las Baader no se acusa al grader', () => {
    const g = grader(100)
    for (let m = 90; m < 100; m++) g.pz[m] = 0
    expect(reglaGraderQuieto(entrada({ grader: g, baader: null }), U)).toBeNull()
  })
})

describe('corte por lectura (hallazgos de Codex)', () => {
  it('P1: grader detenido con el lector vivo SÍ alerta: la última pieza es de hace 15 min pero el lector leyó hasta ahora', () => {
    const g = grader(110)
    for (let m = 95; m < 110; m++) g.pz[m] = 0
    // `hastaMin` = minuto siguiente a la última pieza; el lector leyó entero hasta el 110.
    const a = reglaGraderQuieto(entrada({ grader: g, hastaMin: 95, leidoHastaMin: 110 }), U)
    expect(a?.titulo).toBe('Grader sin piezas 15 min con las Baader andando')
  })

  it('sin saber hasta dónde leyó el lector, el minuto de la última pieza no cuenta como cerrado', () => {
    expect(minutosCerrados({ hastaMin: 15, leidoHastaMin: null })).toBe(14)
    expect(minutosCerrados({ hastaMin: 15, leidoHastaMin: 20 })).toBe(20)
  })

  it('P2: con la última pieza a las 07:29:01, el cuarto 07:15-07:30 aún no está cerrado', () => {
    const g = grader(15, 0)
    for (let m = 0; m < 15; m++) g.pz[m] = 4 // 60 piezas
    g.g0[3] = 2
    g.g0[9] = 2 // 4/60 = 6,7 %
    expect(reglaP0Alto(entrada({ grader: g, hastaMin: 15, leidoHastaMin: null }), U)).toBeNull()
    expect(reglaP0Alto(entrada({ grader: g, hastaMin: 15, leidoHastaMin: 15 }), U)?.regla).toBe('p0-alto')
  })
})

describe('regla 2: P0 sobre 3,5 % sostenido 15 min', () => {
  it('tramos de 15 min alineados al cuarto de hora del reloj', () => {
    const t0 = Date.parse('2026-11-19T07:20:00.000Z')
    const ts = tramos15(t0, 41)
    expect(ts.map((t) => [t.desde, t.hasta, t.completo])).toEqual([[0, 10, true], [10, 25, true], [25, 40, true], [40, 41, false]])
  })

  it('salta con el último tramo completo sobre 3,5 % (caso real 10:30-10:45: 20 de 520)', () => {
    const g = grader(60, 0)
    // tramo 45-60 (08:00-08:15): 520 piezas, 20 a Gate 0
    for (let m = 45; m < 60; m++) g.pz[m] = m < 55 ? 35 : 34
    for (let m = 45; m < 65 - 45; m++) g.g0[m] = 0
    for (let i = 0; i < 20; i++) g.g0[45 + (i % 15)] = (g.g0[45 + (i % 15)] ?? 0) + 1
    const a = reglaP0Alto(entrada({ grader: g }), U)
    expect(a?.titulo).toBe('P0 3,8 % de 08:00 a 08:15')
    expect(a?.detalle).toContain('20 de 520 piezas')
  })

  it('justo en 3,5 % no salta (es «sobre»)', () => {
    const g = grader(60, 0)
    for (let m = 45; m < 60; m++) g.pz[m] = m < 50 ? 14 : 13 // 200
    for (let i = 0; i < 7; i++) g.g0[45 + i] = 1 // 7/200 = 3,5 %
    expect(reglaP0Alto(entrada({ grader: g }), U)).toBeNull()
  })

  it('con poca masa no salta (2 de 30 son 6,7 %, pero es ruido)', () => {
    const g = grader(60, 0)
    for (let m = 45; m < 60; m++) g.pz[m] = 2
    g.g0[46] = 1
    g.g0[47] = 1
    expect(reglaP0Alto(entrada({ grader: g }), U)).toBeNull()
  })

  it('el tramo en curso no cuenta: solo los 15 min completos', () => {
    const g = grader(52, 36)
    for (let m = 45; m < 52; m++) g.g0[m] = 10 // 08:00-08:07, tramo sin cerrar
    expect(reglaP0Alto(entrada({ grader: g }), U)).toBeNull()
  })
})

describe('regla 3: lector sin latido', () => {
  it('salta a los 20 min con el turno en curso', () => {
    const a = reglaLectorCaido(entrada({ grader: grader(100), minutosSinLatido: 20 }), U)
    expect(a?.titulo).toBe('Lector sin aviso hace 20 min')
    expect(a?.detalle).toContain('08:54')
  })
  it('a los 19 min no; con el turno cerrado no; sin latido nunca (nunca hubo lector) no', () => {
    expect(reglaLectorCaido(entrada({ grader: grader(100), minutosSinLatido: 19 }), U)).toBeNull()
    expect(reglaLectorCaido(entrada({ grader: grader(100), minutosSinLatido: 60, turnoEnCurso: false }), U)).toBeNull()
    expect(reglaLectorCaido(entrada({ grader: grader(100), minutosSinLatido: null }), U)).toBeNull()
  })
})

describe('regla 4: peso medio y calibre de la última hora frente al resto del turno', () => {
  it('peso 20 % más alto en la última hora salta', () => {
    const g = grader(180)
    for (let m = 120; m < 180; m++) g.kgSalida[m] = (g.pzPeso[m] ?? 0) * 4.92
    const a = reglasPesoYCalibre(entrada({ grader: g }), U)
    expect(a.map((x) => x.regla)).toEqual(['peso-fuera'])
    expect(a[0]?.titulo).toBe('Peso medio de la última hora 4,9 kg (+20 %)')
  })

  it('peso −1,8 % (caso real 19-11 a las 10:50) no salta', () => {
    const g = grader(180)
    for (let m = 120; m < 180; m++) g.kgSalida[m] = (g.pzPeso[m] ?? 0) * 4.0
    expect(reglasPesoYCalibre(entrada({ grader: g }), U)).toEqual([])
  })

  it('P5: justo en −15 % no salta (3,4 / 4 − 1 da −0,15000000000000002)', () => {
    const g = grader(180)
    for (let m = 0; m < 120; m++) g.kgSalida[m] = (g.pzPeso[m] ?? 0) * 4
    for (let m = 120; m < 180; m++) g.kgSalida[m] = (g.pzPeso[m] ?? 0) * 3.4
    expect(reglasPesoYCalibre(entrada({ grader: g }), U)).toEqual([])
  })

  it('peso a 14 % no salta y a 16 % sí (banda ± 15 %)', () => {
    const conDelta = (f: number) => {
      const g = grader(180)
      for (let m = 120; m < 180; m++) g.kgSalida[m] = (g.pzPeso[m] ?? 0) * 4.1 * f
      return reglasPesoYCalibre(entrada({ grader: g }), U).length
    }
    expect(conDelta(0.86)).toBe(0)
    expect(conDelta(0.84)).toBe(1)
  })

  it('calibre dominante que cambia con ventaja clara salta; un empate no', () => {
    const g = grader(180)
    for (let m = 120; m < 180; m++) g.calibre[m] = { '10-12 lb': 25, '8-10 lb': 11 }
    expect(reglasPesoYCalibre(entrada({ grader: g }), U).map((x) => x.regla)).toEqual(['calibre-salto'])
    for (let m = 120; m < 180; m++) g.calibre[m] = { '10-12 lb': 18.5, '8-10 lb': 17.5 }
    expect(reglasPesoYCalibre(entrada({ grader: g }), U)).toEqual([])
  })

  it('el calibre de Gate 0 no está en la entrada: un rechazo «0-2 lb» no puede volverse dominante', () => {
    // La serie trae `calibre` solo de la salida (espejoMinutos lo garantiza); aquí se comprueba que la regla no lo inventa.
    const g = grader(180, 36, { g0Cada: 1 })
    expect(reglasPesoYCalibre(entrada({ grader: g }), U)).toEqual([])
  })

  it('sin una hora completa ni masa suficiente, nada', () => {
    expect(reglasPesoYCalibre(entrada({ grader: grader(60) }), U)).toEqual([])
    expect(reglasPesoYCalibre(entrada({ grader: grader(180, 2) }), U)).toEqual([])
  })
})

describe('evaluarAlertas', () => {
  it('un turno parejo no tiene alertas', () => {
    expect(evaluarAlertas(entrada({ grader: grader(300, 36, { g0Cada: 2 }) }))).toEqual([])
  })
  it('ordena las de nivel «mal» antes que las de «atento»', () => {
    const g = grader(180)
    for (let m = 120; m < 180; m++) g.kgSalida[m] = (g.pzPeso[m] ?? 0) * 6
    for (let m = 175; m < 180; m++) g.pz[m] = 0
    const a = evaluarAlertas(entrada({ grader: g }))
    expect(a.map((x) => x.nivel)).toEqual(['mal', 'atento'])
  })
  it('respeta umbrales pasados por la pantalla', () => {
    const g = grader(60, 0)
    for (let m = 45; m < 60; m++) g.pz[m] = 20
    for (let m = 45; m < 51; m++) g.g0[m] = 1 // 6/300 = 2 %
    expect(evaluarAlertas(entrada({ grader: g }))).toEqual([])
    expect(evaluarAlertas(entrada({ grader: g, umbrales: { p0CriticoPct: 1.5 } })).map((x) => x.regla)).toEqual(['p0-alto'])
  })
})

describe('regla 5: atasco entre las Baader y el grader', () => {
  /** 120 min parejos a 40 pz/min; el grader baja a `pzAtasco` en [desde, desde + dura). */
  function conAtasco(desde: number, dura: number, pzAtasco = 0, n = 120) {
    const g = grader(n, 40)
    for (let m = desde; m < desde + dura; m++) g.pz[m] = pzAtasco
    return g
  }
  const conBaader = (n: number, pz = 40) => Array(n).fill(pz) as number[]

  it('salta con ≥ 80 piezas acumuladas en 10 min y lo dice «ahora»', () => {
    const g = conAtasco(117, 3) // 3 min a 0 con 40 pz/min corridos = 120 acumuladas
    const a = reglaAtasco(entrada({ grader: g, baader: conBaader(120), retrasoMin: 0 }), U)
    expect(a?.regla).toBe('atasco')
    expect(a?.nivel).toBe('atento')
    expect(a?.titulo).toBe('09:14 · ~120 piezas acumuladas entre las Baader y el grader')
    expect(a?.detalle).toContain('las Baader entregaron 400 piezas y al grader llegaron 280')
    expect(a?.detalle).toContain('Sigue acumulándose')
  })

  it('con 75 piezas no salta', () => {
    const g = conAtasco(117, 3, 15) // (40 − 15) × 3 = 75
    expect(reglaAtasco(entrada({ grader: g, baader: conBaader(120), retrasoMin: 0 }), U)).toBeNull()
  })

  it('aplica el retraso: las Baader corridas son las que cuentan', () => {
    // Baader y grader paran el mismo minuto: sin retraso es una detención aguas arriba; con 3 min, las piezas que
    // salieron de las Baader antes de parar debían llegar al grader y no llegaron.
    const g = conAtasco(110, 3)
    const b = conBaader(120)
    for (let m = 110; m < 113; m++) b[m] = 0
    expect(reglaAtasco(entrada({ grader: g, baader: b, retrasoMin: 0 }), U)).toBeNull()
    expect(reglaAtasco(entrada({ grader: g, baader: b, retrasoMin: 3 }), U)?.regla).toBe('atasco')
  })

  it('mide contra la razón grader/Baader de la hora anterior (el grader cuenta más que las Baader)', () => {
    // El grader cuenta 10 % más (44 contra 40). Un bajón a 36 pz/min 10 min: el tránsito absoluto daría 40, la razón 80.
    const g = grader(120, 44)
    for (let m = 110; m < 120; m++) g.pz[m] = 36
    const e = entrada({ grader: g, baader: conBaader(120), retrasoMin: 0 })
    const ms = minutosAtasco(e, U, 119, 120)
    expect(ms[0]!.razon).toBeCloseTo(1.1, 5)
    expect(ms[0]!.acumulado).toBeCloseTo(80, 5) // 400 × 1,1 − 360
    expect(reglaAtasco(e, U)?.detalle).toContain('llevadas a la cuenta del grader')
  })

  it('exige las Baader andando: promedio de la ventana ≥ 20 pz/min', () => {
    const g = grader(120, 18)
    for (let m = 115; m < 120; m++) g.pz[m] = 0
    expect(reglaAtasco(entrada({ grader: g, baader: conBaader(120, 18), retrasoMin: 0 }), { ...U, atascoPz: 50 })).toBeNull()
  })

  it('un bajón de 2 min de las Baader dentro de la ventana no lo apaga (la serie real por minuto los trae)', () => {
    const g = conAtasco(116, 4)
    const b = conBaader(120)
    b[112] = 8
    b[113] = 9
    expect(reglaAtasco(entrada({ grader: g, baader: b, retrasoMin: 0 }), U)?.regla).toBe('atasco')
  })

  it('queda fuera durante los 15 min siguientes a un arranque de las Baader', () => {
    const b = conBaader(120)
    for (let m = 60; m < 90; m++) b[m] = 0 // colación
    const g = grader(120, 40)
    for (let m = 60; m < 96; m++) g.pz[m] = 0 // el grader parte 6 min después
    const e = (hasta: number) => entrada({ grader: { ...g, pz: g.pz.slice(0, hasta) }, baader: b.slice(0, hasta), retrasoMin: 0, hastaMin: hasta, leidoHastaMin: hasta })
    expect(reglaAtasco(e(97), U)).toBeNull()
    // Pasados los 15 min, un atasco nuevo sí avisa (la razón de esa hora todavía arrastra el arranque: 0,85).
    for (let m = 110; m < 115; m++) g.pz[m] = 0
    expect(reglaAtasco(e(116), U)?.regla).toBe('atasco')
  })

  it('el inicio del turno cuenta como arranque', () => {
    const g = grader(30, 40)
    for (let m = 0; m < 6; m++) g.pz[m] = 0
    expect(reglaAtasco(entrada({ grader: g, baader: conBaader(30), retrasoMin: 0 }), U)).toBeNull()
  })

  it('sigue a la vista 15 min después de drenar, con la hora en que dejó de crecer', () => {
    const g = conAtasco(100, 3, 0, 110)
    for (let m = 103; m < 106; m++) g.pz[m] = 80 // drena
    const a = reglaAtasco(entrada({ grader: g, baader: conBaader(110), retrasoMin: 0 }), U)
    expect(a?.titulo.startsWith('08:57')).toBe(true)
    expect(a?.detalle).toContain('Dejó de crecer a las 08:59')
    // 16 min después del último minuto sobre 80 ya no se muestra.
    const g2 = conAtasco(90, 3, 0, 110)
    for (let m = 93; m < 96; m++) g2.pz[m] = 80
    expect(reglaAtasco(entrada({ grader: g2, baader: conBaader(110), retrasoMin: 0 }), U)).toBeNull()
  })

  it('un minuto de las Baader sin dato (NaN) no cumple', () => {
    const g = conAtasco(117, 3)
    const b = conBaader(120)
    b[115] = NaN
    expect(reglaAtasco(entrada({ grader: g, baader: b, retrasoMin: 0 }), U)).toBeNull()
  })

  it('sin la serie de las Baader, nada', () => {
    expect(reglaAtasco(entrada({ grader: conAtasco(117, 3), baader: null }), U)).toBeNull()
  })

  it('con el grader quieto ≥ 5 min avisa solo «grader quieto»', () => {
    const a = evaluarAlertas(entrada({ grader: conAtasco(113, 7), baader: conBaader(120), retrasoMin: 0 }))
    expect(a.map((x) => x.regla)).toEqual(['grader-quieto'])
  })
})
