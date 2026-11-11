/** Cifras de la TV v2: «N adelante / N atrás», eje en horas de producción, marcador firmes + en juego, y el glosario. */
import { describe, expect, it } from 'vitest'
import type { DatosDuelo, PuntoVentaja } from '../duelo'
import {
  PALABRAS_PROHIBIDAS_TV, alCierreTexto, bandasHoraTv, difMeta, escalaTv, estadoTv, mantTv, marcadorTv, maxEjeTv, mayorVentaja,
  pctDe, sinMarcadorTexto, tituloCarreraTv, tramosVentaja, trazoCurva,
} from '../tvV2Datos'

const eq = (n: number, mins: number, pz: number) => ({ turnos: 1, fallasN: n, fallaMin: mins, piezasPerdidas: pz, minPorFalla: n ? mins / n : null })

/** Una jornada 28/10: hoy corre Rebolledo (a), el rival es Cárdenas (b), que va 3–0 en puntos firmes. */
const duelo = (): DatosDuelo => ({
  hoy: { equipo: 'rebolledo', cerrado: false },
  abreJornada: false,
  esperando: null,
  hoyKey: '2026-10-28',
  puntaje: {
    firmes: { a: 0, b: 3 },
    enJuego: 4,
    cerrada: false,
    detalleEnJuego: [
      { indicador: 'arranque', rotulo: 'Arranque y cierre', quienVaAdelante: 'b' },
      { indicador: 'alimentacion', rotulo: 'Alimentación Ev 1', puesto: 'Ev 1', quienVaAdelante: 'a' },
      { indicador: 'alimentacion', rotulo: 'Alimentación Ev 2', puesto: 'Ev 2', quienVaAdelante: 'a' },
      { indicador: 'alimentacion', rotulo: 'Alimentación Ev 3', puesto: 'Ev 3', quienVaAdelante: 'b' },
    ],
  },
  carrera: { diferencia: -886, rivalEquipo: 'cardenas' },
  costoHoy: { etiqueta: 'jornada 28/10', equipos: { cardenas: eq(3, 15, 400.4), rebolledo: eq(2, 11, 300.2) } },
} as unknown as DatosDuelo)

describe('difMeta', () => {
  it('adelante y atrás en piezas enteras; sin meta, null', () => {
    expect(difMeta(12493, 12321)).toEqual({ n: 172, adelante: true })
    expect(difMeta(3193, 3857)).toEqual({ n: 664, adelante: false })
    expect(difMeta(100, 100)).toEqual({ n: 0, adelante: true })
    expect(difMeta(100, null)).toBeNull()
  })
  it('pctDe topa en 0–100', () => {
    expect(pctDe(50, 100)).toBe(50)
    expect(pctDe(150, 100)).toBe(100)
    expect(pctDe(5, null)).toBe(0)
  })
})

describe('eje en horas de producción', () => {
  it('las bandas se rotulan «1.ª h», nunca con reloj', () => {
    const b = bandasHoraTv(465)
    expect(b).toHaveLength(8)
    expect(b[0]).toMatchObject({ rotulo: '1.ª h', desde: 0, hasta: 60, centro: 30 })
    expect(b.every((x) => !/\d:\d\d/.test(x.rotulo))).toBe(true)
  })
  it('el largo del eje redondea a hora completa y respeta lo previsto', () => {
    expect(maxEjeTv([[{ minutes: 10, pieces: 5 }, { minutes: 386, pieces: 100 }]], 465)).toBe(480)
    expect(maxEjeTv([null], null)).toBe(60)
  })
  it('trazoCurva corta en el minuto pedido', () => {
    const c = [{ minutes: 0, pieces: 0 }, { minutes: 30, pieces: 10 }, { minutes: 60, pieces: 25 }]
    expect(trazoCurva(c, 30, (m) => m, (p) => p)).toBe('M0.0 0.0L30.0 10.0')
    expect(trazoCurva([], 30, (m) => m, (p) => p)).toBe('')
  })
})

describe('ventaja a la misma hora', () => {
  const p = (minuto: number, lider: PuntoVentaja['lider'], ventaja: number): PuntoVentaja => ({ minuto, lider, ventaja, hechas: { cardenas: 0, rebolledo: 0 } })
  it('mayorVentaja y tramos por líder (el cruce no deja hueco)', () => {
    const s = [p(0, null, 0), p(1, 'cardenas', 10), p(2, 'cardenas', 30), p(3, 'rebolledo', 5), p(4, 'rebolledo', 8)]
    expect(mayorVentaja(s)?.ventaja).toBe(30)
    expect(mayorVentaja([p(0, null, 0)])).toBeNull()
    const t = tramosVentaja(s)
    expect(t.map((x) => x.lider)).toEqual(['cardenas', 'rebolledo'])
    expect(t[1]!.puntos[0]!.minuto).toBe(2)
  })
})

describe('marcador y título', () => {
  it('firmes por equipo con Cárdenas primero, y «N en juego» con lo que se decide al cierre', () => {
    const m = marcadorTv(duelo())!
    expect(m.lados.map((l) => [l.equipo, l.firmes])).toEqual([['cardenas', 3], ['rebolledo', 0]])
    expect(m.enJuego).toBe(4)
    expect(m.alCierre).toBe('arranque y cierre · alimentación ×3')
    expect(alCierreTexto([])).toBe('')
  })
  it('sin puntaje no hay marcador y la frase dice por qué', () => {
    const d = { ...duelo(), puntaje: null, abreJornada: true } as unknown as DatosDuelo
    expect(marcadorTv(d)).toBeNull()
    expect(sinMarcadorTexto(d)).toMatch(/noche abre la jornada/)
    expect(sinMarcadorTexto(null)).toMatch(/Todavía/)
  })
  it('el título dice «N atrás de» / «N adelante de» desde el equipo del turno', () => {
    expect(tituloCarreraTv(duelo())).toMatchObject({ nombreSujeto: 'Grupo 1', nombreRival: 'Grupo 2', verbo: '886 atrás de' })
    const d = duelo(); d.carrera!.diferencia = 181
    expect(tituloCarreraTv(d, { rebolledo: 'Francisco Rebolledo', cardenas: 'Cristian Cárdenas' })).toMatchObject({ nombreSujeto: 'Rebolledo', verbo: '181 adelante de' })
    d.carrera!.diferencia = 0
    expect(tituloCarreraTv(d)!.verbo).toBe('parejos con')
  })
})

describe('Mantención de hoy', () => {
  it('suma los dos equipos de la jornada y dice el período', () => {
    const m = mantTv(duelo())!
    expect(m).toMatchObject({ periodo: 'jornada 28/10', fallas: 5, fallaMin: 26, piezasPerdidas: 701 })
    expect(mantTv(null)).toBeNull()
  })
  it('los minutos de la jornada son de LÍNEA: no se presentan como MTTR (29-10: «MTTR 0,4 min» con fallas de 5-7 min)', () => {
    const m = mantTv(duelo())!
    expect(m.mttr).toBeNull()
    expect(m.lineaMin).toBe(26)
  })
})

describe('estado y escala', () => {
  const base = { cerrado: false, status: 'produciendo', viejo: false }
  it('la detención siempre trae su hora', () => {
    expect(estadoTv({ ...base, status: 'detenida', desde: '12:56' })).toEqual({ texto: 'Detenida desde 12:56', detenida: true })
    expect(estadoTv(base)).toEqual({ texto: 'Produciendo', detenida: false })
    expect(estadoTv({ ...base, cerrado: true, cierre: '15:00' }).texto).toBe('Turno terminado 15:00')
    expect(estadoTv({ ...base, viejo: true, sinDatosHaceMin: 22.4 }).texto).toBe('Sin datos hace 22 min')
  })
  it('el lienzo 1920×1080 entra entero en 1366×768 y en 1920×1080', () => {
    expect(escalaTv(1920, 1080)).toBe(1)
    expect(escalaTv(1366, 768)).toBeCloseTo(0.7115, 3)
    expect(escalaTv(1000, 2000)).toBeCloseTo(0.5208, 3)
  })
})

describe('glosario de la TV', () => {
  it('los textos que genera no usan las palabras prohibidas', () => {
    const d = duelo()
    const t = [
      alCierreTexto(d.puntaje!.detalleEnJuego), tituloCarreraTv(d)!.verbo, sinMarcadorTexto(d), mantTv(d)!.periodo,
      estadoTv({ cerrado: false, status: 'detenida', viejo: false, desde: '12:56' }).texto,
    ].join(' ').toLowerCase()
    for (const w of PALABRAS_PROHIBIDAS_TV) expect(t.includes(w)).toBe(false)
  })
})
