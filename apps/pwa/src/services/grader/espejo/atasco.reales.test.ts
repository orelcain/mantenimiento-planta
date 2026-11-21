/**
 * Regla de atasco (aprobada el 21-11) sobre los 3 turnos reales, REPRODUCIDOS como los vería el monitor: cada
 * 5 min (el ciclo del lector) con las piezas leídas hasta ahí y la serie de las Baader con 3 min de atraso.
 */
import { describe, expect, it } from 'vitest'
import { evaluarAlertas, type AlertaGrader } from './alertasGrader'
import { cubetasDe, serieDesdeCubetas } from './espejoMinutos'
import { baaderEnEje, retrasoOReferencia } from './graderVivo'
import { TURNOS_REALES, baaderHasta, piezasHasta, turnoReal, type TurnoReal } from './__fixtures__/turnosReales'

/** Avisos de atasco distintos (por su hora de pico) que el monitor mostró en alguna lectura del turno. */
function reproducir(t: TurnoReal): Array<{ hora: string; pz: number; lecturas: number }> {
  const d = turnoReal(t)
  const fin = Date.parse(d.piezas[d.piezas.length - 1]!.ts) + 60_000
  const n = Math.ceil((fin - d.t0Ms) / 60_000) + 30
  const vistos = new Map<string, { hora: string; pz: number; lecturas: number }>()
  for (let ahora = d.t0Ms + 30 * 60_000; ahora <= fin + 15 * 60_000; ahora += 5 * 60_000) {
    const serie = serieDesdeCubetas(cubetasDe(piezasHasta(d, ahora)), d.t0Ms, n)
    const baader = baaderEnEje(baaderHasta(d, ahora), serie.t0Ms)
    const retraso = retrasoOReferencia(baader, serie.pz, serie.hastaMin)
    const alertas: AlertaGrader[] = evaluarAlertas({
      t0Ms: serie.t0Ms,
      grader: serie,
      baader,
      retrasoMin: retraso.min,
      hastaMin: serie.hastaMin,
      leidoHastaMin: Math.floor((ahora - serie.t0Ms) / 60_000),
      minutosSinLatido: 1,
      turnoEnCurso: true,
    })
    for (const a of alertas.filter((x) => x.regla === 'atasco')) {
      const hora = a.titulo.slice(0, 5)
      const pz = Number(a.titulo.match(/~([\d.]+)/)![1]!.replace('.', ''))
      const v = vistos.get(hora)
      if (v) { v.lecturas++; v.pz = Math.max(v.pz, pz) } else vistos.set(hora, { hora, pz, lecturas: 1 })
    }
  }
  return [...vistos.values()].sort((a, b) => a.hora.localeCompare(b.hora))
}

/** Une los avisos cuyo pico cae a ≤ 5 min uno de otro (el pico se corre a medida que llegan lecturas). */
function episodios(v: ReturnType<typeof reproducir>): string[] {
  const out: Array<{ hora: string; pz: number; min: number }> = []
  for (const x of v) {
    const [h, m] = x.hora.split(':').map(Number)
    const min = h! * 60 + m!
    const ult = out[out.length - 1]
    if (ult && Math.abs(min - ult.min) <= 5) { if (x.pz > ult.pz) { ult.pz = x.pz } ult.min = min; continue }
    out.push({ hora: x.hora, pz: x.pz, min })
  }
  return out.map((x) => `${x.hora}~${x.pz}`)
}

/**
 * Lo esperado (Hallazgos del mockup, 21-11): 19-11 12:57 y 14:06; 18-11 03:52; 17-11 10:39 y 14:26. Con la serie
 * REAL por minuto de las Baader (19-11 y 18-11) aparecen además dos que la serie de 5 min tapaba: 19-11 09:53 (el
 * grader en 10, 0 y 2 pz/min tres minutos con las Baader a ~49) y 18-11 03:39 (justo 80). El 02:06 del 18-11 que
 * daba la serie de 5 min ya no sale, y el arranque de las 00:03 (medianoche) queda fuera.
 */
const ESPERADO: Record<TurnoReal, Array<[string, string]>> = {
  '2026-11-19-turno_2': [['09:50', '09:58'], ['12:55', '13:01'], ['14:04', '14:10']],
  '2026-11-18-turno_1': [['03:37', '03:41'], ['03:50', '03:58']],
  '2026-11-17-turno_2': [['10:36', '10:42'], ['14:22', '14:30']],
}

describe('atasco entre las Baader y el grader, reproducido en los 3 turnos reales', () => {
  it.each(TURNOS_REALES)('%s: avisa en los atascos esperados y en ningún otro momento', (t) => {
    const ep = episodios(reproducir(t))
    const esperado = ESPERADO[t]
    expect(ep).toHaveLength(esperado.length)
    ep.forEach((e, i) => {
      const hora = e.slice(0, 5)
      const pz = Number(e.slice(6))
      const [a, b] = esperado[i]!
      expect(hora >= a && hora <= b, `${t} ${e} fuera de ${a}-${b}`).toBe(true)
      expect(pz).toBeGreaterThanOrEqual(80)
      expect(pz).toBeLessThanOrEqual(180)
    })
  })

  it('el aviso se ve en al menos una lectura de 5 min aunque el atasco dure 1 a 5 min', () => {
    for (const t of TURNOS_REALES) for (const v of reproducir(t)) expect(v.lecturas).toBeGreaterThanOrEqual(1)
    // El de las 14:06 del 19-11 dura un minuto sobre 80 con la serie de 5 min; con la real se ve en ≥ 2 lecturas.
    const v1406 = reproducir('2026-11-19-turno_2').filter((v) => v.hora >= '14:04' && v.hora <= '14:10')
    expect(v1406.reduce((s, v) => s + v.lecturas, 0)).toBeGreaterThanOrEqual(2)
  })
})
