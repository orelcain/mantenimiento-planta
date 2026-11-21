import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/services/firestoreTracked', () => ({ collection: () => null, onSnapshot: () => () => {} }))
vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('@/services/grader/graderDatosHasta', () => ({ useSesionFirebase: () => 'con' }))

const { COMANDO_REGISTRO_LECTOR, FichaEstadoLector } = await import('../EstadoLectorEspejo')

afterEach(cleanup)

const AHORA = Date.parse('2026-11-21T02:20:00.000Z')

describe('Estado del lector en Diagnóstico Matrix', () => {
  it('el comando del registro es el de las últimas 25 líneas de lector.log', () => {
    expect(COMANDO_REGISTRO_LECTOR).toBe('Get-Content "$env:LOCALAPPDATA\\espejo-grader\\lector.log" -Tail 25')
  })

  it('muestra lo que envió el lector, con el error y el límite', () => {
    render(
      <FichaEstadoLector
        ahora={AHORA}
        e={{
          equipo: 'CH-MANT-P07', linea: 'chonchi', ultimoLatidoMs: AHORA - 5 * 60_000, leidoEn: null, informe: 'pieza',
          estado: {
            version: 'e1.0', filasTabla: 10000, piezas: 0, primera: '', ultima: '',
            rango: ['2026-11-19 00:00:00', '2026-11-21 00:00:00'], limite: true, error: 'tope-10-min',
          },
        }}
      />,
    )
    expect(screen.getByText('Vivo')).toBeTruthy()
    expect(screen.getByText('10.000')).toBeTruthy()
    expect(screen.getByText('2026-11-19 00:00:00 → 2026-11-21 00:00:00')).toBeTruthy()
    expect(screen.getByText('marcado')).toBeTruthy()
    expect(screen.getByText('tope-10-min')).toBeTruthy()
    expect(screen.getByText(/pasó los 10 minutos/)).toBeTruthy()
    expect(screen.getByText(/Matrix está cortando en 10 000 registros/)).toBeTruthy()
  })

  it('e1.2: muestra el rango automático y avisa si Matrix no lo tomó', () => {
    const base = { equipo: 'CH-MANT-P07', linea: 'chonchi', ultimoLatidoMs: AHORA - 60_000, leidoEn: null, informe: 'pieza' }
    render(<FichaEstadoLector ahora={AHORA} e={{ ...base, estado: { version: 'e1.2', ajuste: 'ok', error: '' } }} />)
    expect(screen.getByText('Rango automático')).toBeTruthy()
    expect(screen.getByText('lo mueve el lector')).toBeTruthy()
    cleanup()
    render(<FichaEstadoLector ahora={AHORA} e={{ ...base, estado: { version: 'e1.2', ajuste: 'no-filtra', error: '' } }} />)
    expect(screen.getByText('devuelto a como estaba')).toBeTruthy()
    expect(screen.getByText(/Matrix no filtró con el rango nuevo/)).toBeTruthy()
    cleanup()
    render(<FichaEstadoLector ahora={AHORA} e={{ ...base, estado: { version: 'e1.2', bloqueada: true, leidas: 38, error: '' } }} />)
    expect(screen.getByText('bloqueada · leyó 38 filas')).toBeTruthy()
  })

  it('un lector e1.1 (sin la clave «ajuste») no muestra la fila del rango automático', () => {
    render(
      <FichaEstadoLector
        ahora={AHORA}
        e={{ equipo: 'PC', linea: 'chonchi', ultimoLatidoMs: AHORA - 60_000, leidoEn: null, informe: 'pieza', estado: { version: 'e1.1' } }}
      />,
    )
    expect(screen.queryByText('Rango automático')).toBeNull()
  })

  it('con el latido viejo dice «Sin lectura»', () => {
    render(
      <FichaEstadoLector
        ahora={AHORA}
        e={{ equipo: 'PC', linea: 'chonchi', ultimoLatidoMs: AHORA - 60 * 60_000, leidoEn: null, informe: 'pieza', estado: {} }}
      />,
    )
    expect(screen.getByText('Sin lectura')).toBeTruthy()
  })
})
