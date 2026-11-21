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
