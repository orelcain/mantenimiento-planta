import { describe, expect, it } from 'vitest'
import { indicePorSap, nombreParaTexto, nombreVisiblePorSap, textoBuscableRepuesto } from '../nombrePorSap'

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

describe('índice y búsqueda', () => {
  it('un duplicado con nombre común vacío no bloquea al que sí tiene', () => {
    const i = indicePorSap([
      { codigoSAP: '7', textoBreve: 'A', nombresComunes: ['   '] },
      { codigoSAP: '7', textoBreve: 'A', nombresComunes: ['apodo'] },
    ])
    expect(nombreVisiblePorSap(i, '7', 'A').titulo).toBe('Apodo')
    const j = indicePorSap([
      { codigoSAP: '7', textoBreve: 'A', nombresComunes: ['apodo'] },
      { codigoSAP: '7', textoBreve: 'A', nombresComunes: [' '] },
    ])
    expect(nombreVisiblePorSap(j, '7', 'A').titulo).toBe('Apodo')
  })

  it('SAP con espacios resuelve; con ceros iniciales es otro SAP (no se coacciona)', () => {
    const i = indicePorSap([{ codigoSAP: ' 94011760 ', textoBreve: 'X', nombresComunes: ['cuchillo'] }])
    expect(nombreVisiblePorSap(i, '94011760', 'Y').titulo).toBe('Cuchillo')
    expect(nombreVisiblePorSap(i, '094011760', 'Y').titulo).toBe('Y')
  })

  it('el texto buscable incluye TODOS los nombres comunes (buscar solo por apodo encuentra)', () => {
    const t = textoBuscableRepuesto({ textoBreve: 'Cuchillo 1', nombresComunes: ['cuchillo circular', 'disco de corte'], codigoSAP: '9' }, 'BAADER 200').toLowerCase()
    expect(t).toContain('cuchillo circular')
    expect(t).toContain('disco de corte')
    expect(t).toContain('baader 200')
  })
})
