import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Acr, AccionAcr, EventoRefAcr } from '@/services/acr/acr.types'
import type { Repeticion } from '@/services/acr/repeticion'
import type { SenalAcr } from '../useSenalesAcr'

// Las hojas reales traen Firestore y la IA: aquí solo importa que se abran, con qué datos y cuál.
vi.mock('@/components/acr/AcrEntrada', () => ({
  HojasAcr: ({ vista, repeticion, acr }: { vista: string; repeticion: Repeticion | null; acr: Acr | null }) =>
    vista === 'ninguna' ? null : (
      <div
        data-testid="hoja"
        data-vista={vista}
        data-repeticion={repeticion ? String(repeticion.eventoIds.length) : ''}
        data-acr={acr?.id ?? ''}
      />
    ),
}))

const navegar = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => navegar }))

let esPC = false
vi.mock('@/hooks/useEsPC', () => ({ useEsPC: () => esPC }))

let conPase = false
vi.mock('@/store/authStore', () => ({
  useAuthStore: (sel: (s: { user: { paseBitacora?: object } }) => unknown) =>
    sel({ user: conPase ? { paseBitacora: {} } : {} }),
}))

import { FranjaAcr } from '../FranjaAcr'

afterEach(() => {
  cleanup()
  navegar.mockClear()
  esPC = false
  conPase = false
})

const EVENTO = {
  id: 'ej-1',
  tipo: 'falla',
  turnoId: 't1',
  fechaTurno: '2026-11-05',
  equipo: 'EVISCERADORA BAADER 142 N3',
  descripcion: 'Muelle de tracción del carro cortado',
  minutosParada: 35,
  fotos: [],
} as EventoRefAcr

const REPETICION: Repeticion = {
  eventoIds: ['ej-1', 'n2', 'b200'],
  resumen: 'Resorte de la chapaleta · 3 veces',
  minutos: 21,
}

const accion = (fuerza: AccionAcr['fuerza']): AccionAcr =>
  ({ id: `a-${fuerza}`, texto: 'x', fuerza, causaId: 'c1', responsable: '', fechaLimite: null, estado: 'pendiente' }) as AccionAcr

const ACR = {
  id: 'acr-1',
  eventoBitacoraIds: ['ej-1'],
  createdAt: new Date(2026, 10, 5),
  acciones: [accion('fuerte'), accion('debil'), accion('fuerte')],
} as Acr

describe('FranjaAcr', () => {
  it('sin señal no renderiza nada', () => {
    const { container } = render(<FranjaAcr evento={EVENTO} senal={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('una señal sobre un evento que no aplica (sin detención ni falla) no renderiza nada', () => {
    const sinParada = { ...EVENTO, minutosParada: null } as EventoRefAcr
    const senal: SenalAcr = { tipo: 'repite', repeticion: REPETICION }
    const { container } = render(<FranjaAcr evento={sinParada} senal={senal} />)
    expect(container.firstChild).toBeNull()
  })

  it('«Se repite» muestra N veces en 30 días y abre el editor con la repetición', () => {
    const senal: SenalAcr = { tipo: 'repite', repeticion: REPETICION }
    render(<FranjaAcr evento={EVENTO} senal={senal} />)
    expect(screen.getByText('Se repite')).toBeTruthy()
    expect(screen.getByText('3 veces en 30 días')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Analizar/ }))
    const hoja = screen.getByTestId('hoja')
    expect(hoja.getAttribute('data-vista')).toBe('editor')
    expect(hoja.getAttribute('data-repeticion')).toBe('3')
  })

  it('el clic de la franja no sube a la fila del evento', () => {
    const alAbrirFila = vi.fn()
    const senal: SenalAcr = { tipo: 'repite', repeticion: REPETICION }
    render(
      <div role="button" tabIndex={0} onClick={alAbrirFila} onKeyDown={alAbrirFila}>
        <FranjaAcr evento={EVENTO} senal={senal} />
      </div>,
    )
    // La fila de la prueba también es un botón: se toma la franja por su etiqueta de texto.
    const franja = screen.getByText('Analizar causa ›').closest('button') as HTMLElement
    fireEvent.click(franja)
    fireEvent.keyDown(franja, { key: 'Enter' })
    expect(alAbrirFila).not.toHaveBeenCalled()
    expect(screen.getByTestId('hoja').getAttribute('data-vista')).toBe('editor')
  })

  it('«Analizado» muestra el porcentaje de acciones fuertes y abre la lectura', () => {
    const senal: SenalAcr = { tipo: 'analizado', acr: ACR }
    render(<FranjaAcr evento={EVENTO} senal={senal} />)
    expect(screen.getByText('Analizado')).toBeTruthy()
    expect(screen.getByText('67 % fuertes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Ver/ }))
    const hoja = screen.getByTestId('hoja')
    expect(hoja.getAttribute('data-vista')).toBe('lectura')
    expect(hoja.getAttribute('data-acr')).toBe('acr-1')
  })

  it('en PC «Analizado» navega a la página del análisis, sin abrir la hoja', () => {
    esPC = true
    render(<FranjaAcr evento={EVENTO} senal={{ tipo: 'analizado', acr: ACR }} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver/ }))
    expect(navegar).toHaveBeenCalledWith('/causa-raiz/acr-1')
    expect(screen.queryByTestId('hoja')).toBeNull()
  })

  it('en PC con pase de bitácora sigue la hoja: la página no existe para el pase', () => {
    esPC = true
    conPase = true
    render(<FranjaAcr evento={EVENTO} senal={{ tipo: 'analizado', acr: ACR }} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver/ }))
    expect(navegar).not.toHaveBeenCalled()
    expect(screen.getByTestId('hoja').getAttribute('data-vista')).toBe('lectura')
  })

  it('en PC «Se repite» sigue abriendo el editor', () => {
    esPC = true
    render(<FranjaAcr evento={EVENTO} senal={{ tipo: 'repite', repeticion: REPETICION }} />)
    fireEvent.click(screen.getByRole('button', { name: /Analizar/ }))
    expect(navegar).not.toHaveBeenCalled()
    expect(screen.getByTestId('hoja').getAttribute('data-vista')).toBe('editor')
  })

  it('«Analizado» sin acciones no muestra porcentaje', () => {
    const senal: SenalAcr = { tipo: 'analizado', acr: { ...ACR, acciones: [] } as Acr }
    render(<FranjaAcr evento={EVENTO} senal={senal} />)
    expect(screen.getByText('Analizado')).toBeTruthy()
    expect(screen.queryByText(/% fuertes/)).toBeNull()
  })

  it('la hoja abierta sobrevive si la señal desaparece mientras se edita', () => {
    const senal: SenalAcr = { tipo: 'repite', repeticion: REPETICION }
    const { rerender, container } = render(<FranjaAcr evento={EVENTO} senal={senal} />)
    fireEvent.click(screen.getByRole('button', { name: /Analizar/ }))
    rerender(<FranjaAcr evento={EVENTO} senal={null} />)
    expect(screen.getByTestId('hoja').getAttribute('data-vista')).toBe('editor')
    expect(container.querySelector('button')).toBeNull()
  })
})
