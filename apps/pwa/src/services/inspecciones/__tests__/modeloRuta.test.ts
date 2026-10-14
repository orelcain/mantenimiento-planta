import { describe, expect, it } from 'vitest'
import {
  diasDesde,
  resumenDeRecorrido,
  rutasPorAtencion,
  tendenciaDeEquipo,
  type Recorrido,
  type RutaInspeccion,
} from '../modeloRuta'
import { RUTAS_CHONCHI } from '../rutasChonchi'

const filete = RUTAS_CHONCHI.find((r) => r.id === 'filete') as RutaInspeccion

const recorrido = (p: Partial<Recorrido> = {}): Recorrido => ({
  id: 'r1',
  plantId: 'chonchi',
  rutaId: 'filete',
  turnoId: '2026-09-21_dia',
  fechaTurno: '2026-09-21',
  iniciadoEn: '2026-09-21T11:12:00.000Z',
  iniciadoPorNombre: 'Danilo Cortes',
  resultados: {},
  ...p,
})

describe('las rutas salen del registro R-MAN-CH-004', () => {
  it('son las 7 áreas del registro, con 47 puntos', () => {
    expect(RUTAS_CHONCHI).toHaveLength(7)
    expect(RUTAS_CHONCHI.reduce((n, r) => n + r.equipos.length, 0)).toBe(47)
  })

  it('los puntos sin equipo van marcados y NO inventan un nombre de equipo', () => {
    // Las áreas 1 y 2 nunca llenaron la columna del equipo: ahí el punto es la actividad. Lo que
    // no puede pasar es que quede como si tuviera equipo, porque ligaría la tendencia a un equipo
    // que nadie escribió.
    const sinEquipo = RUTAS_CHONCHI.flatMap((r) => r.equipos.filter((e) => e.sinEquipo))
    expect(sinEquipo).toHaveLength(18)
    // El nombre es el primer tramo de la actividad, nada más: si no calza, alguien inventó algo.
    for (const e of sinEquipo) {
      expect(e.actividad.toLowerCase()).toContain(e.nombre.replace(/…$/, '').slice(0, 20).toLowerCase())
    }
    // Y en las áreas que sí lo traen, ninguno queda marcado.
    expect(filete.equipos.some((e) => e.sinEquipo)).toBe(false)
  })

  it('Filete trae sus 11 equipos con la actividad del papel', () => {
    expect(filete.equipos).toHaveLength(11)
    const baader = filete.equipos.find((e) => e.nombre === 'BAADER 200')
    expect(baader?.actividad).toContain('CUCHILLOS DORSALES')
  })

  it('ningún id se repite: la tendencia se guarda por id', () => {
    const ids = RUTAS_CHONCHI.flatMap((r) => r.equipos.map((e) => e.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('un recorrido se puede guardar a medias', () => {
  it('cuenta lo revisado sin exigir el total', () => {
    const r = resumenDeRecorrido(filete, {
      resultados: { 'filete-baader-200': 'conforme', 'filete-cinta-curva': 'no-conforme' },
    })
    expect(r.revisados).toBe(2)
    expect(r.total).toBe(11)
    expect(r.completo).toBe(false)
  })

  it('con todos revisados queda completo', () => {
    const todos = Object.fromEntries(filete.equipos.map((e) => [e.id, 'conforme' as const]))
    expect(resumenDeRecorrido(filete, { resultados: todos }).completo).toBe(true)
  })

  it('un equipo que ya no está en la ruta no se cuenta', () => {
    const r = resumenDeRecorrido(filete, { resultados: { 'equipo-que-se-quito': 'conforme' } })
    expect(r.revisados).toBe(0)
  })

  it('mide el recorrido de la primera marca a la última', () => {
    const r = resumenDeRecorrido(filete, {
      resultados: {},
      marcas: { 'filete-baader-200': '2026-09-21T11:12:00Z', 'filete-cinta-curva': '2026-09-21T11:34:00Z' },
    })
    expect(r.minutosDeRecorrido).toBe(22)
  })

  it('con una sola marca no inventa un recorrido', () => {
    expect(resumenDeRecorrido(filete, { resultados: {}, marcas: { 'filete-baader-200': '2026-09-21T11:12:00Z' } }).minutosDeRecorrido).toBeNull()
  })
})

describe('la presión la pone el número, no una alarma', () => {
  const ahora = new Date('2026-09-26T12:00:00Z')

  it('cuenta los días desde el último recorrido', () => {
    expect(diasDesde('2026-09-20T12:00:00Z', ahora)).toBe(6)
    expect(diasDesde(null, ahora)).toBeNull()
  })

  it('primero lo que nunca se recorrió, después lo más viejo', () => {
    const ultimo = new Map([
      ['filete', '2026-09-24T12:00:00Z'],
      ['acopio', '2026-08-26T12:00:00Z'],
      ['empaque', '2026-09-19T12:00:00Z'],
    ])
    const orden = rutasPorAtencion(RUTAS_CHONCHI, ultimo, ahora).map((x) => x.ruta.id)
    // Las dos sin recorrer van arriba; luego Acopio (31 d), Empaque (7 d) y Filete (2 d).
    expect(orden.slice(-3)).toEqual(['acopio', 'empaque', 'filete'])
    expect(orden.slice(0, 2).every((id) => !ultimo.has(id))).toBe(true)
  })

  it('una fecha ilegible se trata como nunca recorrida, no como hoy', () => {
    expect(diasDesde('no es una fecha', ahora)).toBeNull()
  })
})

describe('la tendencia: lo que ninguna ronda suelta puede decir', () => {
  const rondas = (...res: Array<'conforme' | 'no-conforme'>) =>
    res.map((r, i) =>
      recorrido({
        id: `r${i}`,
        iniciadoEn: `2026-0${i + 4}-10T11:00:00.000Z`,
        resultados: { 'filete-cinta-aceleracion-1': r },
      }),
    )

  it('ordena del más viejo al más nuevo aunque lleguen desordenados', () => {
    const t = tendenciaDeEquipo('filete-cinta-aceleracion-1', [...rondas('conforme', 'no-conforme')].reverse())
    expect(t.pasos.map((p) => p.resultado)).toEqual(['conforme', 'no-conforme'])
  })

  it('avisa cuando se repite en las últimas rondas seguidas', () => {
    const t = tendenciaDeEquipo('filete-cinta-aceleracion-1', rondas('conforme', 'no-conforme', 'conforme', 'no-conforme', 'no-conforme'))
    expect(t.seguidosAlFinal).toBe(2)
    expect(t.veredicto).toBe('No conforme en las 2 últimas rondas seguidas.')
  })

  it('sin repetirse NO inventa un patrón', () => {
    const t = tendenciaDeEquipo('filete-cinta-aceleracion-1', rondas('conforme', 'no-conforme', 'conforme'))
    expect(t.noConformes).toBe(1)
    expect(t.veredicto).toBeNull()
  })

  it('con todo conforme tampoco dice nada', () => {
    expect(tendenciaDeEquipo('filete-cinta-aceleracion-1', rondas('conforme', 'conforme')).veredicto).toBeNull()
  })

  it('los recorridos donde no se miró ese equipo no cuentan', () => {
    const t = tendenciaDeEquipo('filete-baader-200', rondas('no-conforme', 'no-conforme'))
    expect(t.pasos).toHaveLength(0)
    expect(t.veredicto).toBeNull()
  })

  it('arrastra la observación de cada ronda', () => {
    const t = tendenciaDeEquipo('filete-cinta-aceleracion-1', [
      recorrido({ resultados: { 'filete-cinta-aceleracion-1': 'no-conforme' }, notas: { 'filete-cinta-aceleracion-1': 'Ruido en el motorreductor' } }),
    ])
    expect(t.pasos[0]?.nota).toBe('Ruido en el motorreductor')
  })
})
