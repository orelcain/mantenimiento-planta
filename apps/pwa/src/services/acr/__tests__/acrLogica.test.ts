import { describe, expect, it } from 'vitest'
import type { Acr, AccionAcr, CausaAcr } from '../acr.types'
import {
  MENSAJE_LATENTE,
  eventoRequiereAcr,
  faltaParaAvanzar,
  faltaParaIr,
  kpiFuerzaAcciones,
  primerPasoPendiente,
  puedeCerrar,
  resumenFuerza,
} from '../acrLogica'

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

describe('faltaParaAvanzar', () => {
  it('definir: exige texto', () => {
    expect(faltaParaAvanzar('definir', acrBase({ definicion: '   ' }))).not.toBeNull()
    expect(faltaParaAvanzar('definir', acrBase())).toBeNull()
  })

  it('piezaGuardada sola habilita evidencia (sin fotos)', () => {
    expect(faltaParaAvanzar('evidencia', acrBase({ evidencias: [], piezaGuardada: true }))).toBeNull()
    expect(faltaParaAvanzar('evidencia', acrBase({ evidencias: [], piezaGuardada: false }))).not.toBeNull()
  })

  it('una foto sola también habilita evidencia', () => {
    const conFoto = acrBase({
      evidencias: [{ path: 'p', url: 'u', nota: '', origen: 'acr' }],
      piezaGuardada: false,
    })
    expect(faltaParaAvanzar('evidencia', conFoto)).toBeNull()
  })

  it('sin latente bloquea analizar, aunque haya causas físicas y humanas', () => {
    const sinLatente = acrBase({ causas: [causa('fisica', 'c1'), causa('humana', 'c2')] })
    expect(faltaParaAvanzar('analizar', sinLatente)).toBe(MENSAJE_LATENTE)
    expect(faltaParaAvanzar('analizar', CASO_REAL)).toBeNull()
  })

  it('analizar sin ninguna causa pide una causa antes que la latente', () => {
    expect(faltaParaAvanzar('analizar', acrBase({ causas: [] }))).toBe('Agrega al menos una causa.')
  })

  it('acciones: exige al menos una y que todas tengan texto', () => {
    expect(faltaParaAvanzar('acciones', acrBase({ acciones: [] }))).not.toBeNull()
    expect(faltaParaAvanzar('acciones', acrBase({ acciones: [accion('fuerte', 'a', '  ')] }))).not.toBeNull()
    expect(faltaParaAvanzar('acciones', CASO_REAL)).toBeNull()
  })

  it('verificar: criterio no vacío y días mayores que cero', () => {
    expect(
      faltaParaAvanzar('verificar', acrBase({ verificacion: { criterio: '', dias: 60, resultado: 'pendiente' } })),
    ).not.toBeNull()
    expect(
      faltaParaAvanzar('verificar', acrBase({ verificacion: { criterio: 'x', dias: 0, resultado: 'pendiente' } })),
    ).not.toBeNull()
    expect(faltaParaAvanzar('verificar', acrBase())).toBeNull()
  })
})

describe('cierre y navegación entre pasos', () => {
  it('el caso real del mockup se puede cerrar; el borrador vacío no', () => {
    expect(puedeCerrar(CASO_REAL)).toBe(true)
    expect(puedeCerrar(acrBase())).toBe(false)
    expect(primerPasoPendiente(acrBase())).toBe('evidencia')
  })

  it('faltaParaIr revisa cada paso que se deja atrás y permite volver sin revisar', () => {
    const solo = acrBase()
    expect(faltaParaIr(solo, 'definir', 'evidencia')).toBeNull()
    expect(faltaParaIr(solo, 'definir', 'analizar')?.paso).toBe('evidencia')
    expect(faltaParaIr(solo, 'verificar', 'definir')).toBeNull()
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
