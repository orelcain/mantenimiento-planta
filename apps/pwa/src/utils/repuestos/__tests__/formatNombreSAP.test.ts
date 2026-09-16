import { describe, it, expect } from 'vitest'
import { formatNombreSAP } from '../formatNombreSAP'

describe('formatNombreSAP', () => {
  it('un paréntesis largo o con dígitos es el nombre, no una etiqueta', () => {
    expect(formatNombreSAP('(SIN DESCRIPCIÓN — CÓD. SAP 12910556)')).toEqual({
      nombre: 'Sin descripción — cód. SAP 12910556',
      etiquetas: [],
    })
    expect(formatNombreSAP('(NO USAR)')).toEqual({ nombre: '', etiquetas: ['No usar'] })
  })

  it('vacío y null devuelven nombre vacío sin etiquetas', () => {
    expect(formatNombreSAP('')).toEqual({ nombre: '', etiquetas: [] })
    expect(formatNombreSAP(null)).toEqual({ nombre: '', etiquetas: [] })
    expect(formatNombreSAP(undefined)).toEqual({ nombre: '', etiquetas: [] })
    expect(formatNombreSAP('   ')).toEqual({ nombre: '', etiquetas: [] })
  })

  it("apóstrofe suelto al inicio + O'RING", () => {
    const r = formatNombreSAP("'JUEGO O'RING VITON EN MILIMETROS")
    expect(r).toEqual({ nombre: "Juego O'ring Viton en milimetros", etiquetas: [] })
  })

  it("número pegado a unidad, con apóstrofe suelto en medio de texto (se deja tal cual)", () => {
    const r = formatNombreSAP("'SENSOR P' -1/30KG MYPRO MBR1-2/M/V/CP-IV")
    expect(r).toEqual({
      nombre: "Sensor P' -1/30 kg MYPRO MBR1-2/M/V/CP-IV",
      etiquetas: [],
    })
  })

  it("grado Celsius con apóstrofe + abreviatura P/ + código con dígito", () => {
    const r = formatNombreSAP("'SENSOR PTC 100'C, P/COMPRESOR HSN-7471")
    expect(r).toEqual({
      nombre: 'Sensor PTC 100 °C, p/compresor HSN-7471',
      etiquetas: [],
    })
  })

  it('comilla doble al inicio + comilla doble pegada a letra (ASS"Y) + REP.', () => {
    const r = formatNombreSAP('"HEATER ASS"Y T6-1-41000 REP. ENZUNCHAD')
    expect(r).toEqual({
      nombre: "Heater ass'y T6-1-41000 rep. enzunchad",
      etiquetas: [],
    })
  })

  it('pulgada (3/8") se conserva, código con guiones y letras se protege', () => {
    const r = formatNombreSAP('"SELLO MECANICO SEAL 1 3/8" CA-NIR-VI 2')
    expect(r).toEqual({
      nombre: 'Sello mecanico seal 1 3/8" CA-NIR-VI 2',
      etiquetas: [],
    })
  })

  it('prefijo (NO USAR) se extrae a etiquetas', () => {
    const r = formatNombreSAP('(NO USAR) BORNE P/BATERIA')
    expect(r).toEqual({ nombre: 'Borne p/bateria', etiquetas: ['No usar'] })
  })

  it('unidad ya separada (1000 W) se conserva en mayúscula', () => {
    const r = formatNombreSAP('(NO USAR) AMPOLLETA HALOGENA 1000 W')
    expect(r).toEqual({
      nombre: 'Ampolleta halogena 1000 W',
      etiquetas: ['No usar'],
    })
  })

  it('varios prefijos entre paréntesis pegados', () => {
    const r = formatNombreSAP('(NO USAR)(OBSOLETO) BROCA CONCRET. 3/8')
    expect(r).toEqual({
      nombre: 'Broca concret. 3/8',
      etiquetas: ['No usar', 'Obsoleto'],
    })
  })

  it('sigla de marca (SKF) protegida junto a código con dígito', () => {
    const r = formatNombreSAP('RODAMIENTO SKF 6205-2RS')
    expect(r).toEqual({ nombre: 'Rodamiento SKF 6205-2RS', etiquetas: [] })
  })

  it('marca con inicial mayúscula (Festo) + número pegado a sigla (24VDC)', () => {
    const r = formatNombreSAP('VALVULA SOLENOIDE FESTO 24VDC')
    expect(r).toEqual({
      nombre: 'Valvula solenoide Festo 24 VDC',
      etiquetas: [],
    })
  })

  describe('idempotencia', () => {
    const casos = [
      "'JUEGO O'RING VITON EN MILIMETROS",
      "'SENSOR P' -1/30KG MYPRO MBR1-2/M/V/CP-IV",
      "'SENSOR PTC 100'C, P/COMPRESOR HSN-7471",
      '"HEATER ASS"Y T6-1-41000 REP. ENZUNCHAD',
      '"SELLO MECANICO SEAL 1 3/8" CA-NIR-VI 2',
      '(NO USAR) BORNE P/BATERIA',
      '(NO USAR) AMPOLLETA HALOGENA 1000 W',
      '(NO USAR)(OBSOLETO) BROCA CONCRET. 3/8',
      'RODAMIENTO SKF 6205-2RS',
      'VALVULA SOLENOIDE FESTO 24VDC',
    ]

    it.each(casos)('aplicar dos veces da el mismo nombre: %s', (entrada) => {
      const primera = formatNombreSAP(entrada)
      const segunda = formatNombreSAP(primera.nombre)
      expect(segunda.nombre).toBe(primera.nombre)
    })
  })
})
