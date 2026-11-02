/**
 * El globo de la micro con los casos REALES del 02-11-2026 (Chonchi Turno 2 y Filete Turno Día): lo que el usuario lee, línea por línea,
 * con sus marcas (① ✓ ✕ — ▼ ▽). Los textos son los de la spec del globo (opción C); cada cifra sale del doc, no se escribe a mano.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { writeFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { GloboMicro } from '../GraficoRitmoVivo'
import type { MicroClasificada } from '../microCausa'
import { CHONCHI_0211_T2, FILETE_0211_DIA, buscarMicro, clasificarDoc } from './microFixtures'
import { lineasDelGlobo } from './globoTexto'

afterEach(() => cleanup())

const chonchi = clasificarDoc(CHONCHI_0211_T2)
const filete = clasificarDoc(FILETE_0211_DIA)
const globoDe = (q: MicroClasificada, compacto = false) => {
  render(<GloboMicro q={q} compacto={compacto} onCerrar={() => {}} />)
  return screen.getByRole(compacto ? 'group' : 'tooltip')
}

describe('GloboMicro · casos reales', () => {
  it('Chonchi 15:10:00 Ev 1 · Línea común: ① «2 de 3», ② Ev 3 «8 de 16» sin parada anotada, ▽ en 15:09 y Ritmo bajo «no se evalúa»', () => {
    expect(lineasDelGlobo(globoDe(buscarMicro(chonchi, '15:10:00', 'Evisceradora 1')))).toEqual([
      '15:10:00 · Ev 1 · micro de 45 s',
      '≈ 65 s reales (Shoplogix no ve ~20 s)',
      'Causa probable',
      'Línea común',
      '① 2 de 3 · Baader pararon en el mismo segundo · Ev 1 45 s · Ev 2 30 s',
      '② 8 de 16 · Ev 3 sin parada anotada en 15:10 · posible micro de 0 s',
      'pz/min | 15:08 | 15:09 | 15:10 | 15:11 | Esperado',
      'Ev 1 | 14 | ▽ 10 | ① ▼ 5 | 11 | 18',
      'Ev 2 | 15 | ▽ 12 | ① ▼ 5 | 15 | 16',
      'Ev 3 | 16 | 14 | ② 8 | 16 | 16',
      '▽ ya estaba parando (Shoplogix lo anota después)',
      '✕ Arranque · la última pausa larga terminó a las 13:35',
      '✕ Tras detención · la última detención fue hace 9,5 min',
      '— Ritmo bajo · no se evalúa: Shoplogix anotó la micro al empezar el minuto (15:10:00). La parada ya venía de antes, por eso el minuto 15:09 sale bajo',
      'Probable, no imputada. Se confirma en terreno.',
    ])
  })

  it('Chonchi 10:17:43 Ev 1 · Ritmo bajo ✓: «10 de 16» en 10:16, el minuto antes, con su ritmo de los últimos 15 min', () => {
    expect(lineasDelGlobo(globoDe(buscarMicro(chonchi, '10:17:43', 'Evisceradora 1')))).toEqual([
      '10:17:43 · Ev 1 · micro de 15 s',
      '≈ 35 s reales (Shoplogix no ve ~20 s)',
      'Causa probable',
      'Ritmo bajo',
      '① 10 de 16 · Ev 1 a las 10:16, el minuto antes · su ritmo de los últimos 15 min: 16 pz/min',
      'pz/min | 10:15 | 10:16 | 10:17 | 10:18 | Esperado',
      'Ev 1 | 14 | ① 10 | ▼ 5 | 16 | 18',
      'Ev 2 | 13 | 16 | 14 | 14 | 16',
      'Ev 3 | 15 | 16 | 16 | 16 | 16',
      '✕ Arranque · no hubo pausas largas desde el inicio del turno (09:15)',
      '✕ Línea común · ninguna otra Baader paró a ±15 s',
      '✕ Tras detención · la última detención fue hace 15,5 min',
      'Probable, no imputada. Se confirma en terreno.',
    ])
  })

  it('Filete 14:40:00 · Sin contexto: una sola fila en la tabla y Ritmo bajo «no se usa en Filete»', () => {
    expect(lineasDelGlobo(globoDe(buscarMicro(filete, '14:40:00', 'Linea 1')))).toEqual([
      '14:40:00 · Linea 1 · micro de 30 s',
      '≈ 50 s reales (Shoplogix no ve ~20 s)',
      'Causa probable',
      'Sin contexto',
      'Ninguna regla la explica.',
      'pz/min | 14:38 | 14:39 | 14:40 | 14:41 | Esperado',
      'Linea 1 | 14 | ▽ 11 | ▼ 6 | 13 | 20',
      '▽ ya estaba parando (Shoplogix lo anota después)',
      '✕ Arranque · la última pausa larga terminó a las 14:16',
      '✕ Tras detención · la última detención fue hace 23,5 min',
      '— Ritmo bajo · no se usa en Filete: su ritmo cambia mucho y no explica las micro',
      'Probable, no imputada. Se confirma en terreno.',
    ])
  })

  it('Chonchi 15:13:00 Ev 1 · Línea común por detención: ① «3 de 3» con la detención de Ev 3 en la lista', () => {
    expect(lineasDelGlobo(globoDe(buscarMicro(chonchi, '15:13:00', 'Evisceradora 1')))).toEqual([
      '15:13:00 · Ev 1 · micro de 15 s',
      '≈ 35 s reales (Shoplogix no ve ~20 s)',
      'Causa probable',
      'Línea común',
      '① 3 de 3 · Baader pararon en el mismo segundo · Ev 1 15 s · Ev 2 15 s · Ev 3 2,3 min (detención)',
      'pz/min | 15:11 | 15:12 | 15:13 | 15:14 | Esperado',
      'Ev 1 | 11 | ▽ 9 | ① ▼ 7 | 4 | 18',
      'Ev 2 | 15 | ▽ 7 | ① ▼ 7 | 5 | 16',
      'Ev 3 | 16 | 5 | ① 0 | 0 | 16',
      '▽ ya estaba parando (Shoplogix lo anota después)',
      '✕ Arranque · la última pausa larga terminó a las 13:35',
      '✕ Tras detención · la última detención fue hace 12,5 min',
      '— Ritmo bajo · no se evalúa: Shoplogix anotó la micro al empezar el minuto (15:13:00). La parada ya venía de antes, por eso el minuto 15:12 sale bajo',
      'Probable, no imputada. Se confirma en terreno.',
    ])
  })

  it('el celular (una columna) dice lo mismo que PC, con el botón de cerrar y sin la columna doble', () => {
    const q = buscarMicro(chonchi, '10:17:43', 'Evisceradora 1')
    const pc = lineasDelGlobo(globoDe(q))
    cleanup()
    const movil = globoDe(q, true)
    expect(lineasDelGlobo(movil)).toEqual(pc)
    expect(movil.querySelector('.gm-cols')).toBeNull()
    expect(screen.getByRole('button', { name: 'Cerrar la lectura de la micro' })).toBeTruthy()
  })

  it('las marcas llevan el color de SU causa: ▼ y ▽ de línea común en el de la línea común; los cuadros usan los tokens de causa', () => {
    const globo = globoDe(buscarMicro(chonchi, '15:10:00', 'Evisceradora 1'))
    const llenos = Array.from(globo.querySelectorAll('tbody [data-glifo="▼"] path')).map((p) => p.getAttribute('fill'))
    const huecos = Array.from(globo.querySelectorAll('tbody [data-glifo="▽"] path')).map((p) => p.getAttribute('stroke'))
    expect(llenos).toEqual(['var(--v2-ext)', 'var(--v2-ext)'])
    expect(huecos).toEqual(['var(--v2-ext)', 'var(--v2-ext)'])
    expect((globo.querySelector('.gm-causa .sw') as HTMLElement).style.background).toBe('var(--v2-ext)')
    cleanup()
    const ritmo = globoDe(buscarMicro(chonchi, '10:17:43', 'Evisceradora 1'))
    expect((ritmo.querySelector('.gm-causa .sw') as HTMLElement).style.background).toBe('var(--v2-causa-ritmo)')
    cleanup()
    const sin = globoDe(buscarMicro(filete, '14:40:00', 'Linea 1'))
    expect((sin.querySelector('.gm-causa .sw') as HTMLElement).style.background).toBe('var(--v2-causa-sin)')
  })
})

/**
 * Exporta el texto final de los 4 globos (uno por bloque, con el caso en la primera línea) para el revisor de claridad. Solo corre si se
 * pide la ruta de salida: `TEXTOS_GLOBO_SALIDA=<ruta.txt> pnpm exec vitest run src/pages/monitor/__tests__/GloboMicro.reales.test.tsx`.
 * Es el MISMO texto que el test de arriba verifica línea por línea: si se pule un texto, se cambia en `microCausa.ts`, se ajustan los
 * literales de arriba y se vuelve a exportar. (Se escribe con fs en UTF-8: por un pipe de PowerShell se corrompen los acentos.)
 */
describe('GloboMicro · exportar los textos para el revisor', () => {
  it.skipIf(!process.env.TEXTOS_GLOBO_SALIDA)('escribe el texto de los 4 casos reales en TEXTOS_GLOBO_SALIDA', () => {
    const casos = [
      { caso: 'CASO 1 · Chonchi, Turno 2 del 02-11 · micro de Ev 1 a las 15:10:00 · Línea común (Ritmo bajo no se evalúa)', q: buscarMicro(chonchi, '15:10:00', 'Evisceradora 1') },
      { caso: 'CASO 2 · Chonchi, Turno 2 del 02-11 · micro de Ev 1 a las 10:17:43 · Ritmo bajo', q: buscarMicro(chonchi, '10:17:43', 'Evisceradora 1') },
      { caso: 'CASO 3 · Filete, Turno Día del 02-11 · micro de Linea 1 a las 14:40:00 · Sin contexto', q: buscarMicro(filete, '14:40:00', 'Linea 1') },
      { caso: 'CASO 4 · Chonchi, Turno 2 del 02-11 · micro de Ev 1 a las 15:13:00 · Línea común por detención (Ev 3 entra en una detención)', q: buscarMicro(chonchi, '15:13:00', 'Evisceradora 1') },
    ]
    const bloques = casos.map(({ caso, q }) => {
      const lineas = lineasDelGlobo(globoDe(q))
      cleanup()
      return [caso, ...lineas].join('\n')
    })
    writeFileSync(process.env.TEXTOS_GLOBO_SALIDA!, `${bloques.join('\n\n')}\n`, 'utf8')
    expect(bloques).toHaveLength(4)
  })
})
