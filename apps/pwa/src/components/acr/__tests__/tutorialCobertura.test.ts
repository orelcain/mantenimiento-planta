import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { OPCIONES_ACR, PASOS_TUTORIAL, type OpcionAcr } from '../tutorialAcr'

/**
 * Prueba de que el tutorial no se salta nada (guion v2, 08-11-2026: el tutorial anterior explicaba
 * 6 de 21 opciones). Cruza la herramienta con el guion por dos lados:
 * 1. cada opción de `OPCIONES_ACR` la explica al menos un paso;
 * 2. cada control marcado con `data-tutorial` en los componentes del ACR lo ilumina o lo toca al
 *    menos un paso. Marcar un control nuevo sin explicarlo hace fallar este test.
 * Y al revés: lo que ilumina o toca el guion existe en los componentes.
 */
const CARPETA_ACR = join(process.cwd(), 'src', 'components', 'acr')

/** Valores `t-…` que aparecen en atributos `data-tutorial` (también los condicionales). */
function marcasEnComponentes(): Set<string> {
  const marcas = new Set<string>()
  for (const f of readdirSync(CARPETA_ACR).filter((n) => n.endsWith('.tsx'))) {
    for (const linea of readFileSync(join(CARPETA_ACR, f), 'utf8').split('\n')) {
      if (!linea.includes('data-tutorial')) continue
      for (const m of linea.matchAll(/['"](t-[a-z0-9-]+)['"]/g)) marcas.add(m[1]!)
    }
  }
  return marcas
}

/** Todo lo que el guion ilumina o toca, como marca `t-…` (los selectores se reducen a su marca). */
function marcasDelGuion(): Set<string> {
  const usadas = new Set<string>()
  const agregar = (id: string | undefined) => {
    if (!id) return
    for (const m of id.matchAll(/(t-[a-z0-9-]+)/g)) usadas.add(m[1]!)
  }
  for (const paso of PASOS_TUTORIAL) {
    agregar(paso.objetivo)
    for (const m of paso.momentos ?? []) {
      agregar(m.objetivo)
      agregar(m.tocar)
    }
  }
  return usadas
}

describe('el tutorial explica todas las opciones del ACR', () => {
  it('cada opción de la herramienta la explica al menos un paso', () => {
    const explicadas = new Set<OpcionAcr>(PASOS_TUTORIAL.flatMap((p) => p.explica))
    const sinExplicar = (Object.keys(OPCIONES_ACR) as OpcionAcr[]).filter((o) => !explicadas.has(o))
    expect(sinExplicar, `opciones sin explicar: ${sinExplicar.map((o) => OPCIONES_ACR[o]).join(' · ')}`).toEqual([])
  })

  it('cada control marcado con data-tutorial lo ilumina o lo toca algún paso', () => {
    const usadas = marcasDelGuion()
    const sinPaso = [...marcasEnComponentes()].filter((m) => !usadas.has(m))
    expect(sinPaso, 'controles marcados que el guion no muestra').toEqual([])
  })

  it('todo lo que ilumina o toca el guion está marcado en los componentes', () => {
    const marcas = marcasEnComponentes()
    const fantasmas = [...marcasDelGuion()].filter((m) => !marcas.has(m))
    expect(fantasmas, 'el guion apunta a marcas que no existen').toEqual([])
  })
})
