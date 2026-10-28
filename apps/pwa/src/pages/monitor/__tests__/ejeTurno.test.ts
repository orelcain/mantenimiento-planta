/**
 * Tests del eje del turno: eje que crece, proyección (una sola fuente para «Al cierre», detenida = plana),
 * trazo que no retrocede, tonos de Shoplogix, paradas en el eje y carriles que caben y no se pisan.
 */
import { describe, expect, it } from 'vitest'
import type { GrupoDelTurno } from '@/services/shoplogix/monitorEventos'
import {
  CURVA_MIN, acumulado, disenar, escalaY, finDelEje, minutosVisibles, paradaEn, paradasEnEje, pasoMarcas, pctARitmo,
  proyeccion, sumaPorMinuto, tonoRitmo, trazoHastaLectura, valorEnCurva,
} from '../ejeTurno'

describe('eje que crece', () => {
  it('al principio asoma 90 min por delante del ahora', () => {
    expect(finDelEje(51, 450)).toBe(150)
    expect(finDelEje(0, 450)).toBe(90)
  })
  it('más adelante asoma la mitad de lo transcurrido', () => {
    expect(finDelEje(240, 450)).toBe(360)
    expect(finDelEje(200, 450)).toBe(300)
  })
  it('nunca pasa del fin del turno y desde los 300 min (5 h) ya se ve entero', () => {
    expect(finDelEje(400, 450)).toBe(450)
    expect(finDelEje(450, 450)).toBe(450)
    expect(finDelEje(180, 450)).toBe(270)
    expect(finDelEje(300, 450)).toBe(450)
  })
  it('crece de a pasos de 15 min, no minuto a minuto', () => {
    expect(finDelEje(51, 450)).toBe(finDelEje(54, 450))
    expect(finDelEje(61, 450)).toBe(finDelEje(51, 450) + 15)
    for (const n of [7, 51, 133, 299]) expect(finDelEje(n, 450) % 15).toBe(0)
  })
  it('marcas cada 30 min en eje corto y cada hora en el largo', () => {
    expect(pasoMarcas(150)).toBe(30)
    expect(pasoMarcas(450)).toBe(60)
  })
  it('la escala Y es redonda y deja aire sobre el tope', () => {
    expect(escalaY(2546)).toEqual({ paso: 1000, max: 3000 })
    expect(escalaY(14543)).toEqual({ paso: 5000, max: 20000 })
    expect(escalaY(9000)).toEqual({ paso: 2000, max: 10000 })
  })
})

describe('trazo de la curva', () => {
  it('acumula minuto a minuto desde cero', () => {
    expect(acumulado([10, 5, 0, 7])).toEqual([0, 10, 15, 15, 22])
  })
  it('termina en la recta real anterior → última y no retrocede', () => {
    const acum = acumulado([10, 20, 30, 40, 50])
    const t = trazoHastaLectura(acum, { min: 3.6, v: 62 }, { min: 4.6, v: 112 })
    expect(t[t.length - 1]).toEqual({ min: 4.6, v: 112 })
    expect(t[t.length - 2]).toEqual({ min: 3.6, v: 62 })
    for (let i = 1; i < t.length; i++) expect(t[i]!.v).toBeGreaterThanOrEqual(t[i - 1]!.v)
    expect(t.slice(0, -2).every((p) => p.min < 3.6)).toBe(true)
  })
  it('sin lectura anterior, el trazo llega directo a la última', () => {
    const t = trazoHastaLectura(acumulado([10, 20, 30]), null, { min: 2.5, v: 45 })
    expect(t[t.length - 1]).toEqual({ min: 2.5, v: 45 })
    expect(t.every((p) => p.v <= 45)).toBe(true)
  })
  it('interpola la curva y devuelve null fuera de rango', () => {
    const ps = [{ min: 0, v: 0 }, { min: 10, v: 100 }]
    expect(valorEnCurva(ps, 5)).toBe(50)
    expect(valorEnCurva(ps, 11)).toBeNull()
    expect(valorEnCurva([], 1)).toBeNull()
  })
})

describe('proyección punteada', () => {
  const punta = { min: 51, v: 1929 }
  it('con el turno entero a la vista termina EXACTO en «Al cierre» (una sola fuente)', () => {
    const p = proyeccion({ punta, finEje: 450, totalMin: 450, cierre: 14543, detenida: false })!
    expect(p.alCierre).toBe(true)
    expect(p.hasta).toEqual({ min: 450, v: 14543 })
    expect(p.aplanada).toBe(false)
  })
  it('con el eje corto, sigue la misma recta hacia el cierre y se corta en el borde', () => {
    const p = proyeccion({ punta, finEje: 141, totalMin: 450, cierre: 14543, detenida: false })!
    expect(p.alCierre).toBe(false)
    const esperado = 1929 + ((14543 - 1929) * (141 - 51)) / (450 - 51)
    expect(p.hasta.v).toBeCloseTo(esperado, 6)
  })
  it('detenida: se aplana al valor actual y no sube', () => {
    const p = proyeccion({ punta, finEje: 450, totalMin: 450, cierre: 14543, detenida: true })!
    expect(p.aplanada).toBe(true)
    expect(p.hasta.v).toBe(1929)
  })
  it('sin cifra de cierre no se inventa una pendiente', () => {
    expect(proyeccion({ punta, finEje: 450, totalMin: 450, cierre: null, detenida: false })).toBeNull()
  })
  it('nunca queda por debajo de la punta aunque el cierre calculado sea menor', () => {
    const p = proyeccion({ punta, finEje: 450, totalMin: 450, cierre: 1500, detenida: false })!
    expect(p.hasta.v).toBeGreaterThanOrEqual(punta.v)
  })
  it('sin eje por delante no hay proyección', () => {
    expect(proyeccion({ punta, finEje: 51, totalMin: 450, cierre: 14543, detenida: false })).toBeNull()
  })
})

describe('minuto a minuto', () => {
  it('tonos de Shoplogix: 75 % bien, 50 % atento, debajo mal', () => {
    expect(tonoRitmo(39, 51)).toBe('bien')
    expect(tonoRitmo(38, 51)).toBe('atento')
    expect(tonoRitmo(25, 51)).toBe('mal')
    expect(tonoRitmo(null, 51)).toBe('sin')
    expect(tonoRitmo(0, null)).toBe('sin')
    expect(tonoRitmo(3, null)).toBe('bien')
  })
  it('% a ritmo cuenta solo los minutos con dato', () => {
    expect(pctARitmo([20, 20, 5, 12], 20)).toBe(50)
    expect(pctARitmo([null, 20], 20)).toBe(100)
    expect(pctARitmo([], 20)).toBeNull()
    expect(pctARitmo([5], null)).toBeNull()
  })
  it('suma la línea y recorta la cola en cero solo con el turno cerrado', () => {
    const m = [{ cycles: [5, 5, 0, 0] }, { cycles: [5, 0, 0, 0] }]
    expect(sumaPorMinuto(m, 4)).toEqual([10, 5, 0, 0])
    expect(minutosVisibles(m, false)).toBe(4)
    expect(minutosVisibles(m, true)).toBe(2)
    expect(minutosVisibles([], true)).toBe(0)
  })
})

describe('paradas en el eje', () => {
  const grupos: GrupoDelTurno[] = [
    { dueno: 'mantencion', min: 5, piezas: 100, causas: [{ reason: 'Cintas', min: 5, count: 1, piezas: 100, categoria: null, extension: false, paradas: [{ hora: '22:10', hasta: '22:15', min: 5, desdeMin: 40, hastaMin: 45, maquina: 'Evisceradora 1' }] }] },
    { dueno: 'sin-imputar', min: 1, piezas: 10, causas: [{ reason: 'Micro Detencion', min: 1, count: 1, piezas: 10, categoria: null, extension: false, paradas: [{ hora: '21:40', hasta: '21:41', min: 1, desdeMin: 10, hastaMin: 11 }, { hora: '--', hasta: '--', min: 1, desdeMin: null, hastaMin: null }] }] },
  ]
  it('pasa de minutos-desde-el-primer-dato a minutos-desde-el-inicio-del-turno y ordena', () => {
    const ini = Date.UTC(2026, 9, 27, 21, 30)
    const t0 = ini + 5 * 60_000 // la primera pieza llegó 5 min después
    const ps = paradasEnEje(grupos, t0, ini)
    expect(ps.map((p) => p.desdeMin)).toEqual([15, 45])
    expect(ps[1]).toMatchObject({ dueno: 'mantencion', causa: 'Cintas', maquina: 'Evisceradora 1', hastaMin: 50 })
  })
  it('sin base de tiempo no inventa posiciones', () => {
    expect(paradasEnEje(grupos, null, 0)).toEqual([])
    expect(paradasEnEje(null, 1, 0)).toEqual([])
  })
  it('encuentra la parada que cubre un minuto', () => {
    const ps = [{ desdeMin: 10, hastaMin: 20, dueno: 'externo' as const, causa: 'A', maquina: null }]
    expect(paradaEn(ps, 15)?.causa).toBe('A')
    expect(paradaEn(ps, 25)).toBeNull()
  })
})

describe('diseño vertical', () => {
  for (const [w, h, compacto] of [[1352, 880, false], [910, 590, true], [910, 520, true]] as const) {
    it(`cabe y no se pisa en ${w}×${h}`, () => {
      const d = disenar(w, h, 3, compacto)
      expect(d.curva.h).toBeGreaterThanOrEqual(CURVA_MIN)
      expect(d.barras.y0).toBeGreaterThan(d.curva.y0 + d.curva.h)
      expect(d.carriles[0]!.y0).toBeGreaterThan(d.barras.y0 + d.barras.h)
      for (let i = 1; i < d.carriles.length; i++) expect(d.carriles[i]!.y0).toBeGreaterThanOrEqual(d.carriles[i - 1]!.y0 + d.carriles[i - 1]!.h)
      expect(d.paradas.y0).toBeGreaterThan(d.carriles[2]!.y0 + d.carriles[2]!.h)
      expect(d.ejeX).toBeLessThanOrEqual(h - 4)
      expect(d.plotW).toBeGreaterThan(300)
    })
  }
  it('compacto: carriles de 18 y margen de 150; amplio: 26 y 170', () => {
    expect(disenar(1000, 600, 3, true)).toMatchObject({ pr: 150, carriles: [{ h: 18 }, { h: 18 }, { h: 18 }] })
    expect(disenar(1400, 900, 3, false)).toMatchObject({ pr: 170, carriles: [{ h: 26 }, { h: 26 }, { h: 26 }] })
  })
})
