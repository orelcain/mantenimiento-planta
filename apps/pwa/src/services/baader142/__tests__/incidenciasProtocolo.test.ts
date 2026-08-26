/**
 * El marcador [protocolo142 …] es el hilo del lazo lectura→intervención→
 * mejora: si el parseo se rompe, el lector deja de reconocer sus propias
 * incidencias en silencio.
 */
import { describe, it, expect } from 'vitest'
import { parsearMarcadorProtocolo } from '../perilla5Protocolo'

describe('parsearMarcadorProtocolo', () => {
  it('parsea el marcador real que emite registrarIncidencia', () => {
    const desc = [
      '[protocolo142 baader-n2 · stopc 1026/1000 · lectura 2026-08-21]',
      'Venía de 900/1000 en la lectura anterior.',
    ].join('\n')
    expect(parsearMarcadorProtocolo(desc)).toEqual({
      maquina: 'baader-n2', contador: 'stopc', tasa: 1026, lectura: '2026-08-21',
    })
  })

  it('marcador en medio de la descripción también cuenta', () => {
    const desc = 'contexto previo\n[protocolo142 baader-n1 · tclipc 45/1000 · lectura 2026-08-08]\npauta'
    expect(parsearMarcadorProtocolo(desc)?.contador).toBe('tclipc')
  })

  it('descripción sin marcador → null (incidencia ajena al protocolo)', () => {
    expect(parsearMarcadorProtocolo('Se cayó la cinta 4')).toBeNull()
    expect(parsearMarcadorProtocolo('[grader-gates · 2026-08-21]')).toBeNull()
  })
})
