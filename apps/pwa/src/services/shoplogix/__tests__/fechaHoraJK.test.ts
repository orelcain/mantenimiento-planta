import { describe, it, expect, beforeAll } from 'vitest'
import { fechaHoraJK } from '../fechaHoraJK'

// Caso real: Knuro del 25-11 Chonchi, 22:53 de planta. Fixture jk-chonchi-expulsador.json (2026-11-25_Turno 1).
const KNURO_2511_2253 = 1795647183251

describe('fechaHoraJK · hora de planta, no del navegador', () => {
  beforeAll(() => {
    // Zona de Chile (-03 en noviembre). Con getters locales, esto daría 19:53.
    process.env.TZ = 'America/Santiago'
  })

  it('25-11 22:53 sale como «25-nov 22:53»', () => {
    expect(fechaHoraJK(KNURO_2511_2253)).toBe('25-nov 22:53')
  })
})
