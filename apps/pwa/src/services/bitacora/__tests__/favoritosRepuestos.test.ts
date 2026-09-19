import { describe, expect, it } from 'vitest'
import { buscarRepuestos, favoritosDeLista, type RepuestoDelCatalogo } from '../repuestosBitacora'

// Materiales reales de KNURO N1 (19-09-2026); los tres cilindros son favoritos reales de Orel.
const r = (codigoSAP: string, nombre: string, nombreComun = ''): RepuestoDelCatalogo => ({ codigoSAP, nombre, nombreComun, ubicacion: '' })
const KNURO_N1 = [
  r('3300138374', 'CILINDRO CRHD-32-325-PPV-A-MC-S6 195549'),
  r('3300138378', 'CILINDROCRDSNU-32-200-PPV-A-MQ-A1 552791'),
  r('3300138389', 'SENSOR CILINDRO MKT3028BBPKG'),
  r('3300138398', 'CILINDRO CRDSNU-32-100'),
  r('3300138386', 'Cilindro CRHD-32-85-PPV-A-MC-S6 ( 2A herramienta B Knuro )'),
  r('3300138375', 'SENSOR INDUCTIVO SIEH-M12B-PS-S-L 150451'),
]
const FAVS = new Set(['3300138378', '3300138386', '3300138398', '3300106148', 'fab:999 0571'])

describe('favoritos en el buscador de repuestos', () => {
  it('sin escribir: los favoritos que están en la lista, por nombre', () => {
    const nombres = favoritosDeLista(KNURO_N1, FAVS, '').map((x) => x.codigoSAP)
    expect([...nombres].sort()).toEqual(['3300138378', '3300138386', '3300138398'])
    expect(favoritosDeLista([...KNURO_N1].reverse(), FAVS, '').map((x) => x.codigoSAP)).toEqual(nombres)
  })

  it('una sola letra todavía no filtra', () => {
    expect(favoritosDeLista(KNURO_N1, FAVS, 'c')).toHaveLength(3)
  })

  it('con texto: busca solo dentro de los favoritos', () => {
    expect(favoritosDeLista(KNURO_N1, FAVS, 'crdsnu').map((x) => x.codigoSAP).sort()).toEqual(['3300138378', '3300138398'])
    expect(favoritosDeLista(KNURO_N1, FAVS, 'sensor')).toEqual([])
  })

  it('un favorito de otro equipo no aparece en este', () => {
    expect(favoritosDeLista(KNURO_N1, FAVS, '').some((x) => x.codigoSAP === '3300106148')).toBe(false)
  })

  it('en la búsqueda normal los favoritos van primero, antes de cortar', () => {
    // «SENSOR CILINDRO» no empieza con lo escrito: sin favorito queda al final y se corta.
    const sensor = new Set(['3300138389'])
    expect(buscarRepuestos(KNURO_N1, 'cilindro', 2).map((x) => x.codigoSAP)).not.toContain('3300138389')
    expect(buscarRepuestos(KNURO_N1, 'cilindro', 2, sensor)[0]?.codigoSAP).toBe('3300138389')
  })

  it('sin favoritos la búsqueda queda igual que antes', () => {
    expect(buscarRepuestos(KNURO_N1, 'cilindro', 8, new Set())).toEqual(buscarRepuestos(KNURO_N1, 'cilindro'))
  })
})
