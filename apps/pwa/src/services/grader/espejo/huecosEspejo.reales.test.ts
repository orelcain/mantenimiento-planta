/**
 * Huecos del espejo (22-11): el 18-11 Turno 1 el espejo no trajo piezas de 23:39:25 a 00:28:51 mientras las Baader
 * seguían a ~40 pz/min y Puerta 0 registraba piezas. En producción eso dio un atasco falso a las 23:51 (~410 pz) y
 * una «línea manual» de −771 (23 h) y −893 (00 h). Se reproduce con el turno real (Pieza pieza del Excel, completo)
 * quitándole justo las piezas que el espejo no leyó, por el mismo camino que la pantalla (`armarGraderVivo`).
 */
import { describe, expect, it } from 'vitest'
import { armarGraderVivo } from '@/pages/monitor/graderVivoDatos'
import { cubetasDe } from './espejoMinutos'
import { TURNOS_REALES, baaderHasta, piezasHasta, turnoReal, type DatosTurnoReal } from './__fixtures__/turnosReales'

const HUECO_DESDE = '2026-11-18T23:39:26'
const HUECO_HASTA = '2026-11-19T00:28:51'

function conHueco(): DatosTurnoReal {
  const d = turnoReal('2026-11-18-turno_1')
  return { ...d, piezas: d.piezas.filter((p) => p.ts < HUECO_DESDE || p.ts >= HUECO_HASTA) }
}

const finDe = (d: DatosTurnoReal) => Date.parse(d.piezas[d.piezas.length - 1]!.ts) + 60_000

/** La pantalla en el instante `ahora` (lector al día, Shoplogix con 3 min de atraso). */
function pantalla(d: DatosTurnoReal, ahora: number, finMs: number) {
  return armarGraderVivo({
    cubetas: cubetasDe(piezasHasta(d, ahora)),
    inicioMs: d.t0Ms,
    finMs,
    baader: baaderHasta(d, ahora),
    paradas: [],
    minutosSinLatido: 1,
    turnoEnCurso: true,
    leidoHastaMs: ahora,
  })
}

/** Avisos de atasco (hora del pico) en cada lectura de 5 min del turno, como los vería el monitor. */
function atascosVistos(d: DatosTurnoReal): string[] {
  const fin = finDe(d)
  const vistos = new Set<string>()
  for (let ahora = d.t0Ms + 30 * 60_000; ahora <= fin + 15 * 60_000; ahora += 5 * 60_000) {
    for (const a of pantalla(d, ahora, fin + 30 * 60_000).alertas.filter((x) => x.regla === 'atasco')) vistos.add(a.titulo.slice(0, 5))
  }
  return [...vistos].sort()
}

/** El turno cerrado, como lo ve «Ver otro día»: todas las piezas y toda la serie de las Baader. */
const cerrado = (d: DatosTurnoReal) => pantalla(d, finDe(d) + 10 * 60_000, finDe(d))

const horaDe = (t0Ms: number, m: number) => new Date(t0Ms + m * 60_000).toISOString().slice(11, 16)

describe('huecos del espejo, 18-11 Turno 1 (23:39 → 00:28)', () => {
  it('marca sin lectura justo el hueco y nada más del turno', () => {
    const v = cerrado(conHueco())
    const marcados = v.sinLectura.flatMap((x, m) => (x ? [horaDe(v.serie.t0Ms, m)] : []))
    expect(marcados[0]).toBe('23:39')
    expect(marcados[marcados.length - 1]).toBe('00:28')
    expect(marcados).toHaveLength(50)
  })

  it.each(TURNOS_REALES)('%s completo (Excel, sin hueco) no marca ningún minuto', (t) => {
    expect(cerrado(turnoReal(t)).sinLectura.filter(Boolean)).toHaveLength(0)
  })

  it('el retraso se mide sin los minutos del hueco (r 0,90; con ellos baja a 0,76)', () => {
    const r = cerrado(conHueco()).retraso
    expect(r.medido).toBe(true)
    expect(r.r!).toBeGreaterThan(0.85)
  })

  it('no avisa atasco dentro del hueco y conserva el real de las 03:54', () => {
    const vistos = atascosVistos(conHueco())
    expect(vistos.filter((h) => h >= '23:30' || h <= '00:40')).toEqual([])
    // El de las 03:39 del turno completo es justo 80 piezas: sin los 50 min del hueco el retraso medido pasa de 3 a
    // 4 min y queda bajo el umbral. El de las 03:54 (~100) sigue.
    expect(vistos.some((h) => h >= '03:50' && h <= '03:58')).toBe(true)
  })

  it('la línea manual deja las 23 h y las 00 h como «sin lectura», sin diferencia', () => {
    const h = cerrado(conHueco()).manual
    expect(h.find((x) => x.hora === '23:00')).toMatchObject({ sinLectura: true, diferencia: null })
    expect(h.find((x) => x.hora === '00:00')).toMatchObject({ sinLectura: true, diferencia: null })
    // Las demás horas siguen con su diferencia y ninguna se parece al −771 / −893 del hueco.
    const resto = h.filter((x) => x.hora !== '23:00' && x.hora !== '00:00')
    expect(resto.map((x) => x.hora)).toEqual(['22:00', '01:00', '02:00', '03:00', '04:00'])
    for (const x of resto) {
      expect(x.sinLectura).toBe(false)
      expect(Math.abs(x.diferencia!)).toBeLessThan(300)
    }
  })
})
