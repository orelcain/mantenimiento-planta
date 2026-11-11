import { describe, expect, it } from 'vitest'
import {
  buscar,
  fichaDeEquipo,
  indexar,
  itemsEquipos,
  itemsFichas,
  itemsPaginas,
  itemsRepuestos,
  normBuscador,
  resaltar,
  tituloLegible,
  turnosDeFecha,
  turnosRecientes,
  type FichaMaquina,
} from '../buscador'

// Datos reales de Firestore (11-11-2026): equipment, repuestosIndice/sap y learningMachines.
const EQUIPOS = [
  { id: '7jW7mmodB7JSKDbD4SLd', nombre: 'EVISCERADORA BAADER 142 N2', codigo: '720004252', hierarchyPath: 'Aquachile Antarfood Chonchi > PLANTA YAL > PROCESO > EVISCERADO > EVISCERADORA BAADER 142 N2' },
  { id: 'tab-n3', nombre: 'TABLERO ELECTRICO BAADER 142 N3', codigo: '720004456' },
  { id: 'tab-n1', nombre: 'TABLERO ELECTRICO BAADER 142 N1', codigo: '720004444' },
  { id: 'cinta-grader', nombre: 'CINTA ACELERACION 1 GRADER', codigo: '720004467' },
  { id: 'chiller', nombre: 'CENTRAL HIDRAULICA CHILLER', codigo: '720009999' },
  { id: 'borrado', nombre: 'BAADER 142 DADO DE BAJA', codigo: '720000001', deleted: true },
]
const FICHAS: FichaMaquina[] = [
  { slug: 'baader-142', name: 'Evisceradora Baader 142 N3', area: 'EVISCERADO' },
  { slug: 'grader', name: 'Grader', area: 'EMPAQUE' },
  { slug: 'baader-200', name: 'Baader 200', area: 'FILETEO', customRoute: '/aprendizaje/maquina/baader-200' },
]
const REPUESTOS = [
  { codigoSAP: '3100010089', nombre: 'EXTRACTOR RODAMIENTO TIPO TRAG SET 1182', nombreComun: '', ubicacion: '' },
  { codigoSAP: '3100010131', nombre: 'EXTRACTOR DE RODAMIENTOS 2 PATAS 4"', nombreComun: '', ubicacion: 'C-6' },
  { codigoSAP: '3100002938', nombre: 'CUCHILLO M/950-P', nombreComun: 'cuchillo filete', ubicacion: '' },
  { codigoSAP: '3100100142', nombre: 'CORREA DENTADA 142', nombreComun: '', ubicacion: '' },
  // Número de parte que empieza con 142: no es «la Baader 142».
  { codigoSAP: '3300105985', nombre: '(NO USAR) CUBO FIJADOR BAADER 1422002017', nombreComun: '', ubicacion: '' },
  // Nombre que cita el código de otro repuesto: compite con el código exacto.
  { codigoSAP: '3100777777', nombre: 'ADAPTADOR PARA 3100002938', nombreComun: '', ubicacion: '' },
]
const MODULOS = [
  { id: 'tarjeta-a3c', title: 'Tarjeta A3C · Baader 142', subtitle: 'Qué LED prende', href: '/aprendizaje/baader-142/tarjeta-a3c' },
  { id: 'hmi-bombeo-s2', title: 'HMI Bombeo Acopio S2', subtitle: 'Ciclo PLC', href: '/aprendizaje/hmi-bombeo-s2', inDevelopment: true },
]
const PAGINAS = [
  { name: 'Repuestos', href: '/repuestos', grupo: 'Operación' },
  { name: 'Bitácora de turno', href: '/bitacora', grupo: 'Operación' },
]

function indice(esAdmin = false) {
  return indexar([
    ...itemsEquipos(EQUIPOS, FICHAS),
    ...itemsRepuestos(REPUESTOS),
    ...itemsFichas(FICHAS, MODULOS, esAdmin),
    ...itemsPaginas(PAGINAS),
  ])
}
const ids = (g: ReturnType<typeof buscar>) => g.flatMap((x) => x.items.map((i) => i.id))

describe('ranking del buscador', () => {
  it('un código SAP exacto queda primero aunque su tipo no sea el primero del orden fijo', () => {
    const g = buscar(indice(), '3100002938')
    expect(g[0]!.tipo).toBe('repuesto')
    expect(g[0]!.items.map((i) => i.id)).toEqual(['repuesto:3100002938', 'repuesto:3100777777'])
  })

  it('un código parcial de 3 o más dígitos ordena por código antes que por nombre', () => {
    // Los dos extractores empiezan con 3100010; el adaptador solo lo cita en el nombre y no entra.
    const g = buscar(indice(), '3100010')
    expect(g).toHaveLength(1)
    expect(g[0]!.items.map((i) => i.codigo)).toEqual(['3100010131', '3100010089'])
  })

  it('el código SAP de un equipo lo encuentra por encima de todo', () => {
    const g = buscar(indice(), '720004252')
    expect(ids(g)[0]).toBe('equipo:7jW7mmodB7JSKDbD4SLd')
  })

  it('«baader 142» trae los tres equipos antes que el repuesto que solo comparte «142»', () => {
    const g = buscar(indice(), 'baader 142')
    expect(g[0]!.tipo).toBe('equipo')
    expect(g[0]!.items.map((i) => i.id)).toEqual(['equipo:7jW7mmodB7JSKDbD4SLd', 'equipo:tab-n1', 'equipo:tab-n3'])
    expect(ids(g)).not.toContain('repuesto:3100100142')
    expect(ids(g)).not.toContain('repuesto:3300105985')
  })

  it('un número corto coincide con la palabra entera: «correa 142» sí, «baader 1422» no la confunde', () => {
    expect(ids(buscar(indice(), 'correa 142'))).toEqual(['repuesto:3100100142'])
    expect(ids(buscar(indice(), 'baader 1422002017'))).toEqual(['repuesto:3300105985'])
  })

  it('no muestra equipos dados de baja', () => {
    expect(ids(buscar(indice(), 'dado de baja'))).toEqual([])
  })

  it('el nombre que empieza con la consulta gana al que solo la contiene', () => {
    const g = buscar(indice(), 'extractor')
    expect(g[0]!.items.map((i) => i.codigo)).toEqual(['3100010131', '3100010089'])
  })

  it('tolera tildes y mayúsculas: «HIDRÁULICA» encuentra «HIDRAULICA»', () => {
    expect(ids(buscar(indice(), 'HIDRÁULICA'))).toContain('equipo:chiller')
  })

  it('el nombre común del repuesto también lo encuentra', () => {
    expect(ids(buscar(indice(), 'cuchillo filete'))[0]).toBe('repuesto:3100002938')
  })

  it('todas las palabras deben estar: «rodamiento chiller» no trae nada', () => {
    expect(buscar(indice(), 'rodamiento chiller')).toEqual([])
  })

  it('los recientes desempatan a su favor', () => {
    const sin = buscar(indice(), 'tablero')
    expect(sin[0]!.items[0]!.id).toBe('equipo:tab-n1')
    const con = buscar(indice(), 'tablero', { recientes: ['equipo:tab-n3'] })
    expect(con[0]!.items[0]!.id).toBe('equipo:tab-n3')
  })

  it('limita por grupo pero informa el total', () => {
    const g = buscar(indice(), 'baader', { porGrupo: 2 })
    const eq = g.find((x) => x.tipo === 'equipo')!
    expect(eq.items).toHaveLength(2)
    expect(eq.total).toBe(3)
  })

  it('los módulos en desarrollo solo aparecen para administradores', () => {
    expect(ids(buscar(indice(false), 'bombeo'))).toEqual([])
    expect(ids(buscar(indice(true), 'bombeo'))).toEqual(['ficha:hmi-bombeo-s2'])
  })

  it('consulta vacía o solo signos no devuelve nada', () => {
    expect(buscar(indice(), '   ')).toEqual([])
    expect(buscar(indice(), '¿?')).toEqual([])
  })
})

describe('expediente de equipo', () => {
  it('ubicación sin la empresa ni el propio equipo, y accesos reales', () => {
    const [e] = itemsEquipos(EQUIPOS.slice(0, 1), FICHAS)
    expect(e!.titulo).toBe('Evisceradora Baader 142 N2')
    expect(e!.detalle).toBe('Planta Yal › Proceso › Eviscerado')
    expect(e!.href).toBe('/equipment?abrir=7jW7mmodB7JSKDbD4SLd&tab=ficha')
    expect(e!.accesos!.map((a) => a.href)).toEqual([
      '/equipment?abrir=7jW7mmodB7JSKDbD4SLd&tab=ficha',
      '/repuestos?q=EVISCERADORA%20BAADER%20142%20N2',
      '/aprendizaje/maquina/baader-142',
    ])
  })

  it('la ficha de aprendizaje se asocia solo si todas las palabras del slug están en el nombre', () => {
    expect(fichaDeEquipo('CINTA ACELERACION 1 GRADER', FICHAS)?.slug).toBe('grader')
    expect(fichaDeEquipo('BAADER 1420 MOTOR', FICHAS)).toBeUndefined()
    expect(fichaDeEquipo('CENTRAL HIDRAULICA CHILLER', FICHAS)).toBeUndefined()
  })
})

describe('turnos de la Bitácora', () => {
  // Miércoles 11-11-2026 a las 17:30: turno tarde en curso.
  const ahora = new Date(2026, 10, 11, 17, 30)

  it('el turno en curso va primero y la noche de 00 a 08 lleva la fecha de hoy', () => {
    const t = turnosRecientes(ahora, 4)
    expect(t.map((x) => x.href)).toEqual([
      '/bitacora?turno=2026-11-11_tarde',
      '/bitacora?turno=2026-11-11_dia',
      '/bitacora?turno=2026-11-11_noche',
      '/bitacora?turno=2026-11-10_tarde',
    ])
    expect(t[0]!.titulo).toBe('Turno tarde, hoy')
    expect(t[0]!.detalle).toContain('en curso')
    expect(t[3]!.titulo).toBe('Turno tarde, ayer')
  })

  it('«ayer noche» encuentra la noche de ayer', () => {
    const ix = indexar(turnosRecientes(ahora))
    expect(ids(buscar(ix, 'ayer noche'))[0]).toBe('turno:2026-11-10_noche')
  })

  it('una fecha «dd-mm» genera sus tres turnos, sin turnos futuros', () => {
    expect(turnosDeFecha('02-11', ahora).map((x) => x.id)).toEqual([
      'turno:2026-11-02_noche',
      'turno:2026-11-02_dia',
      'turno:2026-11-02_tarde',
    ])
    // Hoy a las 17:30 todavía no empieza ningún turno de mañana.
    expect(turnosDeFecha('11/11', ahora).map((x) => x.id)).toEqual([
      'turno:2026-11-11_noche',
      'turno:2026-11-11_dia',
      'turno:2026-11-11_tarde',
    ])
    // Una fecha que quedaría en el futuro se toma del año anterior.
    expect(turnosDeFecha('25-12', ahora)[0]!.id).toBe('turno:2025-12-25_noche')
    expect(turnosDeFecha('32-13', ahora)).toEqual([])
  })
})

describe('repuestos', () => {
  it('limpia códigos SAP que el índice trae entre comillas invertidas', () => {
    const [r] = itemsRepuestos([{ codigoSAP: '`3300138481`', nombre: 'PROTECTOR PANEL BAADER 142 1427001', nombreComun: '', ubicacion: '' }])
    expect(r!.codigo).toBe('3300138481')
    expect(r!.href).toBe('/repuestos?q=3300138481')
  })
})

describe('texto', () => {
  it('normaliza sin tildes ni signos', () => {
    expect(normBuscador('  Válvula  M/950-P ')).toBe('valvula m 950 p')
  })

  it('pasa los nombres SAP en mayúsculas a forma legible, sin tocar códigos', () => {
    expect(tituloLegible('TABLERO ELECTRICO BAADER 142 N3')).toBe('Tablero Electrico Baader 142 N3')
    expect(tituloLegible('EXTRACTOR DE RODAMIENTOS 2 PATAS 4"')).toBe('Extractor de Rodamientos 2 Patas 4"')
    expect(tituloLegible('Rodamiento SKF 6205')).toBe('Rodamiento SKF 6205')
  })

  it('resalta lo que coincide aunque el título tenga tildes', () => {
    const t = resaltar('Central Hidráulica', 'hidraulica')
    expect(t).toEqual([
      { texto: 'Central ', marca: false },
      { texto: 'Hidráulica', marca: true },
    ])
  })
})
