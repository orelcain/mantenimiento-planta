import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Monitor TV bajo Pizarra: conserva TODOS sus colores de estado hasta la prueba a 3 m.
 * Lee index.css, resuelve la cascada de variables de la piel Apple y la de Pizarra +
 * excepción `.monitor-tv`, y exige que cada token de estado valga LO MISMO en claro y oscuro.
 * Las series `--mon-*` son otro asunto (siguen a Pizarra) y no deben aparecer en la excepción.
 */
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8') // cwd = apps/pwa

function bloque(selector: string): Record<string, string> {
  const i = css.indexOf('\n' + selector + ' {')
  if (i < 0) throw new Error('No se encontró el bloque ' + selector)
  const j = css.indexOf('\n}', i + 1)
  const out: Record<string, string> = {}
  for (const m of css.slice(i, j).matchAll(/(--[\w-]+):\s*([^;]+?);/g)) out[m[1]!] = m[2]!.trim()
  return out
}

const PIZ = ':root[data-skin="apple"][data-paleta="pizarra"]'
const raiz = bloque(':root')
const oscuroBase = bloque('.dark')
const apple = bloque(':root[data-skin="apple"]')
const appleOscuro = bloque(':root[data-skin="apple"].dark')
const pizClaro = bloque(PIZ + ':not(.dark)')
const pizOscuro = bloque(PIZ + '.dark')
const monClaro = bloque(':root[data-paleta="pizarra"]:not(.dark) .monitor-tv')
const monOscuro = bloque(':root[data-paleta="pizarra"].dark .monitor-tv')

// Cascada (especificidad, luego orden): :root < .dark < apple < apple.dark < pizarra < .monitor-tv
const capas = (...c: Record<string, string>[]) => Object.assign({}, ...c) as Record<string, string>
const appleClaroEf = capas(raiz, apple)
const appleOscuroEf = capas(raiz, oscuroBase, apple, appleOscuro)
const monitorClaroEf = capas(raiz, apple, pizClaro, monClaro)
const monitorOscuroEf = capas(raiz, oscuroBase, apple, appleOscuro, pizOscuro, monOscuro)

const esEstado = (k: string) =>
  /^--tw-(emerald|green|red|amber)-\d+$/.test(k) || /^--(ink-|fill-|success|warning|destructive)/.test(k)

describe('Monitor TV bajo Pizarra conserva los colores de estado de Apple', () => {
  for (const [tema, apl, mon, piz] of [
    ['claro', appleClaroEf, monitorClaroEf, pizClaro],
    ['oscuro', appleOscuroEf, monitorOscuroEf, pizOscuro],
  ] as const) {
    it(`${tema}: cada token de estado resuelve igual que en Apple`, () => {
      const tokens = Object.keys(piz).filter(esEstado)
      expect(tokens.length).toBeGreaterThan(20) // que el filtro no quede vacío por error
      for (const k of tokens) expect({ k, v: mon[k] }).toEqual({ k, v: apl[k] })
    })
  }

  it('los tokens que usa el monitor están restaurados (ink, fill, success, warning, tw-*)', () => {
    for (const mon of [monClaro, monOscuro]) {
      for (const k of ['--ink-ok', '--ink-crit', '--ink-warn', '--ink-info', '--fill-ok', '--fill-critical', '--fill-warning',
        '--success', '--warning', '--warning-ink', '--tw-emerald-500', '--tw-red-500', '--tw-amber-500']) {
        expect(mon[k], k).toBeDefined()
      }
    }
  })

  it('los valores restaurados son literales (un var() se resolvería en :root, no en el monitor)', () => {
    for (const mon of [monClaro, monOscuro]) for (const v of Object.values(mon)) expect(v).not.toMatch(/var\(/)
  })

  it('las series --mon-* NO se tocan en la excepción', () => {
    for (const mon of [monClaro, monOscuro]) expect(Object.keys(mon).filter(k => k.startsWith('--mon-'))).toEqual([])
  })
})
