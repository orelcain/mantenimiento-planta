/**
 * La prueba de vida del espejo debe llegar INTACTA y seguir siendo de SOLO
 * LECTURA: mide si la tabla de Matrix crece sola sin pulsar nada. Un clic o una
 * escritura en Matrix rompería la promesa que la página le hace al admin.
 */
import { describe, it, expect } from 'vitest'
import { PRUEBA_VIDA_ESPEJO_PS1 } from '../pruebaVidaEspejoScript'

describe('PRUEBA_VIDA_ESPEJO_PS1', () => {
  it('empieza con el encabezado del script de solo lectura', () => {
    expect(PRUEBA_VIDA_ESPEJO_PS1.startsWith('# Prueba de vida del espejo del grader (Matrix, Marelec). SOLO LECTURA')).toBe(true)
  })

  it('va en un solo bloque para que al pegarlo corra de una vez', () => {
    const codigo = PRUEBA_VIDA_ESPEJO_PS1.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'))
    expect(codigo[0]?.startsWith('& {')).toBe(true)
    expect(codigo[codigo.length - 1]).toBe('}')
  })

  it('conserva las barras invertidas y los acentos graves de PowerShell', () => {
    expect(PRUEBA_VIDA_ESPEJO_PS1).toContain("-replace '\\s+', ' '")
    expect(PRUEBA_VIDA_ESPEJO_PS1).toContain("'^\\s*\\d{1,4}[-/.]\\d{1,2}[-/.]\\d{1,4}'")
  })

  it('solo lee una tabla cuyas columnas calzan EXACTO con uno de los dos informes', () => {
    expect(PRUEBA_VIDA_ESPEJO_PS1).toContain("'Fecha', 'Hora', 'Peso de las piezas', 'Cantidad de piezas', 'Lote', 'Gate', 'Calidad', 'Conservacion', 'Calibre', 'Producto', 'Turno'")
    expect(PRUEBA_VIDA_ESPEJO_PS1).toContain("'Especie', 'Lote', 'Fecha', 'Hora', 'Turno', 'Gate', 'Cantidad de piezas', 'Calidad', 'Peso de las piezas', 'Error', 'peso en Gr'")
    expect(PRUEBA_VIDA_ESPEJO_PS1).toContain('if ($f.enc[$i] -ne $esp[$i]) { $ok = $false; break }')
  })

  it('salta la fila «Total» de Puerta 0', () => {
    expect(PRUEBA_VIDA_ESPEJO_PS1).toContain("-match '^\\s*Total'")
  })

  it('tiene topes de tiempo para no dejar pegado el PC de planta', () => {
    expect(PRUEBA_VIDA_ESPEJO_PS1).toContain('$reloj.Elapsed.TotalSeconds -gt 20')
    expect(PRUEBA_VIDA_ESPEJO_PS1).toContain('$reloj.Elapsed.TotalSeconds -lt 90')
    expect(PRUEBA_VIDA_ESPEJO_PS1).toContain('-TimeoutSec 15')
  })

  it('la red solo hace GET a la app (nada se envía)', () => {
    expect(PRUEBA_VIDA_ESPEJO_PS1).toContain('-Method Get')
    expect(PRUEBA_VIDA_ESPEJO_PS1).not.toMatch(/-Method\s+(Post|Put|Patch|Delete)|Invoke-RestMethod|-Body\b/i)
  })

  it('nombra el archivo que el admin debe buscar en el Escritorio', () => {
    expect(PRUEBA_VIDA_ESPEJO_PS1).toContain("'vida-espejo-{0:HHmmss}.txt'")
  })

  it('es de solo lectura: no pulsa, no escribe ni mueve el foco en Matrix', () => {
    expect(PRUEBA_VIDA_ESPEJO_PS1).not.toMatch(
      /\.Invoke\(\)|\.SetValue\(|\.Toggle\(\)|\.Select\(\)|\.Expand\(\)|\.Collapse\(\)|\.Close\(\)|\.SetFocus\(\)|\.ScrollIntoView\(|SendKeys|SendInput|Set-Clipboard|mouse_event|keybd_event/,
    )
  })
})
