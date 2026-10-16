import { describe, expect, it } from 'vitest'
import { formatoTamano, LIMITE_ARCHIVO_BYTES, nombreSeguro, rutaDocumento, separarPorTamano, tituloDeArchivo } from '../archivosEquipos'

describe('archivosEquipos', () => {
  it('limpia el nombre para Storage y conserva la extensión', () => {
    expect(nombreSeguro('Catálogo GEA PowerPak/5550 (mecánico).pdf')).toBe('Catalogo GEA PowerPak_5550 _mecanico_.pdf')
    expect(nombreSeguro('///')).toBe('_')
    expect(nombreSeguro('')).toBe('archivo')
  })

  it('arma la ruta por equipo con marca de tiempo', () => {
    expect(rutaDocumento('BMIrg', 'manual.pdf', 1700)).toBe('documentosEquipos/BMIrg/1700_manual.pdf')
  })

  it('titula sin la extensión', () => {
    expect(tituloDeArchivo('Manual GEA 5550.pdf')).toBe('Manual GEA 5550')
    expect(tituloDeArchivo('.pdf')).toBe('.pdf')
  })

  it('rechaza lo que pasa de 100 MB o viene vacío', () => {
    const { validos, rechazados } = separarPorTamano([
      { name: 'a.pdf', size: LIMITE_ARCHIVO_BYTES },
      { name: 'b.pdf', size: LIMITE_ARCHIVO_BYTES + 1 },
      { name: 'c.pdf', size: 0 },
    ])
    expect(validos.map((v) => v.name)).toEqual(['a.pdf'])
    expect(rechazados.map((r) => r.archivo.name)).toEqual(['b.pdf', 'c.pdf'])
    expect(rechazados[0]!.motivo).toContain('100 MB')
  })

  it('formatea tamaños en es-CL', () => {
    expect(formatoTamano(95.5 * 1024 * 1024)).toBe('95,5 MB')
    expect(formatoTamano(2048)).toBe('2 KB')
    expect(formatoTamano(10)).toBe('10 B')
  })
})
