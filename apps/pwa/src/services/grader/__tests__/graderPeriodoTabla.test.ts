import { describe, it, expect } from 'vitest'
import { compararFilas, nombreArchivoCsv } from '../graderPeriodoTabla'

/** Los tres turnos reales del 2026-08-17, el único día del período con los tres. */
const T1 = { dateKey: '2026-08-17', shiftId: 'Turno 1',       startAt: '2026-08-17T21:19:49.000Z', totalPieces: 13825 }
const T1L = { dateKey: '2026-08-17', shiftId: 'Turno 1 Lunes', startAt: '2026-08-17T00:12:26.000Z', totalPieces: 15438 }
const T2 = { dateKey: '2026-08-17', shiftId: 'Turno 2',       startAt: '2026-08-17T10:17:55.000Z', totalPieces: 10888 }

const ordenar = (filas: typeof T1[], clave: keyof typeof T1, dir: 'asc' | 'desc') =>
  [...filas].sort((a, b) => compararFilas(a, b, clave, dir)).map((f) => f.shiftId)

describe('compararFilas', () => {
  it('los turnos del mismo día salen en orden CRONOLÓGICO, no por nombre', () => {
    // En Chonchi «Turno 1» es la NOCHE (21:19) y «Turno 2» la mañana (10:17):
    // el orden del reloj no es el del nombre.
    expect(ordenar([T1, T1L, T2], 'dateKey', 'asc')).toEqual(['Turno 1 Lunes', 'Turno 2', 'Turno 1'])
  })

  it('con fechas descendentes, dentro del día también manda el reloj invertido', () => {
    expect(ordenar([T1, T1L, T2], 'dateKey', 'desc')).toEqual(['Turno 1', 'Turno 2', 'Turno 1 Lunes'])
  })

  it('el desempate no pisa la columna elegida', () => {
    // Ordenar por piezas tiene que dar piezas, no horas.
    expect(ordenar([T1, T1L, T2], 'totalPieces', 'desc')).toEqual(['Turno 1 Lunes', 'Turno 1', 'Turno 2'])
  })

  it('sin startAt no rompe ni inventa un orden', () => {
    const a = { ...T1, startAt: undefined }
    const b = { ...T2, startAt: undefined }
    expect(compararFilas(a, b, 'dateKey', 'asc')).toBe(0)
  })

  it('los vacíos van al final en las dos direcciones', () => {
    const conDato = { ...T1, totalPieces: 100 }
    const sinDato = { ...T2, totalPieces: undefined as unknown as number }
    expect(compararFilas(sinDato, conDato, 'totalPieces', 'asc')).toBe(1)
    expect(compararFilas(sinDato, conDato, 'totalPieces', 'desc')).toBe(1)
  })
})

describe('nombreArchivoCsv', () => {
  it('la Ú de «Último» ya no se come una letra', () => {
    // El slug viejo (`[^a-zA-Z0-9-]` → '-') dejaba `grader--ltimo-mes.csv`.
    expect(nombreArchivoCsv('Último mes')).toBe('grader-ultimo-mes.csv')
    expect(nombreArchivoCsv('Última semana')).toBe('grader-ultima-semana.csv')
  })

  it('no deja guiones dobles ni de borde', () => {
    expect(nombreArchivoCsv('Personalizado…')).toBe('grader-personalizado.csv')
    expect(nombreArchivoCsv('  Temporada  ')).toBe('grader-temporada.csv')
  })

  it('una etiqueta sin nada usable no deja el nombre colgando', () => {
    expect(nombreArchivoCsv('…')).toBe('grader-periodo.csv')
  })
})
