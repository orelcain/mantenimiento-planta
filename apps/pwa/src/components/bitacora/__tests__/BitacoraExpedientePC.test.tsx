import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { BitacoraExpedientePC } from '../BitacoraExpedientePC'
import { tecnicosConTrabajos, tituloTurno, totalesTurno } from '../expedienteBitacora'
import { resumirBitacora } from '@/services/bitacora/resumenBitacora'
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'

afterEach(cleanup)

/** Eventos con la forma del turno real del 23-09-2026 (día), reducidos a lo que la tabla usa. */
const evento = (p: Partial<EventoBitacora>): EventoBitacora =>
  ({
    id: 'e1',
    plantId: 'chonchi',
    turnoId: '2026-09-23_dia',
    fechaTurno: '2026-09-23',
    banda: 'dia',
    tipo: 'correctivo',
    equipo: 'BAADER 200',
    equipoCodigo: '720004417',
    equipoId: 'n1',
    titulo: null,
    descripcion: 'Se cambió punta trinquete reutilizada',
    horaInicio: '',
    horaTermino: null,
    impacto: 'no-aplica',
    minutosParada: null,
    ventana: null,
    pendiente: false,
    estado: 'listo',
    fotos: [],
    repuestos: [],
    participantes: [],
    creadoPor: 'u1',
    autorNombre: 'Danilo Cortes',
    registradoPor: 'Danilo Cortes',
    ...p,
  }) as EventoBitacora

const foto = (n: number) => ({ url: `https://ejemplo/f${n}.jpg`, path: `p/f${n}.jpg`, etiqueta: 'foto' as const, ancho: 100, alto: 100 })

const EVENTOS = [
  evento({ id: 'a', equipo: 'RED DE INCENDIO', tipo: 'rutinario', fotos: [foto(1), foto(2), foto(3)] }),
  evento({ id: 'b', equipo: 'SELLADORA CAMPANA', tipo: 'novedad', participantes: ['Mauricio Gallardo'] }),
  evento({
    id: 'c',
    equipo: 'SALIDA FILETE SANITIZADO BINS',
    equipoId: undefined,
    tipo: 'preventivo',
    fotos: [foto(4)],
    repuestos: [{ codigoSAP: '1001', cantidad: 1, nombreComun: 'Bobina magnética' }] as EventoBitacora['repuestos'],
  }),
]

function montar(eventos = EVENTOS, extra: Partial<Parameters<typeof BitacoraExpedientePC>[0]> = {}) {
  const props = {
    turnoNombre: 'Turno día',
    horario: 'mié 23-09 · 08:00 – 16:00',
    fecha: 'miércoles 23-09-2026',
    planta: 'Planta Chonchi',
    esActual: false,
    onAnterior: vi.fn(),
    onSiguiente: vi.fn(),
    onHoy: vi.fn(),
    barra: null,
    resumen: resumirBitacora(eventos),
    mtbf: null,
    fotos: eventos.reduce((n, e) => n + (e.fotos?.length ?? 0), 0),
    eventos,
    hechos: eventos,
    pendientes: [],
    borradores: [],
    numeroDe: new Map(eventos.map((e, i) => [e.id, i + 1])),
    cargando: false,
    presentes: ['Danilo Cortes'],
    onTecnicos: vi.fn(),
    observacion: { texto: '', autor: null },
    onObservacion: vi.fn(),
    onAbrir: vi.fn(),
    onVerFoto: vi.fn(),
    onNuevo: vi.fn(),
    onCompartir: vi.fn(),
    enlaces: [],
    ...extra,
  }
  render(<BitacoraExpedientePC {...props} />)
  return props
}

describe('expediente de la Bitácora en PC', () => {
  it('el título dice qué pasó en el turno, no el nombre del módulo', () => {
    montar()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('3 trabajos y 4 fotos; ninguno anotó detención')
  })

  it('la tabla cierra con su total: trabajos, equipos, repuestos y fotos', () => {
    montar()
    const filas = screen.getAllByRole('row')
    // encabezado + 3 trabajos + total
    expect(filas).toHaveLength(5)
    const total = filas[filas.length - 1]!.textContent ?? ''
    expect(total).toContain('3 trabajos, 3 equipos')
    expect(total).toContain('1 repuesto')
    expect(total).toContain('4 fotos')
  })

  it('una fila abre el evento y una miniatura abre el visor sin abrir el evento', () => {
    const p = montar()
    const fila = screen.getAllByRole('row')[1]!
    fireEvent.click(within(fila).getByText('Red de incendio'))
    expect(p.onAbrir).toHaveBeenCalledWith(EVENTOS[0])
    fireEvent.click(within(fila).getByRole('button', { name: 'Ver foto 2 de 3' }))
    expect(p.onVerFoto).toHaveBeenCalledWith(EVENTOS[0], EVENTOS[0]!.fotos, 1)
    expect(p.onAbrir).toHaveBeenCalledTimes(1)
  })

  it('el evento sin código lo dice y los repuestos se nombran en la fila', () => {
    montar()
    const fila = screen.getAllByRole('row')[3]!
    expect(fila.textContent).toContain('sin código')
    expect(fila.textContent).toContain('Repuestos: Bobina magnética')
  })

  it('sin eventos no hay tabla ni total', () => {
    montar([])
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Sin trabajos registrados en este turno')
  })
})

describe('ayudantes del expediente', () => {
  it('con detención, el título la pone primero', () => {
    const r = resumirBitacora([evento({ impacto: 'con-parada', minutosParada: 5, horaInicio: '10:00', horaTermino: '10:05' })])
    expect(tituloTurno(r, 0)).toBe('1 trabajo; 1 detuvo la máquina 5 min')
  })

  it('cuenta los trabajos de cada técnico y marca a quien no estaba como presente', () => {
    expect(tecnicosConTrabajos(EVENTOS, ['Danilo Cortes'])).toEqual([
      { nombre: 'Danilo Cortes', trabajos: 3, presente: true },
      { nombre: 'Mauricio Gallardo', trabajos: 1, presente: false },
    ])
  })

  it('el total agrupa por tipo y no cuenta dos veces el mismo equipo', () => {
    const t = totalesTurno([...EVENTOS, evento({ id: 'd', equipo: 'red de incendio', tipo: 'rutinario' })])
    expect(t.equipos).toBe(3)
    expect(t.tipos[0]).toEqual(['rutinario', 2])
  })
})
