import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AccionAcr, CausaAcr, EventoRefAcr } from '@/services/acr/acr.types'
import { PlanAccionPC, RielExpediente } from '../AcrExpedientePC'
import { equipoCorto, etiquetaTurno, gruposPlan, partesEquipo, plazoAccion, tituloAcr, totalesPlan } from '../acrExpedienteTextos'

vi.mock('@/hooks/repuestos/useRepuestosByCodigos', () => ({
  useRepuestosByCodigos: () => ({
    bySap: new Map([['3300012407', { id: 'x', codigoSAP: '3300012407', nombre: 'MUELLE', posicionManual: 'Fig. 12 pos. 27', ubicacion: 'C-1' }]]),
    loading: false,
  }),
}))

afterEach(cleanup)

const causa = (id: string, nivel: CausaAcr['nivel'] = 'fisica'): CausaAcr => ({ id, texto: `Causa ${id}`, nivel, m6: null })
const accion = (id: string, causaId: string | null, extra: Partial<AccionAcr> = {}): AccionAcr => ({
  id,
  texto: `Acción ${id}`,
  fuerza: 'media',
  causaId,
  responsable: '',
  fechaLimite: null,
  estado: 'pendiente',
  ...extra,
})

describe('textos del expediente', () => {
  it('el título es la primera frase', () => {
    expect(tituloAcr('Se corta resorte ingreso chapaleta baader 1. Se reemplaza y normaliza')).toBe('Se corta resorte ingreso chapaleta baader 1')
    expect(tituloAcr('Sin punto final')).toBe('Sin punto final')
  })

  it('separa el tipo de máquina y conserva los códigos', () => {
    expect(partesEquipo('EVISCERADORA BAADER 142 N1')).toEqual({ tipo: 'Evisceradora', nombre: 'Baader 142 N1' })
    expect(partesEquipo('BAADER 200')).toEqual({ tipo: null, nombre: 'Baader 200' })
  })

  it('abrevia la máquina para la fila de antecedentes', () => {
    expect(equipoCorto('EVISCERADORA BAADER 142 N2')).toBe('N2')
    expect(equipoCorto('BAADER 200')).toBe('B200')
  })

  it('muestra el turno solo si el id lo dice', () => {
    expect(etiquetaTurno('2026-09-24_dia', '2026-09-24')).toBe('Día, 24-09-2026')
    expect(etiquetaTurno('2026-09-24_noche', '2026-09-24')).toBe('Noche, 24-09-2026')
    expect(etiquetaTurno('demo', '2026-09-24')).toBe('24-09-2026')
  })

  it('agrupa las acciones bajo su causa y deja al final las sin causa válida', () => {
    const grupos = gruposPlan([causa('a'), causa('b')], [accion('1', 'b'), accion('2', null), accion('3', 'borrada')])
    expect(grupos.map((g) => g.acciones.map((x) => x.id))).toEqual([[], ['1'], ['2', '3']])
    expect(grupos[2]?.causa).toBeNull()
  })

  it('una acción hecha muestra cuándo se hizo, no su plazo', () => {
    expect(plazoAccion(accion('1', 'a', { estado: 'hecha', hechaEn: '2026-10-12', fechaLimite: '2026-11-30' })).texto).toBe('Hecha 12-10')
    expect(plazoAccion(accion('1', 'a', { fechaLimite: '2026-11-30' }))).toEqual({ texto: '30-11-2026', apagado: false })
    expect(plazoAccion(accion('1', 'a'))).toEqual({ texto: 'Sin fecha', apagado: true })
  })

  it('los totales cuentan fuertes, hechas y asignadas', () => {
    const t = totalesPlan([causa('a')], [accion('1', 'a', { fuerza: 'fuerte', responsable: 'Planificación' }), accion('2', 'a', { estado: 'hecha' })])
    expect(t).toEqual({ causas: '1 causa', acciones: '2 acciones, 1 fuerte, 1 hecha', asignadas: '1 de 2' })
  })
})

describe('PlanAccionPC', () => {
  const props = { onEditarCausa: vi.fn(), onEditarAccion: vi.fn(), onAgregarAccion: vi.fn() }

  it('una causa sin acción ofrece agregarla y avisa cuál es', () => {
    const onAgregarAccion = vi.fn()
    render(<PlanAccionPC {...props} causas={[causa('a')]} acciones={[]} onAgregarAccion={onAgregarAccion} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sin acción. Agregar' }))
    expect(onAgregarAccion).toHaveBeenCalledWith('a')
  })

  it('tocar una causa o una acción abre su editor, con la marca que usa el tutorial', () => {
    const onEditarCausa = vi.fn()
    const onEditarAccion = vi.fn()
    const { container } = render(
      <PlanAccionPC {...props} causas={[causa('a', 'latente')]} acciones={[accion('1', 'a')]} onEditarCausa={onEditarCausa} onEditarAccion={onEditarAccion} />,
    )
    fireEvent.click(container.querySelector('[data-tutorial="t-lat"]') as Element)
    fireEvent.click(container.querySelector('[data-tutorial="t-accion"]') as Element)
    expect(onEditarCausa).toHaveBeenCalledWith('a')
    expect(onEditarAccion).toHaveBeenCalledWith('1')
  })
})

describe('RielExpediente', () => {
  const evento: EventoRefAcr = {
    id: 'e',
    tipo: 'correctivo',
    turnoId: 't',
    fechaTurno: '2026-09-24',
    equipo: 'EVISCERADORA BAADER 142 N1',
    descripcion: 'Se corta resorte',
    minutosParada: 7,
    fotos: [],
    repuestos: [{ codigoSAP: '3300012407', nombre: 'MUELLE', nombreComun: 'Resorte medidor largo', cantidad: 2 }],
  }
  const base = { evento, equipo: evento.equipo, turno: 'Día', minutos: '7 min', registro: 'Técnico', tutorial: false, preguntaUno: null, pieza: null }

  it('muestra el repuesto con su figura y ubicación del maestro', () => {
    render(<RielExpediente {...base} repeticion={null} />)
    expect(screen.getByText('Resorte medidor largo, 2 UN')).toBeTruthy()
    expect(screen.getByText('SAP 3300012407. Fig. 12 pos. 27. C-1.')).toBeTruthy()
  })

  it('lista los antecedentes con su total; sin eventos cae al resumen', () => {
    const eventos = [
      { id: 'b', equipo: 'BAADER 200', descripcion: 'Corte B', fechaTurno: '2026-09-24', minutosParada: 6 },
      { id: 'a', equipo: 'EVISCERADORA BAADER 142 N3', descripcion: 'Corte A', fechaTurno: '2026-09-20', minutosParada: null },
    ]
    const resumen = 'Resorte cortado · 2 veces · Baader · 6 min'
    const { container, rerender } = render(<RielExpediente {...base} repeticion={{ eventoIds: ['a', 'b'], resumen, minutos: 6, eventos }} />)
    const filas = [...container.querySelectorAll('[data-tutorial="t-alert"] .truncate')].map((n) => n.textContent)
    expect(filas).toEqual(['Corte A', 'Corte B'])
    expect(screen.getByText('6 min')).toBeTruthy()
    rerender(<RielExpediente {...base} repeticion={{ eventoIds: ['a', 'b'], resumen, minutos: 6 }} />)
    expect(screen.getByText(resumen)).toBeTruthy()
  })
})
