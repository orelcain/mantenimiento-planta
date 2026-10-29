/**
 * La TV v2 con datos de ejemplo: una sola cifra de piezas con la hora de su lectura, la meta a esta hora con «N atrás»,
 * el marcador con puntos firmes + «N en juego», Mantención diciendo su período y la carrera en horas de producción.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TvV2, type TvV2Props } from '../TvV2'
import type { DatosDuelo } from '../duelo'
import { PALABRAS_PROHIBIDAS_TV } from '../tvV2Datos'

afterEach(cleanup)

const curva = (fin: number, ritmo: number) => Array.from({ length: Math.floor(fin / 5) + 1 }, (_, i) => ({ minutes: i * 5, pieces: Math.round(i * 5 * ritmo) }))
const eq = (n: number, mins: number, pz: number) => ({ turnos: 1, fallasN: n, fallaMin: mins, piezasPerdidas: pz, minPorFalla: n ? mins / n : null })

const duelo = (): DatosDuelo => {
  const hoy = curva(385, 32.4)
  const fan = curva(465, 34.7)
  const ventaja = Array.from({ length: 387 }, (_, m) => {
    const a = Math.round(m * 32.4); const b = Math.round(m * 34.7)
    return { minuto: m, hechas: { rebolledo: a, cardenas: b }, lider: a === b ? null : a > b ? 'rebolledo' : 'cardenas', ventaja: Math.abs(a - b) }
  })
  return {
    hoy: { equipo: 'rebolledo', cerrado: false },
    abreJornada: false, esperando: null, hoyKey: '2026-10-28',
    puntaje: { firmes: { a: 0, b: 3 }, enJuego: 4, cerrada: false, detalleEnJuego: [{ indicador: 'arranque', rotulo: 'a', quienVaAdelante: 'b' }, { indicador: 'alimentacion', rotulo: 'b', quienVaAdelante: 'a' }, { indicador: 'alimentacion', rotulo: 'c', quienVaAdelante: 'a' }, { indicador: 'alimentacion', rotulo: 'd', quienVaAdelante: 'b' }] },
    carrera: { hoy, fantasma: fan, rivalEquipo: 'cardenas', minuto: 385, hoyPz: 12493, fantasmaPz: 13379, diferencia: -886, ventaja },
    costoHoy: { etiqueta: 'jornada 28/10', equipos: { cardenas: eq(3, 15, 400), rebolledo: eq(2, 11, 300) } },
  } as unknown as DatosDuelo
}

const props = (): TvV2Props => ({
  linea: 'Eviscerado', turno: 'P. Principal · Turno 2 · 07:15 → 15:00',
  estado: { texto: 'Produciendo', detenida: false }, reloj: '13:42',
  piezas: 12493, lectura: '13:42', metaAhora: 12321, metaTurno: 15000,
  ritmo: { rotulo: 'Ritmo · últimos 15 min', valor: 37.2, unidad: 'pz/min', secRotulo: 'esperado', sec: 51, chips: [{ nombre: 'Ev 1', valor: '17,0' }, { nombre: 'Ev 2', valor: '4,0', baja: true }] },
  duelo: duelo(), nombres: null, previstoMin: 465,
})

describe('TvV2', () => {
  it('muestra UNA cifra grande de piezas (el contador) con la hora de su lectura', () => {
    render(<TvV2 {...props()} />)
    expect(screen.getByTestId('tv-piezas').textContent).toBe('12.493')
    expect(screen.getByText('contador de Shoplogix · leído a las 13:42')).toBeTruthy()
  })
  it('la meta a esta hora dice cuántas piezas va adelante o atrás', () => {
    render(<TvV2 {...props()} />)
    expect(screen.getByText('Meta a esta hora')).toBeTruthy()
    expect(within(screen.getByTestId('tv-dif')).getByText('172')).toBeTruthy()
    expect(within(screen.getByTestId('tv-dif')).getByText('adelante')).toBeTruthy()
    cleanup()
    render(<TvV2 {...props()} piezas={12000} />)
    expect(within(screen.getByTestId('tv-dif')).getByText('atrás')).toBeTruthy()
  })
  it('el marcador trae los puntos firmes y «N en juego»', () => {
    render(<TvV2 {...props()} />)
    const m = screen.getByTestId('tv-marcador')
    expect(m.textContent).toContain('Grupo 2')
    expect(m.textContent).toContain('4 en juego')
    expect(m.textContent).toContain('arranque y cierre · alimentación ×3')
  })
  it('la jornada muestra minutos de línea detenida, nunca un MTTR (sus minutos no son de reparación)', () => {
    const { container } = render(<TvV2 {...props()} />)
    const mant = container.querySelector('.tv-mant')!.textContent ?? ''
    expect(mant).not.toContain('MTTR')
    expect(mant).toContain('línea detenida')
  })
  it('Mantención dice su período y el eje va en horas de producción', () => {
    const { container } = render(<TvV2 {...props()} />)
    expect(screen.getByText(/Mantención · jornada 28\/10/)).toBeTruthy()
    expect(screen.getByText('1.ª h')).toBeTruthy()
    expect(container.querySelector('svg')?.textContent).not.toMatch(/\d{2}:\d{2}/)
    expect(screen.getByText(/886 atrás de/)).toBeTruthy()
  })
  it('sin Duelo (sin rival) igual dibuja la pantalla, con la frase del porqué', () => {
    render(<TvV2 {...props()} duelo={null} mantTurno={{ fallas: 2, fallaMin: 12, mttr: 6 }} />)
    expect(screen.getByText('Todavía no hay turno para comparar.')).toBeTruthy()
    expect(screen.getByText(/Mantención · este turno/)).toBeTruthy()
  })
  it('no usa las palabras prohibidas del glosario', () => {
    const { container } = render(<TvV2 {...props()} />)
    const t = (container.textContent ?? '').toLowerCase()
    for (const w of PALABRAS_PROHIBIDAS_TV) expect(t.includes(w)).toBe(false)
  })
})
