/**
 * Los totales VALIDADOS de las reglas, protegidos con datos reales: 5 turnos de Chonchi (262 micro: Arranque 26 · Línea común 52 · Tras detención 3 ·
 * Ritmo bajo 34 · Sin contexto 147) y 5 de Filete (77 micro: 9 · 0 · 6 · 0 · 62), del 28-10 al 02-11-2026.
 *
 * Los conteos por turno de `fixtures/turnos_validados.json` los dio el script de la validación (`reglas_v2.mjs`), una implementación APARTE de
 * `microCausa.ts` que se escribió y corrió sobre los mismos docs: si el clasificador se desvía en una sola micro, falla aquí con el turno. Los
 * dos turnos del 02-11 vienen de sus fixtures de siempre (`chonchi_0211_turno2.json`, `filete_0211_dia.json`).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAUSAS_MICRO, contarPorCausa, type CausaMicro } from '../microCausa'
import { CHONCHI_0211_T2, FILETE_0211_DIA, clasificarDoc, type DocMicro } from './microFixtures'

type Conteo = Record<CausaMicro, number>
interface TurnoValidado { id: string; planta: 'Chonchi' | 'Filete'; turno: string; micro: number; esperado: Conteo; doc: Omit<DocMicro, '_fuente'> }

const { turnos: otros } = JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'turnos_validados.json'), 'utf8')) as { turnos: TurnoValidado[] }

const conDocPropio = (id: string, planta: TurnoValidado['planta'], turno: string, micro: number, esperado: Conteo, doc: DocMicro): TurnoValidado => ({ id, planta, turno, micro, esperado, doc })
const TURNOS: TurnoValidado[] = [
  conDocPropio('2026-11-02_Turno 2', 'Chonchi', 'Turno 2', 46, { arranque: 0, linea: 17, paro: 1, ritmo: 6, sin: 22 }, CHONCHI_0211_T2),
  conDocPropio('2026-11-02_Turno Dia', 'Filete', 'Turno Dia', 20, { arranque: 2, linea: 0, paro: 0, ritmo: 0, sin: 18 }, FILETE_0211_DIA),
  ...otros,
]
const de = (planta: TurnoValidado['planta']) => TURNOS.filter((t) => t.planta === planta)
const suma = (ts: TurnoValidado[], f: (t: TurnoValidado) => Conteo): Conteo => {
  const out: Conteo = { arranque: 0, linea: 0, paro: 0, ritmo: 0, sin: 0 }
  for (const t of ts) for (const k of CAUSAS_MICRO) out[k] += f(t)[k]
  return out
}
const clasificar = (t: TurnoValidado) => clasificarDoc({ _fuente: t.id, ...t.doc })

describe('microCausa · los totales validados (5 turnos de Chonchi y 5 de Filete)', () => {
  it('hay 5 turnos de Chonchi y 5 de Filete', () => {
    expect(de('Chonchi')).toHaveLength(5)
    expect(de('Filete')).toHaveLength(5)
  })

  for (const t of TURNOS) {
    it(`${t.planta} ${t.id}: ${t.micro} micro, ${CAUSAS_MICRO.map((k) => t.esperado[k]).join(' · ')} (lo que da el script validado)`, () => {
      const micros = clasificar(t)
      expect(micros).toHaveLength(t.micro)
      expect(contarPorCausa(micros)).toEqual(t.esperado)
    })
  }

  it('Chonchi, los 5 turnos: 262 micro · Arranque 26 · Línea común 52 · Tras detención 3 · Ritmo bajo 34 · Sin contexto 147', () => {
    const real = suma(de('Chonchi'), (t) => contarPorCausa(clasificar(t)))
    expect(real).toEqual({ arranque: 26, linea: 52, paro: 3, ritmo: 34, sin: 147 })
    expect(Object.values(real).reduce((a, b) => a + b, 0)).toBe(262)
    /* «Sin contexto» sigue siendo la causa más grande: es la salida honesta. */
    expect(Math.max(...CAUSAS_MICRO.map((k) => real[k]))).toBe(real.sin)
  })

  it('Filete, los 5 turnos: 77 micro · 9 · 0 · 6 · 0 · 62, y ninguna sale Línea común ni Ritmo bajo (hay una sola Baader)', () => {
    const real = suma(de('Filete'), (t) => contarPorCausa(clasificar(t)))
    expect(real).toEqual({ arranque: 9, linea: 0, paro: 6, ritmo: 0, sin: 62 })
    expect(Object.values(real).reduce((a, b) => a + b, 0)).toBe(77)
  })
})
