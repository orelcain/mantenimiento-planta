import { describe, expect, it } from 'vitest'
import type { EventoBitacora } from '../bitacora.types'
import { turnoDesdeId } from '../turnoMantencion'
import { gruposDelTurno, ordenarEventos } from '../resumenBitacora'
import { lineaRepuestos, minutosEnTurno, nombreConComun, normalizarRepuestos, posicionAlMover, posicionEnIndice, textoRepuesto } from '../presentacionEvento'
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

describe('lo hecho y lo pendiente: un solo orden para todos', () => {
  it('numera igual en la pantalla, WhatsApp, el correo y el PDF; el borrador no cuenta', () => {
    const uno = ev({ id: 'uno', horaInicio: '17:00', horaTermino: '17:20' })
    // Un pendiente A MEDIO TURNO: en la lista iría entre los demás, pero se
    // entrega al final, así que numera después de todo lo hecho.
    const pend = ev({ id: 'pend', horaInicio: '18:00', horaTermino: null, pendiente: true })
    const dos = ev({ id: 'dos', horaInicio: '19:00', horaTermino: '19:30' })
    // Uno que otro turno cerró después: también estuvo pendiente.
    const cerrado = ev({ id: 'cerrado', horaInicio: '17:30', horaTermino: null, cierre: { turnoId: '2026-09-17_dia', tipo: 'resuelto', porNombre: 'Leandro Igor' } })
    const borrador = ev({ id: 'borrador', horaInicio: '17:10', horaTermino: null, estado: 'borrador' })
    const { hechos, pendientes } = gruposDelTurno(turno, [dos, borrador, pend, cerrado, uno])
    expect(hechos.map((e) => e.id)).toEqual(['uno', 'dos'])
    expect(pendientes.map((e) => e.id)).toEqual(['cerrado', 'pend'])
    const numeros = [...hechos, ...pendientes].map((e, i) => `${i + 1}. ${e.id}`)
    expect(numeros).toEqual(['1. uno', '2. dos', '3. cerrado', '4. pend'])
  })
})

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
