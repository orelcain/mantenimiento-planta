import { describe, it, expect } from 'vitest'
import { INSTALAR_LECTOR_ESPEJO_PS1 } from '@/pages/admin/instalarLectorEspejoScript'
import { VIGENCIA_ALTA_MIN, esVersionValida, instaladorConAlta, versionDeLector } from './espejoVersionLogica'

const CODIGO = 'a'.repeat(43)

describe('versionDeLector', () => {
  it('el instalador real declara e1.4', () => {
    expect(versionDeLector(INSTALAR_LECTOR_ESPEJO_PS1)).toBe('e1.4')
  })

  it('lee la línea aunque no sea la primera y tolere CRLF', () => {
    expect(versionDeLector("param()\r\n$VERSION = 'e1.2'\r\n$x = 1")).toBe('e1.2')
  })

  it('acepta eX.Y.Z (dos puntos)', () => {
    expect(versionDeLector("$VERSION = 'e1.3.4'")).toBe('e1.3.4')
  })

  it('null si falta la línea, si la versión no calza o si hay una comilla de más', () => {
    expect(versionDeLector('sin versión aquí')).toBeNull()
    expect(versionDeLector("$VERSION = 'e1.3.4.5'")).toBeNull()
    expect(versionDeLector("$VERSION = 'e1.300'")).toBeNull()
    expect(versionDeLector("  $VERSION = 'e1.3'")).toBeNull()
  })
})

describe('esVersionValida', () => {
  it('calza el mismo formato que las reglas de Firestore', () => {
    expect(esVersionValida('e1.3')).toBe(true)
    expect(esVersionValida('e12.10.2')).toBe(true)
    expect(esVersionValida('e1')).toBe(false)
    expect(esVersionValida('1.3')).toBe(false)
    expect(esVersionValida('e1.3.4.5')).toBe(false)
    expect(esVersionValida('e1.3 ')).toBe(false)
  })
})

describe('instaladorConAlta', () => {
  it('con el instalador real: el código aparece una sola vez y la marca desaparece', () => {
    const out = instaladorConAlta(INSTALAR_LECTOR_ESPEJO_PS1, CODIGO)
    expect(out.split(CODIGO).length - 1).toBe(1)
    expect(out).toContain(`$ALTA = '${CODIGO}'`)
    expect(out).not.toContain('@@ALTA@@')
  })

  it('el resto del instalador queda igual, byte a byte', () => {
    const out = instaladorConAlta(INSTALAR_LECTOR_ESPEJO_PS1, CODIGO)
    expect(out.replace(`$ALTA = '${CODIGO}'`, "$ALTA = '@@ALTA@@'")).toBe(INSTALAR_LECTOR_ESPEJO_PS1)
  })

  it('rechaza un código que no tiene 43 caracteres base64url', () => {
    expect(() => instaladorConAlta(INSTALAR_LECTOR_ESPEJO_PS1, 'a'.repeat(42))).toThrow()
    expect(() => instaladorConAlta(INSTALAR_LECTOR_ESPEJO_PS1, 'a'.repeat(44))).toThrow()
    expect(() => instaladorConAlta(INSTALAR_LECTOR_ESPEJO_PS1, 'a'.repeat(42) + '+')).toThrow()
    expect(() => instaladorConAlta(INSTALAR_LECTOR_ESPEJO_PS1, 'a'.repeat(42) + '/')).toThrow()
    expect(() => instaladorConAlta(INSTALAR_LECTOR_ESPEJO_PS1, '')).toThrow()
  })

  it('lanza si la marca no aparece', () => {
    expect(() => instaladorConAlta('nada que reemplazar', CODIGO)).toThrow(/una sola vez/)
  })

  it('lanza si la marca aparece dos veces', () => {
    const doble = `$ALTA = '@@ALTA@@'\n$ALTA = '@@ALTA@@'`
    expect(() => instaladorConAlta(doble, CODIGO)).toThrow(/una sola vez/)
  })

  it('no interpreta $ del código ni de la plantilla como patrón de reemplazo', () => {
    const plantilla = "$ALTA = '@@ALTA@@' # $& $1"
    expect(instaladorConAlta(plantilla, CODIGO)).toBe(`$ALTA = '${CODIGO}' # $& $1`)
  })
})

describe('vigencia del alta', () => {
  it('son 25 minutos', () => {
    expect(VIGENCIA_ALTA_MIN).toBe(25)
  })
})
