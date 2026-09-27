import { describe, expect, it } from 'vitest'
import {
  PAUTA_POST_ASEO,
  avisoDeInspeccion,
  frasePorLiberacion,
  pautaCambio,
  pautaDeLaInspeccion,
  resumenDeInspeccion,
  type DesviacionDeInspeccion,
} from '../modeloInspeccion'

const TODOS = Object.fromEntries(PAUTA_POST_ASEO.criterios.map((c) => [c.id, 'conforme' as const]))

const desviacion = (p: Partial<DesviacionDeInspeccion> = {}): DesviacionDeInspeccion => ({
  id: 'd1',
  criterioId: 'neumatico',
  pendiente: false,
  critica: false,
  desdeMin: 40,
  hastaMin: 80,
  ...p,
})

describe('el avance de la pauta', () => {
  it('no sugiere liberar mientras falten puntos por revisar', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: { mecanico: 'conforme' } }, [])
    expect(r.revisados).toBe(1)
    expect(r.total).toBe(7)
    expect(r.sugerido).toBeNull()
  })

  it('cuenta conformes y no conformes por separado', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: { ...TODOS, neumatico: 'no-conforme' } }, [desviacion()])
    expect(r.conformes).toBe(6)
    expect(r.noConformes).toBe(1)
    expect(r.revisados).toBe(7)
  })
})

describe('el estado de la liberación se deduce, no se marca', () => {
  it('sin desviaciones es conforme', () => {
    expect(resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, []).sugerido).toBe('conforme')
  })

  it('con desviaciones todas cerradas es «corregida antes del arranque»', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [desviacion(), desviacion({ id: 'd2' })])
    expect(r.sugerido).toBe('corregida')
    expect(r.pendientes).toBe(0)
  })

  it('con una abierta pasa a «con pendientes controlados»', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion(),
      desviacion({ id: 'd2', pendiente: true, hastaMin: null }),
    ])
    expect(r.sugerido).toBe('con-pendientes')
    expect(r.pendientes).toBe(1)
  })

  it('nunca sugiere «no liberada»: esa la marca una persona', () => {
    for (const ds of [[], [desviacion()], [desviacion({ pendiente: true, hastaMin: null })]]) {
      expect(resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, ds).sugerido).not.toBe('no-liberada')
    }
  })
})

describe('la corrida: lo que hoy no queda en ninguna parte', () => {
  it('va de la primera desviación a la última cerrada', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion({ id: 'd1', desdeMin: 40, hastaMin: 70 }),
      desviacion({ id: 'd2', desdeMin: 55, hastaMin: 85 }),
    ])
    expect(r.minutosDeCorrida).toBe(45)
  })

  it('no inventa minutos si ninguna se cerró', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion({ pendiente: true, hastaMin: null }),
    ])
    expect(r.minutosDeCorrida).toBeNull()
  })

  it('ignora las desviaciones sin hora en vez de romperse', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion({ id: 'd1', desdeMin: null, hastaMin: null }),
      desviacion({ id: 'd2', desdeMin: 30, hastaMin: 60 }),
    ])
    expect(r.minutosDeCorrida).toBe(30)
  })
})

describe('la frase de la entrega', () => {
  it('dice cuánto tomó la corrida', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion({ id: 'd1', desdeMin: 40, hastaMin: 80 }),
      desviacion({ id: 'd2', desdeMin: 45, hastaMin: 75 }),
    ])
    expect(frasePorLiberacion('corregida', r)).toBe('2 desviaciones resueltas en 40 min antes del arranque.')
  })

  it('en singular no dice «desviaciones»', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion({ pendiente: true, hastaMin: null }),
    ])
    expect(frasePorLiberacion('con-pendientes', r)).toBe('1 de 1 desviación queda abierta, controladas.')
  })
})

describe('las desviaciones críticas (§8) no se lavan', () => {
  it('cuenta aparte las abiertas que detienen una línea', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion({ id: 'd1', pendiente: true, critica: true, hastaMin: null }),
      desviacion({ id: 'd2', pendiente: true, critica: false, hastaMin: null }),
    ])
    expect(r.pendientes).toBe(2)
    expect(r.pendientesCriticos).toBe(1)
  })

  it('una crítica ya cerrada no cuenta: lo que importa es lo que queda abierto', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [desviacion({ critica: true })])
    expect(r.pendientesCriticos).toBe(0)
    expect(r.sugerido).toBe('corregida')
  })

  it('con una crítica abierta la frase NO dice «controladas»', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion({ pendiente: true, critica: true, hastaMin: null }),
    ])
    expect(frasePorLiberacion('con-pendientes', r)).toContain('detiene una línea')
    expect(frasePorLiberacion('con-pendientes', r)).not.toContain('controladas')
  })

  it('sin críticas abiertas sí dice «controladas»', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion({ pendiente: true, critica: false, hastaMin: null }),
    ])
    expect(frasePorLiberacion('con-pendientes', r)).toContain('controladas')
  })
})

describe('el recorrido y las observaciones', () => {
  it('mide de la primera marca a la última', () => {
    const r = resumenDeInspeccion(
      PAUTA_POST_ASEO,
      { resultados: TODOS, marcas: { mecanico: '2026-09-20T09:20:00Z', despejado: '2026-09-20T10:05:00Z' } },
      [],
    )
    expect(r.minutosDeRecorrido).toBe(45)
  })

  it('con una sola marca no inventa un recorrido', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS, marcas: { mecanico: '2026-09-20T09:20:00Z' } }, [])
    expect(r.minutosDeRecorrido).toBeNull()
  })

  it('cuenta los «conforme con observación», y una nota en blanco no cuenta', () => {
    const r = resumenDeInspeccion(
      PAUTA_POST_ASEO,
      { resultados: TODOS, notas: { mecanico: 'Rodillo 3 empieza a sonar', electrico: '   ' } },
      [],
    )
    expect(r.conObservacion).toBe(1)
  })
})

describe('«corregido»: encontrado y resuelto antes de entregar', () => {
  it('cuenta como revisado y libera igual que un conforme', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: { ...TODOS, mecanico: 'corregido' } }, [])
    expect(r.revisados).toBe(7)
    expect(r.corregidos).toBe(1)
    expect(r.conformes).toBe(6)
    expect(r.sugerido).toBe('conforme')
  })

  it('no se cuenta como no conforme: el criterio de liberación mira el estado AL ENTREGAR', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: { ...TODOS, mecanico: 'corregido' } }, [])
    expect(r.noConformes).toBe(0)
  })

  it('la frase de la entrega dice cuántos se corrigieron al pasar', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: { ...TODOS, mecanico: 'corregido' } }, [])
    expect(frasePorLiberacion('conforme', r)).toBe('7 de 7 conformes, 1 corregido antes de entregar.')
  })
})

describe('la contradicción que encontró Orel: «no conforme» sin desviación', () => {
  it('se cuenta aparte para poder decirlo en el informe', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: { ...TODOS, mecanico: 'no-conforme' } }, [])
    expect(r.noConformes).toBe(1)
    expect(r.noConformesSinDesviacion).toBe(1)
  })

  it('con su desviación anotada, deja de contarse', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: { ...TODOS, mecanico: 'no-conforme' } }, [
      desviacion({ criterioId: 'mecanico' }),
    ])
    expect(r.noConformesSinDesviacion).toBe(0)
  })

  it('una desviación de OTRO punto no tapa el hueco', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: { ...TODOS, mecanico: 'no-conforme' } }, [
      desviacion({ criterioId: 'neumatico' }),
    ])
    expect(r.noConformesSinDesviacion).toBe(1)
  })
})

describe('lo que no se pudo evaluar no se da por inofensivo', () => {
  it('una desviacion abierta sin equipo reconocible se cuenta aparte', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion({ pendiente: true, critica: null, hastaMin: null }),
    ])
    expect(r.sinEvaluar).toBe(1)
    expect(r.pendientesCriticos).toBe(0)
  })

  it('la frase NO dice «controladas» cuando algo quedo sin evaluar', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion({ pendiente: true, critica: null, hastaMin: null }),
    ])
    // Ni «controladas» (sería lavarlo) ni «sin poder evaluar» (jerga nuestra): la cifra y punto.
    expect(frasePorLiberacion('con-pendientes', r)).toBe('1 de 1 desviación queda abierta.')
  })

  it('una critica confirmada manda sobre una sin evaluar', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion({ id: 'd1', pendiente: true, critica: true, hastaMin: null }),
      desviacion({ id: 'd2', pendiente: true, critica: null, hastaMin: null }),
    ])
    expect(frasePorLiberacion('con-pendientes', r)).toContain('detiene una linea'.replace('linea', 'línea'))
  })

  it('una cerrada sin evaluar no cuenta: solo importa lo que queda abierto', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [desviacion({ critica: null })])
    expect(r.sinEvaluar).toBe(0)
  })
})

describe('la inspeccion se recorre con la pauta con que empezo', () => {
  const guardada = { pautaId: 'post-aseo', pautaVersion: 1, criterios: [{ id: 'mecanico', titulo: 'Equipos mecanicos', ayuda: '' }] }
  const viva = { ...PAUTA_POST_ASEO, version: 4 }

  it('usa los criterios guardados, no los de la pauta viva', () => {
    const p = pautaDeLaInspeccion(viva, guardada)
    expect(p.criterios).toHaveLength(1)
    expect(p.version).toBe(1)
  })

  it('una inspeccion vieja, sin criterios guardados, cae a la pauta viva', () => {
    expect(pautaDeLaInspeccion(viva, { pautaId: 'post-aseo', pautaVersion: 1 }).criterios).toHaveLength(7)
  })

  it('avisa cuando la pauta se edito despues de empezar', () => {
    expect(pautaCambio(viva, guardada)).toBe(true)
    expect(pautaCambio(PAUTA_POST_ASEO, guardada)).toBe(false)
    // Sin criterios guardados no hay con que comparar: no se avisa.
    expect(pautaCambio(viva, { pautaVersion: 1 })).toBe(false)
  })
})

describe('el aviso: que toca y que quedo a medias', () => {
  const r = (revisados: number) => ({ revisados, total: 7 })

  it('un turno de domingo sin inspeccion dice que toca', () => {
    // 20-09-2026 es domingo.
    expect(avisoDeInspeccion('2026-09-20', null, r(0))).toBe('toca')
  })

  it('cualquier otro dia no molesta', () => {
    expect(avisoDeInspeccion('2026-09-21', null, r(0))).toBeNull()
  })

  it('el dia se calcula a mediodia: la zona horaria no puede correrlo', () => {
    // A medianoche UTC-3 esto caeria en sabado y el aviso no saldria el domingo.
    expect(avisoDeInspeccion('2026-09-20', null, r(0))).toBe('toca')
    expect(avisoDeInspeccion('2026-09-27', null, r(0))).toBe('toca')
  })

  it('empezada y sin terminar queda «a medias»', () => {
    expect(avisoDeInspeccion('2026-09-21', { liberacion: null }, r(3))).toBe('a-medias')
  })

  it('completa pero sin entregar la planta se dice aparte', () => {
    expect(avisoDeInspeccion('2026-09-21', { liberacion: null }, r(7))).toBe('sin-liberar')
  })

  it('entregada no avisa nada', () => {
    const l = { estado: 'conforme' as const, en: '2026-09-21T10:00:00.000Z', porNombre: 'Danilo' }
    expect(avisoDeInspeccion('2026-09-20', { liberacion: l }, r(7))).toBeNull()
  })
})

/**
 * §8 pide las desviaciones «corregidas **o controladas** antes de la puesta en marcha». La app
 * solo sabía decir *corregidas*: una falla que se sobrellevó toda la noche a mano para no
 * detener el proceso quedaba como «No conforme» a secas (Orel, 21-09-2026).
 */
describe('un punto controlado con contingencia', () => {
  const conControlado = { ...TODOS, electrico: 'controlado' as const }

  it('cuenta como revisado, pero no como conforme', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: conControlado }, [
      desviacion({ criterioId: 'electrico', pendiente: true, hastaMin: null }),
    ])
    expect(r.revisados).toBe(r.total)
    expect(r.controlados).toBe(1)
    expect(r.conformes).toBe(r.total - 1)
    expect(r.noConformes).toBe(0)
  })

  it('deja la entrega en «con pendientes controlados», no en «conforme»', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: conControlado }, [
      desviacion({ criterioId: 'electrico', pendiente: true, hastaMin: null }),
    ])
    expect(r.sugerido).toBe('con-pendientes')
  })

  it('la frase de la entrega nombra la contingencia: es el trabajo que se hizo', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: conControlado }, [
      desviacion({ criterioId: 'electrico', pendiente: true, critica: false, hastaMin: null }),
    ])
    expect(frasePorLiberacion('con-pendientes', r)).toContain('contingencia aplicada')
  })

  /** Un punto abierto sin desviación anotada NO puede sugerir «conforme»: es el mismo lavado. */
  it('sin desviación anotada igual deja pendientes', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: conControlado }, [])
    expect(r.noConformesSinDesviacion).toBe(1)
    expect(r.sugerido).toBe('con-pendientes')
  })
})

/**
 * Siete marcas a las 18:09 en una pauta del domingo completada el lunes daban un «recorrido de
 * 833 min» que nadie caminó. Sin marcas no hay recorrido que declarar.
 */
describe('la hora del punto es opcional', () => {
  it('sin marcas no se inventa un recorrido', () => {
    expect(resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, []).minutosDeRecorrido).toBeNull()
  })

  it('con una sola marca tampoco: un punto no es un recorrido', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS, marcas: { electrico: '2026-09-20T12:16:00.000Z' } }, [])
    expect(r.minutosDeRecorrido).toBeNull()
  })
})
