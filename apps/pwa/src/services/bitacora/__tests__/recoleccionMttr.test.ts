import { describe, expect, it } from 'vitest'
import type { EventoBitacora } from '../bitacora.types'
import { turnoDesdeId } from '../turnoMantencion'
import { bitacoraAHtmlCorreo, bitacoraATextoPlano } from '../bitacoraCorreo'
import {
  fechaRecoleccion,
  filasAXml,
  filasRecoleccion,
  filasRecoleccionPeriodo,
  htmlRecoleccionMttr,
  nombreExcelRecoleccion,
  serieExcel,
  textoRecoleccionMttr,
} from '../recoleccionMttr'

const turno = turnoDesdeId('2026-09-17_dia')!
const ev = (p: Partial<EventoBitacora>): EventoBitacora => ({
  id: 'x',
  plantId: 'chonchi',
  turnoId: '2026-09-17_dia',
  fechaTurno: '2026-09-17',
  banda: 'dia',
  tipo: 'falla',
  equipo: 'DESPLAZADOR AUTOMATICO 1',
  descripcion: 'Se encontró cable de señal que va a parada de emergencia en mal estado, se realiza reconexión de equipo.',
  horaInicio: '10:00',
  horaTermino: '10:05',
  impacto: 'con-parada',
  minutosParada: 5,
  ventana: null,
  pendiente: false,
  fotos: [],
  creadoPor: 'u1',
  autorNombre: 'a',
  ...p,
})

describe('planilla «Recoleccion MTTR» llenada desde la bitácora', () => {
  it('la fecha sale como la escribe Excel en Chile y solo en la primera fila', () => {
    expect(fechaRecoleccion('2026-09-17')).toBe('17-sept-2026 jue')
    expect(fechaRecoleccion('2025-08-26')).toBe('26-ago-2025 mar')
    const filas = filasRecoleccion(turno, [ev({ id: 'a' }), ev({ id: 'b', horaInicio: '11:00', horaTermino: '11:20', minutosParada: 20, equipo: 'TOLVA GENERAL RILES' })])
    expect(filas.map((f) => f.fecha)).toEqual(['17-sept-2026 jue', ''])
    expect(filas.map((f) => f.fechaIso)).toEqual(['2026-09-17', '2026-09-17'])
  })

  it('una fila por evento: máquina, falla (título o primera frase), «35min» o «0», observaciones', () => {
    const [conTitulo, sinTitulo, sinParada, pendiente] = filasRecoleccion(turno, [
      ev({ id: 'a', titulo: 'Cable de parada de emergencia', minutosParada: 35, repuestos: [{ codigoSAP: '3300011612', nombre: 'SOPORTE SECCION 519437', cantidad: 1 }] }),
      ev({ id: 'b', horaInicio: '11:00', horaTermino: '11:20', minutosParada: 20 }),
      ev({ id: 'c', horaInicio: '12:00', horaTermino: '12:10', impacto: 'en-ventana', ventana: 'Colación HG', minutosParada: null, tipo: 'ajuste', equipo: 'GRADER MS4/12', descripcion: 'Se recalibra la celda.' }),
      ev({ id: 'd', horaInicio: '14:00', horaTermino: null, impacto: 'no-aplica', minutosParada: null, pendiente: true, equipo: 'ENZUNCHADORA TP-6000', descripcion: 'Motor con ruido.' }),
    ])
    expect(conTitulo).toMatchObject({ maquina: 'DESPLAZADOR AUTOMATICO 1', falla: 'Cable de parada de emergencia', duracion: '35min', minutos: 35 })
    expect(conTitulo!.observaciones).toContain('Repuestos: 3300011612 Soporte sección 519437 ×1.')
    expect(sinTitulo!.falla).toBe('Se encontró cable de señal que va a parada de emergencia en mal estado')
    // Sin título, «Falla» ya lleva la primera frase: Observaciones sigue con el resto.
    expect(sinTitulo!.observaciones).toBe('Se realiza reconexión de equipo.')
    expect(sinTitulo!.duracion).toBe('20min')
    expect(sinParada).toMatchObject({ duracion: '0', minutos: 0, falla: 'Se recalibra la celda' })
    expect(sinParada!.observaciones).toBe('Sin detener: Colación HG.')
    // El pendiente va al final, como en el correo, y lo dice.
    expect(pendiente).toMatchObject({ falla: 'Motor con ruido', observaciones: 'Queda pendiente para el turno siguiente.' })
    // Si la descripción repite el título, Observaciones no la repite (celular apretado).
    const [igual] = filasRecoleccion(turno, [ev({ titulo: 'Desmonte y montaje cintas filete', descripcion: 'Desmonte y montaje cintas filete.', impacto: 'no-aplica', minutosParada: null })])
    expect(igual).toMatchObject({ falla: 'Desmonte y montaje cintas filete', observaciones: '' })
  })

  it('el HTML tiene el aspecto de la planilla: banda azul, encabezados azules, bandas blanco y celeste', () => {
    const html = htmlRecoleccionMttr(filasRecoleccion(turno, [ev({ id: 'a' }), ev({ id: 'b', horaInicio: '11:00' })]))
    expect(html).toContain('MTBF - MTTR')
    expect(html).toContain('background-color:#00557F;color:#FFFFFF')
    expect(html).toContain('<img src="data:image/png;base64,')
    expect(html).toContain('>Duración Falla (Min)</font></th>')
    // Un solo día: cuatro columnas (la fecha va en la banda, no en una columna que en el
    // teléfono se llevaba un cuarto del ancho para una sola celda con dato).
    expect(html.match(/background-color:#D9E1F2/g)).toHaveLength(4)
    expect(html.match(/background-color:#FFFFFF;color:#000000/g)).toHaveLength(4)
    expect(html).not.toContain('>Fecha</font></th>')
    expect(html).toMatch(/MTBF - MTTR<span[^>]*>&nbsp;&nbsp;·&nbsp;&nbsp;17-sept-2026 jue<\/span>/)
    // Varios días (historial): la columna Fecha vuelve.
    const dosDias = htmlRecoleccionMttr([...filasRecoleccion(turno, [ev({ id: 'a' })]), ...filasRecoleccion({ ...turno, id: '2026-09-18_dia', fecha: '2026-09-18' }, [ev({ id: 'c' })])])
    expect(dosDias).toContain('>Fecha</font></th>')
    expect(dosDias.match(/background-color:#D9E1F2/g)).toHaveLength(5)
    // Escapado: lo que escribe el técnico no se vuelve HTML.
    expect(htmlRecoleccionMttr(filasRecoleccion(turno, [ev({ descripcion: 'Presión <2 bar>' })]))).toContain('Presión &lt;2 bar&gt;')
  })

  it('va arriba del correo del turno y del texto plano; sin eventos no aparece', () => {
    const datos = { turno, eventos: [ev({})], tecnicos: ['Jose Chodil'], planta: 'Planta Chonchi' }
    const html = bitacoraAHtmlCorreo(datos)
    expect(html.indexOf('MTBF - MTTR')).toBeLessThan(html.indexOf('Bitácora de Mantención'))
    expect(bitacoraATextoPlano(datos).startsWith('Fecha\tMáquina\tFalla\tDuración Falla (Min)\tObservaciones\n17-sept-2026 jue\tDESPLAZADOR AUTOMATICO 1\t')).toBe(true)
    expect(bitacoraAHtmlCorreo({ ...datos, eventos: [] })).not.toContain('MTBF - MTTR')
  })

  it('el período: turno por turno del más nuevo al más viejo, la fecha cuando cambia', () => {
    const filas = filasRecoleccionPeriodo([
      ev({ id: 'viejo', turnoId: '2026-09-16_tarde', fechaTurno: '2026-09-16', banda: 'tarde', horaInicio: '17:00' }),
      ev({ id: 'nuevo' }),
      ev({ id: 'nuevo2', horaInicio: '09:00', horaTermino: '09:10' }),
      ev({ id: 'borrador', estado: 'borrador' }),
    ])
    expect(filas.map((f) => f.fecha)).toEqual(['17-sept-2026 jue', '', '16-sept-2026 mié'])
  })

  it('el Excel: filas desde la 4 con los estilos de la plantilla, la fecha como número de serie', () => {
    expect(serieExcel('2026-09-17')).toBe(46282)
    expect(serieExcel('1899-12-31')).toBe(1)
    const xml = filasAXml(filasRecoleccion(turno, [ev({ titulo: 'Cable <suelto> & roto', minutosParada: 35 }), ev({ id: 'b', horaInicio: '11:00' })]))
    expect(xml).toContain('<row r="4"><c r="A4" s="5"><v>46282</v></c><c r="B4" s="6" t="inlineStr"><is><t xml:space="preserve">DESPLAZADOR AUTOMATICO 1</t></is></c>')
    expect(xml).toContain('<t xml:space="preserve">Cable &lt;suelto&gt; &amp; roto</t>')
    expect(xml).toContain('<c r="D4" s="7"><v>35</v></c>')
    // La segunda fila no repite la fecha (celda vacía con el mismo estilo).
    expect(xml).toContain('<row r="5"><c r="A5" s="5"/>')
    expect(textoRecoleccionMttr([]).split('\n')).toHaveLength(1)
    expect(nombreExcelRecoleccion(turno)).toBe('Recoleccion MTTR Turno dia 17-09-2026.xlsx')
  })
})
