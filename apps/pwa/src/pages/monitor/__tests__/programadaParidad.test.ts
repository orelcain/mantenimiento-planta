/**
 * Paridad de la detención programada, lado PWA (vitest).
 *
 * `esProgramada` (aquí) y `esParoPlanificado` (`functions/publicMonitor.js`) son la misma regla en dos runtimes. Las dos
 * leen `functions/lib/causasProgramadas.json` y las dos corren la tabla `functions/__tests__/fixtures/causasProgramadas.casos.json`
 * (el servidor en `functions/__tests__/programadaParidad.test.js`). Si una se separa, su prueba falla.
 * Pasó el 04-11: la cascada no reconocía «EJERCICIO  COMPENSATORIO» con dos espacios y daba 56 min programados contra
 * 64 del «Tiempo del turno».
 */
import { describe, expect, it } from 'vitest'
import { CAUSAS_PROGRAMADAS, esProgramada } from '../cascadaPerilla'
import LISTA from '../../../../../../functions/lib/causasProgramadas.json'
import CASOS from '../../../../../../functions/__tests__/fixtures/causasProgramadas.casos.json'

describe('detención programada: la misma tabla que el servidor', () => {
  it('la lista es el JSON compartido, no una copia (aunque sea idéntica)', () => {
    expect(CAUSAS_PROGRAMADAS).toBe(LISTA)
  })

  it('la tabla trae el caso de los dos espacios y casos de los dos lados', () => {
    expect(CASOS.some((c) => c.razon === 'EJERCICIO  COMPENSATORIO' && c.programada)).toBe(true)
    expect(CASOS.some((c) => c.programada) && CASOS.some((c) => !c.programada)).toBe(true)
  })

  it.each(CASOS)('$razon → programada: $programada ($por)', ({ razon, programada }) => {
    expect(esProgramada(razon)).toBe(programada)
  })
})
