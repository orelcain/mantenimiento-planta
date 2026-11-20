/**
 * El script de lectura de la tabla debe llegar INTACTO y seguir siendo de SOLO
 * LECTURA: un escape mal hecho pierde barras invertidas o acentos graves sin dar
 * error, y una llamada que pulse o escriba en Matrix rompería la promesa que la
 * página le hace al admin.
 */
import { describe, it, expect } from 'vitest'
import { LECTURA_TABLA_MATRIX_PS1 } from '../lecturaTablaMatrixScript'

describe('LECTURA_TABLA_MATRIX_PS1', () => {
  it('empieza con el encabezado del script de solo lectura', () => {
    expect(LECTURA_TABLA_MATRIX_PS1.startsWith('# Lectura de la tabla de Matrix (Marelec). SOLO LECTURA')).toBe(true)
  })

  it('va en un solo bloque para que al pegarlo corra de una vez', () => {
    const codigo = LECTURA_TABLA_MATRIX_PS1.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'))
    expect(codigo[0]?.startsWith('& {')).toBe(true)
    expect(codigo[codigo.length - 1]).toBe('}')
  })

  it('conserva las barras invertidas y los acentos graves de PowerShell', () => {
    expect(LECTURA_TABLA_MATRIX_PS1).toContain("-replace '\\s+', ' '")
    expect(LECTURA_TABLA_MATRIX_PS1).toContain("'^ControlType\\.'")
    expect(LECTURA_TABLA_MATRIX_PS1).toContain('-join "`t"')
  })

  it('conserva los $ de PowerShell y las llaves de formato sin tocar', () => {
    expect(LECTURA_TABLA_MATRIX_PS1).toContain('function Celda($gp, [int]$r, [int]$c)')
    expect(LECTURA_TABLA_MATRIX_PS1).toContain('{0} de {1} en {2:N1} s')
  })

  it('tiene tope de tiempo para no dejar pegado el PC de planta', () => {
    expect(LECTURA_TABLA_MATRIX_PS1).toContain('$reloj.Elapsed.TotalSeconds -lt $maxSeg')
  })

  it('nombra el archivo que el admin debe buscar en el Escritorio', () => {
    expect(LECTURA_TABLA_MATRIX_PS1).toContain("'lectura-matrix-{0:HHmmss}.txt'")
  })

  it('es de solo lectura: no pulsa, no escribe ni mueve el foco en Matrix', () => {
    expect(LECTURA_TABLA_MATRIX_PS1).not.toMatch(
      /\.Invoke\(\)|\.SetValue\(|\.Toggle\(\)|\.Select\(\)|\.Expand\(\)|\.Collapse\(\)|\.Close\(\)|\.SetFocus\(\)|\.ScrollIntoView\(|SendKeys|SendInput|Set-Clipboard|mouse_event|keybd_event/,
    )
  })
})
