import { describe, expect, it } from 'vitest'
import type { Acr, AccionAcr, CausaAcr } from '../acr.types'
import {
  MAX_PORQUES,
  MENSAJE_LATENTE_SIN_CAUSAS,
  MENSAJE_LATENTE_SIN_NIVEL,
  aplicaAnalisis,
  cadenaPorQues,
  eventoRequiereAcr,
  kpiFuerzaAcciones,
  motivoNoCierra,
  motivoNoPropone,
  puedeCerrar,
  resumenFuerza,
} from '../acrLogica'

describe('cadenaPorQues', () => {
  const base = { queSeRompio: 'Resorte', queHacemos: 'Regulador' }

  it('el porqué 1 va primero, seguido de los extra', () => {
    expect(cadenaPorQues({ ...base, porQue: 'A', porQues: ['B', 'C'] })).toEqual(['A', 'B', 'C'])
  })

  it('sin porQues (ACR guardados antes de la cadena) es solo el porqué 1', () => {
    expect(cadenaPorQues({ ...base, porQue: 'A' })).toEqual(['A'])
  })

  it('descarta vacíos y espacios, y recorta los textos', () => {
    expect(cadenaPorQues({ ...base, porQue: '  A ', porQues: ['', '   ', ' B', 'C  '] })).toEqual(['A', 'B', 'C'])
  })

  it('sin porqué 1 ni extra con texto da lista vacía', () => {
    expect(cadenaPorQues({ ...base, porQue: '', porQues: ['  '] })).toEqual([])
  })

  it('el máximo son 5 porqués contando el primero', () => {
    expect(MAX_PORQUES).toBe(5)
  })
})

const EQUIPO = 'EVISCERADORA BAADER 142 N1'

function acrBase(over: Partial<Acr> = {}): Acr {
  return {
    id: 'acr-1',
    version: 2,
    plantId: 'chonchi',
    eventoBitacoraIds: ['ev-1'],
    equipo: EQUIPO,
    fechaTurno: '2026-09-24',
    definicion: 'Se corta resorte ingreso chapaleta baader 1.',
    minutosDetencion: 7,
    evidencias: [],
    piezaGuardada: false,
    causas: [],
    acciones: [],
    verificacion: { criterio: 'Sin repetir la falla durante 60 días', dias: 60, resultado: 'pendiente' },
    estado: 'borrador',
    createdBy: 'uid-1',
    createdByNombre: 'Técnico',
    createdAt: new Date('2026-09-24'),
    updatedAt: new Date('2026-09-24'),
    ...over,
  }
}

const causa = (nivel: CausaAcr['nivel'], id: string = nivel): CausaAcr => ({ id, texto: `causa ${nivel}`, nivel, m6: null })
const accion = (fuerza: AccionAcr['fuerza'], id: string, texto = `acción ${id}`): AccionAcr => ({
  id,
  texto,
  fuerza,
  causaId: null,
  responsable: 'planificación',
  fechaLimite: null,
  estado: 'pendiente',
})

/** Caso real del mockup: resorte de la chapaleta, 3 acciones (débil, media, fuerte). */
const CASO_REAL = acrBase({
  respuestas: {
    queSeRompio: 'Resorte de ingreso de la chapaleta, cortado',
    porQue: 'Golpea fuerte, en N3 se puso regulador',
    queHacemos: 'Regulador de aire en N1 y N2',
  },
  causas: [causa('fisica', 'c1'), causa('humana', 'c2'), causa('latente', 'c3')],
  acciones: [accion('debil', 'a1'), accion('media', 'a2'), accion('fuerte', 'a3')],
  evidencias: [{ path: 'bitacora/T/E/f.jpg', url: 'https://x/f.jpg', nota: 'Foto', origen: 'bitacora' }],
  piezaGuardada: true,
})

describe('kpiFuerzaAcciones', () => {
  it('caso real del mockup: 3 acciones, 1 fuerte → 33 %, agrupado por equipo y mes', () => {
    const k = kpiFuerzaAcciones([CASO_REAL], { start: '2026-09-01', end: '2026-09-30' })
    expect(k.acciones).toBe(3)
    expect(k.debil).toBe(1)
    expect(k.media).toBe(1)
    expect(k.fuerte).toBe(1)
    expect(k.fuertePct).toBeCloseTo(100 / 3)
    expect(k.porEquipoMes).toHaveLength(1)
    expect(k.porEquipoMes[0]).toMatchObject({
      equipo: EQUIPO,
      mes: '2026-09',
      acrs: 1,
      acciones: 3,
      fuertes: 1,
    })
    expect(k.porEquipoMes[0]?.fuertePct).toBeCloseTo(100 / 3)
  })

  it('rango vacío → fuertePct null y sin filas', () => {
    const k = kpiFuerzaAcciones([CASO_REAL], { start: '2026-10-01', end: '2026-10-31' })
    expect(k.acrs).toBe(0)
    expect(k.acciones).toBe(0)
    expect(k.fuertePct).toBeNull()
    expect(k.porEquipoMes).toEqual([])
  })

  it('sin ninguna lista de ACR → métricas neutras', () => {
    const k = kpiFuerzaAcciones([], { start: '2026-09-01', end: '2026-09-30' })
    expect(k.fuertePct).toBeNull()
  })

  it('incluye ACR en borrador y cerrados; el rango es inclusivo en los dos extremos', () => {
    const borrador = acrBase({ id: 'b', estado: 'borrador', fechaTurno: '2026-09-01', acciones: [accion('fuerte', 'x')] })
    const cerrado = acrBase({ id: 'c', estado: 'cerrado', fechaTurno: '2026-09-30', acciones: [accion('debil', 'y')] })
    const fuera = acrBase({ id: 'f', fechaTurno: '2026-10-01', acciones: [accion('fuerte', 'z')] })
    const k = kpiFuerzaAcciones([borrador, cerrado, fuera], { start: '2026-09-01', end: '2026-09-30' })
    expect(k.acrs).toBe(2)
    expect(k.acciones).toBe(2)
    expect(k.fuertePct).toBe(50)
  })

  it('orden: mes descendente y luego equipo ascendente', () => {
    const acrs = [
      acrBase({ id: '1', equipo: 'Zeta', fechaTurno: '2026-09-02', acciones: [accion('media', 'a')] }),
      acrBase({ id: '2', equipo: 'Alfa', fechaTurno: '2026-08-02', acciones: [accion('media', 'b')] }),
      acrBase({ id: '3', equipo: 'Alfa', fechaTurno: '2026-09-03', acciones: [accion('media', 'c')] }),
    ]
    const k = kpiFuerzaAcciones(acrs, { start: '2026-08-01', end: '2026-09-30' })
    expect(k.porEquipoMes.map((f) => `${f.mes}|${f.equipo}`)).toEqual([
      '2026-09|Alfa',
      '2026-09|Zeta',
      '2026-08|Alfa',
    ])
  })

  it('una fila sin acciones tiene fuertePct null', () => {
    const k = kpiFuerzaAcciones([acrBase({ acciones: [] })], { start: '2026-09-01', end: '2026-09-30' })
    expect(k.porEquipoMes[0]?.fuertePct).toBeNull()
    expect(k.fuertePct).toBeNull()
  })
})

describe('resumenFuerza', () => {
  it('sin acciones → null, con acciones → porcentaje sin redondear', () => {
    expect(resumenFuerza([]).fuertePct).toBeNull()
    expect(resumenFuerza([accion('fuerte', 'a'), accion('fuerte', 'b')]).fuertePct).toBe(100)
  })
})

describe('motivoNoCierra y puedeCerrar (R1)', () => {
  it('el caso real del mockup se puede cerrar; el borrador vacío no', () => {
    expect(puedeCerrar(CASO_REAL)).toBe(true)
    expect(motivoNoCierra(CASO_REAL)).toBeNull()
    expect(puedeCerrar(acrBase())).toBe(false)
  })

  it('pide las 3 respuestas, en orden', () => {
    const sinQue = acrBase({ ...CASO_REAL, respuestas: { ...CASO_REAL.respuestas!, queSeRompio: '  ' } })
    expect(motivoNoCierra(sinQue)).toBe('Falta: qué se rompió.')
    const sinPorQue = acrBase({ ...CASO_REAL, respuestas: { ...CASO_REAL.respuestas!, porQue: '' } })
    expect(motivoNoCierra(sinPorQue)).toBe('Falta: por qué se rompió.')
    const sinHacer = acrBase({ ...CASO_REAL, respuestas: { ...CASO_REAL.respuestas!, queHacemos: '' } })
    expect(motivoNoCierra(sinHacer)).toBe('Falta: qué hacemos para que no vuelva.')
  })

  it('sin causas todavía, el motivo dice qué tocar: proponer o armar a mano', () => {
    const sinCausas = acrBase({ ...CASO_REAL, causas: [] })
    expect(puedeCerrar(sinCausas)).toBe(false)
    expect(motivoNoCierra(sinCausas)).toBe('Falta la causa latente: toca «Proponer causas» o «Armar a mano».')
    expect(motivoNoCierra(sinCausas)).toBe(MENSAJE_LATENTE_SIN_CAUSAS)
  })

  it('con causas pero sin latente, el motivo dice cambiarle el nivel a una causa', () => {
    const sinLatente = acrBase({ ...CASO_REAL, causas: [causa('fisica', 'c1'), causa('humana', 'c2')] })
    expect(puedeCerrar(sinLatente)).toBe(false)
    expect(motivoNoCierra(sinLatente)).toBe('Falta la causa latente: toca una causa y cámbiale el nivel a Latente.')
    expect(motivoNoCierra(sinLatente)).toBe(MENSAJE_LATENTE_SIN_NIVEL)
  })

  it('exige al menos una acción y que tenga texto', () => {
    expect(motivoNoCierra(acrBase({ ...CASO_REAL, acciones: [] }))).not.toBeNull()
    expect(motivoNoCierra(acrBase({ ...CASO_REAL, acciones: [accion('fuerte', 'a', '  ')] }))).not.toBeNull()
  })
})

describe('aplicaAnalisis', () => {
  it('solo correctivo o falla con detención de máquina (R1)', () => {
    expect(aplicaAnalisis({ tipo: 'correctivo', minutosParada: 7 })).toBe(true)
    expect(aplicaAnalisis({ tipo: 'falla', minutosParada: 1 })).toBe(true)
    expect(aplicaAnalisis({ tipo: 'correctivo', minutosParada: null })).toBe(false)
    expect(aplicaAnalisis({ tipo: 'rutinario', minutosParada: 5 })).toBe(false)
  })
})

describe('eventoRequiereAcr', () => {
  it('correctivo o falla siempre; otros tipos solo con detención', () => {
    expect(eventoRequiereAcr({ tipo: 'correctivo', minutosParada: null })).toBe(true)
    expect(eventoRequiereAcr({ tipo: 'falla', minutosParada: 0 })).toBe(true)
    expect(eventoRequiereAcr({ tipo: 'rutinario', minutosParada: 5 })).toBe(true)
    expect(eventoRequiereAcr({ tipo: 'rutinario', minutosParada: 0 })).toBe(false)
    expect(eventoRequiereAcr({ tipo: 'inspeccion', minutosParada: null })).toBe(false)
  })
})

describe('motivoNoPropone', () => {
  const vacias = { queSeRompio: 'Resorte roto', porQue: '', queHacemos: '' }

  it('sin la pregunta 2 dice que responda la 2', () => {
    expect(motivoNoPropone(vacias)).toBe('Para proponer, responde la pregunta 2.')
    expect(motivoNoPropone({ porQue: '   ', queHacemos: 'Cambiar el resorte' })).toBe('Para proponer, responde la pregunta 2.')
  })

  it('con la pregunta 2 y sin la 3 dice que responda la 3', () => {
    expect(motivoNoPropone({ porQue: 'Fatiga', queHacemos: '' })).toBe('Para proponer, responde la pregunta 3.')
    expect(motivoNoPropone({ porQue: 'Fatiga', queHacemos: '  ' })).toBe('Para proponer, responde la pregunta 3.')
  })

  it('con las preguntas 2 y 3 respondidas no hay motivo', () => {
    expect(motivoNoPropone({ porQue: 'Fatiga', queHacemos: 'Cambiar el resorte' })).toBeNull()
  })
})
