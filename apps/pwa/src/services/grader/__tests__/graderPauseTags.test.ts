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
