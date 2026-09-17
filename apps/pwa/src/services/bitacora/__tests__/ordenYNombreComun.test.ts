import { describe, expect, it } from 'vitest'
import type { EventoBitacora } from '../bitacora.types'
import { turnoDesdeId } from '../turnoMantencion'
import { ordenarEventos } from '../resumenBitacora'
import { lineaRepuestos, minutosEnTurno, nombreConComun, normalizarRepuestos, opcionesUbicacion, posicionAlMover, posicionEnIndice, textoRepuesto } from '../presentacionEvento'
import { buscarRepuestos, conNombreComunAlFrente, desdeIndice } from '../repuestosBitacora'
import { aFormulario, camposACambiar } from '../borradores'

const turno = turnoDesdeId('2026-09-16_tarde')!
const ev = (p: Partial<EventoBitacora>): EventoBitacora => ({
  id: 'x',
  plantId: 'chonchi',
  turnoId: '2026-09-16_tarde',
  fechaTurno: '2026-09-16',
  banda: 'tarde',
  tipo: 'falla',
  equipo: 'CASINO',
  descripcion: 'x',
  horaInicio: '18:07',
  horaTermino: '18:30',
  impacto: 'no-aplica',
  minutosParada: null,
  ventana: null,
  pendiente: false,
  fotos: [],
  creadoPor: 'u1',
  autorNombre: 'a',
  ...p,
})
const registrado = (h: number) => ({ toMillis: () => turno.inicio.getTime() + h * 3_600_000 }) as never

describe('eventos sin hora: ubicación a mano', () => {
  const casino = ev({ id: 'casino', horaInicio: '18:07', horaTermino: '18:30' })
  const epack = ev({ id: 'epack', equipo: 'EMPACADORA E-PACK', horaInicio: '20:00', horaTermino: '20:20' })
  const cintas = ev({ id: 'cintas', equipo: 'CINTAS FILETE', horaInicio: '', horaTermino: null, createdAt: registrado(5) })

  it('sin posición queda donde se registró; con posición, donde lo dejaron', () => {
    expect(ordenarEventos(turno, [cintas, epack, casino]).map((e) => e.id)).toEqual(['casino', 'epack', 'cintas'])
    expect(ordenarEventos(turno, [{ ...cintas, posicionMin: -1 }, epack, casino]).map((e) => e.id)).toEqual(['cintas', 'casino', 'epack'])
    expect(minutosEnTurno(turno, { horaInicio: '', posicionMin: 130.5 })).toBe(130.5)
    // Con hora, la posición se ignora.
    expect(minutosEnTurno(turno, { horaInicio: '18:07', posicionMin: -1 })).toBe(127)
  })

  it('▲ lo pasa antes del vecino y ▼ después, hasta los extremos', () => {
    const orden = ordenarEventos(turno, [casino, epack, cintas]) // casino 127, epack 240, cintas 300
    const arriba = posicionAlMover(turno, orden, 'cintas', -1)
    expect(arriba).toBe((127 + 240) / 2)
    const orden2 = ordenarEventos(turno, [casino, epack, { ...cintas, posicionMin: arriba }])
    expect(orden2.map((e) => e.id)).toEqual(['casino', 'cintas', 'epack'])
    const arriba2 = posicionAlMover(turno, orden2, 'cintas', -1)
    expect(arriba2).toBe(126) // antes del primero: uno menos
    expect(posicionAlMover(turno, ordenarEventos(turno, [casino, epack, { ...cintas, posicionMin: arriba2 }]), 'cintas', -1)).toBeNull()
    expect(posicionAlMover(turno, orden, 'cintas', 1)).toBeNull()
    expect(posicionAlMover(turno, orden, 'nadie', 1)).toBeNull()
  })

  it('arrastrado: queda entre los vecinos del lugar donde se suelta; en su lugar, no cambia', () => {
    const orden = ordenarEventos(turno, [casino, epack, cintas]) // casino 127, epack 240, cintas 300
    expect(posicionEnIndice(turno, orden, 'cintas', 0)).toBe(126)
    expect(posicionEnIndice(turno, orden, 'cintas', 1)).toBe((127 + 240) / 2)
    expect(posicionEnIndice(turno, orden, 'cintas', 2)).toBeNull()
    expect(posicionEnIndice(turno, orden, 'cintas', 99)).toBeNull()
    const arriba = ordenarEventos(turno, [casino, epack, { ...cintas, posicionMin: 126 }])
    expect(posicionEnIndice(turno, arriba, 'cintas', 2)).toBe(241)
    expect(posicionEnIndice(turno, [cintas], 'cintas', 0)).toBeNull()
    expect(posicionEnIndice(turno, orden, 'nadie', 0)).toBeNull()
  })

  it('el editor ofrece inicio, después de cada evento con hora y final; sin eventos con hora, nada', () => {
    const op = opcionesUbicacion(turno, [casino, epack, cintas], 'cintas')
    expect(op.map((o) => o.etiqueta)).toEqual(['Al inicio', 'Después de 18:07 CASINO', 'Al final'])
    expect(op.map((o) => o.posicion)).toEqual([126, (127 + 240) / 2, 241])
    expect(opcionesUbicacion(turno, [cintas], 'cintas')).toEqual([])
  })

  it('el formulario guarda la posición solo sin hora y la escribe aparte', () => {
    const f = aFormulario({ ...cintas, posicionMin: 126 })
    expect(f.posicion).toBe('126')
    expect(aFormulario({ ...casino, posicionMin: 126 }).posicion).toBe('')
    expect(camposACambiar(f, { ...f, posicion: '241' }, [], [])).toEqual(['posicionMin'])
  })
})

describe('nombre común en los repuestos', () => {
  it('sale primero y el nombre SAP entre paréntesis; el común también se busca', () => {
    const r = { codigoSAP: '3300135877', nombre: 'FILTRO 1/2  PURGA N.A AFF40-04D-D 295734', nombreComun: 'Filtro FRL', cantidad: 2 }
    expect(nombreConComun(r)).toMatch(/^Filtro FRL \(Filtro 1\/2/)
    expect(textoRepuesto(r)).toMatch(/^3300135877 Filtro FRL \(Filtro 1\/2 .* ×2$/)
    expect(nombreConComun({ nombre: '', nombreComun: 'Muelle carros' })).toBe('Muelle carros')
    expect(lineaRepuestos({ repuestos: [r] })).toContain('Filtro FRL (')
    expect(normalizarRepuestos([{ codigoSAP: '3300135877', nombre: 'x', nombreComun: '  ', cantidad: 1 }])[0]).not.toHaveProperty('nombreComun')
    const lista = [
      { codigoSAP: '3300011872', nombre: 'CORREA 37750006', nombreComun: 'Correa cuchilla circular', ubicacion: '' },
      { codigoSAP: '3300011619', nombre: 'CUCHILLO 94011760', nombreComun: 'cuchillo circular baader 200', ubicacion: '' },
    ]
    expect(buscarRepuestos(lista, 'cuchilla').map((x) => x.codigoSAP)).toEqual(['3300011872'])
    // Empieza por el nombre común: va primero.
    expect(buscarRepuestos(lista, 'cuchillo').map((x) => x.codigoSAP)).toEqual(['3300011619'])
  })

  it('el índice se lee a lista y el nombre nuevo va al frente sin repetirse', () => {
    const lista = desdeIndice({ '3300135877': ['FILTRO 1/2 PURGA', 'Filtro FRL'], 'x/y': ['no', ''], '4600001': ['Filtro de agua'] })
    expect(lista.map((r) => [r.codigoSAP, r.nombreComun])).toEqual([
      ['3300135877', 'Filtro FRL'],
      ['4600001', ''],
    ])
    expect(conNombreComunAlFrente(['muelle carros', 'resorte'], 'Muelle carros')).toEqual(['Muelle carros', 'resorte'])
    expect(conNombreComunAlFrente(['a'], '   ')).toEqual(['a'])
    expect(conNombreComunAlFrente(undefined, ' Filtro  FRL ')).toEqual(['Filtro FRL'])
  })
})
