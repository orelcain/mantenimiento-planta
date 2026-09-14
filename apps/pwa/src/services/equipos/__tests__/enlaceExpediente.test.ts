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

describe('llegar filtrado desde un repuesto', () => {
  it('lleva el código a la lista de materiales', () => {
    const ruta = rutaExpedienteEquipo('23kemhGhbN22YIwHd2VN', 'recursos', { buscar: '3300138386' })
    const p = new URLSearchParams(ruta.split('?')[1])
    expect(p.get('nodo')).toBe('23kemhGhbN22YIwHd2VN')
    expect(p.get('tab')).toBe('recursos')
    expect(p.get('q')).toBe('3300138386')
  })

  it('sin búsqueda no agrega un q vacío', () => {
    expect(rutaExpedienteEquipo('n1')).not.toContain('q=')
    expect(rutaExpedienteEquipo('n1', 'recursos', { buscar: '   ' })).not.toContain('q=')
  })

  it('un código de fabricante con espacios viaja escapado y vuelve igual', () => {
    const ruta = rutaExpedienteEquipo('n1', 'recursos', { buscar: '999 0543' })
    expect(new URLSearchParams(ruta.split('?')[1]).get('q')).toBe('999 0543')
  })
})
