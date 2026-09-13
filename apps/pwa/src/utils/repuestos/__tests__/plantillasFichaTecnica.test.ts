import { describe, it, expect } from 'vitest'
import { PLANTILLAS_FICHA, CAMPOS_COMUNES, etiquetaDeCampo, normalizarTipoFicha } from '../plantillasFichaTecnica'

/**
 * El defecto que se arregló: el PDF de la ficha no conocía las etiquetas del modal y caía a
 * `key.toUpperCase()`. Un cilindro cargado con los campos de su plantilla salía impreso como
 * DIAMETROPISTON / PRESIONMAX / TIPOCILINDRO: sin unidad, sin acentos y pegado.
 */
describe('la ficha se etiqueta igual en pantalla y en el PDF', () => {
  const tipos = Object.keys(PLANTILLAS_FICHA)

  it.each(tipos)('%s: cada campo de la plantilla tiene etiqueta propia, no la clave cruda', (tipo) => {
    const campos = Object.entries(PLANTILLAS_FICHA[tipo]!.fields)
    for (const [clave, label] of campos) {
      expect(etiquetaDeCampo(tipo, clave)).toBe(label)
      expect(etiquetaDeCampo(tipo, clave)).not.toBe(clave)
      // `rpm` → «RPM» es legítimo; lo que no puede pasar es que una clave compuesta
      // (diametroPiston, presionMax) salga como su propia mayúscula, que era el síntoma.
      if (clave !== clave.toLowerCase()) expect(label).not.toBe(clave.toUpperCase())
    }
  })

  it('el caso concreto del cilindro: ya no imprime DIAMETROPISTON', () => {
    expect(etiquetaDeCampo('cilindro', 'diametroPiston')).toBe('Diámetro Pistón (mm)')
    expect(etiquetaDeCampo('cilindro', 'presionMax')).toBe('Presión Máx. (bar)')
    expect(etiquetaDeCampo('cilindro', 'amortiguacion')).toBe('Amortiguación')
  })

  it('una clave que no pertenece a la plantilla se devuelve tal cual (no se pierde el dato)', () => {
    expect(etiquetaDeCampo('cilindro', 'campoQueNoExiste')).toBe('campoQueNoExiste')
  })

  it('«general» no tiene campos propios: solo los comunes y lo que se agregue a mano', () => {
    expect(PLANTILLAS_FICHA['general']!.fields).toEqual({})
    expect(etiquetaDeCampo('general', 'loQueSea')).toBe('loQueSea')
  })

  it.each(Object.entries(CAMPOS_COMUNES))(
    'el campo común %s se etiqueta igual en cualquier tipo',
    (clave, label) => {
      // Estos seis los llena la sección «Datos generales» para TODOS los tipos; el PDF los
      // imprimía como NUMEROSERIE y ANOINSTALACION porque solo el modal los conocía.
      for (const tipo of Object.keys(PLANTILLAS_FICHA)) {
        expect(etiquetaDeCampo(tipo, clave)).toBe(label)
      }
    },
  )
})

describe('normalizarTipoFicha', () => {
  it('traduce los tipos legacy guardados en Firestore', () => {
    expect(normalizarTipoFicha('pump')).toBe('bomba')
    expect(normalizarTipoFicha('conveyor')).toBe('cinta')
  })

  it('una ficha vieja de bomba conserva sus etiquetas en vez de caer a General', () => {
    expect(etiquetaDeCampo('pump', 'caudal')).toBe('Caudal (L/min)')
    expect(etiquetaDeCampo('conveyor', 'anchoBanda')).toBe('Ancho Banda (mm)')
  })

  it('sin tipo cae a general, no revienta', () => {
    expect(normalizarTipoFicha(undefined)).toBe('general')
    expect(etiquetaDeCampo(undefined, 'x')).toBe('x')
  })
})
