import { describe, it, expect } from 'vitest'
import {
  acotar,
  alternarLinea,
  asuntoPedido,
  cambiarDuenoPedido,
  conSapAsignado,
  conStockVigente,
  etiquetaStock,
  filasExcelPedido,
  fijarCantidad,
  htmlPedido,
  indiceEnPedido,
  mismoRepuesto,
  nivelStock,
  pendientesDeRegistrar,
  quitarLinea,
  resumenPedido,
  solicitudesDePedido,
  textoPedido,
  unidadTrasCantidad,
  type LineaPedido,
} from '../pedidoRepuestos'

const base: LineaPedido = {
  clave: '3300012256',
  codigoSAP: '3300012256',
  codigoFabricante: '1424101003',
  textoBreve: 'Hoja móvil guillotina aspirador',
  equipo: 'BAADER 142 N1',
  cantidad: 1,
  unidad: 'UN',
  stockActual: 0,
  stockMinimo: 2,
  ubicacionBodega: 'C-3',
  foto: 'https://x/foto.jpg',
}
const sinSap: LineaPedido = { ...base, clave: 'fab:30831003', codigoSAP: '', codigoFabricante: '30831003', textoBreve: 'Tuerca M5', stockActual: null, stockMinimo: null, ubicacionBodega: '', foto: null }
const conStock: LineaPedido = { ...base, clave: '3300074788', codigoSAP: '3300074788', textoBreve: 'Tuerca 20600050', stockActual: 10, stockMinimo: 2, cantidad: 4 }
const fecha = new Date(2026, 9, 11, 19, 0)

describe('acotar', () => {
  it.each([
    [0, 1], [-3, 1], [1.6, 2], [5, 5], [5000, 999], [Number.NaN, 1],
  ])('%s → %s', (n, esperado) => expect(acotar(n)).toBe(esperado))
})

describe('unidadTrasCantidad', () => {
  it.each([
    [1, 'pzas', ' pza'],
    [2, 'pzas', ' pzas'],
    [1, 'unidades', ' unidad'],
    [1, 'KG', ' KG'],
    [3, 'UN', ''],
    [1, '', ''],
  ])('%s %s → "%s"', (cantidad, unidad, esperado) => expect(unidadTrasCantidad({ cantidad, unidad })).toBe(esperado))
})

describe('alternar / fijar / quitar', () => {
  it('agrega una vez y al repetir la quita (interruptor de la fila)', () => {
    const una = alternarLinea([], base)
    expect(una).toHaveLength(1)
    expect(alternarLinea(una, base)).toHaveLength(0)
  })
  it('no duplica ni toca las demás al fijar cantidad', () => {
    const lista = alternarLinea(alternarLinea([], base), conStock)
    const r = fijarCantidad(lista, base.clave, 7)
    expect(r.find((l) => l.clave === base.clave)?.cantidad).toBe(7)
    expect(r.find((l) => l.clave === conStock.clave)?.cantidad).toBe(4)
    expect(fijarCantidad(lista, base.clave, 0).find((l) => l.clave === base.clave)?.cantidad).toBe(1)
  })
  it('quita solo la indicada', () => {
    expect(quitarLinea([base, conStock], base.clave).map((l) => l.clave)).toEqual([conStock.clave])
  })
})

describe('nivelStock', () => {
  it('sin registro en bodega NO es cero', () => expect(nivelStock(sinSap)).toBe('sin-registro'))
  it('cero es agotado', () => expect(nivelStock(base)).toBe('agotado'))
  it('igual o bajo el mínimo es bajo', () => expect(nivelStock({ stockActual: 2, stockMinimo: 2 })).toBe('bajo'))
  it('mínimo 0 o desconocido no marca bajo', () => {
    expect(nivelStock({ stockActual: 1, stockMinimo: 0 })).toBe('ok')
    expect(nivelStock({ stockActual: 1, stockMinimo: null })).toBe('ok')
  })
})

describe('conStockVigente', () => {
  it('usa el stock de bodega de ahora', () => {
    const l = conStockVigente(base, () => ({ configurado: true, stockActual: 3, unidad: 'UN', ubicacionBodega: 'A-1' }))
    expect(l.stockActual).toBe(3)
    expect(l.ubicacionBodega).toBe('A-1')
  })
  it('sin registro en bodega queda null', () => {
    expect(conStockVigente(base, () => ({ configurado: false })).stockActual).toBeNull()
  })
  it('sin SAP no consulta', () => {
    expect(conStockVigente(sinSap, () => { throw new Error('no debía consultar') })).toBe(sinSap)
  })
})

describe('resumen y textos', () => {
  const lineas = [base, sinSap, conStock]
  it('resume repuestos, unidades, críticos y sin SAP', () => {
    expect(resumenPedido(lineas)).toEqual({ repuestos: 3, unidades: 6, criticos: 1, sinSap: 1 })
  })
  it('asunto con fecha dd-mm-aaaa y singular/plural', () => {
    expect(asuntoPedido({ lineas, fecha })).toBe('Solicitud de repuestos · 3 ítems · 11-10-2026')
    expect(asuntoPedido({ lineas: [base], fecha })).toContain('1 ítem ·')
  })
  it('texto plano trae códigos, cantidad, stock y observación', () => {
    const t = textoPedido({ lineas, fecha, solicitante: 'Danilo', nota: 'Cambio de cuchillas' })
    expect(t).toContain('Solicita: Danilo')
    expect(t).toContain('1. Hoja móvil guillotina aspirador — 1')
    expect(t).toContain('SAP 3300012256 · Fab. 1424101003 · BAADER 142 N1')
    expect(t).toContain('Stock: 0 en bodega · C-3')
    expect(t).toContain('sin SAP · Fab. 30831003')
    expect(t).toContain('Stock: sin registro en bodega')
    expect(t).toContain('Observación: Cambio de cuchillas')
    expect(t).not.toContain('\n\n\n')
  })
  it('etiqueta de stock con ubicación', () => {
    expect(etiquetaStock(conStock)).toBe('10 en bodega · C-3')
  })
})

describe('htmlPedido', () => {
  it('estilo en línea, tabla y foto con width/height como atributos', () => {
    const h = htmlPedido({ lineas: [base, sinSap], fecha, foto: (l) => (l.foto ? { src: l.foto, w: 72, h: 54 } : null) })
    expect(h).toContain('<table')
    expect(h).toContain('width="72" height="54"')
    expect(h).toContain('sin foto')
    expect(h).not.toContain('class=')
    expect(h).toContain('Sin código SAP.')
  })
  it('escapa el texto del repuesto', () => {
    const h = htmlPedido({ lineas: [{ ...base, textoBreve: 'Tubo <12mm> & "x"' }], fecha })
    expect(h).toContain('Tubo &lt;12mm&gt; &amp; &quot;x&quot;')
  })
})

describe('Excel y solicitudes', () => {
  it('Excel: encabezado + una fila por repuesto, stock vacío si no hay registro', () => {
    const f = filasExcelPedido([base, sinSap])
    expect(f).toHaveLength(3)
    expect(f[0]?.[0]).toBe('SAP')
    expect(f[2]?.[6]).toBe('')
  })
  it('solicitudes solo con SAP y con la observación', () => {
    const s = solicitudesDePedido([base, sinSap, conStock], ' urgente ')
    expect(s.map((x) => x.codigoSAP)).toEqual(['3300012256', '3300074788'])
    expect(s[0]?.observaciones).toBe('urgente')
    expect(solicitudesDePedido([base])[0]).not.toHaveProperty('observaciones')
  })
})

describe('mismo repuesto con otra clave (fab: → SAP)', () => {
  const despiece: LineaPedido = { ...base, clave: 'fab:1424101003', codigoSAP: '' }
  it('reconoce la línea fab: como el repuesto que ahora tiene SAP', () => {
    expect(mismoRepuesto(despiece, base)).toBe(true)
    expect(indiceEnPedido([despiece])({ clave: base.clave, codigoSAP: base.codigoSAP, codigoFabricante: base.codigoFabricante })).toBe(true)
  })
  it('dos SAP distintos no son el mismo aunque compartan código de fabricante', () => {
    expect(mismoRepuesto(base, { ...base, clave: '3300099999', codigoSAP: '3300099999' })).toBe(false)
  })
  it('tocar la fila con SAP quita la línea fab: en vez de duplicarla', () => {
    expect(alternarLinea([despiece], base)).toHaveLength(0)
  })
  it('conSapAsignado pasa la línea al SAP y junta cantidades si ya estaba', () => {
    const r = conSapAsignado([despiece], () => base.codigoSAP)
    expect(r[0]).toMatchObject({ clave: base.codigoSAP, codigoSAP: base.codigoSAP })
    const juntas = conSapAsignado([{ ...base, cantidad: 2 }, { ...despiece, cantidad: 3 }], () => base.codigoSAP)
    expect(juntas).toHaveLength(1)
    expect(juntas[0]?.cantidad).toBe(5)
  })
  it('conSapAsignado devuelve la misma lista si no hay nada que cambiar', () => {
    const lista = [base, sinSap]
    expect(conSapAsignado(lista, () => undefined)).toBe(lista)
  })
})

describe('stock vigente con mínimo', () => {
  const sinMinimo: LineaPedido = { ...base, stockActual: null, stockMinimo: null }
  it('toma el mínimo configurado después de agregar la línea', () => {
    const l = conStockVigente(sinMinimo, () => ({ configurado: true, stockActual: 1, stockMinimo: 3 }))
    expect(l.stockMinimo).toBe(3)
    expect(nivelStock(l)).toBe('bajo')
  })
  it('bodega configurada pero sin stock cargado = sin registro, no agotado', () => {
    expect(nivelStock(conStockVigente(base, () => ({ configurado: true })))).toBe('sin-registro')
  })
})

describe('correo sin fotos', () => {
  it('quita la columna Foto entera', () => {
    const html = htmlPedido({ lineas: [base], fecha, conFotos: false, foto: () => ({ src: 'https://x/f.jpg', w: 72, h: 72 }) })
    expect(html).not.toContain('<img')
    expect(html).not.toContain('Foto')
    expect(html).not.toContain('sin foto')
  })
})

describe('pedido por usuario (PC compartido)', () => {
  const vacio = { lineas: [], nota: '', registradas: [], otros: {} }
  it('un pedido sin dueño (anterior) lo adopta el primero que entra, sin perderlo', () => {
    const s = cambiarDuenoPedido({ ...vacio, dueno: null, lineas: [base] }, 'ana')
    expect(s.dueno).toBe('ana')
    expect(s.lineas).toEqual([base])
  })
  it('al entrar otro, aparta el de quien estaba y se lo devuelve cuando vuelve', () => {
    const deAna = { ...vacio, dueno: 'ana', lineas: [base], nota: 'urgente', registradas: [base.clave] }
    const deLuis = cambiarDuenoPedido(deAna, 'luis')
    expect(deLuis.lineas).toEqual([])
    expect(deLuis.nota).toBe('')
    const conLuis = { ...deLuis, lineas: [conStock] }
    const anaOtraVez = cambiarDuenoPedido(conLuis, 'ana')
    expect(anaOtraVez).toMatchObject({ dueno: 'ana', lineas: [base], nota: 'urgente', registradas: [base.clave] })
    expect(anaOtraVez.otros.luis?.lineas).toEqual([conStock])
    expect(anaOtraVez.otros.ana).toBeUndefined()
  })
  it('no guarda pedidos vacíos de otros ni cambia nada si es el mismo usuario', () => {
    const s = { ...vacio, dueno: 'ana' }
    expect(cambiarDuenoPedido(s, 'ana')).toBe(s)
    expect(cambiarDuenoPedido(s, 'luis').otros).toEqual({})
  })
})

describe('pendientesDeRegistrar', () => {
  it('salta las sin SAP y las ya registradas (no duplica al reintentar)', () => {
    const lista = [base, sinSap, conStock]
    expect(pendientesDeRegistrar(lista, []).map((l) => l.clave)).toEqual([base.clave, conStock.clave])
    expect(pendientesDeRegistrar(lista, [base.clave]).map((l) => l.clave)).toEqual([conStock.clave])
    expect(pendientesDeRegistrar(lista, [base.clave, conStock.clave])).toHaveLength(0)
  })
})
