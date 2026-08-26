import { describe, it, expect } from 'vitest'
import { coincideTitulo, etiquetaHoja } from '../hojas'

/**
 * El selector "Ir a hoja" listaba numeros pelados (1..254): en un despiece
 * nadie sabe que es la hoja 137. Ahora usa la figura impresa y el titulo del
 * conjunto, PERO sin repetir titulos que no distinguen nada — medido: las 18
 * hojas del as-built de la 200 dicen todas "Continuacion del esquema".
 */
describe('etiquetaHoja', () => {
  it('usa la figura impresa y el titulo en castellano', () => {
    expect(etiquetaHoja({ blatt: 89, fig: '70-8', titulo: 'Induktive', tituloEs: 'Sensores inductivos' }, true))
      .toBe('70-8 · Sensores inductivos')
  })

  it('respeta el aleman cuando se elige DE', () => {
    expect(etiquetaHoja({ blatt: 89, fig: '70-8', titulo: 'Induktive', tituloEs: 'Sensores' }, false))
      .toBe('70-8 · Induktive')
  })

  it('cae al numero de hoja cuando no hay figura', () => {
    expect(etiquetaHoja({ blatt: 23, titulo: null, tituloEs: 'SM3 Aspirador' }, true))
      .toBe('23 · SM3 Aspirador')
  })

  it('omite los titulos que no distinguen una hoja de otra', () => {
    expect(etiquetaHoja({ blatt: 7, tituloEs: 'Continuacion del esquema' }, true)).toBe('7')
    expect(etiquetaHoja({ blatt: 7, titulo: 'Fortsetzung Schaltplan' }, false)).toBe('7')
  })

  it('no muestra el guion largo del indice como si fuera una figura', () => {
    expect(etiquetaHoja({ blatt: 1, fig: '—', tituloEs: 'Portada' }, true)).toBe('1 · Portada')
  })

  it('degrada a solo el numero si no hay titulo', () => {
    expect(etiquetaHoja({ blatt: 5 }, true)).toBe('5')
  })
})

/**
 * Los títulos de los planos GEA salen de OCR del cajetín y traen palabras
 * pegadas. Verificado en producción antes del fix: "ocupacion cable" devolvía
 * 0 resultados y "ocupacioncable" devolvía 3.
 */
describe('coincideTitulo', () => {
  const TIT = 'H0.14 · OCUPACIONCABLE DE UNION25G075'

  it('encuentra el título aunque el OCR haya pegado las palabras', () => {
    expect(coincideTitulo(TIT, 'OCUPACION CABLE')).toBe(true)
  })

  it('sigue encontrando la coincidencia literal', () => {
    expect(coincideTitulo(TIT, 'OCUPACIONCABLE')).toBe(true)
    expect(coincideTitulo(TIT, 'UNION25G075')).toBe(true)
  })

  it('NO convierte consultas cortas en coincidencias de cualquier cosa', () => {
    // "de la" -> "dela" no puede empezar a calzar con títulos al azar.
    expect(coincideTitulo('CUADRO DE LAMPARAS', 'DE LA')).toBe(true)   // literal, sí
    expect(coincideTitulo('MODELADO', 'DE LA')).toBe(false)            // pegado, no
  })

  it('no calza con texto vacío', () => {
    expect(coincideTitulo('', 'CABLE')).toBe(false)
    expect(coincideTitulo(TIT, '')).toBe(false)
  })
})
