/**
 * El instalador del lector del espejo queda corriendo en el PC de Matrix: debe
 * llegar INTACTO, accionar un solo control de Matrix («Actualizar») y no llevar
 * ninguna llave dentro del texto que se pega.
 */
import { describe, it, expect } from 'vitest'
import { INSTALAR_LECTOR_ESPEJO_PS1 } from '../instalarLectorEspejoScript'

const S = INSTALAR_LECTOR_ESPEJO_PS1

describe('INSTALAR_LECTOR_ESPEJO_PS1', () => {
  it('no está vacío y va en un solo bloque para pegar', () => {
    expect(S.length).toBeGreaterThan(5000)
    const codigo = S.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'))
    expect(codigo[0]?.startsWith('& {')).toBe(true)
    expect(codigo[codigo.length - 1]).toBe('}')
  })

  it('acciona un único control de Matrix: una sola llamada a Invoke, sobre el botón «Actualizar»', () => {
    expect(S.match(/\.Invoke\(\)/g)?.length).toBe(1)
    expect(S).toContain('Boton-Actualizar')
    expect(S).toContain('InvokePattern')
  })

  it('no escribe, marca, selecciona ni mueve el foco en Matrix', () => {
    expect(S).not.toMatch(
      /\.SetValue\(|\.Toggle\(\)|\.Select\(\)|\.Expand\(\)|\.Collapse\(\)|\.Close\(\)|\.SetFocus\(\)|\.ScrollIntoView\(|SendKeys|SendInput|Set-Clipboard|mouse_event|keybd_event/,
    )
  })

  it('solo lee una tabla con las columnas exactas de «Pieza pieza Grader»', () => {
    expect(S).toContain("'Fecha', 'Hora', 'Peso de las piezas', 'Cantidad de piezas', 'Lote', 'Gate', 'Calidad', 'Conservacion', 'Calibre', 'Producto', 'Turno'")
    expect(S).toContain('otro-informe')
    expect(S).toContain('licencia-en-pantalla')
  })

  it('la llave se pide oculta, se guarda cifrada y nunca viaja en el texto pegado', () => {
    expect(S).toContain('-AsSecureString')
    expect(S).toContain('ConvertFrom-SecureString')
    expect(S).not.toMatch(/Bearer [A-Za-z0-9_-]{43}/)
  })

  it('envía solo a la función del espejo', () => {
    const urls = S.match(/https?:\/\/[^\s'"]+/g) ?? []
    expect(new Set(urls)).toEqual(new Set(['https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net/espejoGraderIngesta']))
  })

  it('arranca oculto, sin tarea programada ni inicio automático, y se puede detener', () => {
    expect(S).toContain('-WindowStyle Hidden')
    expect(S).not.toMatch(/schtasks|Register-ScheduledTask|CurrentVersion\\Run|shell:startup/i)
    expect(S).toContain('DETENER')
    expect(S).toContain('Local\\EspejoGraderLector')
  })

  it('conserva las barras invertidas de las expresiones regulares', () => {
    expect(S).toContain("'^\\d{4}-\\d{2}-\\d{2}$'")
    expect(S).toContain("'^\\d{2}:\\d{2}:\\d{2}$'")
  })
})
