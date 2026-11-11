/**
 * Causa raíz en modo lectura (opción A): bajo la piel Apple, `AcrDocumento` entrega
 * `AcrLecturaA`. Mismo contenido, otra forma: contexto y titular arriba, secciones
 * con filete y una tabla de acciones cuyas columnas de responsable y límite van solo en PC.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Acr } from '@/services/acr/acr.types'
import { AcrDocumento } from '../AcrDocumento'

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

describe('AcrDocumento · piel Apple (modo lectura A)', () => {
  beforeEach(() => document.documentElement.setAttribute('data-skin', 'apple'))
  afterEach(() => {
    cleanup()
    document.documentElement.removeAttribute('data-skin')
  })

  it('la línea de contexto dice equipo, turno, detención y estado; el titular es lo que pasó', () => {
    const { container } = render(<AcrDocumento acr={ACR} />)
    expect(container.querySelector('[data-testid="acr-lectura"]')).not.toBeNull()
    expect(container.textContent).toContain('Evisceradora Baader 142 N1, turno del 24-09-2026. Detuvo la máquina 7 minutos. Análisis cerrado.')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(ACR.definicion)
  })

  it('las cuatro secciones van con filete, en el orden del mockup', () => {
    const { container } = render(<AcrDocumento acr={ACR} />)
    const secciones = Array.from(container.querySelectorAll('section'))
    expect(secciones.map((s) => s.querySelector('h2')?.textContent)).toEqual(['Causas', 'Acciones', 'Evidencia', 'Verificación'])
    secciones.forEach((s) => expect(s.className).toContain('border-t'))
  })

  it('acciones en tabla: responsable y límite como columnas solo en PC y como nota en el celular', () => {
    const { container } = render(<AcrDocumento acr={ACR} />)
    const cabeceras = Array.from(container.querySelectorAll('thead th'))
    expect(cabeceras.map((th) => th.textContent)).toEqual(['Qué se hace', 'Fuerza', 'Responsable', 'Límite'])
    expect(cabeceras[2]!.className).toContain('hidden lg:table-cell')
    expect(container.textContent).toContain('Responsable: Danilo. Límite: 01-12-2026.')
    expect(container.textContent).toContain('Ataca: al cambiar el resorte no se guarda')
    expect(screen.getByText('1 de 2 acciones es fuerte')).toBeTruthy()
  })

  it('la evidencia dice su origen y si se guardó la pieza; la verificación trae vence y resultado', () => {
    const { container } = render(<AcrDocumento acr={ACR} />)
    expect(screen.getByRole('img').getAttribute('src')).toBe('https://x/f.jpg')
    expect(container.textContent).toContain('Antes. Foto del evento de Bitácora.')
    expect(container.textContent).toContain('Pieza dañada guardada.')
    expect(container.textContent).toContain('Sin repetir la falla en Evisceradora Baader 142 N1 durante 60 días')
    expect(container.textContent).toContain('Vence')
    expect(container.textContent).toContain('Pendiente')
  })

  it('el panel compacto no cambia: sigue con su forma', () => {
    const { container } = render(<AcrDocumento acr={ACR} compacto />)
    expect(container.querySelector('[data-testid="acr-lectura"]')).toBeNull()
    expect(container.querySelector('h2')?.textContent).toBe(ACR.definicion)
  })
})
