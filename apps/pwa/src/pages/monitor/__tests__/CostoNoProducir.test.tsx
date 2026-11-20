import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { CausaDelTurno, GrupoDelTurno } from '@/services/shoplogix/monitorEventos'
import type { ConfigCostoNoProducir } from '@/services/shoplogix/costoNoProducir'

vi.mock('@/services/shoplogix/costoNoProducirConfig', () => ({
  leerConfigCostoNoProducir: vi.fn(),
  guardarMargen: vi.fn(),
}))

import { leerConfigCostoNoProducir } from '@/services/shoplogix/costoNoProducirConfig'
import { CostoNoProducir, type CostoNoProducirProps } from '../CostoNoProducir'
import { PROHIBIDAS } from './vocabulario'

afterEach(cleanup)

function causa(reason: string, piezas: number | null, mins: number[]): CausaDelTurno {
  return {
    reason,
    min: mins.reduce((s, m) => s + m, 0),
    count: mins.length,
    piezas,
    categoria: null,
    extension: false,
    paradas: mins.map((min) => ({ hora: '08:00', hasta: '08:10', min, desdeMin: null, hastaMin: null })),
  }
}

/* Mismo turno que el fixture de costoNoProducir.test.ts: 990 pz, 45 min, 4,6 kg por pieza. */
const GRUPOS: GrupoDelTurno[] = [
  { dueno: 'mantencion', min: 18, piezas: 396, causas: [
    causa('Baader 200/CUCHILLERIA DORSAL', 264, [12]),
    causa('Equipo Auxiliar / CINTAS', 132, [6]),
  ] },
  { dueno: 'externo', min: 18, piezas: 396, causas: [causa('CAMBIO LOTE/MMPP', 396, [18])] },
  { dueno: 'sin-imputar', min: 9, piezas: 198, causas: [causa('Detencion', 198, [9])] },
  { dueno: 'programado', min: 30, piezas: null, causas: [causa('COLACION', null, [30])] },
]

const CON_MARGEN: ConfigCostoNoProducir = {
  tipoCambioClpPorUsd: null,
  lineas: { filete: [{ margenPorKg: 500, moneda: 'CLP', vigenteDesde: '2026-11-01', autor: 'a', guardadoEn: null }] },
}
const SIN_MARGEN: ConfigCostoNoProducir = { tipoCambioClpPorUsd: null, lineas: {} }

function props(over: Partial<CostoNoProducirProps> = {}): CostoNoProducirProps {
  return {
    grupos: GRUPOS,
    pesoKg: 4.6,
    lineId: 'filete',
    lineLabel: 'Filete',
    dateKey: '2026-11-20',
    turnosAnteriores: [],
    puedeEditar: false,
    autor: 'admin@test',
    ...over,
  }
}

async function montar(cfg: ConfigCostoNoProducir | null, p: Partial<CostoNoProducirProps>) {
  vi.mocked(leerConfigCostoNoProducir).mockResolvedValue(cfg)
  const r = render(<CostoNoProducir {...props(p)} />)
  return r
}

describe('CostoNoProducir', () => {
  it('con margen de 500 CLP y 4,6 kg, muestra ≈ $2.280.000 para 990 piezas', async () => {
    await montar(CON_MARGEN, {})
    const cifras = await screen.findAllByText('≈ $2.280.000')
    expect(cifras.length).toBeGreaterThan(0)
    expect(screen.getByText(/990 pz/)).toBeTruthy()
    expect(screen.getByText(/≈ 4,6 t × \$500\/kg/)).toBeTruthy()
  })

  it('sin margen dice qué falta; el botón solo aparece si puede editar', async () => {
    const { unmount } = await montar(SIN_MARGEN, { puedeEditar: false })
    expect(await screen.findByText('Falta el margen de esta línea para mostrarlo en pesos.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Definir margen' })).toBeNull()
    unmount()

    await montar(SIN_MARGEN, { puedeEditar: true })
    expect(await screen.findByRole('button', { name: 'Definir margen' })).toBeTruthy()
  })

  it('sin peso promedio dice que nadie cargó la cuota', async () => {
    await montar(CON_MARGEN, { pesoKg: null })
    expect(await screen.findByText('Falta el peso promedio del turno (nadie cargó la cuota).')).toBeTruthy()
  })

  it('sin historia suficiente, la tarjeta de evitado no pone una cifra', async () => {
    await montar(CON_MARGEN, { turnosAnteriores: [] })
    expect(await screen.findByText('Aún no hay historia suficiente para comparar (mínimo 5 casos por causa).')).toBeTruthy()
  })

  it('ningún texto visible cae en el vocabulario prohibido (estado con margen)', async () => {
    await montar(CON_MARGEN, { puedeEditar: true })
    await screen.findAllByText('≈ $2.280.000')
    expect(PROHIBIDAS.test(document.body.textContent ?? '')).toBe(false)
  })

  it('ningún texto visible cae en el vocabulario prohibido (estados sin dato)', async () => {
    const { unmount } = await montar(SIN_MARGEN, { puedeEditar: true })
    await screen.findByRole('button', { name: 'Definir margen' })
    expect(PROHIBIDAS.test(document.body.textContent ?? '')).toBe(false)
    unmount()

    await montar(CON_MARGEN, { pesoKg: null })
    await screen.findByText('Falta el peso promedio del turno (nadie cargó la cuota).')
    expect(PROHIBIDAS.test(document.body.textContent ?? '')).toBe(false)
  })
})
