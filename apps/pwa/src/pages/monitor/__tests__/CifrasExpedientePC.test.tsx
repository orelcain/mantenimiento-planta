// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { CifrasExpedientePC } from '../CifrasExpedientePC'
import { etiquetaTurno, parte, tituloPerdido, totalMaquinas } from '../cifrasExpediente'
import { horas } from '../MonitorV2'

afterEach(cleanup)

// Chonchi, P. Principal, turno 2 del viernes 6-11-2026 (Monitor, leído 15:05).
const CAUSAS = [
  { causa: 'Falta MMPP Logistica', dueno: 'externo' as const, veces: 3, min: 165 },
  { causa: 'Micro Detencion', dueno: 'sin-imputar' as const, veces: 35, min: 8 },
  { causa: 'CUCHILLOS/GUILLOTINAS', dueno: 'mantencion' as const, veces: 3, min: 3 },
]
const MAQ = [
  { name: 'Evisceradora 1', fallas: 1, fallaMin: 2, microN: 65, microMin: 9, disp: 99, mttr: 2.3 },
  { name: 'Evisceradora 2', fallas: 0, fallaMin: 0, microN: 25, microMin: 5, disp: 100, mttr: null },
  { name: 'Evisceradora 3', fallas: 2, fallaMin: 8, microN: 59, microMin: 9, disp: 96.7, mttr: 3.8 },
]
const DATOS = {
  perdidas: [{ dueno: 'mantencion' as const, min: 3 }, { dueno: 'externo' as const, min: 165 }, { dueno: 'sin-imputar' as const, min: 8 }],
  perdidasMaquina: { min: 529, maquinas: 3 },
  causas: CAUSAS,
  programadas: [{ causa: 'COLACION', min: 51 }],
  mant: { fallas: 3, fallaMin: 10, mttr: 3.3, mttrPrevio: 5, dispPct: 98.6 },
  mantPorMaquina: MAQ,
  eventos: [
    { maquina: 'Evisceradora 3', desde: '2026-11-06T09:07:00', hasta: '2026-11-06T09:11:00', min: 4, causa: 'CUCHILLOS/GUILLOTINAS', causas: ['CUCHILLOS/GUILLOTINAS'] },
    { maquina: 'Evisceradora 1', desde: '2026-11-06T07:41:00', hasta: '2026-11-06T07:43:00', min: 2, causa: 'LOGICA', causas: ['LOGICA'] },
  ],
  turnoId: '2026-11-06_Turno 2',
  cerrado: true,
}

describe('cuentas del expediente de cifras', () => {
  it('nombra el turno desde su id', () => {
    expect(etiquetaTurno('2026-11-06_Turno 2')).toBe('Turno 2 · 6 nov')
    expect(etiquetaTurno('2026-11-09_Turno+1+Lunes')).toBe('Turno 1 Lunes · 9 nov')
    expect(etiquetaTurno('sin-fecha')).toBeNull()
  })
  it('el título dice cuánto se perdió y la causa mayor', () => {
    expect(tituloPerdido(176, CAUSAS, horas)).toBe('La línea perdió 2 h 56 min; el 94 % fue Falta MMPP Logistica')
    expect(tituloPerdido(0, [], horas)).toBe('La línea no perdió tiempo en este turno')
  })
  it('la fila Línea suma todas las máquinas', () => {
    expect(totalMaquinas(MAQ)).toEqual({ fallas: 3, fallaMin: 10, microN: 149, microMin: 23 })
    expect(parte(8, 176)).toBe(5)
    expect(parte(1, 0)).toBe(0)
  })
})

describe('ventana Tiempo perdido y fallas en PC', () => {
  const abrir = () => render(<CifrasExpedientePC open onClose={() => {}} datos={DATOS} />)

  it('el costado ordena los dueños y cierra con el total', () => {
    abrir()
    const costado = within(screen.getByRole('complementary', { name: 'Resumen del tiempo perdido' }))
    expect(costado.getByText('Turno 2 · 6 nov')).toBeTruthy()
    expect(costado.getByText('de línea perdidos (529 min de máquina ÷ 3)')).toBeTruthy()
    const dueños = costado.getAllByText(/^(Externo|Sin imputar|Mantención)$/).map((e) => e.textContent)
    expect(dueños).toEqual(['Externo', 'Sin imputar', 'Mantención'])
    expect(costado.getAllByText('2 h 56 min').length).toBe(2)
  })

  it('cada tabla cierra con su total y las fallas van en orden de hora', () => {
    abrir()
    const fallas = within(screen.getByRole('region', { name: 'Cada falla' }))
    const horasFalla = fallas.getAllByText(/^\d\d:\d\d–/).map((e) => e.textContent)
    expect(horasFalla).toEqual(['07:41–07:43', '09:07–09:11'])
    expect(fallas.getByText('2 fallas')).toBeTruthy()
    expect(fallas.getByText('6 min')).toBeTruthy()
    const maq = within(screen.getByRole('region', { name: 'Fallas de equipos por máquina' }))
    expect(maq.getByText('149 · 23 min')).toBeTruthy()
  })

  it('lo programado no cuenta y va con su nombre legible', () => {
    abrir()
    expect(screen.getByText(/Programado, no cuenta como pérdida: colación 51 min/)).toBeTruthy()
  })
})
