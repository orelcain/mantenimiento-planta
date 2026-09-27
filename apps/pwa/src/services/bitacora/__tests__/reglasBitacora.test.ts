import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { IMPACTOS, TIPOS_EVENTO } from '@/config/bitacora'
import type { ImpactoEvento, TipoEvento } from '../bitacora.types'

/**
 * Lo que la app OFRECE y lo que `firestore.rules` ACEPTA son dos listas en archivos
 * distintos, y se separaron sin que nadie se enterara (20-09-2026).
 *
 * Faltaban `rutinario` y `afecta-sin-detener` —el 2.º chip de cada fila— y el efecto era
 * peor que un error: la app escribe sin esperar al servidor, así que el evento aparecía en
 * el teléfono desde la caché local, nunca llegaba a Firestore y se perdía al limpiarla.
 * Lo pilló Diego Cárdenas, recién dado de alta con el pase: todo lo que anotaba se evaporaba.
 *
 * Este test compara las dos listas. Si alguien agrega un chip y no toca las reglas, falla acá
 * en vez de en planta.
 */
const REGLAS = readFileSync(join(process.cwd(), '..', '..', 'firestore.rules'), 'utf8')

/**
 * Solo el cuerpo de `eventoValido(d)`: otras colecciones tienen su propio `d.tipo in [...]`
 * (el movimiento de stock, por ejemplo) y buscar en todo el archivo agarraba el equivocado.
 */
const EVENTO_VALIDO = (() => {
  const i = REGLAS.indexOf('function eventoValido(d)')
  if (i < 0) throw new Error('No se encontró `eventoValido` en firestore.rules')
  return REGLAS.slice(i, REGLAS.indexOf('\n      }', i))
})()

/** Los valores de un `d.<campo> in [...]` de `eventoValido`. */
function listaDeLaRegla(campo: string): string[] {
  const m = new RegExp(`d\\.${campo} in \\[([^\\]]*)\\]`).exec(EVENTO_VALIDO)
  if (!m) throw new Error(`No se encontró la lista de «${campo}» en eventoValido`)
  return [...(m[1] ?? '').matchAll(/'([^']+)'/g)].flatMap((x) => (x[1] ? [x[1]] : []))
}

/** Tipos que ya no se ofrecen pero siguen en eventos viejos: editarlos no puede fallar. */
const TIPOS_LEGADO: TipoEvento[] = ['falla', 'planificado', 'montaje']

describe('firestore.rules acepta todo lo que la bitácora ofrece', () => {
  it('cada tipo de evento del formulario está permitido', () => {
    const permitidos = listaDeLaRegla('tipo')
    const faltan = TIPOS_EVENTO.map((t) => t.id).filter((id) => !permitidos.includes(id))
    expect(faltan, `Tipos que la app ofrece y las reglas rechazan: ${faltan.join(', ')}`).toEqual([])
  })

  it('los tipos de eventos viejos siguen permitidos, o no se podrían editar', () => {
    const permitidos = listaDeLaRegla('tipo')
    expect(TIPOS_LEGADO.filter((id) => !permitidos.includes(id))).toEqual([])
  })

  it('cada impacto del formulario está permitido', () => {
    const permitidos = listaDeLaRegla('impacto')
    const faltan = IMPACTOS.map((i) => i.id).filter((id) => !permitidos.includes(id))
    expect(faltan, `Impactos que la app ofrece y las reglas rechazan: ${faltan.join(', ')}`).toEqual([])
  })

  it('«afectó sin detener» y su contingencia están cubiertos', () => {
    // El escalón que más se usa en planta y el que más caro salía perder.
    expect(listaDeLaRegla('impacto')).toContain<ImpactoEvento>('afecta-sin-detener')
    expect(EVENTO_VALIDO).toMatch(/'contingencia' in d/)
  })

  it('las reglas no permiten valores que la app no conoce', () => {
    const conocidos = new Set<string>([...TIPOS_EVENTO.map((t) => t.id), ...TIPOS_LEGADO])
    const sobran = listaDeLaRegla('tipo').filter((id) => !conocidos.has(id))
    expect(sobran, `Las reglas aceptan tipos que la app no conoce: ${sobran.join(', ')}`).toEqual([])
  })
})
