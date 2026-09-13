import { describe, it, expect } from 'vitest'
import { criticidadEvaluada, criticidadParaMostrar, CRIT } from '../ctd'
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

/**
 * El arreglo estaba SOLO en la ficha. El listado —sus cuatro vistas: compacta, tarjeta, móvil y
 * PC— pintaba la insignia con el color pleno de una criticidad evaluada, mientras el KPI de la
 * misma pantalla decía «553 Criticidad sin evaluar». Y el Excel de auditoría exportaba «B» para
 * los 553 sin una columna que dijera que nadie la evaluó.
 */
describe('criticidadParaMostrar — el color dice si alguien la evaluó', () => {
  it('sin evaluar: nivel correcto pero insignia ATENUADA y con explicación', () => {
    const v = criticidadParaMostrar(equipo())
    expect(v.nivel).toBe('B')
    expect(v.evaluada).toBe(false)
    expect(v.cls).not.toContain('amber') // no el color pleno de «media»
    expect(v.title).toMatch(/importó|importo/i)
  })

  it('evaluada: color pleno y sin explicación que dar', () => {
    const v = criticidadParaMostrar(equipo({ criticidadEvaluadaEl: '2026-08-24T18:00:00.000Z' }))
    expect(v.cls).toBe(CRIT.media.cls)
    expect(v.title).toBeUndefined()
    expect(v.evaluada).toBe(true)
  })

  it('el nivel NUNCA cambia: lo que cambia es cómo se muestra', () => {
    // Atenuar no es ocultar — el dato sigue a la vista, marcado como lo que es.
    for (const c of ['alta', 'media', 'baja'] as const) {
      expect(criticidadParaMostrar(equipo({ criticidad: c })).nivel).toBe(CRIT[c].nivel)
      expect(criticidadParaMostrar(equipo({ criticidad: c, criticidadEvaluadaEl: 'x' })).nivel).toBe(CRIT[c].nivel)
    }
  })

  it('una criticidad «alta» importada tampoco se pinta como evaluada', () => {
    // El caso que engaña: si mañana la importación trae «alta», seguiría sin evaluar.
    const v = criticidadParaMostrar(equipo({ criticidad: 'alta' }))
    expect(v.nivel).toBe('A')
    expect(v.evaluada).toBe(false)
    expect(v.cls).not.toContain('red')
  })
})
