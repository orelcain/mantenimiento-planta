import { describe, it, expect } from 'vitest'
import { criticidadEvaluada, CRIT } from '../ctd'
import type { Equipment } from '@/types'

/**
 * Los 553 equipos entraron por la importación SAP con `criticidad: 'media'` —el
 * valor por defecto del formulario— y nadie la cambió nunca. El Centro Técnico
 * Documental mostraba "Criticidad B · Inspección base ~365 días" como si fuera
 * una evaluación NFPA 70B §2.4, y el KPI "Criticidad A: 0" se leía como "no hay
 * equipos críticos" en vez de "nadie los ha clasificado".
 */
const equipo = (over: Partial<Equipment> = {}) => ({ criticidad: 'media', ...over }) as Equipment

describe('criticidadEvaluada', () => {
  it('un equipo recién importado NO tiene la criticidad evaluada', () => {
    expect(criticidadEvaluada(equipo())).toBe(false)
  })

  it('queda evaluada cuando alguien la guarda desde el formulario', () => {
    expect(criticidadEvaluada(equipo({ criticidadEvaluadaEl: '2026-08-24T18:00:00.000Z' }))).toBe(true)
  })

  it('no basta con que la criticidad sea distinta de "media"', () => {
    // Alguien pudo haberla importado como alta; evaluarla es un acto humano
    // con fecha, no un valor.
    expect(criticidadEvaluada(equipo({ criticidad: 'alta' }))).toBe(false)
  })

  it('el nivel que se muestra sigue saliendo de la criticidad', () => {
    expect(CRIT.alta.nivel).toBe('A')
    expect(CRIT.media.nivel).toBe('B')
    expect(CRIT.baja.nivel).toBe('C')
  })
})
