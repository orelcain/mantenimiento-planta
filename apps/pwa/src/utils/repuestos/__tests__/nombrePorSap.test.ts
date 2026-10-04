import { describe, expect, it } from 'vitest'
import { indicePorSap, nombreParaTexto, nombreVisiblePorSap } from '../nombrePorSap'

describe('nombreVisiblePorSap', () => {
  const indice = indicePorSap([
    { codigoSAP: '94011760', textoBreve: 'Cuchillo 94011760', nombresComunes: [] },
    { codigoSAP: '94011760', textoBreve: 'Cuchillo 94011760', nombresComunes: ['cuchillo circular baader 200'] },
    { codigoSAP: '555', textoBreve: 'Rodamiento 6204', nombresComunes: [] },
  ])

  it('con nombre común: el común es el título y el SAP queda debajo', () => {
    const nv = nombreVisiblePorSap(indice, '94011760', 'Cuchillo 94011760')
    expect(nv.titulo).toBe('Cuchillo circular baader 200')
    expect(nv.oficial).toBe('Cuchillo 94011760')
  })

  it('sin nombre común: el nombre SAP', () => {
    const nv = nombreVisiblePorSap(indice, '555', 'viejo')
    expect(nv.titulo).toBe('Rodamiento 6204')
    expect(nv.oficial).toBeNull()
  })

  it('fuera del catálogo: respaldo con el texto guardado, y vacío no revienta', () => {
    expect(nombreVisiblePorSap(indice, '999', 'Guardado').titulo).toBe('Guardado')
    expect(nombreVisiblePorSap(indice, '', '').titulo).toBe('(sin nombre)')
  })
})

describe('nombreParaTexto (ARIA)', () => {
  it('con común: común primero y SAP entre paréntesis', () => {
    expect(nombreParaTexto({ textoBreve: 'Cuchillo 94011760', nombresComunes: ['cuchillo circular baader 200'] }))
      .toBe('Cuchillo circular baader 200 (SAP: Cuchillo 94011760)')
  })
  it('sin común: el texto SAP tal cual; vacío no revienta', () => {
    expect(nombreParaTexto({ textoBreve: 'AMORTIGUADOR 1421003000', nombresComunes: [] })).toBe('AMORTIGUADOR 1421003000')
    expect(nombreParaTexto({ textoBreve: '', nombresComunes: null })).toBe('(sin nombre)')
  })
})
