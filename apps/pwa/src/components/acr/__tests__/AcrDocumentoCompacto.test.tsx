import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Acr } from '@/services/acr/acr.types'
import { nombreEquipoLegible } from '@/services/bitacora/nombreEquipo'
import { AcrDocumento } from '../AcrDocumento'

vi.mock('../useUbicacionJK', () => ({
  useUbicacionJK: () => ({ estado: 'listo', punto: null, nivel: null, turnos: 0 }),
}))

afterEach(cleanup)

const EQUIPO = 'EVISCERADORA BAADER 142 N1'

function acrBase(extra: Partial<Acr> = {}): Acr {
  return {
    id: 'a1',
    version: 2,
    plantId: 'chonchi',
    eventoBitacoraIds: ['e1'],
    equipo: EQUIPO,
    fechaTurno: '2026-09-24',
    definicion: 'Se corta resorte ingreso chapaleta',
    minutosDetencion: 7,
    evidencias: [],
    piezaGuardada: false,
    causas: [{ id: 'c1', nivel: 'humana', texto: 'Al cambiar el resorte no se guarda', m6: null }],
    acciones: [
      { id: 'x1', fuerza: 'fuerte', texto: 'Instalar regulador', estado: 'pendiente', responsable: '', fechaLimite: null, causaId: 'c1' },
      { id: 'x2', fuerza: 'media', texto: 'Actualizar estándar', estado: 'hecha', hechaEn: '2026-10-01', responsable: 'Danilo', fechaLimite: '2026-12-01', causaId: null },
    ],
    verificacion: { criterio: `Sin repetir la falla en ${EQUIPO} durante 60 días`, dias: 60, resultado: 'pendiente' },
    estado: 'cerrado',
    ...extra,
  } as unknown as Acr
}

describe('AcrDocumento compacto', () => {
  it('usa título h2 con el texto de la definición y una sola columna', () => {
    const { container } = render(<AcrDocumento acr={acrBase()} compacto />)
    expect(screen.getByRole('heading', { level: 2, name: 'Se corta resorte ingreso chapaleta' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(container.querySelector('article')?.className).not.toMatch(/lg:grid/)
  })

  it('sin onActualizar no muestra botones de acción ni de resultado', () => {
    render(<AcrDocumento acr={acrBase()} compacto />)
    expect(screen.queryByRole('button', { name: 'Marcar hecha' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Eficaz' })).toBeNull()
  })

  it('con onActualizar, «Marcar hecha» guarda la fecha con hechaEn', () => {
    const onActualizar = vi.fn()
    render(<AcrDocumento acr={acrBase()} compacto onActualizar={onActualizar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Marcar hecha' }))
    expect(onActualizar).toHaveBeenCalledTimes(1)
    const enviado = onActualizar.mock.calls[0]![0] as Acr
    const pendiente = enviado.acciones.find((a) => a.id === 'x1')!
    expect(pendiente.estado).toBe('hecha')
    expect(pendiente.hechaEn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // La otra acción no cambia.
    expect(enviado.acciones.find((a) => a.id === 'x2')!.estado).toBe('hecha')
  })

  it('con onActualizar, «Deshacer» vuelve la acción a pendiente sin fecha', () => {
    const onActualizar = vi.fn()
    render(<AcrDocumento acr={acrBase()} compacto onActualizar={onActualizar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    const enviado = onActualizar.mock.calls[0]![0] as Acr
    expect(enviado.acciones.find((a) => a.id === 'x2')).toMatchObject({ estado: 'pendiente', hechaEn: null })
  })

  it('con onActualizar y verificación pendiente, «Eficaz» cambia el resultado', () => {
    const onActualizar = vi.fn()
    render(<AcrDocumento acr={acrBase()} compacto onActualizar={onActualizar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Eficaz' }))
    const enviado = onActualizar.mock.calls[0]![0] as Acr
    expect(enviado.verificacion.resultado).toBe('eficaz')
  })

  it('muestra «Vence el» con la fecha de verificación, siempre', () => {
    render(<AcrDocumento acr={acrBase()} compacto />)
    // 2026-09-24 + 60 días = 2026-11-23
    expect(screen.getByText('Vence el 23-11-2026')).toBeTruthy()
  })

  it('sin definición, el título usa el equipo', () => {
    render(<AcrDocumento acr={acrBase({ definicion: '' })} compacto />)
    expect(screen.getByRole('heading', { level: 2, name: nombreEquipoLegible(EQUIPO) })).toBeTruthy()
  })
})

describe('AcrDocumento: «En el Jack-Knife»', () => {
  it('sin causaJK no muestra la sección', () => {
    render(<AcrDocumento acr={acrBase()} compacto />)
    expect(screen.queryByRole('heading', { name: 'En el Jack-Knife' })).toBeNull()
  })

  it('con causaJK null dice que no aparece en el gráfico', () => {
    render(<AcrDocumento acr={acrBase({ causaJK: null })} compacto />)
    expect(screen.getByRole('heading', { name: 'En el Jack-Knife' })).toBeTruthy()
    expect(screen.getByText('No aparece en el Jack-Knife')).toBeTruthy()
  })

  it('con causaJK y sin detenciones en 90 días lo dice', () => {
    render(<AcrDocumento acr={acrBase({ causaJK: 'Empaquetadura Rota' })} compacto />)
    expect(screen.getByText('Empaquetadura Rota')).toBeTruthy()
    expect(screen.getByText('Sin detenciones en los últimos 90 días')).toBeTruthy()
  })
})
