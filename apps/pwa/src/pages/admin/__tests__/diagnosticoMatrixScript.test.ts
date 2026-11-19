/**
 * El script que se copia debe llegar INTACTO: un escape mal hecho en el template
 * literal pierde las barras invertidas (HKLM:\Software) sin dar error. Estos
 * chequeos fallan si eso pasa.
 */
import { describe, it, expect } from 'vitest'
import { DIAGNOSTICO_MATRIX_PS1 } from '../diagnosticoMatrixScript'

describe('DIAGNOSTICO_MATRIX_PS1', () => {
  it('empieza con el encabezado del script de solo lectura', () => {
    expect(DIAGNOSTICO_MATRIX_PS1.startsWith('# Diagnóstico de SOLO LECTURA del PC de Matrix')).toBe(true)
  })

  it('conserva las barras invertidas de las rutas del registro y de Windows', () => {
    expect(DIAGNOSTICO_MATRIX_PS1).toContain('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall')
    expect(DIAGNOSTICO_MATRIX_PS1).toContain('$env:USERPROFILE\\Documents')
  })

  it('conserva los $ de PowerShell y las llaves de ${...} sin tocar', () => {
    expect(DIAGNOSTICO_MATRIX_PS1).toContain('function T([string]$s)')
    expect(DIAGNOSTICO_MATRIX_PS1).toContain('(ini|config|udl)$')
    expect(DIAGNOSTICO_MATRIX_PS1).toContain('${env:ProgramFiles(x86)}')
  })

  it('termina en el nombre de archivo que el admin debe buscar en el Escritorio', () => {
    expect(DIAGNOSTICO_MATRIX_PS1).toContain("'diagnostico-matrix.txt'")
  })
})
