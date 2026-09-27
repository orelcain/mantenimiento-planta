import { describe, expect, it } from 'vitest'
import { INDICE_TERRENO, SECCIONES_TERRENO, getSeccionTerreno } from '@/data/baader200Terreno'
import {
  buscar,
  construirIndiceBusqueda,
  dibujoParaPos,
  dibujoPreferido,
  estiloRecorte,
  formatoValor,
  normalizar,
  partirCifras,
  posNumero,
  posTexto,
  vecinas,
} from '../terreno'

const indice = construirIndiceBusqueda(SECCIONES_TERRENO, INDICE_TERRENO)
const ventrales = getSeccionTerreno('cuchillos-ventrales')!

describe('normalizar', () => {
  it('quita acentos y mayúsculas', () => {
    expect(normalizar('Salmón JAPONÉS')).toBe('salmon japones')
  })
  it('iguala el punto y la coma decimal', () => {
    expect(normalizar('177.5')).toBe(normalizar('177,5'))
  })
  it('limpia la puntuación de las posiciones', () => {
    expect(normalizar('pos. 8·9')).toBe('pos 8 9')
  })
})

describe('formato', () => {
  it('posTexto une con punto medio y marca las piezas sin número', () => {
    expect(posTexto(['8', '9'])).toBe('8·9')
    expect(posTexto([])).toBe('—')
    expect(posTexto(['35.2', '35.3', '38.5'])).toBe('dib. 35 pos. 2·3 · dib. 38 pos. 5')
    expect(posNumero('52.11')).toBe('11')
  })
  it('formatoValor junta pares de valores', () => {
    expect(formatoValor(['320', '180'], 'mm')).toBe('320 / 180 mm')
    expect(formatoValor(['177,5'], 'mm')).toBe('177,5 mm')
  })
})

describe('estiloRecorte', () => {
  it('sin recorte muestra la página entera', () => {
    const e = estiloRecorte(undefined, 1000, 500)
    expect(e.aspecto).toBe(2)
    expect(e.imgAnchoPct).toBe(100)
    expect(e.imgIzqPct).toBeCloseTo(0)
    expect(e.imgArribaPct).toBeCloseTo(0)
  })
  it('un recorte de la mitad derecha duplica el ancho de la página', () => {
    const e = estiloRecorte({ x: 50, y: 25, w: 50, h: 50 }, 1000, 1000)
    expect(e.aspecto).toBe(1)
    expect(e.imgAnchoPct).toBe(200)
    expect(e.imgIzqPct).toBe(-100)
    expect(e.imgArribaPct).toBe(-50)
  })
})

describe('dibujos', () => {
  it('prefiere el dibujo con más posiciones marcadas', () => {
    expect(dibujoPreferido(ventrales.dibujos)?.id).toBe('planta-p6')
  })
  it('se queda en el dibujo actual si marca la posición, si no salta al que la tiene', () => {
    expect(dibujoParaPos(ventrales.dibujos, ['11'], 'v4-dib11')?.id).toBe('v4-dib11')
    expect(dibujoParaPos(ventrales.dibujos, ['12'], 'v4-dib11')?.id).toBe('v4-dib12')
    expect(dibujoParaPos(ventrales.dibujos, [], 'v4-dib11')).toBeUndefined()
  })
})

describe('vecinas', () => {
  it('ubica la sección en el índice', () => {
    const v = vecinas(INDICE_TERRENO, 'cuchillos-ventrales')
    expect(v.posicion).toBe(4)
    expect(v.total).toBe(14)
    expect(v.anterior?.id).toBe('levantadores-aletas')
    expect(v.siguiente?.id).toBe('guias-flotantes')
  })
})

describe('buscar', () => {
  it('«trucha» responde con el valor de trucha primero', () => {
    const r = buscar(indice, 'trucha')
    expect(r.medidas[0]!.valor).toBe('4 mm')
    expect(r.medidas[0]!.especie).toBe('trucha')
  })
  it('«pos 11» y «pos. 11» devuelven la entrada derecha', () => {
    for (const q of ['pos 11', 'pos. 11', 'POS11']) {
      const r = buscar(indice, q)
      expect(r.piezas.map(p => p.titulo)).toContain('Entrada derecha')
      expect(r.piezas.every(p => p.pos?.some(x => posNumero(x) === '11'))).toBe(true)
      expect(r.porPos).toBe(true)
    }
  })
  it('«pos 1» no confunde la 1 con la 11 ni la 14', () => {
    const r = buscar(indice, 'pos 1')
    expect(r.piezas.every(p => p.pos?.some(x => posNumero(x) === '1'))).toBe(true)
  })
  it('encuentra medidas por número, con coma o punto', () => {
    expect(buscar(indice, '177').medidas[0]!.valor).toBe('177,5 mm')
    expect(buscar(indice, '177.5').medidas[0]!.valor).toBe('177,5 mm')
  })
  it('encuentra piezas por código Baader y SAP', () => {
    expect(buscar(indice, '94011760').piezas[0]!.titulo).toMatch(/Cuchilla circular/)
    expect(buscar(indice, '3300054470').piezas[0]!.titulo).toMatch(/Buje apretador/)
  })
  it('ignora acentos', () => {
    expect(buscar(indice, 'salmon').medidas[0]!.valor).toBe('5 mm')
  })
  it('las 14 secciones de ajuste están disponibles en el índice', () => {
    expect(SECCIONES_TERRENO.map(s => s.orden)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
    const r = buscar(indice, 'dorsales')
    expect(r.secciones.length).toBeGreaterThan(0)
    expect(r.secciones.every(s => s.disponible)).toBe(true)
  })
  it('sin resultados devuelve total 0', () => {
    expect(buscar(indice, 'zzz').total).toBe(0)
    expect(buscar(indice, '   ').total).toBe(0)
  })
})

describe('partirCifras', () => {
  it('destaca las medidas con su unidad y deja las posiciones como texto', () => {
    const t = partirCifras('Controlar 320 y 180 mm con pos. 6·7 y dejar 1,5 mm.')
    expect(t.filter(x => x.cifra).map(x => x.texto)).toEqual(['320 y 180 mm', '1,5 mm'])
    expect(t.map(x => x.texto).join('')).toBe('Controlar 320 y 180 mm con pos. 6·7 y dejar 1,5 mm.')
  })
  it('sin cifras devuelve el texto entero', () => {
    expect(partirCifras('Volver a fijar.')).toEqual([{ texto: 'Volver a fijar.', cifra: false }])
  })
})
