// @vitest-environment happy-dom
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AreaRepuestoRow } from '@/hooks/repuestos/useAreaRepuestos'
import { RepuestoDetailPanel } from '../RepuestoDetailPanel'

vi.mock('@/hooks/repuestos/useManualesDeEquipos', () => ({ useManualesDeEquipos: () => ({ manuales: [], loading: false }) }))

// Caso real: válvula 34970060 en las Baader 142 y en una Baader 200.
const item = {
  codigoSAP: '3300070160',
  textoBreve: 'VALVULA MAGNETICA 34970060',
  equipos: [
    { machineId: 'b142-n1', machineName: 'EVISCERADORA BAADER 142 N1' },
    { machineId: 'b200', machineName: 'BAADER 200' },
  ],
  fotos: [],
  stockStatus: 'ok',
} as unknown as AreaRepuestoRow

/** El panel elige el diseño con matchMedia: `ancho` decide qué consultas calzan. */
function viewport(ancho: number) {
  window.matchMedia = ((q: string) => {
    const min = /min-width:\s*(\d+)/.exec(q)
    const max = /max-width:\s*(\d+)/.exec(q)
    const matches = (!min || ancho >= Number(min[1])) && (!max || ancho <= Number(max[1]))
    return { matches, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }
  }) as unknown as typeof window.matchMedia
}

function montar(onRemoveEquipo?: (id: string) => Promise<void>) {
  return render(
    <MemoryRouter>
      <RepuestoDetailPanel item={item} areaName="Evisceración" onClose={() => {}} loadMovimientos={async () => []} onSaveLocation={async () => {}} onRemoveEquipo={onRemoveEquipo} />
    </MemoryRouter>,
  )
}

afterEach(cleanup)

/** En el teléfono «Dónde se usa» va plegado por familia: hay que abrirla para ver sus unidades. */
function abrirFamiliaSiTelefono(ancho: number) {
  if (ancho >= 640) return
  fireEvent.click(screen.getByText('Baader 200'))
}

describe.each([['PC', 1280], ['teléfono', 390]])('ficha del repuesto · quitar equipo (%s)', (_, ancho) => {
  it('pide confirmación y recién entonces quita ese equipo', async () => {
    viewport(ancho)
    const quitar = vi.fn(async () => {})
    montar(quitar)
    abrirFamiliaSiTelefono(ancho)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar BAADER 200' }))
    expect(quitar).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog').textContent).toContain('¿Quitar BAADER 200 de este repuesto?')
    fireEvent.click(screen.getByRole('button', { name: /^Quitar$/ }))
    await waitFor(() => expect(quitar).toHaveBeenCalledWith('b200'))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('Cancelar no quita nada', () => {
    viewport(ancho)
    const quitar = vi.fn(async () => {})
    montar(quitar)
    abrirFamiliaSiTelefono(ancho)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar BAADER 200' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(quitar).not.toHaveBeenCalled()
  })

  it('sin permiso (no admin) no aparece la x', () => {
    viewport(ancho)
    montar(undefined)
    abrirFamiliaSiTelefono(ancho)
    expect(screen.queryByRole('button', { name: /^Quitar / })).toBeNull()
  })
})
