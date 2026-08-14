/**
 * El bloque de diagnóstico en pantalla.
 *
 * Lo que se protege: que describa lo que pasó sin afirmar causas, y que los
 * números que muestra sean los del historial y no una interpretación.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { DiagnosticoDeLinea } from '../MonitorDiagnostico'
import type { DiagnosticoLinea } from '@/services/shoplogix/monitorDiagnostico'

// El bloque recuerda si quedó abierto (localStorage): sin limpiarlo, un test
// heredaría el estado del anterior.
afterEach(() => { cleanup(); localStorage.clear() })

/** Filete, con sus números reales del 13-ago. */
const FILETE: DiagnosticoLinea = {
  factor: 'velocidad', cvVelocidad: 12.8, cvTiempo: 7.4, samples: 9,
  micro: {
    hoy: 81, menos: { count: 79, pieces: 4410 }, mas: { count: 150, pieces: 2410 },
    relacionInversa: true,
  },
}

/** Arranca plegado —es contexto, no el dato del turno—, así que se abre. */
const texto = (d: DiagnosticoLinea | null) => {
  const { container } = render(<DiagnosticoDeLinea d={d} />)
  const cabecera = container.querySelector('button')
  if (cabecera) fireEvent.click(cabecera)
  return container.textContent ?? ''
}

describe('DiagnosticoDeLinea', () => {
  it('nombra el factor que manda y muestra las dos dispersiones', () => {
    const t = texto(FILETE)
    expect(t).toMatch(/Manda la velocidad/)
    expect(t).toContain('12,8%')
    expect(t).toContain('7,4%')
    expect(t).toMatch(/últimos 9 turnos/)
  })

  it('en una línea de disponibilidad apunta a las paradas largas', () => {
    const t = texto({ ...FILETE, factor: 'tiempo', cvVelocidad: 5.2, cvTiempo: 14.1, micro: null })
    expect(t).toMatch(/Manda el tiempo andando/)
    expect(t).toMatch(/paradas largas/)
  })

  it('cuando ninguno domina lo dice, en vez de forzar un ganador', () => {
    const t = texto({ ...FILETE, factor: 'parejo', micro: null })
    expect(t).toMatch(/pesan parecido/)
    expect(t).not.toMatch(/El terreno está/)
  })

  it('las micro-detenciones se presentan como HECHOS, sin relación causal', () => {
    const t = texto(FILETE)
    expect(t).toContain('81')
    expect(t).toMatch(/El turno con menos tuvo 79 y produjo 4.410 pz/)
    expect(t).toMatch(/el que más tuvo 150 y produjo 2.410 pz/)
    // Nada de "por eso", "gracias a", "provocan": el dato no prueba causa.
    expect(t).not.toMatch(/por eso|gracias a|provoca|causa/i)
  })

  it('⚠ sin relación inversa muestra solo el RANGO, sin aparearlo con piezas', () => {
    // Con los 6 turnos recientes de Filete el pareo iba al revés; enseñarlo
    // haría leer "más micro-detenciones es mejor".
    const t = texto({
      ...FILETE,
      micro: { hoy: 40, menos: { count: 43, pieces: 3618 }, mas: { count: 63, pieces: 4364 }, relacionInversa: false },
    })
    expect(t).toMatch(/fueron entre 43 y 63/)
    expect(t).toMatch(/no acompañaron al total/)
    // Y ninguna de las dos cifras de piezas aparece al lado de las detenciones.
    expect(t).not.toContain('3.618')
    expect(t).not.toContain('4.364')
  })

  it('sin micro-detenciones registradas, el resto del bloque igual se muestra', () => {
    const t = texto({ ...FILETE, micro: null })
    expect(t).toMatch(/Manda la velocidad/)
    expect(t).not.toMatch(/Micro-detenciones/)
  })

  it('sin diagnóstico no renderiza nada', () => {
    const { container } = render(<DiagnosticoDeLinea d={null} />)
    expect(container.innerHTML).toBe('')
  })
})
