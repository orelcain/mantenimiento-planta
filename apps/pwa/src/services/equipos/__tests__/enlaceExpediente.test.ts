import { describe, it, expect } from 'vitest'
import { rutaExpedienteEquipo } from '../enlaceExpediente'

/** nodeId real de la EVISCERADORA BAADER 142 N1 de Chonchi. */
const NODO = 'nIjUKAay3odasttyZ0yj'

describe('rutaExpedienteEquipo', () => {
  it('entra por defecto a la pestaña de repuestos y documentos', () => {
    expect(rutaExpedienteEquipo(NODO)).toBe(
      `/centro-tecnico-documental?nodo=${NODO}&tab=recursos`,
    )
  })

  it('permite elegir otra pestaña', () => {
    expect(rutaExpedienteEquipo(NODO, 'ficha')).toContain('tab=ficha')
  })

  it('usa `nodo`, que es el id con el que habla el módulo Repuestos', () => {
    expect(rutaExpedienteEquipo(NODO)).toContain(`nodo=${NODO}`)
    expect(rutaExpedienteEquipo(NODO)).not.toContain('eq=')
  })

  it('escapa el id en vez de pegarlo crudo', () => {
    expect(rutaExpedienteEquipo('a b&c=d')).toBe(
      '/centro-tecnico-documental?nodo=a+b%26c%3Dd&tab=recursos',
    )
  })
})
