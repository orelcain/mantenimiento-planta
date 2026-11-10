/**
 * Jack-Knife en la piel Apple (modo lectura) con las cifras del mockup «Jack-Knife, A».
 * Se prueba el componente directo: el texto, la tabla que cierra y la ausencia de
 * fondos de cuadrante.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { JackKnifeLectura, type JackKnifeLecturaProps } from '../JackKnifeLectura'
import type { CalculoJK } from '@/services/shoplogix/jackKnife'
import type { FilaLecturaJK } from '@/services/shoplogix/jackKnifeLectura'

const FILAS: FilaLecturaJK[] = [
  { causa: 'Planta de Riles', q: 'agu', ev: 9, min: 288, mttr: 31.6, veredicto: 'sinHistoria' },
  { causa: 'Pernos / Resortes', q: 'agu', ev: 15, min: 216, mttr: 14.4, veredicto: 'empeoro' },
  { causa: 'Grader', q: 'agu', ev: 3, min: 60, mttr: 18.9, veredicto: 'empeoro' },
  { causa: 'Balanzas', q: 'agu', ev: 3, min: 54, mttr: 18.4, veredicto: 'mejoro' },
  { causa: 'Knuro', q: 'cro', ev: 82, min: 570, mttr: 7.0, veredicto: 'empeoro', minAntes10: 2.1, minAhora10: 39.0 },
  { causa: 'Cuchillos / Guillotinas', q: 'cro', ev: 32, min: 282, mttr: 8.8, veredicto: 'empeoro' },
  { causa: 'Cintas', q: 'cro', ev: 47, min: 276, mttr: 5.9, veredicto: 'empeoro' },
  { causa: 'Lógica', q: 'ok', ev: 31, min: 414, mttr: 13.4, veredicto: 'mejoro', minAntes10: 244.5, minAhora10: 28.5 },
  { causa: 'Correas', q: 'ok', ev: 18, min: 168, mttr: 9.4, veredicto: 'empeoro' },
  { causa: 'Túneles', q: 'ok', ev: 12, min: 144, mttr: 11.9, veredicto: 'sinHistoria' },
  { causa: 'Motores', q: 'ok', ev: 13, min: 126, mttr: 9.8, veredicto: 'mejoro' },
  { causa: 'Punto Cero', q: 'ok', ev: 19, min: 108, mttr: 5.8, veredicto: 'empeoro' },
  { causa: 'Bombas', q: 'ok', ev: 9, min: 78, mttr: 8.5, veredicto: 'empeoro' },
  { causa: 'Ajuste mantenimiento', q: 'ok', ev: 20, min: 60, mttr: 2.9, veredicto: 'mejoro' },
]

// Calculo mínimo para el gráfico y la tabla: 313 eventos, 474 min (47,4 h).
const CALC: CalculoJK = {
  pts: FILAS.map((f) => ({ k: f.causa, ev: f.ev, min: f.min, mttr: f.mttr, q: f.q })),
  N: 313,
  D: 474 * 60,
  un: 31.2,
  um: 13.7,
  cob: 0.73,
  barras: [],
  desde: 0,
  hasta: -1,
}

function props(extra: Partial<JackKnifeLecturaProps> = {}): JackKnifeLecturaProps {
  const noop = () => {}
  return {
    calc: CALC,
    turnos: [],
    filas: FILAS,
    ahora: { desdeKey: '2026-08-12', hastaKey: '2026-11-09', turnos: 146 },
    antes: { desdeKey: '2026-02-02', hastaKey: '2026-08-11', turnos: 86 },
    minAhora: 19.5,
    minAntes: 38.1,
    fantasmas: [],
    sel: null,
    elegirCausa: noop,
    preset: '90',
    onPreset: noop,
    modoCmp: 'ant',
    onModo: noop,
    mesActivo: false,
    onMes: noop,
    hayPrevia: true,
    limitesBase: true,
    onLimites: noop,
    umbralesDelBase: true,
    desaparecieron: 1,
    exportable: true,
    exportando: false,
    onExportar: noop,
    ...extra,
  }
}

describe('JackKnifeLectura (piel Apple, caso real del mockup)', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-skin', 'apple')
  })
  afterEach(() => {
    cleanup()
    document.documentElement.removeAttribute('data-skin')
  })

  it('el titular dice que bajó a la mitad y la bajada nombra Lógica y Knuro', () => {
    render(<JackKnifeLectura {...props()} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'La detención de Mantención bajó a la mitad: de 38,1 a 19,5 min por turno',
    )
    expect(screen.getByText(/Lógica cayó de 244,5 a 28,5 min cada 10 turnos/)).toBeTruthy()
    expect(screen.getByText('12 de agosto a 9 de noviembre, 146 turnos, frente a 2 de febrero a 11 de agosto, 86 turnos.')).toBeTruthy()
  })

  it('la tabla cierra en 313 eventos y 47,4 h, con los grupos del mockup', () => {
    render(<JackKnifeLectura {...props()} />)
    const tabla = screen.getByRole('table')
    const filaTotal = within(tabla).getByText('Mantención').closest('tr')!
    expect(within(filaTotal).getByText('313')).toBeTruthy()
    expect(within(filaTotal).getByText('47,4')).toBeTruthy()
    expect(within(tabla).getByText('10,3')).toBeTruthy()
    expect(within(tabla).getByText('18,8')).toBeTruthy()
    expect(within(tabla).getByText('18,3')).toBeTruthy()
    expect(screen.getByText('4 mejoraron, 8 empeoraron. 2 sin historia y 1 desapareció. Cobertura de causa aproximada, 73 %.')).toBeTruthy()
  })

  it('el gráfico no pinta fondos de cuadrante', () => {
    const { container } = render(<JackKnifeLectura {...props()} />)
    expect(container.querySelectorAll('svg rect')).toHaveLength(0)
  })
})
