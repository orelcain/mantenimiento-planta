import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * La fila de Causa raíz va antes que el formulario. Al final de la hoja el técnico no la
 * encontraba (prueba del 08-11-2026). Se revisa el orden en el código porque la fila depende de
 * Firestore y montar la hoja completa exige toda la bitácora.
 */
describe('hoja del evento: dónde está Causa raíz', () => {
  const fuente = readFileSync(join(process.cwd(), 'src/components/bitacora/EventoBitacoraSheet.tsx'), 'utf8')

  it('la fila se monta una sola vez, antes del primer campo del formulario', () => {
    const montajes = fuente.match(/<AcrEntrada /g) ?? []
    expect(montajes).toHaveLength(1)
    const fila = fuente.indexOf('<AcrEntrada ')
    const titulo = fuente.indexOf('htmlFor="bitacora-titulo"')
    expect(titulo).toBeGreaterThan(-1)
    expect(fila).toBeLessThan(titulo)
  })
})
