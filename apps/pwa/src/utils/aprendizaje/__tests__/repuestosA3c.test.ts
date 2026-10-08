import { describe, expect, it } from 'vitest'
import type { ParteFisica } from '@/hooks/usePartesPlano'
import { certezaDe, clasificarRepuesto, coberturaRepuestos, esModoCandidatos, esPiezaFisica, letraFamilia, origenPieza } from '../repuestosA3c'

const pieza = (extra: Partial<ParteFisica> = {}): ParteFisica => ({
  nr: '42303109', es: 'Sensor', de: 'Sensor', fig: '70-8', hoja: 89, pos: 'B1', confianza: 'catalogo', ...extra,
})
const partes = {
  aparatos: { B1: [pieza({ sap: '3300012350' })], B10: [pieza({ nr: '42303077' })], B2: [pieza({ sap: '1' }), pieza()] },
  familias: { SM: { etiqueta: 'motor paso a paso', figuras: [{ fig: '70-1', hoja: 80, titulo: 'x', n: 1 }] }, Y: { etiqueta: 'y', figuras: [] } },
}

describe('clasificarRepuesto', () => {
  it('A: pieza exacta con SAP', () => expect(clasificarRepuesto('B1', partes).estado).toBe('A'))
  it('B: pieza exacta sin SAP', () => expect(clasificarRepuesto('B10', partes).estado).toBe('B'))
  it('B: si alguna de varias piezas no tiene SAP', () => {
    const c = clasificarRepuesto('B2', partes)
    expect(c.estado).toBe('B')
    expect(c.piezas).toHaveLength(2)
  })
  it('C: solo familia por la letra IEC (SM6-1 → SM)', () => {
    const c = clasificarRepuesto('SM6-1', partes)
    expect(c.estado).toBe('C')
    expect(c.familia?.etiqueta).toBe('motor paso a paso')
  })
  it('D: nada, o familia sin figuras, o sin partes', () => {
    expect(clasificarRepuesto('Y3', partes).estado).toBe('D')
    expect(clasificarRepuesto('Z9', partes).estado).toBe('D')
    expect(clasificarRepuesto('B1', null).estado).toBe('D')
  })
  it('la letra de familia', () => {
    expect(letraFamilia('SM6-1')).toBe('SM')
    expect(letraFamilia('A3C.P1')).toBe('A')
    expect(letraFamilia('1x')).toBeNull()
  })
})

describe('esPiezaFisica', () => {
  it('excluye A3C.*, regletas X* y TP*', () => {
    for (const c of ['A3C', 'A3C.X5', 'A3C.P1', 'X1', 'X20', 'TP', 'TP_5VV', 'TP_GNDDC']) expect(esPiezaFisica(c), c).toBe(false)
  })
  it('incluye el resto', () => {
    for (const c of ['B1', 'SM6-1', 'Y55', 'T1', 'S1']) expect(esPiezaFisica(c), c).toBe(true)
  })
})

describe('coberturaRepuestos', () => {
  type V = { estado: 'confirmado' | 'corregido' | 'no_aplica'; codigo?: string }
  const e = (n2?: V, n3?: V) => ({ porMaquina: { ...(n2 ? { 'baader-n2': n2 } : {}), ...(n3 ? { 'baader-n3': n3 } : {}) } })
  const MQ = ['baader-n2', 'baader-n3'] as const
  const por = new Map<string, { porMaquina: Partial<Record<'baader-n2' | 'baader-n3', V>>; sinMaquina?: V }>([
    ['B1', e({ estado: 'confirmado' }, { estado: 'corregido', codigo: 'X9' })], // resuelto en ambas (aunque distinta)
    ['B10', e({ estado: 'confirmado' })], // solo N2
    ['X5', e({ estado: 'confirmado' }, { estado: 'confirmado' })], // regleta: no es pieza
    ['Y3', { porMaquina: {}, sinMaquina: { estado: 'confirmado' as const } }], // vieja sin máquina: no cuenta
  ])
  it('cuenta M, N y X (resueltos en ambas) sin contar pseudo-elementos, regletas ni TP', () => {
    const r = coberturaRepuestos(['A3C.P1', 'X5', 'TP', 'B1', 'B10', 'B1', 'Y3'], partes.aparatos, por, MQ)
    expect(r).toEqual({ total: 3, identificados: 2, confirmados: 1, porMaquina: { 'baader-n2': 2, 'baader-n3': 1 } })
  })
  it('sin datos: todo en cero salvo el total', () => {
    expect(coberturaRepuestos(['B1', 'B2'], null, null, MQ)).toEqual({
      total: 2, identificados: 0, confirmados: 0, porMaquina: { 'baader-n2': 0, 'baader-n3': 0 },
    })
  })
  it('cualquier respuesta resuelve: no_aplica en una y confirmado en la otra suma en ambas', () => {
    const r = coberturaRepuestos(['B1'], null, new Map([['B1', e({ estado: 'no_aplica' }, { estado: 'confirmado' })]]), MQ)
    expect(r.confirmados).toBe(1)
  })
})

describe('esModoCandidatos / origenPieza', () => {
  it('candidatos = varias piezas y ninguna según catálogo', () => {
    expect(esModoCandidatos([{ confianza: 'propuesto' }, { confianza: 'propuesto' }])).toBe(true)
    expect(esModoCandidatos([{ confianza: 'catalogo' }, { confianza: 'propuesto' }])).toBe(false)
    expect(esModoCandidatos([{ confianza: 'propuesto' }])).toBe(false)
  })
  it('origen distingue catálogo 2006, 2014 y candidato sin figura', () => {
    expect(origenPieza({ fig: '70-8', pos: 'B1' })).toBe('Catálogo 2006 · fig. 70-8 · pos. B1')
    expect(origenPieza({ fig: '120 (2014)', pos: '321' })).toBe('Catálogo 2014 · fig. 120 · pos. 321')
    expect(origenPieza({ fig: null, pos: 'SM5' })).toBe('Candidato · sin figura asignada')
  })
  it('con candidatos, el código confirmado manda; vínculo viejo sin código vale para la primera', () => {
    const v = { estado: 'confirmado' as const, codigo: '42303107' }
    expect(certezaDe('propuesto', v, '42303107', '42303109').texto).toBe('Confirmada en terreno')
    expect(certezaDe('propuesto', v, '42303109', '42303109').texto).toBe('Descartada en terreno')
    expect(certezaDe('catalogo', { estado: 'confirmado' }, '42303109', '42303109').tono).toBe('ok')
  })
})

describe('certezaDe', () => {
  it('sin vínculo: catálogo o propuesto', () => {
    expect(certezaDe('catalogo')).toEqual({ tono: 'info', texto: 'Según catálogo' })
    expect(certezaDe('otro')).toEqual({ tono: 'neutral', texto: 'Propuesto' })
  })
  it('el vínculo de terreno manda', () => {
    expect(certezaDe('catalogo', { estado: 'confirmado' }).tono).toBe('ok')
    expect(certezaDe('catalogo', { estado: 'corregido' })).toEqual({ tono: 'warning', texto: 'Es otra pieza' })
    expect(certezaDe('catalogo', { estado: 'no_aplica' }).tono).toBe('neutral')
  })
})
