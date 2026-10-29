import { describe, expect, it } from 'vitest'
import type { PacePoint } from '@/services/shoplogix/monitorCompare'
import { compararTurnos, puntajeJornada, type DatosDuelo, type DetencionPin, type PuntoVentaja, type ResumenTurno } from '../duelo'
import {
  colacionDe, filasDePuntos, fraseDeVentaja, hitosDeCarrera, intensidadCelda, marcasDePiezas, milTexto, modeloMarcador, patronDeMicro, tendenciaDeVentaja, textoMinutoProduccion,
  partirTexto, trazoSuave, tramosDeRelleno, type FilaPunto,
} from '../dueloCalma'

const curva = (ritmo: number, hasta: number, pausa?: [number, number]): PacePoint[] => {
  const out: PacePoint[] = []
  let pz = 0
  for (let m = 0; m <= hasta; m += 5) {
    if (!pausa || m <= pausa[0] || m > pausa[1]) pz += m === 0 ? 0 : ritmo * 5
    out.push({ minutes: m, pieces: pz })
  }
  return out
}

describe('dueloCalma · curva suave', () => {
  it('no baja nunca: una curva monótona se mantiene monótona entre los puntos', () => {
    const d = trazoSuave([[0, 100], [10, 90], [20, 90], [30, 40]])
    const ys = [...d.matchAll(/C[\d.]+ [\d.]+ [\d.]+ [\d.]+ ([\d.]+) ([\d.]+)/g)].map((m) => Number(m[2]))
    expect(ys).toEqual([90, 90, 40])
    // tramo plano: los dos controles quedan a la misma altura
    expect(d).toContain('C')
  })
  it('con 0, 1 o 2 puntos no inventa curvas', () => {
    expect(trazoSuave([])).toBe('')
    expect(trazoSuave([[1, 2]])).toBe('M1 2')
    expect(trazoSuave([[0, 0], [5, 5]])).toBe('M0 0L5 5')
  })
})

describe('dueloCalma · relleno bicolor', () => {
  it('parte la banda donde se cruzan las curvas y deja los dos tramos tocándose', () => {
    // Cárdenas arranca más rápido y Rebolledo lo pasa
    const c = [{ minutes: 0, pieces: 0 }, { minutes: 60, pieces: 600 }, { minutes: 120, pieces: 900 }]
    const r = [{ minutes: 0, pieces: 0 }, { minutes: 60, pieces: 300 }, { minutes: 120, pieces: 1200 }]
    const t = tramosDeRelleno({ cardenas: c, rebolledo: r }, 120, 10)
    expect(t.map((x) => x.lider)).toEqual(['cardenas', 'rebolledo'])
    const finA = t[0]!.puntos[t[0]!.puntos.length - 1]!
    const iniB = t[1]!.puntos[0]!
    expect(finA.m).toBeCloseTo(iniB.m, 6)
    expect(finA.c).toBeCloseTo(finA.r, 0)
  })
  it('sin curvas no hay tramos', () => {
    expect(tramosDeRelleno({ cardenas: [], rebolledo: [] }, 60)).toEqual([])
  })
})

describe('dueloCalma · ejes', () => {
  it('marcas redondas, máximo cuatro', () => {
    expect(marcasDePiezas(16500).marcas).toEqual([5000, 10000, 15000])
    expect(marcasDePiezas(3100).marcas).toEqual([1000, 2000, 3000])
    expect(marcasDePiezas(3100).marcas.length).toBeLessThanOrEqual(4)
  })
  it('textos en horas de producción, nunca de reloj', () => {
    expect(milTexto(5000)).toBe('5 mil')
    expect(milTexto(2500)).toBe('2,5 mil')
    expect(textoMinutoProduccion(134)).toBe('2 h 14 min')
    expect(textoMinutoProduccion(45)).toBe('45 min')
  })
})

describe('dueloCalma · hitos', () => {
  const pin = (o: Partial<DetencionPin>): DetencionPin => ({
    desdeMin: 100, hastaMin: 110, duracionMin: 10, causa: 'x', corta: 'x', programada: false, fallaTecnica: false, dueno: 'sin-imputar', ...o,
  })
  it('cruce de 10.000 con los minutos de diferencia, mayor ventaja y la falla técnica más larga', () => {
    const cardenas = curva(40, 400)
    const rebolledo = curva(36, 400)
    const ventaja: PuntoVentaja[] = [
      { minuto: 10, hechas: { cardenas: 400, rebolledo: 360 }, lider: 'cardenas', ventaja: 40 },
      { minuto: 300, hechas: { cardenas: 12000, rebolledo: 10800 }, lider: 'cardenas', ventaja: 1200 },
      { minuto: 400, hechas: { cardenas: 16000, rebolledo: 14400 }, lider: 'cardenas', ventaja: 1600 },
    ]
    const h = hitosDeCarrera({
      ventaja,
      detenciones: { cardenas: [pin({ duracionMin: 30 })], rebolledo: [pin({ duracionMin: 12, fallaTecnica: true, dueno: 'mantencion' }), pin({ duracionMin: 50, programada: true })] },
    }, { cardenas, rebolledo }, 400)
    expect(h.mayor).toEqual({ min: 400, ventaja: 1600, lider: 'cardenas' })
    expect(h.cruce?.umbral).toBe(10000)
    expect(h.cruce?.primero).toBe('cardenas')
    expect(h.cruce?.difMin).toBeGreaterThan(0)
    // la falla técnica manda aunque haya una detención más larga sin causa técnica; la programada nunca cuenta
    expect(h.falla).toMatchObject({ equipo: 'rebolledo' })
    expect(h.falla?.pin.duracionMin).toBe(12)
  })
  it('sin fallas técnicas elige la detención no programada más larga', () => {
    const h = hitosDeCarrera({ ventaja: [], detenciones: { cardenas: [pin({ duracionMin: 8 }), pin({ duracionMin: 25 })] } }, { cardenas: curva(30, 60), rebolledo: curva(30, 60) }, 60)
    expect(h.falla?.pin.duracionMin).toBe(25)
    expect(h.mayor).toBeNull()
  })
  it('colación: la banda sale de la detención programada «colación»', () => {
    const ev = (causa: string, programada: boolean) => ({ causa, corta: causa, desde: 200, hasta: 245, programada })
    expect(colacionDe({ cardenas: { eventos: [ev('Reunión inicio', true)] }, rebolledo: { eventos: [ev('Colación', true)] } })).toEqual({ desde: 200, hasta: 245 })
    expect(colacionDe({ cardenas: null, rebolledo: null })).toBeNull()
  })
})

describe('dueloCalma · tendencia de la ventaja', () => {
  const p = (minuto: number, c: number, r: number): PuntoVentaja => ({ minuto, hechas: { cardenas: c, rebolledo: r }, lider: c === r ? null : c > r ? 'cardenas' : 'rebolledo', ventaja: Math.abs(c - r) })
  it('la ventaja del líder crece o se achica respecto de una hora atrás', () => {
    expect(tendenciaDeVentaja([p(0, 0, 0), p(60, 2400, 2300), p(120, 4800, 4400)])).toEqual({ lider: 'cardenas', ventaja: 400, cambio: 300, pasoAdelante: null })
    expect(tendenciaDeVentaja([p(0, 0, 0), p(60, 2300, 2400), p(120, 4400, 4800)])).toEqual({ lider: 'rebolledo', ventaja: 400, cambio: 300, pasoAdelante: null })
    expect(tendenciaDeVentaja([p(0, 0, 0), p(60, 2400, 2000), p(120, 4600, 4400)])?.cambio).toBe(-200)
  })
  it('si hace una hora iba adelante el otro, lo dice en vez de inventar un «crece»', () => {
    const r = tendenciaDeVentaja([p(0, 0, 0), p(60, 2300, 3300), p(120, 4600, 4440)])
    expect(r).toMatchObject({ lider: 'cardenas', ventaja: 160, cambio: null, pasoAdelante: { atrasPz: 1000 } })
  })
  it('sin una hora atrás no hay cambio; sin serie no hay nada', () => {
    expect(tendenciaDeVentaja([p(0, 0, 0), p(30, 1000, 900)])?.cambio).toBeNull()
    expect(tendenciaDeVentaja([])).toBeNull()
  })
})

describe('dueloCalma · frase de ventaja', () => {
  const fila = (id: FilaPunto['id'], gana: FilaPunto['gana']): FilaPunto => ({ id, rotulo: id, sub: '', formula: '', c: 1, r: 2, unidad: '', dec: 0, gana, frase: '' })
  const n = { cardenas: 'Cárdenas', rebolledo: 'Rebolledo' }
  it('un solo ganador: por qué va adelante', () => {
    expect(fraseDeVentaja([fila('carrera', 'c'), fila('ritmo', 'c'), fila('micro', 'c')], n)).toBe('Cárdenas va adelante por más piezas a la misma hora, más ritmo andando y menos micro detención.')
    expect(fraseDeVentaja([fila('carrera', 'pend'), fila('ritmo', 'r'), fila('micro', 'r')], n)).toBe('Rebolledo va adelante por más ritmo andando y menos micro detención.')
  })
  it('puntos repartidos: dice qué ganó cada uno', () => {
    expect(fraseDeVentaja([fila('carrera', 'c'), fila('ritmo', 'r'), fila('micro', 'r')], n)).toBe('Cárdenas gana la carrera; Rebolledo, el ritmo andando y la micro detención.')
  })
  it('sin ganadores no hay frase', () => {
    expect(fraseDeVentaja([fila('carrera', 'empate')], n)).toBeNull()
  })
})

describe('dueloCalma · micro por hora', () => {
  it('separa el patrón de la operación (en los dos equipos) del patrón del turno (en uno)', () => {
    const p = patronDeMicro([1, 6, 1, 1, 1, 1], [1, 5, 1, 1, 7, 1])
    expect(p?.enAmbos).toEqual([2])
    expect(p?.soloR).toEqual([5])
    expect(p?.soloC).toEqual([])
  })
  it('sin horas de alguno no hay patrón', () => {
    expect(patronDeMicro(null, [1, 2])).toBeNull()
  })
  it('la intensidad usa la misma escala para los dos y se acota a 0–1', () => {
    expect(intensidadCelda(3, 6)).toBe(0.5)
    expect(intensidadCelda(9, 6)).toBe(1)
    expect(intensidadCelda(2, 0)).toBe(0)
  })
})

describe('dueloCalma · textos largos', () => {
  it('parte la causa en líneas sin recortar nada ni usar puntos suspensivos', () => {
    const causa = 'Baader 200/cuchilleria rapida de cola'
    const l = partirTexto(causa, 20)
    expect(l.length).toBeGreaterThan(1)
    expect(l.every((x) => x.length <= 22)).toBe(true)
    expect(l.join(' ').replace(/ \//g, '/').replace(/\/ /g, '/')).toBe(causa)
    expect(l.join('')).not.toContain('…')
  })
  it('una palabra más larga que el máximo queda entera en su línea', () => {
    expect(partirTexto('superlargapalabra x', 5)).toEqual(['superlargapalabra', 'x'])
  })
})

describe('dueloCalma · marcador y filas con la jornada abierta', () => {
  const res = (p: Partial<ResumenTurno>): ResumenTurno => ({
    shiftDocId: 'x', dateKey: '2026-10-28', jornada: '2026-10-28', h0: '07:00', shiftId: 'Turno Dia', esNoche: false, equipo: 'rebolledo', cerrado: false,
    piezas: 12000, dispMin: 420, fallasN: 0, fallaMin: 0, piezasMant: 0, ritmo: 30, microMinH: 2, arranqueMin: 10, arranqueModo: 'primera-pieza', iniProdMin: 10,
    ultimaHoraPz: 1500, puestos: [{ clave: 'ev1', etiqueta: 'Ev 1', llenado: 90 }], ...p,
  })
  const hoy = res({ ritmo: 31, microMinH: 1, arranqueMin: 5, puestos: [{ clave: 'ev1', etiqueta: 'Ev 1', llenado: 80 }] })
  const rival = res({ equipo: 'cardenas', ritmo: 30, microMinH: 2, arranqueMin: 12, cerrado: true, puestos: [{ clave: 'ev1', etiqueta: 'Ev 1', llenado: 95 }] })
  const m = compararTurnos(hoy, rival, { carreraEnVivo: { a: 5000, b: 4900 } })
  const d = { hoy, rival, marcador: m, puntaje: puntajeJornada(m) } as unknown as DatosDuelo

  it('el marcador da solo los firmes, cuántos quedan en juego y quién va adelante en cada uno, con Cárdenas a la izquierda', () => {
    const mm = modeloMarcador(d)
    expect(mm).toMatchObject({ conPuntaje: true, c: 0, r: 3, enJuego: 2, cerrada: false, lider: 'r' })
    expect(mm.detalle.map((x) => [x.indicador, x.adelante])).toEqual([['arranque', 'r'], ['alimentacion', 'c']])
    // las cifras de cada punto en juego también van en el orden Cárdenas, Rebolledo
    expect(mm.detalle[0]!.valores).toEqual({ c: 12, r: 5, unidad: 'min', dec: 0 })
    expect(mm.detalle[1]!.valores).toEqual({ c: 95, r: 80, unidad: '%', dec: 0 })
  })

  it('tres filas por indicador que da punto, sin arranque ni alimentación, con su frase', () => {
    const filas = filasDePuntos({ d, nombres: { cardenas: 'Cárdenas', rebolledo: 'Rebolledo' }, micro: { cardenas: { totalTurno: 15.1, nMaquinas: 3 }, rebolledo: { totalTurno: 22.3, nMaquinas: 3 } } })
    expect(filas.map((f) => f.id)).toEqual(['carrera', 'ritmo', 'micro'])
    expect(filas.map((f) => f.gana)).toEqual(['r', 'r', 'r'])
    expect(filas[0]!.frase).toBe('Rebolledo 100 adelante a la misma hora.')
    expect(filas[1]!.frase).toBe('Rebolledo rinde 1,0 pz/min más cuando anda.')
    expect(filas[2]).toMatchObject({ totalC: 15.1, totalR: 22.3, nMaquinas: 3 })
    expect(filas[2]!.sub).toContain('min por hora por máquina')
    expect(filas[2]!.formula).toContain('÷ horas transcurridas ÷ cantidad de Baader')
  })

  it('sin puntaje (la noche corre sola) no hay marcador', () => {
    expect(modeloMarcador({ ...d, puntaje: null } as unknown as DatosDuelo).conPuntaje).toBe(false)
  })
})
