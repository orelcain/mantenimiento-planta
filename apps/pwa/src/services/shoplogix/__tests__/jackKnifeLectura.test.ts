import { describe, it, expect } from 'vitest'
import {
  bajadaLectura,
  identidadLectura,
  tablaLectura,
  titularLectura,
  type FilaLecturaJK,
} from '../jackKnifeLectura'

// Caso real del mockup «Jack-Knife, A» (jk-A.dc.html, 09-11-2026).
// Horas y eventos de la tabla; minutos = horas × 60. Solo llevan minutos cada 10
// turnos las dos causas que el mockup muestra en el texto (Lógica y Knuro).
const FILAS: FilaLecturaJK[] = [
  { causa: 'Planta de Riles', q: 'agu', ev: 9, min: 288, mttr: 31.6, veredicto: 'sinHistoria' },
  { causa: 'Pernos / Resortes', q: 'agu', ev: 15, min: 216, mttr: 14.4, veredicto: 'empeoro' },
  { causa: 'Grader', q: 'agu', ev: 3, min: 60, mttr: 18.9, veredicto: 'empeoro' },
  { causa: 'Balanzas', q: 'agu', ev: 3, min: 54, mttr: 18.4, veredicto: 'mejoro' },
  { causa: 'Knuro', q: 'cro', ev: 82, min: 570, mttr: 7.0, veredicto: 'empeoro', minAntes10: 2.1, minAhora10: 39.0 },
  { causa: 'Cuchillos / Guillotinas', q: 'cro', ev: 32, min: 282, mttr: 8.8, veredicto: 'empeoro' },
  { causa: 'Cintas', q: 'cro', ev: 47, min: 276, mttr: 5.9, veredicto: 'empeoro' },
  { causa: 'Lógica', q: 'ok', ev: 31, min: 414, mttr: 13.4, veredicto: 'mejoro', minAntes10: 244.5, minAhora10: 28.5 },
  { causa: 'Correas', q: 'ok', ev: 18, min: 168, mttr: 9.4, veredicto: 'empeoro' },
  { causa: 'Túneles', q: 'ok', ev: 12, min: 144, mttr: 11.9, veredicto: 'sinHistoria' },
  { causa: 'Motores', q: 'ok', ev: 13, min: 126, mttr: 9.8, veredicto: 'mejoro' },
  { causa: 'Punto Cero', q: 'ok', ev: 19, min: 108, mttr: 5.8, veredicto: 'empeoro' },
  { causa: 'Bombas', q: 'ok', ev: 9, min: 78, mttr: 8.5, veredicto: 'empeoro' },
  { causa: 'Ajuste mantenimiento', q: 'ok', ev: 20, min: 60, mttr: 2.9, veredicto: 'mejoro' },
]

describe('titularLectura', () => {
  it('baja de 48 % o más se dice «a la mitad» (caso real: 38,1 → 19,5)', () => {
    expect(titularLectura(19.5, 38.1)).toBe('La detención de Mantención bajó a la mitad: de 38,1 a 19,5 min por turno')
  })
  it('fuera de 45–55 % se dice el porcentaje', () => {
    expect(titularLectura(30, 40)).toBe('La detención de Mantención bajó 25 %: de 40,0 a 30,0 min por turno')
  })
  it('si sube, dice «subió» con el porcentaje', () => {
    expect(titularLectura(30, 20)).toBe('La detención de Mantención subió 50 %: de 20,0 a 30,0 min por turno')
  })
  it('sin comparación dice solo el valor del período', () => {
    expect(titularLectura(19.5, null)).toBe('La detención de Mantención fue 19,5 min por turno')
  })
})

describe('bajadaLectura', () => {
  it('caso real: mejor, peor y la que más cuesta, en dos frases', () => {
    expect(bajadaLectura(FILAS)).toBe(
      'Lógica cayó de 244,5 a 28,5 min cada 10 turnos. Knuro subió de 2,1 a 39,0 y hoy es la que más tiempo cuesta: 82 eventos y 9,5 horas.',
    )
  })
  it('sin comparación queda solo la que más horas cuesta', () => {
    const sin = FILAS.map((f) => ({ causa: f.causa, q: f.q, ev: f.ev, min: f.min, mttr: f.mttr, veredicto: null }))
    expect(bajadaLectura(sin)).toBe('Knuro es la que más tiempo cuesta: 82 eventos y 9,5 horas.')
  })
})

describe('identidadLectura', () => {
  it('pone los dos tramos con su número de turnos', () => {
    expect(
      identidadLectura(
        { desdeKey: '2026-08-12', hastaKey: '2026-11-09', turnos: 146 },
        { desdeKey: '2026-02-02', hastaKey: '2026-08-11', turnos: 86 },
      ),
    ).toBe('12 de agosto a 9 de noviembre, 146 turnos, frente a 2 de febrero a 11 de agosto, 86 turnos.')
  })
})

describe('tablaLectura', () => {
  const tabla = tablaLectura(FILAS, { cobertura: 0.73, desaparecieron: 1 })

  it('agrupa por cuadrante, sin los grupos vacíos, y cierra las horas del caso real', () => {
    expect(tabla.grupos.map((g) => [g.titulo, g.ev, g.horas])).toEqual([
      ['Agudas', 30, '10,3'],
      ['Crónicas', 161, '18,8'],
      ['Bajo control', 122, '18,3'],
    ])
    expect(tabla.ev).toBe(313)
    expect(tabla.horas).toBe('47,4')
  })

  it('la nota cuenta mejoras, empeoras, sin historia, desaparecidas y cobertura', () => {
    expect(tabla.nota).toBe('4 mejoraron, 8 empeoraron. 2 sin historia y 1 desapareció. Cobertura de causa aproximada, 73 %.')
  })

  it('sin comparación no lleva la columna ni la parte de la nota', () => {
    const sin = tablaLectura(
      FILAS.map((f) => ({ ...f, veredicto: null })),
      { cobertura: null, desaparecieron: 0 },
    )
    expect(sin.grupos[0]!.filas[0]!.frente).toBe('')
    expect(sin.nota).toBe('')
  })

  it('los restos mayores hacen que las horas de las filas sumen el total del grupo', () => {
    // Filas con décimas fraccionarias: el grupo debe cerrar con la suma de sus filas.
    const f: FilaLecturaJK[] = [
      { causa: 'A', q: 'agu', ev: 1, min: 10, mttr: 10, veredicto: null },
      { causa: 'B', q: 'agu', ev: 1, min: 10, mttr: 10, veredicto: null },
      { causa: 'C', q: 'agu', ev: 1, min: 10, mttr: 10, veredicto: null },
    ]
    const t = tablaLectura(f, { cobertura: null, desaparecieron: 0 })
    const suma = t.grupos[0]!.filas.reduce((a, r) => a + Math.round(Number(r.horas.replace(',', '.')) * 10), 0)
    expect(t.grupos[0]!.horas).toBe('0,5')
    expect(suma).toBe(5)
  })
})
