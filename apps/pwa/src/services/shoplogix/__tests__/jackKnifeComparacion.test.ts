import { describe, it, expect } from 'vitest'
import fixture from './fixtures/chonchi-ultimos-120.json'
import {
  agruparComentarios,
  calcularJackKnife,
  codificarEstadoJK,
  datosInforme,
  filtrarComentarios,
  leerEstadoJK,
  normalizarTexto,
  palabrasFrecuentes,
  prepararTurnos,
  previaAnterior,
  previaJK,
  previaMesPasado,
  resumenComparacion,
  restarMes,
  sentidoCambio,
  veredicto,
  ventanaJK,
  type TurnoCrudo,
  type TurnoJK,
} from '../jackKnife'

// Fixture real de Chonchi (mockup jack-knife-v5-con-datos.html, const DATA), últimos 120 turnos hasta 07-11.
const turnos = prepararTurnos(fixture.turnos as TurnoCrudo[]).turnos

// Ventana «30 días» al 07-11, frente a los 30 días anteriores (mismo largo, justo antes).
const ahoraRango = ventanaJK(turnos, '30')
const previa = previaJK(turnos, ahoraRango, 'ant')!
const ahora = calcularJackKnife(turnos, ahoraRango.desde, ahoraRango.hasta, 'imp')
const antes = calcularJackKnife(turnos, previa.desde, previa.hasta, 'imp')

describe('Chonchi 30 días al 07-11 frente a los 30 anteriores', () => {
  it('ventanas de 50 turnos cada una, sin período parcial', () => {
    expect(ahoraRango.hasta - ahoraRango.desde + 1).toBe(50)
    expect(previa.hasta - previa.desde + 1).toBe(50)
    expect(previa.parcial).toBe(false)
    expect(turnos[ahoraRango.hasta]!.dateKey).toBe('2026-11-07')
  })

  it('minutos por turno: 24,2 antes → 14,3 ahora', () => {
    const r = resumenComparacion(ahora, antes, previa)!
    expect(r.minAntes.toFixed(1)).toBe('24.2')
    expect(r.minAhora.toFixed(1)).toBe('14.3')
  })

  it('9 causas mejoraron, 2 desaparecieron y 3 empeoraron', () => {
    const r = resumenComparacion(ahora, antes, previa)!
    expect(r.mejoraron).toBe(9)
    expect(r.desaparecieron).toBe(2)
    expect(r.empeoraron).toBe(3)
  })

  it('empeoran Cintas, Pernos / Resortes y Balanzas; prioridad 1 Cuchillos / Guillotinas', () => {
    const inf = datosInforme(turnos, ahora, antes, previa)!
    expect([...inf.empeoraron].sort()).toEqual(['Balanzas', 'Cintas', 'Pernos / Resortes'])
    expect(inf.prioridad1[0]).toBe('Cuchillos / Guillotinas')
    expect(inf.resultado).toBe('mejoro')
    expect(inf.variacionPct).toBeLessThan(-10)
  })

  it('el informe trae una fila por causa y comentarios de las prioritarias o empeoradas', () => {
    const inf = datosInforme(turnos, ahora, antes, previa)!
    const causas = new Set(inf.filas.map((f) => f.causa))
    for (const c of [...inf.empeoraron, ...inf.prioridad1]) expect(causas.has(c)).toBe(true)
    expect(inf.comentariosClave.length).toBeLessThanOrEqual(4)
    for (const g of inf.comentariosClave) expect(g.top.length).toBeLessThanOrEqual(2)
  })
})

describe('comparación', () => {
  it('antes del primer turno no hay historia: null', () => {
    expect(previaAnterior(0, 10)).toBeNull()
  })

  it('si la historia no alcanza, el período anterior sale parcial', () => {
    const p = previaAnterior(10, 69)!
    expect(p.parcial).toBe(true)
    expect(p.desde).toBe(0)
    expect(p.hasta).toBe(9)
  })

  it('«Vs. mes pasado» usa las mismas fechas un mes antes', () => {
    const p = previaMesPasado(turnos, ahoraRango.desde, ahoraRango.hasta)!
    expect(turnos[p.desde]!.dateKey >= '2026-09-01').toBe(true)
    expect(turnos[p.hasta]!.dateKey <= '2026-10-07').toBe(true)
  })

  it('«Sin comparar» y sin historia dan null', () => {
    expect(previaJK(turnos, ahoraRango, 'no')).toBeNull()
    expect(resumenComparacion(ahora, null, null)).toBeNull()
  })

  it('«Elegir a mano» ordena los índices', () => {
    expect(previaJK(turnos, ahoraRango, 'mano', { desde: 80, hasta: 20 })).toEqual({ desde: 20, hasta: 80, parcial: false })
  })

  it('±10 % para la variación', () => {
    expect(sentidoCambio(100, 109)).toBe('igual')
    expect(sentidoCambio(100, 89)).toBe('mejor')
    expect(sentidoCambio(100, 111)).toBe('peor')
    expect(sentidoCambio(0, 5)).toBe('peor')
  })

  it('veredicto por minutos por turno', () => {
    const p = (min: number) => ({ k: 'x', ev: 1, min, mttr: min, q: 'ok' as const })
    expect(veredicto(p(5), p(10), 10, 10)).toBe('mejoro')
    expect(veredicto(p(10), p(10), 10, 10)).toBe('igual')
    expect(veredicto(p(20), p(10), 10, 10)).toBe('empeoro')
    expect(veredicto(p(5), undefined, 10, 10)).toBe('nueva')
    expect(veredicto(undefined, p(5), 10, 10)).toBe('sinEventos')
  })
})

describe('comentarios', () => {
  it('normaliza tildes y mayúsculas', () => {
    // Como el mockup: NFD quita la tilde de la ñ también, y buscar y comparar usan la misma forma.
    expect(normalizarTexto('  Cambió el Resorte, ñandú!  ')).toBe('cambio el resorte nandu')
  })

  it('chips: más de 3 letras, sin vacías ni números, máximo 10', () => {
    const chips = palabrasFrecuentes(['Cambié el resorte de la cinta 2', 'resorte roto en la cinta', 'ajuste 123 resorte'])
    const palabras = chips.map((c) => c.palabra)
    expect(palabras[0]).toBe('resorte')
    expect(palabras).toContain('cinta')
    expect(palabras).not.toContain('de')
    expect(palabras).not.toContain('123')
    expect(palabras.length).toBeLessThanOrEqual(10)
  })

  it('filtro de búsqueda sin tildes y filtro por chip', () => {
    const lista = [{ texto: 'Cambié el resorte' }, { texto: 'Falló el sensor' }, { texto: 'resorte flojo' }]
    expect(filtrarComentarios(lista, 'cambie', null)).toHaveLength(1)
    expect(filtrarComentarios(lista, '', 'resorte')).toHaveLength(2)
    expect(filtrarComentarios(lista, 'resorte', 'flojo')).toEqual([{ texto: 'resorte flojo' }])
  })

  it('agrupados por texto normalizado, con ×n y fecha del último', () => {
    const g = agruparComentarios([
      { texto: 'Ajuste de cuchillo', inicioMs: 1 },
      { texto: 'ajuste de CUCHILLO', inicioMs: 5 },
      { texto: 'Otro', inicioMs: 9 },
    ])
    expect(g[0]).toEqual({ texto: 'Ajuste de cuchillo', n: 2, ultimoMs: 5 })
    expect(g[1]!.n).toBe(1)
  })
})

describe('mes pasado en fin de mes', () => {
  it('31-mar → 28-feb (2026), 31-mar → 29-feb en año bisiesto, nunca 3-mar', () => {
    expect(restarMes('2026-03-31')).toBe('2026-02-28')
    expect(restarMes('2028-03-31')).toBe('2028-02-29')
    expect(restarMes('2026-03-30')).toBe('2026-02-28')
    expect(restarMes('2026-01-15')).toBe('2025-12-15')
    expect(restarMes('2026-05-31')).toBe('2026-04-30')
  })

  it('«Vs. mes pasado» toma el turno del último día del mes anterior', () => {
    const t = (dateKey: string): TurnoJK => ({
      id: `${dateKey}_Turno 1`,
      dateKey,
      shiftId: 'Turno 1',
      resumen: fixtureResumen(),
    })
    const turnos = [t('2026-02-27'), t('2026-02-28'), t('2026-03-01'), t('2026-03-31')]
    const p = previaMesPasado(turnos, 3, 3)!
    expect(turnos[p.desde]!.dateKey).toBe('2026-02-28')
    expect(turnos[p.hasta]!.dateKey).toBe('2026-02-28')
  })
})

function fixtureResumen() {
  return { v: 1 as const, eventos: [], sinImputar: [], sinImputarLinea: [], comentarios: [], conCausaMin: 0, sinCausaMin: 0, uptimeMin: 1 }
}

describe('enlace con los filtros (#jk=)', () => {
  it('ida y vuelta de los filtros, con extremos manuales por id de turno', () => {
    const hash = codificarEstadoJK({
      pl: 'chonchi', v: 'libre', vs: 'todas', cmp: 'mano',
      ha: '2026-10-09_Turno 1', hb: '2026-11-07_Turno 2', ca: '2026-08-01_Turno 1', cb: '2026-08-30_Turno 2',
    })
    expect(hash.startsWith('#jk=')).toBe(true)
    expect(leerEstadoJK(hash, 'chonchi')).toEqual({
      pl: 'chonchi', v: 'libre', vs: 'todas', cmp: 'mano',
      ha: '2026-10-09_Turno 1', hb: '2026-11-07_Turno 2', ca: '2026-08-01_Turno 1', cb: '2026-08-30_Turno 2',
    })
  })

  it('otra planta o un hash ajeno no se aplica; valores raros caen al predeterminado', () => {
    expect(leerEstadoJK('#t=abc', 'chonchi')).toBeNull()
    expect(leerEstadoJK('#jk=pl=yal&v=30', 'chonchi')).toBeNull()
    const e = leerEstadoJK('#jk=pl=chonchi&v=999&vs=x&cmp=y', 'chonchi')!
    expect(e.v).toBe('90')
    expect(e.vs).toBe('imp')
    expect(e.cmp).toBe('ant')
  })
})
