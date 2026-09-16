import { describe, expect, it } from 'vitest'
import {
  AJUSTES_VACIOS,
  agregarTecnico,
  construirListaTecnicos,
  quitarTecnico,
  renombrarTecnico,
  tecnicosPresentes,
  sugeridosPorCalendario,
} from '../listaTecnicos'
import { buscarEquipos, construirOpcionesEquipo, type NodoJerarquia } from '../buscarEquipos'

const PLANILLA = ['Jose Chodil', 'Lucas Adrade', 'Danilo Cortes', 'Matias Serpa']

describe('lista maestra de técnicos', () => {
  it('sin ajustes es la planilla del calendario', () => {
    expect(construirListaTecnicos(PLANILLA, null).map((t) => t.nombre)).toEqual(PLANILLA)
  })

  it('agrega un contratista sin duplicar (tildes y mayúsculas dan igual)', () => {
    let a = agregarTecnico(AJUSTES_VACIOS, '  Juan   Pérez ')
    a = agregarTecnico(a, 'juan perez')
    const lista = construirListaTecnicos(PLANILLA, a)
    expect(lista.map((t) => t.nombre)).toEqual([...PLANILLA, 'Juan Pérez'])
    expect(lista[lista.length - 1]?.origen).toBe('agregado')
    // Agregar el nombre de alguien del calendario no lo repite.
    expect(construirListaTecnicos(PLANILLA, agregarTecnico(a, 'DANILO CORTES'))).toHaveLength(5)
  })

  it('renombra conservando la clave original y deshace si vuelve al nombre de siempre', () => {
    const a = renombrarTecnico(AJUSTES_VACIOS, 'Lucas Adrade', 'Lucas Andrade')
    const lista = construirListaTecnicos(PLANILLA, a)
    expect(lista[1]).toEqual({ clave: 'Lucas Adrade', nombre: 'Lucas Andrade', origen: 'calendario' })
    expect(renombrarTecnico(a, 'Lucas Adrade', 'lucas adrade').renombres).toEqual({})
  })

  it('quitar uno del calendario lo OCULTA; quitar un agregado lo borra', () => {
    let a = agregarTecnico(AJUSTES_VACIOS, 'Juan Pérez')
    const lista = construirListaTecnicos(PLANILLA, a)
    a = quitarTecnico(a, lista[0]!) // Jose Chodil, del calendario
    a = quitarTecnico(a, lista[lista.length - 1]!) // Juan Pérez, agregado
    expect(a.ocultos).toEqual(['Jose Chodil'])
    expect(a.agregados).toEqual([])
    expect(construirListaTecnicos(PLANILLA, a).map((t) => t.nombre)).toEqual(['Lucas Adrade', 'Danilo Cortes', 'Matias Serpa'])
    // Volver a agregar a alguien oculto lo muestra de nuevo.
    expect(construirListaTecnicos(PLANILLA, agregarTecnico(a, 'jose chodil')).some((t) => t.nombre === 'Jose Chodil')).toBe(true)
  })

  it('presentes: SOLO lo marcado a mano; el calendario únicamente sugiere (16-09)', () => {
    const a = quitarTecnico(renombrarTecnico(AJUSTES_VACIOS, 'Lucas Adrade', 'Lucas Andrade'), { clave: 'Matias Serpa', nombre: 'Matias Serpa', origen: 'calendario' })
    const lista = construirListaTecnicos(PLANILLA, a)
    // El calendario no está siempre al día: sin marcar, no hay nadie presente.
    expect(tecnicosPresentes(null, ['Lucas Adrade', 'Matias Serpa'], lista)).toEqual({ nombres: [], ajustado: false })
    // Como sugerencia, traducido por los renombres y sin los quitados.
    expect(sugeridosPorCalendario(['Lucas Adrade', 'Matias Serpa'], lista)).toEqual(['Lucas Andrade'])
    expect(tecnicosPresentes(['Danilo Cortes'], ['Lucas Adrade'], lista)).toEqual({ nombres: ['Danilo Cortes'], ajustado: true })
    // Presentes guardados ANTES de corregir un nombre muestran el corregido; quien salió de la lista se conserva.
    expect(tecnicosPresentes(['Lucas Adrade', 'Matias Serpa', 'Ex Técnico'], [], lista).nombres).toEqual(['Lucas Andrade', 'Matias Serpa', 'Ex Técnico'])
    // Una lista guardada vacía ES un ajuste (nadie presente), no "sin ajustar".
    expect(tecnicosPresentes([], ['Lucas Adrade'], lista)).toEqual({ nombres: [], ajustado: true })
  })
})

describe('buscador de equipos sobre la jerarquía', () => {
  // Forma real de `hierarchy` (15-09-2026): path va de la raíz al padre.
  const nodos: NodoJerarquia[] = [
    { id: 'aq-in-cho', nombre: 'Aquachile Antarfood Chonchi', tipoNodo: 'area', path: [] },
    { id: 'pcho', nombre: 'PLANTA CHONCHI', tipoNodo: 'area', path: ['aq-in-cho'] },
    { id: 'pyal', nombre: 'PLANTA YAL', tipoNodo: 'area', path: ['aq-in-cho'] },
    { id: 'evis', nombre: 'EVISCERADO', tipoNodo: 'area', path: ['aq-in-cho', 'pcho'] },
    { id: 'evis-yal', nombre: 'EVISCERADO', tipoNodo: 'area', path: ['aq-in-cho', 'pyal'] },
    { id: 'b142n2', nombre: 'EVISCERADORA BAADER 142 N2', codigo: '720004100', tipoNodo: 'equipo', path: ['aq-in-cho', 'pcho', 'evis'] },
    { id: 'tab142n1', nombre: 'TABLERO ELECTRICO BAADER 142 N1', codigo: '720004101', tipoNodo: 'equipo', path: ['aq-in-cho', 'pcho', 'evis', 'x'] },
    { id: 'tab142n3', nombre: 'TABLERO ELECTRICO BAADER 142 N3', tipoNodo: 'equipo', path: ['aq-in-cho', 'pyal', 'evis-yal'] },
    { id: 'bomba', nombre: 'BOMBA FLUJO NH3 N2', codigo: '720004607', tipoNodo: 'equipo', path: ['aq-in-cho', 'pcho'] },
    { id: 'inactivo', nombre: 'BAADER 142 VIEJA', tipoNodo: 'equipo', activo: false, path: ['aq-in-cho', 'pcho'] },
  ]
  const opciones = construirOpcionesEquipo(nodos)

  it('no ofrece la empresa ni las plantas, ni nodos inactivos', () => {
    const ids = opciones.map((o) => o.id)
    expect(ids).not.toContain('aq-in-cho')
    expect(ids).not.toContain('pcho')
    expect(ids).not.toContain('inactivo')
  })

  it('cada opción dice planta y área para distinguir Chonchi de Yal', () => {
    const n3 = opciones.find((o) => o.id === 'tab142n3')!
    expect([n3.planta, n3.area]).toEqual(['Planta Yal', 'Eviscerado'])
    const bomba = opciones.find((o) => o.id === 'bomba')!
    expect([bomba.planta, bomba.area]).toEqual(['Planta Chonchi', ''])
  })

  it('busca por palabras en cualquier orden, sin tildes ni mayúsculas, y por código', () => {
    expect(buscarEquipos(opciones, '142 baader').map((o) => o.id).sort()).toEqual(['b142n2', 'tab142n1', 'tab142n3'])
    expect(buscarEquipos(opciones, 'evíscerado').map((o) => o.id)).toContain('evis')
    expect(buscarEquipos(opciones, '4607').map((o) => o.id)).toEqual(['bomba'])
    expect(buscarEquipos(opciones, 'b')).toEqual([]) // desde 2 letras
  })

  it('ordena: empieza con lo escrito > palabra que empieza > lo ya usado', () => {
    expect(buscarEquipos(opciones, 'tablero')[0]?.nombre).toMatch(/^TABLERO/)
    const conUsado = buscarEquipos(opciones, 'baader 142', { usados: ['TABLERO ELECTRICO BAADER 142 N3'] })
    expect(conUsado[0]?.id).toBe('tab142n3')
  })
})
