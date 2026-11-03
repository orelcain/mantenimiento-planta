/**
 * Los totales VALIDADOS de las causas v3, protegidos con datos reales y MICRO A MICRO: 5 turnos de Chonchi (262 micro: Arranque 31 · a la vez 54 · en cadena 6 ·
 * detención previa 6 · Al volver de una detención 3 · Sin contexto 162) y 5 de Filete (77 micro: 9 · 0 · 0 · 0 · 6 · 62), del 28-10 al 02-11-2026.
 *
 * El golden (`fixtures/turnos_validados_v3.json`) lo generó `exportar_golden_v3.py`, que corre `causas_v3.py` (la referencia ejecutable) sobre la captura de las
 * 15:27 del 02-11: una implementación APARTE de `microCausa.ts`. Se compara cada micro (fila + `ini_ms`) con su causa y su modo: si el clasificador se desvía en
 * una sola, falla aquí con el turno y la hora.
 *
 * Qué cambió respecto de v2 (por eso esta prueba ya no habla de «Ritmo bajo»): «Ritmo bajo» se retiró de las causas de micro (fuga del atraso de anotación,
 * estudio v3 §1); el arranque cuenta desde la primera producción de cada Baader; «Otra Baader paró» suma «en cadena» y «detención previa»; y «Al volver de una
 * detención» sigue igual. Los dos turnos del 02-11 vienen de sus fixtures de siempre (`chonchi_0211_turno2.json`, `filete_0211_dia.json`).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAUSAS_MICRO, contarPorCausa, contarPorForma, type CausaMicro, type FormaMicro, type MicroClasificada } from '../microCausa'
import { CHONCHI_0211_T2, FILETE_0211_DIA, clasificarDoc, type DocMicro } from './microFixtures'

type Conteo = Record<CausaMicro, number>
interface TurnoValidado { id: string; planta: 'Chonchi' | 'Filete'; turno: string; micro: number; doc: Omit<DocMicro, '_fuente'> }
interface MicroGolden { fila: number; ini_ms: number; causa: string; modo: string | null; clave: string }
interface TurnoGolden { planta: 'ch' | 'fi'; turno: string; micros: MicroGolden[]; reparto: Record<string, number> }

const leer = <T>(archivo: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', archivo), 'utf8')) as T
const { turnos: otros } = leer<{ turnos: Array<TurnoValidado & { esperado?: unknown }> }>('turnos_validados.json')
const { turnos: golden } = leer<{ turnos: TurnoGolden[] }>('turnos_validados_v3.json')

const conDocPropio = (id: string, planta: TurnoValidado['planta'], turno: string, micro: number, doc: DocMicro): TurnoValidado => ({ id, planta, turno, micro, doc })
const TURNOS: TurnoValidado[] = [
  conDocPropio('2026-11-02_Turno 2', 'Chonchi', 'Turno 2', 46, CHONCHI_0211_T2),
  conDocPropio('2026-11-02_Turno Dia', 'Filete', 'Turno Dia', 20, FILETE_0211_DIA),
  ...otros.map(({ id, planta, turno, micro, doc }) => ({ id, planta, turno, micro, doc })),
]
const de = (planta: TurnoValidado['planta']) => TURNOS.filter((t) => t.planta === planta)
const slug = (t: TurnoValidado) => (t.planta === 'Chonchi' ? 'chonchi' : 'filete')
const clasificar = (t: TurnoValidado) => clasificarDoc({ _fuente: t.id, ...t.doc }, { planta: slug(t) })
const doGolden = (t: TurnoValidado) => {
  const g = golden.find((x) => x.turno === t.id && (x.planta === 'ch') === (t.planta === 'Chonchi'))
  if (!g) throw new Error(`el golden no trae ${t.planta} ${t.id}`)
  return g
}
const sumaForma = (ts: TurnoValidado[]) => {
  const out: Record<FormaMicro, number> = { arranque: 0, linea_a_la_vez: 0, linea_en_cadena: 0, linea_tras_paro_otra: 0, paro: 0, sin: 0 }
  for (const t of ts) for (const [k, v] of Object.entries(contarPorForma(clasificar(t)))) out[k as FormaMicro] += v
  return out
}

describe('microCausa v3 · el golden micro a micro (5 turnos de Chonchi y 5 de Filete)', () => {
  it('hay 5 turnos de Chonchi y 5 de Filete, y el golden trae los mismos 10', () => {
    expect(de('Chonchi')).toHaveLength(5)
    expect(de('Filete')).toHaveLength(5)
    expect(golden).toHaveLength(10)
    for (const t of TURNOS) expect(() => doGolden(t)).not.toThrow()
  })

  for (const t of TURNOS) {
    it(`${t.planta} ${t.id}: las ${t.micro} micro coinciden con el golden en causa y modo, una por una (fila + inicio)`, () => {
      const micros = clasificar(t)
      const g = doGolden(t)
      expect(micros).toHaveLength(t.micro)
      expect(g.micros).toHaveLength(t.micro)
      const porClave = new Map(micros.map((q) => [`${q.fila}@${q.inicioMs}`, q]))
      for (const esp of g.micros) {
        const q: MicroClasificada | undefined = porClave.get(`${esp.fila}@${esp.ini_ms}`)
        expect(q, `falta la micro fila ${esp.fila} inicio ${esp.ini_ms}`).toBeDefined()
        expect([q!.causa, q!.modo], `micro fila ${esp.fila} inicio ${new Date(esp.ini_ms).toISOString()}`).toEqual([esp.causa, esp.modo])
        expect(q!.forma, `forma de la micro fila ${esp.fila} inicio ${esp.ini_ms}`).toBe(esp.clave)
      }
    })
  }

  it('Chonchi, los 5 turnos: 262 micro · Arranque 31 · a la vez 54 · en cadena 6 · detención previa 6 · Al volver de una detención 3 · Sin contexto 162', () => {
    const real = sumaForma(de('Chonchi'))
    expect(real).toEqual({ arranque: 31, linea_a_la_vez: 54, linea_en_cadena: 6, linea_tras_paro_otra: 6, paro: 3, sin: 162 })
    expect(Object.values(real).reduce((a, b) => a + b, 0)).toBe(262)
    /* «Sin contexto» sigue siendo la causa más grande: es la salida honesta. */
    expect(Math.max(...Object.values(real))).toBe(real.sin)
  })

  it('Filete, los 5 turnos: 77 micro · 9 · 0 · 0 · 0 · 6 · 62, y ninguna sale «Otra Baader paró» (hay una sola Baader)', () => {
    const real = sumaForma(de('Filete'))
    expect(real).toEqual({ arranque: 9, linea_a_la_vez: 0, linea_en_cadena: 0, linea_tras_paro_otra: 0, paro: 6, sin: 62 })
    expect(Object.values(real).reduce((a, b) => a + b, 0)).toBe(77)
  })

  it('el reparto por causa de cada turno es el del golden (arranque · otra Baader paró · al volver · sin contexto)', () => {
    for (const t of TURNOS) {
      const g = doGolden(t).reparto
      const lineas = (g.linea_a_la_vez ?? 0) + (g.linea_en_cadena ?? 0) + (g.linea_tras_paro_otra ?? 0)
      const real: Conteo = contarPorCausa(clasificar(t))
      expect([t.id, CAUSAS_MICRO.map((k) => real[k])]).toEqual([t.id, [g.arranque ?? 0, lineas, g.paro ?? 0, g.sin ?? 0]])
    }
  })

  it('ninguna micro sale «Ritmo bajo»: la causa ya no existe', () => {
    for (const t of TURNOS) for (const q of clasificar(t)) expect(['arranque', 'linea', 'paro', 'sin']).toContain(q.causa)
    expect(CAUSAS_MICRO).toEqual(['arranque', 'linea', 'paro', 'sin'])
  })
})
