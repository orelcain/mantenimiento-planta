/**
 * La sonda que se copia debe llegar INTACTA y seguir siendo de SOLO LECTURA:
 * un escape mal hecho en el template literal pierde barras invertidas o
 * acentos graves sin dar error, y una llamada que pulse o escriba en Matrix
 * rompería la promesa que la página le hace al admin.
 */
import { describe, it, expect } from 'vitest'
import { SONDA_MATRIX_PS1 } from '../sondaMatrixScript'

describe('SONDA_MATRIX_PS1', () => {
  it('empieza con el encabezado de la sonda de solo lectura', () => {
    expect(SONDA_MATRIX_PS1.startsWith('# Sonda de controles de Matrix (Marelec). SOLO LECTURA')).toBe(true)
  })

  it('va en un solo bloque para que al pegarla corra de una vez', () => {
    const codigo = SONDA_MATRIX_PS1.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'))
    expect(codigo[0]?.startsWith('& {')).toBe(true)
    expect(codigo[codigo.length - 1]).toBe('}')
  })

  it('conserva las barras invertidas de las expresiones regulares', () => {
    expect(SONDA_MATRIX_PS1).toContain("-replace '\\s+', ' '")
    expect(SONDA_MATRIX_PS1).toContain("'^ControlType\\.'")
  })

  it('conserva los acentos graves con que PowerShell escapa las comillas', () => {
    expect(SONDA_MATRIX_PS1).toContain('ventana `"{0}`"')
  })

  it('conserva los $ de PowerShell y las llaves de formato sin tocar', () => {
    expect(SONDA_MATRIX_PS1).toContain('function T([string]$s)')
    expect(SONDA_MATRIX_PS1).toContain('"$($_.Key)=$($_.Value)"')
    expect(SONDA_MATRIX_PS1).toContain('clase={3} {{{4}}}{5}')
  })

  it('nombra el archivo que el admin debe buscar en el Escritorio', () => {
    expect(SONDA_MATRIX_PS1).toContain("'sonda-matrix-{0:HHmmss}.txt'")
  })

  it('es de solo lectura: no pulsa, no escribe ni mueve el foco en Matrix', () => {
    expect(SONDA_MATRIX_PS1).not.toMatch(
      /\.Invoke\(\)|\.SetValue\(|\.Toggle\(\)|\.Select\(\)|\.Expand\(\)|\.Collapse\(\)|\.Close\(\)|\.SetFocus\(\)|SendKeys|SendInput|Set-Clipboard|mouse_event|keybd_event/,
    )
  })

  it('no despliega ni elige opciones de los combos para leerlas', () => {
    expect(SONDA_MATRIX_PS1).not.toMatch(
      /\.AddToSelection\(|\.RemoveFromSelection\(|\.ScrollIntoView\(|\.Realize\(|FindItemByProperty|\.Scroll\(|\.SetScrollPercent\(|Set-ItemProperty|New-ItemProperty|Remove-ItemProperty/,
    )
  })

  it('lista los combos de la ventana con su valor, su estado y sus opciones', () => {
    expect(SONDA_MATRIX_PS1).toContain("T '5. COMBOS DE LA VENTANA")
    expect(SONDA_MATRIX_PS1).toContain('[System.Windows.Automation.TreeWalker]::RawViewWalker')
    expect(SONDA_MATRIX_PS1).toContain('.Current.ExpandCollapseState')
    expect(SONDA_MATRIX_PS1).toContain("T '6. VEREDICTO'")
  })

  it('distingue los cuatro casos del periodo y pide foto si las opciones no se ven', () => {
    for (const caso of ["'relativo'", "'sin-relativo'", "'sin-opciones'", "'sin-periodo'", "'ninguno'"]) {
      expect(SONDA_MATRIX_PS1).toContain(caso)
    }
    expect(SONDA_MATRIX_PS1).toContain('Eso NO significa que no haya periodo relativo')
    expect(SONDA_MATRIX_PS1).toContain('saca una foto del combo de periodo desplegado')
  })

  it('del registro de Marelec solo muestra ReportPeriod', () => {
    expect(SONDA_MATRIX_PS1).toContain("'HKCU:\\Software\\Marelec\\MATRIX CG'")
    expect(SONDA_MATRIX_PS1).toContain("$_.Name -match '^ReportPeriod'")
  })
})
