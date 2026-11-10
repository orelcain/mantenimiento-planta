/**
 * Detalle de una causa en el modo lectura (piel Apple): PC (columna derecha) y
 * celular (hoja). Elegir una causa no pide «Ver detalle»; «Cerrar» quita la selección
 * y «Ver los N» pide abrir «Ver detalle» con la causa.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import { JackKnifeLectura, type JackKnifeLecturaProps } from '../JackKnifeLectura'
import type { CalculoJK, PuntoJK, ResumenJK, TurnoJK } from '@/services/shoplogix/jackKnife'
import type { FilaLecturaJK } from '@/services/shoplogix/jackKnifeLectura'

const { esPC } = vi.hoisted(() => ({ esPC: { valor: true } }))
vi.mock('@/hooks/useEsPC', () => ({ useEsPC: () => esPC.valor }))

const PUNTOS: PuntoJK[] = [
  { k: 'Planta de Riles', ev: 9, min: 288, mttr: 31.6, q: 'agu' },
  { k: 'Knuro', ev: 82, min: 570, mttr: 7.0, q: 'cro' },
  { k: 'Grader', ev: 3, min: 60, mttr: 18.9, q: 'agu' },
]

const FILAS: FilaLecturaJK[] = PUNTOS.map((p) => ({ causa: p.k, q: p.q, ev: p.ev, min: p.min, mttr: p.mttr, veredicto: 'igual' }))

// Dos turnos: Knuro tiene 3 comentarios (dos iguales), en el período elegido.
const RESUMEN = {
  v: 1,
  eventos: [],
  sinImputar: [],
  sinImputarLinea: [],
  conCausaMin: 0,
  sinCausaMin: 0,
  uptimeMin: 0,
  comentarios: [
    ['Knuro', 1, 'expulsador trabado mordaza'],
    ['Knuro', 2, 'expulsador trabado mordaza'],
    ['Knuro', 3, 'pernos sueltos'],
  ],
} as unknown as ResumenJK

const TURNOS: TurnoJK[] = [
  { id: 't1', dateKey: '2026-11-01', shiftId: 'Turno 1', resumen: RESUMEN },
]

const CALC: CalculoJK = {
  pts: PUNTOS,
  N: 94,
  D: 918 * 60,
  un: 31.2,
  um: 13.7,
  cob: 0.73,
  barras: [],
  desde: 0,
  hasta: 0,
}

function props(extra: Partial<JackKnifeLecturaProps> = {}): JackKnifeLecturaProps {
  const noop = () => {}
  return {
    calc: CALC,
    turnos: TURNOS,
    filas: FILAS,
    ahora: { desdeKey: '2026-11-01', hastaKey: '2026-11-01', turnos: 1 },
    antes: { desdeKey: '2026-10-01', hastaKey: '2026-10-31', turnos: 2 },
    minAhora: 19.5,
    minAntes: 38.1,
    fantasmas: [],
    antesPts: [{ k: 'Knuro', ev: 1, min: 20, mttr: 3.5, q: 'cro' }],
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
    desaparecieron: 0,
    exportable: true,
    exportando: false,
    onExportar: noop,
    ...extra,
  }
}

describe('JackKnifeLectura, detalle de causa (PC)', () => {
  beforeEach(() => {
    esPC.valor = true
    document.documentElement.setAttribute('data-skin', 'apple')
  })
  afterEach(() => {
    cleanup()
    document.documentElement.removeAttribute('data-skin')
  })

  it('con causa elegida, la columna derecha muestra el detalle y no «Atacar ahora»', () => {
    render(<JackKnifeLectura {...props({ sel: 'Knuro' })} />)
    const detalle = screen.getByTestId('jk-detalle')
    expect(within(detalle).getByRole('heading', { level: 2, name: 'Knuro' })).toBeTruthy()
    expect(within(detalle).getByText(/82 eventos, MTTR 7,0 min, 9,5 h en total\./)).toBeTruthy()
    expect(screen.queryByTestId('jk-atacar')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('la tabla Antes/Ahora marca en rojo lo que empeoró (Eventos, Reparación y Detenido)', () => {
    render(<JackKnifeLectura {...props({ sel: 'Knuro' })} />)
    const detalle = screen.getByTestId('jk-detalle')
    expect(within(detalle).getByRole('columnheader', { name: 'Antes' })).toBeTruthy()
    const ahora = within(detalle).getAllByRole('cell').filter((c) => c.className.includes('text-ink-crit'))
    expect(ahora).toHaveLength(3)
  })

  it('«Cerrar» quita la selección: vuelve «Atacar ahora» y no abre nada', () => {
    const onCerrarCausa = vi.fn()
    const onVerDetalle = vi.fn()
    render(<JackKnifeLectura {...props({ sel: 'Knuro', onCerrarCausa, onVerDetalle })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onCerrarCausa).toHaveBeenCalledTimes(1)
    expect(onVerDetalle).not.toHaveBeenCalled()
  })

  it('«Ver los 3» pide abrir «Ver detalle» con la causa, y no pasa por la selección', () => {
    const onVerDetalle = vi.fn()
    const elegirCausa = vi.fn()
    render(<JackKnifeLectura {...props({ sel: 'Knuro', onVerDetalle, elegirCausa })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver los 3' }))
    expect(onVerDetalle).toHaveBeenCalledWith('Knuro')
    expect(elegirCausa).not.toHaveBeenCalled()
  })

  it('elegir una causa desde la tabla llama a elegirCausa y no a «Ver detalle»', () => {
    const elegirCausa = vi.fn()
    const onVerDetalle = vi.fn()
    render(<JackKnifeLectura {...props({ elegirCausa, onVerDetalle })} />)
    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: 'Grader' }))
    expect(elegirCausa).toHaveBeenCalledWith('Grader')
    expect(onVerDetalle).not.toHaveBeenCalled()
  })

  it('la fila elegida se destaca con bg-muted', () => {
    render(<JackKnifeLectura {...props({ sel: 'Knuro' })} />)
    const fila = screen.getByRole('button', { name: 'Knuro', pressed: true }).closest('tr')!
    expect(fila.className).toContain('bg-muted')
  })
})

describe('JackKnifeLectura, detalle de causa (celular)', () => {
  beforeEach(() => {
    esPC.valor = false
    document.documentElement.setAttribute('data-skin', 'apple')
  })
  afterEach(() => {
    cleanup()
    document.documentElement.removeAttribute('data-skin')
  })

  it('con causa elegida, el detalle sale en la hoja', () => {
    render(<JackKnifeLectura {...props({ sel: 'Knuro' })} />)
    const hoja = screen.getByRole('dialog')
    expect(within(hoja).getByRole('heading', { level: 2, name: 'Knuro' })).toBeTruthy()
    expect(within(hoja).getByText(/82 eventos, MTTR 7,0 min/)).toBeTruthy()
  })

  it('«Cerrar» de la hoja llama a onCerrarCausa', () => {
    const onCerrarCausa = vi.fn()
    render(<JackKnifeLectura {...props({ sel: 'Knuro', onCerrarCausa })} />)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' }))
    expect(onCerrarCausa).toHaveBeenCalledTimes(1)
  })

  it('«Ver los 3» cierra la hoja y pide abrir «Ver detalle» con la causa', () => {
    const onVerDetalle = vi.fn()
    render(<JackKnifeLectura {...props({ sel: 'Knuro', onVerDetalle })} />)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ver los 3' }))
    expect(onVerDetalle).toHaveBeenCalledWith('Knuro')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('sin causa elegida no hay hoja', () => {
    render(<JackKnifeLectura {...props()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
