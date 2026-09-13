import { describe, it, expect } from 'vitest'
import { textoSeguroPdf, filaSegura, esImprimibleEnPdf } from '../textoSeguroPdf'

/**
 * Las fuentes base de jsPDF usan WinAnsiEncoding (cp1252). Un carácter fuera de ese juego no
 * sale como caja ni como interrogante: **jsPDF rompe la cadena entera** y el renglón aparece
 * vacío. El texto se ve bien en el editor y en la pantalla; el fallo solo sale en el papel.
 */

/** Lo que cp1252 admite: si algo de esto se pierde, el PDF sale mutilado en español. */
const ADMITE_CP1252 = [
  'Inspección visual: limpieza, montaje, acoplamiento',
  'Termografía carcasa (lado eje)',
  'NFPA 70B §2.2 · datos de rotulación',
  'Temperatura 70 °C — rodamiento accesible',
  '«sin evaluar»',
  'Año de instalación · ± 5 %',
  '¿Vencida? ¡Sí!',
]

describe('lo que el español necesita sobrevive intacto', () => {
  it.each(ADMITE_CP1252)('%s', (texto) => {
    expect(textoSeguroPdf(texto)).toBe(texto)
  })

  it('ningún carácter que sale queda fuera de lo imprimible', () => {
    const salida = textoSeguroPdf([...ADMITE_CP1252, 'Temp ≤ 70 °C', '✓ ok', 'a → b'].join(' '))
    const fuera = [...salida].filter((ch) => !esImprimibleEnPdf(ch))
    expect(fuera).toEqual([])
  })

  it('el em dash sobrevive: es el caso que engaña al criterio ingenuo', () => {
    // ⚠ No sirve comprobar `codePoint <= 0xff`: «—» es U+2014 (8212) y cp1252 SÍ lo tiene,
    // en el byte 0x97. El juego imprimible no es un rango contiguo de Unicode.
    expect('—'.codePointAt(0)).toBeGreaterThan(0xff)
    expect(esImprimibleEnPdf('—')).toBe(true)
    expect(textoSeguroPdf('70 °C — rodamiento')).toBe('70 °C — rodamiento')
  })
})

describe('lo que rompería el renglón se traduce, no se pierde', () => {
  it('≤ y ≥ pasan a <= y >=, que es lo que el técnico necesita leer', () => {
    expect(textoSeguroPdf('Temp ≤ 70 °C')).toBe('Temp <= 70 °C')
    expect(textoSeguroPdf('Desbalance ≥ 10 %')).toBe('Desbalance >= 10 %')
  })

  it('los tildes de verificación pasan a algo imprimible', () => {
    expect(textoSeguroPdf('✓ revisado')).toBe('X revisado')
    expect(textoSeguroPdf('☐ pendiente')).toBe('[ ] pendiente')
  })

  it('las flechas de una nota pegada de un correo no se comen la línea', () => {
    expect(textoSeguroPdf('Bomba → estanque')).toBe('Bomba -> estanque')
  })

  it('el espacio duro se vuelve espacio normal y no un hueco raro', () => {
    expect(textoSeguroPdf('70 °C')).toBe('70 °C')
  })
})

describe('el último recurso: perder la tilde, nunca el renglón', () => {
  it('un carácter exótico se pliega a su letra base', () => {
    // Una «ā» (macron) no está en cp1252 pero su letra base sí.
    expect(textoSeguroPdf('Rodamiento SKF 6205 ā')).toBe('Rodamiento SKF 6205 a')
  })

  it('un emoji se descarta y el resto de la frase queda entero', () => {
    // Este es el caso que importa: una nota del técnico con un emoji NO puede
    // borrar el hallazgo completo.
    expect(textoSeguroPdf('Fuga en el sello 🔧 revisar en parada')).toBe('Fuga en el sello  revisar en parada')
  })

  it('un texto entero de CJK no revienta y devuelve cadena vacía', () => {
    expect(textoSeguroPdf('軸受温度')).toBe('')
  })
})

describe('bordes', () => {
  it('null y undefined dan cadena vacía, no «null»', () => {
    expect(textoSeguroPdf(null)).toBe('')
    expect(textoSeguroPdf(undefined)).toBe('')
  })

  it('los números se imprimen como texto', () => {
    expect(textoSeguroPdf(720004565)).toBe('720004565')
    expect(textoSeguroPdf(0)).toBe('0')
  })

  it('conserva los saltos de línea de una nota larga', () => {
    expect(textoSeguroPdf('línea 1\nlínea 2')).toBe('línea 1\nlínea 2')
  })

  it('filaSegura limpia cada celda de una fila de autoTable', () => {
    expect(filaSegura(['10', '3300029112', 'ABRAZADERA 2" INOX ✓', 1, null]))
      .toEqual(['10', '3300029112', 'ABRAZADERA 2" INOX X', '1', ''])
  })
})
