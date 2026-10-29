/**
 * El núcleo del marcador del Duelo corre también en el backend (`functions/lib/dueloNucleo.cjs`, para el cierre
 * congelado). Este test amarra que sea la MISMA regla:
 *  1. el `.cjs` commiteado es exactamente lo que sale de empaquetar `dueloNucleo.ts` hoy (si cambia la regla y no se
 *     regenera, falla acá, antes de que el cierre cuente distinto que la pantalla);
 *  2. sobre datos reales (Eviscerado y Filete, semanas 43 y 44), la PWA da la foto esperada, la misma que el test de
 *     Functions exige al `.cjs`.
 */
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as nucleo from '../dueloNucleo'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..')
const FIXTURES = path.join(RAIZ, 'functions', '__tests__', 'fixtures')
const req = createRequire(import.meta.url)

describe('núcleo del Duelo compartido con Functions', () => {
  it('functions/lib/dueloNucleo.cjs está al día con dueloNucleo.ts (regenerar: node scripts/build-duelo-nucleo.mjs)', async () => {
    const script = path.join(RAIZ, 'scripts', 'build-duelo-nucleo.mjs')
    const { construirNucleo, SALIDA } = (await import(/* @vite-ignore */ script)) as { construirNucleo: () => Promise<string>; SALIDA: string }
    const commiteado = readFileSync(SALIDA, 'utf8').replace(/\r\n/g, '\n')
    expect(commiteado === (await construirNucleo()), 'el .cjs quedó atrás de la regla de la PWA').toBe(true)
  }, 30_000)

  it('misma regla: sobre las semanas 43 y 44 reales la PWA da la foto esperada', () => {
    const { instantanea } = req(path.join(FIXTURES, 'instantaneaDuelo.cjs')) as { instantanea: (n: unknown, f: unknown) => unknown }
    const fixture = JSON.parse(readFileSync(path.join(FIXTURES, 'duelo-semanas-43-44.json'), 'utf8'))
    const esperado = JSON.parse(readFileSync(path.join(FIXTURES, 'duelo-semanas-43-44.esperado.json'), 'utf8'))
    const foto = JSON.parse(JSON.stringify(instantanea(nucleo, fixture)))
    expect(foto).toEqual(esperado)
    // Que la foto pruebe algo: hay jornadas con duelo en las dos líneas.
    expect(esperado.eviscerado.jornadas.length).toBeGreaterThan(5)
    expect(esperado.filete.jornadas.length).toBeGreaterThan(5)
  })
})
