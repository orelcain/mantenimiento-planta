import { describe, expect, it } from 'vitest'
import type { AccionAcr } from '../acr.types'
import { estadoDeAccion, fechaCorta, resumenCumplimiento } from '../revisionSemanal'

const accion = (extra: Partial<AccionAcr>): AccionAcr => ({
  id: 'a', texto: 'x', fuerza: 'media', causaId: null, responsable: 'Eléctrico', fechaLimite: null, estado: 'pendiente', ...extra,
})
const HOY = '2026-11-09'

describe('estadoDeAccion', () => {
  it('vence recién el día después de la fecha límite', () => {
    expect(estadoDeAccion(accion({ fechaLimite: '2026-11-08' }), HOY)).toBe('vencida')
    expect(estadoDeAccion(accion({ fechaLimite: HOY }), HOY)).toBe('pendiente')
  })
  it('sin fecha no vence y una hecha nunca vence', () => {
    expect(estadoDeAccion(accion({}), HOY)).toBe('pendiente')
    expect(estadoDeAccion(accion({ estado: 'hecha', fechaLimite: '2020-01-01' }), HOY)).toBe('hecha')
  })
})

describe('resumenCumplimiento', () => {
  it('hechas y pendientes suman el total; vencidas va dentro de pendientes', () => {
    const r = resumenCumplimiento([accion({ estado: 'hecha' }), accion({ fechaLimite: '2020-01-01' }), accion({ responsable: '  ' })], HOY)
    expect(r).toEqual({ hechas: 1, pendientes: 2, vencidas: 1, sinResponsable: 1 })
  })
})

describe('fechaCorta', () => {
  it('muestra día y mes, o raya', () => {
    expect(fechaCorta('2026-09-24')).toBe('24-09')
    expect(fechaCorta(null)).toBe('—')
  })
})
