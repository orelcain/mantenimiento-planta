import { describe, expect, it } from 'vitest'
import { armarGraderVivo } from './graderVivoDatos'
import { cubetasDe } from '@/services/grader/espejo/espejoMinutos'
import { baaderHasta, piezasHasta, turnoReal } from '@/services/grader/espejo/__fixtures__/turnosReales'
import { MANUAL_CERO_PZ, cuentaDelTurno, manualPz, textoManual, tramosBarra } from './cuantoLlevamosDatos'

describe('cuentaDelTurno', () => {
  const s = { pz: [10, 10, 0, 0, 12], kgSalida: [40, 40, 0, 0, 48], hastaMin: 5 }
  it('resta solo lo leído y deja aparte las Baader de los minutos sin lectura', () => {
    const c = cuentaDelTurno(s, [9, 9, 11, 11, 10], 0, [false, false, true, true, false])
    expect(c).toEqual({ grader: 32, kg: 128, baaderLeido: 28, baaderSinLeer: 22 })
    expect(manualPz(c)).toBe(4)
  })
  it('corre las Baader el retraso de tránsito', () => {
    // Con 1 min de retraso, el grader del minuto m se compara con la Baader del m−1.
    const c = cuentaDelTurno(s, [7, 9, 11, 11, 10], 1)
    expect(c.baaderLeido).toBe(7 + 9 + 11 + 11)
  })
  it('sin serie de las Baader no inventa manual', () => {
    const c = cuentaDelTurno(s, null, 4)
    expect(c.baaderLeido).toBeNull()
    expect(textoManual(manualPz(c))).toBe('—')
  })
  it('NaN (antes de que arranque la serie) no suma', () => {
    expect(cuentaDelTurno(s, [NaN, 9, 0, 0, 10], 0).baaderLeido).toBe(19)
  })
})

describe('textoManual y tramosBarra', () => {
  it('≈ 0 bajo el umbral, signo y miles sobre él', () => {
    expect(textoManual(MANUAL_CERO_PZ - 1)).toBe('≈ 0')
    expect(textoManual(-(MANUAL_CERO_PZ - 1))).toBe('≈ 0')
    expect(textoManual(2454)).toBe('+2.454')
    expect(textoManual(-120)).toBe('−120')
  })
  it('la manual negativa no ocupa barra y los tramos suman 100', () => {
    const t = tramosBarra({ grader: 90, kg: 0, baaderLeido: 100, baaderSinLeer: 20 })
    expect(t.manual).toBe(0)
    expect(t.baader + t.sinLeer).toBeCloseTo(100)
  })
})

describe('18-11 T1 real a las 04:30, con el hueco del espejo 23:39 → 00:29', () => {
  it('las Baader sin leer quedan aparte y la manual sale ≈ 0', () => {
    const d = turnoReal('2026-11-18-turno_1')
    const ahora = Date.parse('2026-11-19T04:30:00Z')
    const piezas = piezasHasta(d, ahora).filter((p) => p.ts < '2026-11-18T23:39:26' || p.ts >= '2026-11-19T00:28:51')
    const v = armarGraderVivo({
      cubetas: cubetasDe(piezas), inicioMs: d.t0Ms, finMs: ahora + 60 * 60_000, baader: baaderHasta(d, ahora),
      paradas: [], minutosSinLatido: 1, turnoEnCurso: true, leidoHastaMs: ahora,
    })
    const c = cuentaDelTurno(v.serie, v.baader, v.retraso.min, v.sinLectura)
    // Mockup v4: 1.655 pz de las Baader en el hueco; manual neta ≈ 0. Tolerancia: los bordes del hueco son por minuto.
    expect(c.baaderSinLeer).toBeGreaterThan(1500)
    expect(c.baaderSinLeer).toBeLessThan(1800)
    expect(Math.abs(manualPz(c)!)).toBeLessThan(400)
    // Las 13 piezas de prueba de antes de las 21:29 (inicio Shoplogix) quedan fuera del eje.
    expect(c.grader).toBe(piezas.filter((p) => Date.parse(p.ts) >= d.t0Ms).reduce((a, p) => a + p.cantidad, 0))
    // Medido 23-11: grader 13.709 · Baader leído 13.540 · sin leer 1.748 · manual +169. El mockup decía 13.705 /
    // 13.705 / 1.655: allá las Baader iban sin el atraso de Shoplogix y con los bordes del hueco a mano (hallazgo).
    expect([c.grader, c.baaderLeido, c.baaderSinLeer]).toEqual([13709, 13540, 1748])
  })
})
