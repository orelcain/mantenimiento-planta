import { describe, it, expect } from 'vitest'
import { documentacionDe, fotosParaEquipos, fusionarDocumentacion, SIN_DOCUMENTACION } from '../documentacionDeRepuesto'
import type { Repuesto, TechnicalSpecs, ImagenRepuesto, MachineImage } from '@/types/repuestos'

const rep = (p: Partial<Repuesto>): Repuesto => ({ id: 'r1', codigoSAP: '3300138386', textoBreve: 'X', ...p } as Repuesto)
const foto = (url: string): ImagenRepuesto =>
  ({ id: url, url, descripcion: '', orden: 0, esPrincipal: false, tipo: 'real', createdAt: new Date() })
const deGaleria = (url: string): MachineImage => ({ id: url, url, type: 'part', timestamp: 0 })

const fichaReal: TechnicalSpecs = {
  type: 'cilindro',
  standardValues: { fabricante: 'Festo', diametroPiston: '32 mm' },
  customFields: [],
  updatedAt: 0,
}
const fichaVacia: TechnicalSpecs = { type: 'general', standardValues: {}, customFields: [], updatedAt: 0 }

describe('el badge dice lo que el botón abre', () => {
  it('sin nada, los tres quedan en cero', () => {
    expect(documentacionDe(rep({}))).toEqual(SIN_DOCUMENTACION)
  })

  it('una ficha con datos cuenta como ficha', () => {
    expect(documentacionDe(rep({ technicalSpecs: fichaReal })).tieneFicha).toBe(true)
  })

  it('una ficha VACÍA no cuenta: el modal la guarda con solo abrirlo y guardar', () => {
    // Si contara, el badge prometería contenido que no existe — justo lo que evita este módulo.
    expect(documentacionDe(rep({ technicalSpecs: fichaVacia })).tieneFicha).toBe(false)
  })

  it('las notas solas ya son contenido', () => {
    const soloNotas = { ...fichaVacia, notes: 'Ver plano B14' }
    expect(documentacionDe(rep({ technicalSpecs: soloNotas })).tieneFicha).toBe(true)
  })

  it('un campo propio solo ya es contenido', () => {
    const soloCustom = { ...fichaVacia, customFields: [{ id: 'c1', label: 'Norma', value: 'ISO 6432', isCustom: true }] }
    expect(documentacionDe(rep({ technicalSpecs: soloCustom })).tieneFicha).toBe(true)
  })

  it('un standardValue en blanco no cuenta (el formulario los crea vacíos)', () => {
    const enBlanco = { ...fichaVacia, standardValues: { fabricante: '', modelo: '' } }
    expect(documentacionDe(rep({ technicalSpecs: enBlanco })).tieneFicha).toBe(false)
  })

  it('las fotos van de foto real a captura de manual a galería, sin perder ninguna', () => {
    const d = documentacionDe(rep({ fotosReales: [foto('a')], imagenesManual: [foto('b')], gallery: [deGaleria('c')] }))
    expect(d.fotos).toEqual(['a', 'b', 'c'])
  })

  it('cuenta los manuales vinculados', () => {
    expect(documentacionDe(rep({ vinculosManual: [{ id: 'm1', url: 'u', titulo: 't' }] as never })).manuales).toBe(1)
  })
})

describe('fusionarDocumentacion — dos documentos del mismo SAP', () => {
  it('la ficha del SEGUNDO documento no se pierde por el orden de llegada', () => {
    // El caso real: `3300138387` tiene dos documentos en el maestro.
    const primero = documentacionDe(rep({ fotosReales: [foto('a')] }))
    const segundo = documentacionDe(rep({ technicalSpecs: fichaReal }))
    expect(primero.tieneFicha).toBe(false)
    expect(fusionarDocumentacion(primero, segundo).tieneFicha).toBe(true)
  })

  it('conserva las fotos del primero si las tiene', () => {
    const primero = documentacionDe(rep({ fotosReales: [foto('a')] }))
    const segundo = documentacionDe(rep({ fotosReales: [foto('z')] }))
    expect(fusionarDocumentacion(primero, segundo).fotos).toEqual(['a'])
  })

  it('toma las fotos del segundo si el primero no trae', () => {
    const primero = documentacionDe(rep({}))
    const segundo = documentacionDe(rep({ fotosReales: [foto('z')] }))
    expect(fusionarDocumentacion(primero, segundo).fotos).toEqual(['z'])
  })

  it('se queda con el mayor número de manuales', () => {
    const a = { fotos: [], tieneFicha: false, manuales: 1 }
    const b = { fotos: [], tieneFicha: false, manuales: 3 }
    expect(fusionarDocumentacion(a, b).manuales).toBe(3)
    expect(fusionarDocumentacion(b, a).manuales).toBe(3)
  })

  it('fusionar dos vacíos sigue siendo vacío', () => {
    expect(fusionarDocumentacion(SIN_DOCUMENTACION, SIN_DOCUMENTACION)).toEqual(SIN_DOCUMENTACION)
  })
})

describe('fotos según la máquina en foco', () => {
  // Tornillo Baader usado en la 142 (equipos n1, n2) y en la 200 (b200): un dibujo de cada manual.
  const de142 = { ...foto('u142'), tipo: 'manual' as const, equipos: ['n1', 'n2'] }
  const de200 = { ...foto('u200'), tipo: 'manual' as const, equipos: ['b200'] }
  const doc = documentacionDe(rep({ imagenesManual: [de142, de200], fotosReales: [foto('real')] }))

  it('documentacionDe anota a qué equipos corresponde cada captura', () => {
    expect(doc.equiposDeFoto).toEqual({ u142: ['n1', 'n2'], u200: ['b200'] })
  })
  it('mirando la 142 se ve su dibujo (y la foto real), no el de la 200', () => {
    expect(fotosParaEquipos(doc.fotos, doc.equiposDeFoto, ['n2'])).toEqual(['real', 'u142'])
    expect(fotosParaEquipos(doc.fotos, doc.equiposDeFoto, ['b200'])).toEqual(['real', 'u200'])
  })
  it('sin equipo en foco (búsqueda general) se ven todas', () => {
    expect(fotosParaEquipos(doc.fotos, doc.equiposDeFoto, null)).toEqual(['real', 'u142', 'u200'])
  })
  it('si el filtro dejaría la fila sin fotos, se muestran todas', () => {
    expect(fotosParaEquipos(['u200'], { u200: ['b200'] }, ['otro'])).toEqual(['u200'])
  })
  it('capturas antiguas sin equipos se ven siempre', () => {
    expect(fotosParaEquipos(['vieja', 'u200'], { u200: ['b200'] }, ['n1'])).toEqual(['vieja'])
  })
  it('fusionar conserva el mapa de los dos documentos', () => {
    const f = fusionarDocumentacion({ fotos: ['a'], tieneFicha: false, manuales: 0, equiposDeFoto: { a: ['x'] } }, { fotos: ['b'], tieneFicha: false, manuales: 0, equiposDeFoto: { b: ['y'] } })
    expect(f.equiposDeFoto).toEqual({ a: ['x'], b: ['y'] })
  })
})
