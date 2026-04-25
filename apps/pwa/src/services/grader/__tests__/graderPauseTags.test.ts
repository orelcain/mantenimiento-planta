/**
 * Tests para graderPauseTags.ts — funciones puras, sin Firebase.
 *
 * Cubre: getPauseTagById, resolveEffectiveTag, integridad del catálogo
 * GRADER_PAUSE_TAGS (9 tags, campos requeridos, IDs únicos).
 */

import { describe, it, expect } from 'vitest'
import {
  GRADER_PAUSE_TAGS,
  getPauseTagById,
  resolveEffectiveTag,
  isOperationalTag,
  isOrganizationalTag,
  ORGANIZATIONAL_PAUSE_TAG_IDS,
  OPERATIONAL_PAUSE_TAG_IDS,
} from '../graderPauseTags'

// ── getPauseTagById ───────────────────────────────────────────────────────────

describe('getPauseTagById', () => {
  it('retorna el tag para un id conocido', () => {
    const tag = getPauseTagById('colacion')
    expect(tag).toBeDefined()
    expect(tag?.id).toBe('colacion')
    expect(tag?.label).toBeTruthy()
  })

  it('retorna undefined para un id desconocido', () => {
    expect(getPauseTagById('no_existe')).toBeUndefined()
  })

  it('retorna undefined cuando el argumento es undefined', () => {
    expect(getPauseTagById(undefined)).toBeUndefined()
  })

  it('retorna undefined cuando el argumento es null', () => {
    expect(getPauseTagById(null)).toBeUndefined()
  })

  it('retorna undefined para string vacío', () => {
    expect(getPauseTagById('')).toBeUndefined()
  })
})

// ── resolveEffectiveTag ───────────────────────────────────────────────────────

describe('resolveEffectiveTag', () => {
  it('retorna tag manual cuando solo existe tag manual', () => {
    const tag = resolveEffectiveTag({ tag: 'colacion' })
    expect(tag?.id).toBe('colacion')
  })

  it('retorna autoTag cuando no hay tag manual', () => {
    const tag = resolveEffectiveTag({ autoTag: 'colacion' })
    expect(tag?.id).toBe('colacion')
  })

  it('tag manual prevalece sobre autoTag cuando ambos existen', () => {
    const tag = resolveEffectiveTag({ tag: 'limpieza', autoTag: 'colacion' })
    expect(tag?.id).toBe('limpieza')
  })

  it('retorna undefined cuando no hay ni tag ni autoTag', () => {
    expect(resolveEffectiveTag({})).toBeUndefined()
  })

  it('retorna undefined si tag es un id no registrado en el catálogo', () => {
    expect(resolveEffectiveTag({ tag: 'id_inventado' })).toBeUndefined()
  })

  it('autoTag inválido no impide resolver tag manual válido', () => {
    const tag = resolveEffectiveTag({ tag: 'mantencion', autoTag: 'id_inventado' })
    expect(tag?.id).toBe('mantencion')
  })
})

// ── GRADER_PAUSE_TAGS — integridad del catálogo ───────────────────────────────

describe('GRADER_PAUSE_TAGS', () => {
  it('contiene exactamente 9 tags', () => {
    expect(GRADER_PAUSE_TAGS).toHaveLength(9)
  })

  it('todos los tags tienen id, label, emoji, color, bandFill', () => {
    for (const tag of GRADER_PAUSE_TAGS) {
      expect(tag.id, `${tag.id}.id`).toBeTruthy()
      expect(tag.label, `${tag.id}.label`).toBeTruthy()
      expect(tag.emoji, `${tag.id}.emoji`).toBeTruthy()
      expect(tag.color, `${tag.id}.color`).toMatch(/^#[0-9a-f]{6}$/i)
      expect(tag.bandFill, `${tag.id}.bandFill`).toMatch(/^rgba\(/)
    }
  })

  it('todos los IDs son únicos', () => {
    const ids = GRADER_PAUSE_TAGS.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('contiene el tag "colacion" que usa el detector de pausas', () => {
    expect(GRADER_PAUSE_TAGS.some(t => t.id === 'colacion')).toBe(true)
  })
})

// ── Clasificación operacional vs organizacional (fuente única) ────────────────

describe('Clasificación operacional vs organizacional', () => {
  it('los sets son disjuntos (un tag NO puede ser ambas categorías)', () => {
    for (const id of ORGANIZATIONAL_PAUSE_TAG_IDS) {
      expect((OPERATIONAL_PAUSE_TAG_IDS as Set<string>).has(id)).toBe(false)
    }
    for (const id of OPERATIONAL_PAUSE_TAG_IDS) {
      expect((ORGANIZATIONAL_PAUSE_TAG_IDS as Set<string>).has(id)).toBe(false)
    }
  })

  it('todos los GRADER_PAUSE_TAGS están clasificados (cobertura completa)', () => {
    for (const tag of GRADER_PAUSE_TAGS) {
      const isInOrg = (ORGANIZATIONAL_PAUSE_TAG_IDS as Set<string>).has(tag.id)
      const isInOp  = (OPERATIONAL_PAUSE_TAG_IDS as Set<string>).has(tag.id)
      expect(isInOrg || isInOp, `tag ${tag.id} sin clasificar`).toBe(true)
    }
  })
})

describe('isOrganizationalTag', () => {
  it('detecta los 4 organizacionales (colacion, ejercicios, cambio_lote, limpieza)', () => {
    expect(isOrganizationalTag('colacion')).toBe(true)
    expect(isOrganizationalTag('ejercicios')).toBe(true)
    expect(isOrganizationalTag('cambio_lote')).toBe(true)
    expect(isOrganizationalTag('limpieza')).toBe(true)
  })
  it('NO detecta operacionales', () => {
    expect(isOrganizationalTag('mantencion')).toBe(false)
    expect(isOrganizationalTag('falla_equipo')).toBe(false)
    expect(isOrganizationalTag('espera_mp')).toBe(false)
    expect(isOrganizationalTag('ajuste_gates')).toBe(false)
    expect(isOrganizationalTag('otro')).toBe(false)
  })
  it('null / undefined / "" / desconocido retornan false', () => {
    expect(isOrganizationalTag(null)).toBe(false)
    expect(isOrganizationalTag(undefined)).toBe(false)
    expect(isOrganizationalTag('')).toBe(false)
    expect(isOrganizationalTag('id_inventado')).toBe(false)
  })
})

describe('isOperationalTag', () => {
  it('detecta los 5 operacionales', () => {
    expect(isOperationalTag('mantencion')).toBe(true)
    expect(isOperationalTag('ajuste_gates')).toBe(true)
    expect(isOperationalTag('espera_mp')).toBe(true)
    expect(isOperationalTag('falla_equipo')).toBe(true)
    expect(isOperationalTag('otro')).toBe(true)
  })
  it('NO detecta organizacionales', () => {
    expect(isOperationalTag('colacion')).toBe(false)
    expect(isOperationalTag('ejercicios')).toBe(false)
    expect(isOperationalTag('cambio_lote')).toBe(false)
    expect(isOperationalTag('limpieza')).toBe(false)
  })
  it('null / undefined / "" / desconocido retornan false', () => {
    expect(isOperationalTag(null)).toBe(false)
    expect(isOperationalTag(undefined)).toBe(false)
    expect(isOperationalTag('')).toBe(false)
    expect(isOperationalTag('id_inventado')).toBe(false)
  })
})
