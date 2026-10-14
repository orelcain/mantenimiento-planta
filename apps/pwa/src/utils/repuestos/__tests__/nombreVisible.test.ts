import { describe, it, expect } from 'vitest'
import { nombreVisible } from '../nombreVisible'

describe('nombreVisible', () => {
  it('prioriza el nombre común y muestra el nombre SAP formateado como oficial', () => {
    expect(nombreVisible({
      textoBreve: 'CUCHILLO 94011760',
      nombresComunes: ['Cuchillo circular baader 200'],
    })).toEqual({
      titulo: 'Cuchillo circular baader 200',
      oficial: 'Cuchillo 94011760',
      etiquetas: [],
      otros: [],
      esComun: true,
    })
  })

  it('solo cambia la primera letra del nombre común', () => {
    expect(nombreVisible({
      textoBreve: 'ACEITE ATLAS COPCO GR° ALIMENTICIO',
      nombresComunes: ['aceite ga90'],
    })).toMatchObject({ titulo: 'Aceite ga90', oficial: 'Aceite Atlas Copco gr° alimenticio' })
    expect(nombreVisible({ nombresComunes: ['  aceite GA90  '] }).titulo).toBe('Aceite GA90')
  })

  it('usa el primer nombre no vacío y excluye sus duplicados normalizados de otros', () => {
    expect(nombreVisible({
      textoBreve: 'VALVULA',
      nombresComunes: [' ', '  válvula de vacío ', '', ' llave ', 'VALVULA  DE VACIO', ' paso '],
    })).toMatchObject({ titulo: 'Válvula de vacío', otros: ['llave', 'paso'], esComun: true })
  })

  it('omite el oficial si coincide sin tildes, mayúsculas ni espacios sobrantes', () => {
    expect(nombreVisible({
      textoBreve: 'VALVULA DE VACIO',
      nombresComunes: ['  valvula\t de   vacio  '],
    }).oficial).toBeNull()
  })

  it('sin texto breve usa descripción, luego alias y finalmente el marcador vacío', () => {
    expect(nombreVisible({ descripcion: 'BOMBA VACIO', alias: 'OTRO' }).titulo).toBe('Bomba vacío')
    expect(nombreVisible({ textoBreve: null, descripcion: ' ', alias: 'CUCHILLO' }).titulo).toBe('Cuchillo')
    expect(nombreVisible({ textoBreve: '', descripcion: null, alias: ' ' }).titulo).toBe('(sin nombre)')
    expect(nombreVisible({}).titulo).toBe('(sin nombre)')
  })

  it('ignora el alias como título cuando existe texto breve o nombre común', () => {
    expect(nombreVisible({ textoBreve: 'CUCHILLO', alias: 'ALIAS' }).titulo).toBe('Cuchillo')
    expect(nombreVisible({ nombresComunes: ['disco'], alias: 'ALIAS' }).titulo).toBe('Disco')
  })

  it.each([
    ['(NO USAR)', ['No usar']],
    ['(OBSOLETO)', ['Obsoleto']],
    ['(NO USAR)(OBSOLETO)', ['No usar', 'Obsoleto']],
  ])('conserva las etiquetas %s con y sin nombre común, sin repetirlas en el texto', (prefijo, etiquetas) => {
    const textoBreve = `${prefijo} CUCHILLO`
    expect(nombreVisible({ textoBreve })).toEqual({
      titulo: 'Cuchillo', oficial: null, etiquetas, otros: [], esComun: false,
    })
    expect(nombreVisible({ textoBreve, nombresComunes: ['disco'] })).toEqual({
      titulo: 'Disco', oficial: 'Cuchillo', etiquetas, otros: [], esComun: true,
    })
    expect(nombreVisible({ textoBreve, nombresComunes: ['cuchillo'] })).toMatchObject({
      oficial: null, etiquetas,
    })
  })

  it('conserva las etiquetas incluso si no hay texto después del prefijo', () => {
    expect(nombreVisible({ textoBreve: '(NO USAR)', alias: 'ALIAS' })).toMatchObject({
      titulo: '(sin nombre)', etiquetas: ['No usar'],
    })
  })

  it.each([undefined, null, [], ['  ', '']])('tolera nombres comunes vacíos: %j', (nombresComunes) => {
    expect(nombreVisible({ textoBreve: 'CUCHILLO', nombresComunes })).toEqual({
      titulo: 'Cuchillo', oficial: null, etiquetas: [], otros: [], esComun: false,
    })
    expect(nombreVisible({ textoBreve: '   ', nombresComunes }).titulo).toBe('(sin nombre)')
    expect(nombreVisible({ textoBreve: '   ', nombresComunes, descripcion: 'BOMBA' }).titulo).toBe('Bomba')
  })

  it('no modifica el objeto ni la lista original', () => {
    const nombresComunes = Object.freeze(['  aceite ga90 ', ' lubricante '])
    const entrada = Object.freeze({
      textoBreve: '(NO USAR) ACEITE', nombresComunes, descripcion: 'DESCRIPCION', alias: 'ALIAS',
    })
    const original = { ...entrada, nombresComunes: [...nombresComunes] }
    const resultado = nombreVisible(entrada)
    resultado.otros.push('otro')
    expect(entrada).toEqual(original)
    expect(resultado.titulo).toBe('Aceite ga90')
  })
})
