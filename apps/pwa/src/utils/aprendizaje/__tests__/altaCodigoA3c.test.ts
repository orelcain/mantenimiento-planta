import { describe, expect, it } from 'vitest'
import type { ParteFisica, PartesPlano } from '@/hooks/usePartesPlano'
import partes888 from '../../../../public/planos/baader-142-888/partes.json'
import {
  armarAltaCodigo, avisoDeAlta, avisosAlta, codigoParaAlta, compactarElementos, descripcionAlta, elementosConCodigo,
  fechaCortaAlta, idAltaDeCodigo, lineaCatalogoAlta, listaEnFrase, resumenElementos, sapEfectivo,
} from '../altaCodigoA3c'

const pieza = (extra: Partial<ParteFisica> = {}): ParteFisica => ({
  nr: '42203183', es: 'Relé en miniatura', de: 'Miniaturrelais 24V DC', fig: '120 (2014)', hoja: null, pos: '321',
  confianza: 'catalogo', nivel: 'pieza', fuentes: ['499 catálogo EK 2014 · fig. 120 · pos. 321'], ...extra,
})
const aparatos = (): PartesPlano['aparatos'] => ({
  K20: [pieza()],
  K22: [pieza()],
  K23: [pieza({ nr: '42203310', sap: '3300080929' })],
  Y2: [pieza({ nr: '34974309' })],
  Y10: [pieza({ nr: '34974309' })],
  Y1: [pieza({ nr: '34974309' })],
})

describe('elementos que usan un código (calculados del plano, no a mano)', () => {
  it('K20 y K22 usan 42203183; K23 lleva otro relé', () => {
    expect(elementosConCodigo(aparatos(), '42203183')).toEqual(['K20', 'K22'])
  })
  it('ordena como se lee en el plano: Y2 antes que Y10', () => {
    expect(elementosConCodigo(aparatos(), '34974309')).toEqual(['Y1', 'Y2', 'Y10'])
  })
  it('compara el código normalizado ("4220 3183" es 42203183) y sin plano devuelve vacío', () => {
    expect(elementosConCodigo(aparatos(), '4220 3183')).toEqual(['K20', 'K22'])
    expect(elementosConCodigo(null, '42203183')).toEqual([])
    expect(elementosConCodigo(aparatos(), '')).toEqual([])
  })
  it('datos reales del plano 888: 42203183 en K20 y K22 (K23 y K25 llevan el módulo 42203310) e Y1–Y12 la isla', () => {
    const ap = (partes888 as unknown as PartesPlano).aparatos
    expect(elementosConCodigo(ap, '42203183')).toEqual(['K20', 'K22'])
    expect(elementosConCodigo(ap, '34974309')).toHaveLength(12)
    expect(compactarElementos(elementosConCodigo(ap, '34974309'))).toBe('Y1–Y12')
    expect(ap.K23?.[0]?.nr).toBe('42203310')
  })
})

describe('compactarElementos / resumenElementos', () => {
  it('rangos desde 3 consecutivos de la misma letra; el resto uno por uno', () => {
    expect(compactarElementos(['K22', 'K20'])).toBe('K20, K22')
    expect(compactarElementos(['Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7', 'Y8', 'Y9', 'Y10', 'Y11', 'Y12'])).toBe('Y1–Y12')
    expect(compactarElementos(['Y13', 'Y14', 'Y53', 'Y54', 'Y55'])).toBe('Y13, Y14, Y53–Y55')
    expect(compactarElementos(['S12', 'S13', 'S14', 'S15', 'S16', 'S17'])).toBe('S12–S17')
    expect(compactarElementos(['A3C'])).toBe('A3C')
    expect(compactarElementos(['K1', 'Y2', 'Y3', 'Y4'])).toBe('K1, Y2–Y4')
  })
  it('el resumen suma cuántos elementos son', () => {
    expect(resumenElementos(['K20', 'K22'])).toBe('K20, K22 · 2 elementos')
    expect(resumenElementos(['A4'])).toBe('A4 · 1 elemento')
  })
  it('listaEnFrase: "K20 y K22" para dos, compacto para más', () => {
    expect(listaEnFrase(['K22', 'K20'])).toBe('K20 y K22')
    expect(listaEnFrase(['Y1', 'Y2', 'Y3'])).toBe('Y1–Y3')
  })
})

describe('id del alta: un código, una alta', () => {
  it('alta_<código normalizado>: mayúsculas y sin separadores', () => {
    expect(idAltaDeCodigo('42203183')).toBe('alta_42203183')
    expect(idAltaDeCodigo('999 0608')).toBe('alta_9990608')
    expect(idAltaDeCodigo('ab-12')).toBe('alta_AB12')
  })
})

describe('descripcionAlta', () => {
  it('suma la tensión de la descripción alemana', () => {
    expect(descripcionAlta('Relé en miniatura', 'Miniaturrelais 24V DC')).toBe('Relé en miniatura 24V DC')
    expect(descripcionAlta('Contactor', 'Schütz 230 V AC')).toBe('Contactor 230 V AC')
  })
  it('sin tensión (o ya dicha) no agrega ni inventa nada', () => {
    expect(descripcionAlta('Diodo luminoso', 'Leuchtdiode 3mm, rot')).toBe('Diodo luminoso')
    expect(descripcionAlta('Relé 24V', 'Relais 24V')).toBe('Relé 24V')
    expect(descripcionAlta('Resistencia', '')).toBe('Resistencia')
    expect(descripcionAlta('Resistencia')).toBe('Resistencia')
  })
})

describe('avisos del formulario', () => {
  it('catálogo: ninguno', () => {
    expect(avisosAlta(pieza())).toEqual({ conjunto: false, propuesto: false, generacion: null })
  })
  it('conjunto y propuesto', () => {
    expect(avisosAlta(pieza({ nivel: 'conjunto', confianza: 'propuesto' }))).toMatchObject({ conjunto: true, propuesto: true })
  })
  it('código del catálogo 2006 (N1): aviso de generación', () => {
    const a = avisosAlta(pieza({ confianza: 'propuesto', generacion: 'N1 (catálogo 2006)' }))
    expect(a.generacion).toBe('Código del catálogo 2006 (N1): revisa que sirva para N2 y N3.')
  })
  it('un código leído en la etiqueta ya no es «propuesto»', () => {
    expect(avisosAlta(pieza({ confianza: 'propuesto' }), true).propuesto).toBe(false)
  })
})

describe('armarAltaCodigo', () => {
  const base = { pieza: pieza(), codigo: '42203183', elemento: 'K20', maquina: 'baader-n2' as const, aparatos: aparatos(), planoSlug: 'baader-142-888' }

  it('arma el documento con todos los elementos del plano, la máquina corta y sin undefined', () => {
    const { id, data } = armarAltaCodigo(base)
    expect(id).toBe('alta_42203183')
    expect(data).toMatchObject({
      tipo: 'alta_codigo', codigoFabricante: '42203183', codigoNorm: '42203183', textoBreve: 'Relé en miniatura 24V DC', descripcionDe: 'Miniaturrelais 24V DC',
      fig: '120 (2014)', pos: '321', nivel: 'pieza', confianza: 'catalogo', planoSlug: 'baader-142-888', maquina: 'N2',
      elemento: 'K20', elementos: ['K20', 'K22'],
    })
    expect(data.fuentes).toEqual(['499 catálogo EK 2014 · fig. 120 · pos. 321'])
    expect(Object.values(data).some(v => v === undefined)).toBe(false)
    expect('observaciones' in data).toBe(false)
    expect('fotoUrl' in data).toBe(false)
  })
  it('codigoNorm es el normCodigo del código y el id es alta_<codigoNorm> (lo que exige la regla)', () => {
    const { id, data } = armarAltaCodigo({ ...base, codigo: ' 4220-3183 ' })
    expect(data.codigoFabricante).toBe('4220-3183')
    expect(data.codigoNorm).toBe('42203183')
    expect(id).toBe(`alta_${data.codigoNorm}`)
    expect(data.codigoNorm).toMatch(/^[A-Z0-9]{1,30}$/)
  })
  it('incluye siempre el elemento de origen aunque el plano no lo liste (código leído de otro elemento)', () => {
    expect(armarAltaCodigo({ ...base, codigo: '99990000', elemento: 'K30' }).data.elementos).toEqual(['K30'])
  })
  it('sin máquina elegida no inventa una; nota y foto solo si vienen', () => {
    const { data } = armarAltaCodigo({ ...base, maquina: null, observaciones: '  De respaldo ', fotoUrl: 'https://f' })
    expect('maquina' in data).toBe(false)
    expect(data.observaciones).toBe('De respaldo')
    expect(data.fotoUrl).toBe('https://f')
  })
  it('un conjunto queda como conjunto; «componente» (A7) cuenta como pieza', () => {
    expect(armarAltaCodigo({ ...base, pieza: pieza({ nivel: 'conjunto' }) }).data.nivel).toBe('conjunto')
    expect(armarAltaCodigo({ ...base, pieza: pieza({ nivel: 'componente' as never }) }).data.nivel).toBe('pieza')
  })
  it('código leído en terreno: no hereda figura, posición, fuentes ni tensión del catálogo', () => {
    const { id, data } = armarAltaCodigo({ ...base, codigo: '42203199' })
    expect(id).toBe('alta_42203199')
    expect(data).toMatchObject({ codigoFabricante: '42203199', codigoNorm: '42203199', confianza: 'terreno', textoBreve: 'Relé en miniatura', fuentes: [] })
    expect('fig' in data).toBe(false)
    expect('pos' in data).toBe(false)
    expect('descripcionDe' in data).toBe(false)
  })
})

describe('codigoParaAlta', () => {
  it('el de la etiqueta si el terreno lo corrigió; si no, el del catálogo', () => {
    expect(codigoParaAlta({ nr: '42203183' }, { estado: 'corregido', codigo: ' 42203199 ' })).toBe('42203199')
    expect(codigoParaAlta({ nr: '42203183' }, { estado: 'confirmado', codigo: '42203183' })).toBe('42203183')
    expect(codigoParaAlta({ nr: '42203183' }, { estado: 'corregido' })).toBe('42203183')
    expect(codigoParaAlta({ nr: '42203183' })).toBe('42203183')
  })
})

describe('sapEfectivo: el del plano o el del alta ya creada', () => {
  it('el del plano manda', () => {
    expect(sapEfectivo('3300080929', { estado: 'creada', sapCreado: '3300112345' })).toBe('3300080929')
  })
  it('sin SAP del plano, el del alta creada', () => {
    expect(sapEfectivo(undefined, { estado: 'creada', sapCreado: '3300112345' })).toBe('3300112345')
  })
  it('pendiente, rechazada o sin alta: no hay SAP', () => {
    expect(sapEfectivo(undefined, { estado: 'pendiente' })).toBeUndefined()
    expect(sapEfectivo(undefined, { estado: 'rechazada', sapCreado: '3300112345' })).toBeUndefined()
    expect(sapEfectivo(undefined, undefined)).toBeUndefined()
    expect(sapEfectivo(undefined, { estado: 'creada' })).toBeUndefined()
  })
})

describe('texto de la tarjeta de bodega', () => {
  it('lineaCatalogoAlta: dónde, catálogo y también', () => {
    expect(lineaCatalogoAlta({ elemento: 'K20', maquina: 'N2', fig: '120 (2014)', pos: '321', elementos: ['K20', 'K22'] }))
      .toBe('K20 en N2 · catálogo 2014 fig. 120 pos. 321 · también K22')
    expect(lineaCatalogoAlta({ elemento: 'Y13', maquina: 'N2', elementos: ['Y13', 'Y14', 'Y53', 'Y54', 'Y55'] }))
      .toBe('Y13 en N2 · sin figura en el catálogo · también Y14, Y53–Y55')
    expect(lineaCatalogoAlta({ elemento: 'S3', fig: '151-3', pos: '2', elementos: ['S3'] })).toBe('S3 · catálogo 2006 fig. 151-3 pos. 2')
  })
  it('avisoDeAlta: conjunto y/o propuesto; nada si es del catálogo o leído en terreno', () => {
    expect(avisoDeAlta({ nivel: 'conjunto', confianza: 'propuesto' })).toBe('Conjunto completo · código propuesto, sin confirmar en terreno')
    expect(avisoDeAlta({ nivel: 'pieza', confianza: 'propuesto' })).toBe('Código propuesto, sin confirmar en terreno')
    expect(avisoDeAlta({ nivel: 'conjunto', confianza: 'catalogo' })).toBe('Conjunto completo')
    expect(avisoDeAlta({ nivel: 'pieza', confianza: 'catalogo' })).toBeNull()
    expect(avisoDeAlta({ nivel: 'pieza', confianza: 'terreno' })).toBeNull()
  })
  it('fechaCortaAlta: dd-MM', () => {
    expect(fechaCortaAlta(new Date(2026, 9, 8))).toBe('08-10')
    expect(fechaCortaAlta(undefined)).toBe('')
  })
})
