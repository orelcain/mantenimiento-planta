import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Acr } from '@/services/acr/acr.types'
import { AcrDocumento } from '../AcrDocumento'
import { fraseDetencion, rotuloVolver, totalFuertes } from '../acrDocumentoTextos'

afterEach(cleanup)

const EQUIPO = 'EVISCERADORA BAADER 142 N1'

const ACR = {
  id: 'a1',
  version: 2,
  plantId: 'chonchi',
  eventoBitacoraIds: ['e1'],
  equipo: EQUIPO,
  fechaTurno: '2026-09-24',
  definicion: 'Se corta resorte ingreso chapaleta',
  minutosDetencion: 7,
  evidencias: [{ path: 'p', url: 'https://x/f.jpg', nota: 'Antes', origen: 'bitacora' }],
  piezaGuardada: true,
  causas: [{ id: 'c1', nivel: 'humana', texto: 'Al cambiar el resorte no se guarda', m6: null }],
  acciones: [
    { id: 'x1', fuerza: 'fuerte', texto: 'Instalar regulador', estado: 'pendiente', responsable: '', fechaLimite: null, causaId: 'c1' },
    { id: 'x2', fuerza: 'media', texto: 'Actualizar estándar', estado: 'pendiente', responsable: 'Danilo', fechaLimite: '2026-12-01', causaId: null },
  ],
  verificacion: { criterio: `Sin repetir la falla en ${EQUIPO} durante 60 días`, dias: 60, resultado: 'pendiente' },
  estado: 'cerrado',
} as unknown as Acr

describe('AcrDocumento', () => {
  it('el título es lo que pasó, no el nombre del formulario', () => {
    render(<AcrDocumento acr={ACR} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(ACR.definicion)
  })

  it('muestra la foto real y su origen', () => {
    render(<AcrDocumento acr={ACR} />)
    expect(screen.getByRole('img').getAttribute('src')).toBe('https://x/f.jpg')
    expect(screen.getByText('Antes. Foto del evento de Bitácora.')).toBeTruthy()
  })

  it('escribe el equipo legible también dentro del criterio', () => {
    const { container } = render(<AcrDocumento acr={ACR} />)
    expect(container.textContent).not.toContain(EQUIPO)
    expect(container.textContent).toContain('Evisceradora Baader 142 N1')
  })

  it('sigue la frase de la causa y marca lo que falta', () => {
    const { container } = render(<AcrDocumento acr={ACR} />)
    expect(container.textContent).toContain('Ataca: al cambiar el resorte no se guarda')
    expect(screen.getAllByText('Sin causa asociada')).toHaveLength(1)
    expect(container.textContent).toContain('Sin asignar')
    expect(container.textContent).toContain('01-12-2026')
  })

  it('cierra la tabla con el total de acciones fuertes', () => {
    render(<AcrDocumento acr={ACR} />)
    expect(screen.getByText('1 de 2 acciones es fuerte')).toBeTruthy()
  })

  it('no anida tarjetas', () => {
    const { container } = render(<AcrDocumento acr={ACR} />)
    expect(container.querySelector('.bg-card')).toBeNull()
  })

  it('un análisis sin datos dice qué falta en vez de quedar en blanco', () => {
    render(<AcrDocumento acr={{ ...ACR, evidencias: [], causas: [], acciones: [] }} />)
    expect(screen.getByText('Sin fotos')).toBeTruthy()
    expect(screen.getByText('Sin causas registradas')).toBeTruthy()
    expect(screen.getByText('Sin acciones registradas')).toBeTruthy()
  })
})

describe('frases', () => {
  it('detención', () => {
    expect(fraseDetencion(null)).toBe('Sin detención.')
    expect(fraseDetencion(1)).toBe('Detuvo la máquina 1 minuto.')
    expect(fraseDetencion(7)).toBe('Detuvo la máquina 7 minutos.')
  })
  it('volver al turno', () => {
    expect(rotuloVolver('2026-09-24_dia')).toBe('Bitácora, turno día 24-09-2026')
    expect(rotuloVolver(undefined)).toBe('Bitácora')
  })
  it('total', () => {
    expect(totalFuertes(0, 2)).toBe('0 de 2 acciones son fuertes')
    expect(totalFuertes(1, 1)).toBe('1 de 1 acción es fuerte')
    expect(totalFuertes(2, 3)).toBe('2 de 3 acciones son fuertes')
  })
})
