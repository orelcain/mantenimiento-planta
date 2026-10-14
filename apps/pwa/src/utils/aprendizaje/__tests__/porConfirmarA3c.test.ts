import { describe, expect, it } from 'vitest'
import type { ModuloPrioritario } from '@/data/baader142A3cPrioridad'
import { PRIORIDAD_A3C, TOTAL_PRIORITARIOS } from '@/data/baader142A3cPrioridad'
import { armarPorConfirmar, estaEnLista, primeraSeleccion } from '../porConfirmarA3c'

const prioridad: ModuloPrioritario[] = [
  {
    id: 'm1',
    nombre: 'Módulo uno',
    episodios: 5,
    resumen: 'r1',
    fuentes: ['f'],
    elementos: [
      { codigo: 'SM5', tipo: 'motor', lectura: 'Leer placa del motor' },
      { codigo: 'B5', tipo: 'sensor', lectura: 'Leer etiqueta del sensor' },
      { codigo: 'B25', tipo: 'encoder', lectura: 'Leer etiqueta del encoder' },
    ],
  },
  { id: 'm2', nombre: 'Módulo dos', episodios: 3, resumen: 'r2', fuentes: ['f'], elementos: [{ codigo: 'Y1', tipo: 'valvula', lectura: 'Leer placa' }] },
]
const elementos = {
  SM5: { es: 'motor paso a paso' }, B5: { es: 'sensor' }, B25: { es: 'encoder' }, Y1: { es: 'válvula' },
  B1: { es: 'sensor B1' }, B2: { es: 'sensor B2' }, SM9: { es: 'motor 9' },
  'A3C.P1': { es: 'pseudo' }, X5: { es: 'regleta' }, TP3: { es: 'punto de prueba' },
}
const aparatos = {
  SM5: [{ nr: '41702013' }, { nr: '41702013' }, { nr: '41702014' }],
  B1: [{ nr: '42303109' }],
}

type V = { estado: 'confirmado' | 'corregido' | 'no_aplica'; codigo?: string }
/** porAparato a mano: `{ B5: { N2: {...}, N3: {...} }, B1: { sin: {...} } }`. */
const mapa = (o: Record<string, { N2?: V; N3?: V; sin?: V }>) =>
  new Map(
    Object.entries(o).map(([c, e]) => [
      c,
      { porMaquina: { ...(e.N2 ? { 'baader-n2': e.N2 } : {}), ...(e.N3 ? { 'baader-n3': e.N3 } : {}) }, sinMaquina: e.sin },
    ]),
  )
const ok: V = { estado: 'confirmado' }
const base = { prioridad, aparatos, elementos }
const armar = (por: ReturnType<typeof mapa> | null, maquina: 'baader-n2' | 'baader-n3' | null = 'baader-n2') =>
  armarPorConfirmar({ ...base, porAparato: por, maquina })

describe('armarPorConfirmar', () => {
  it('pendientes de la máquina elegida antes que resueltos dentro del grupo, conteos 0/3 y 1/3', () => {
    const sin = armar(new Map())
    expect(sin.grupos[0]?.filas.map(f => f.codigo)).toEqual(['SM5', 'B5', 'B25'])
    expect(sin.grupos[0]).toMatchObject({ numero: 1, resueltos: 0, total: 3 })

    const con = armar(mapa({ SM5: { N2: ok } }))
    expect(con.grupos[0]?.filas.map(f => f.codigo)).toEqual(['B5', 'B25', 'SM5'])
    expect(con.grupos[0]?.filas[2]?.estado).toBe('confirmado')
    expect(con.grupos[0]).toMatchObject({ resueltos: 1, total: 3 })
    expect(con.prioritarios).toMatchObject({ resueltos: 1, total: 4, enTodas: 0, porMaquina: { 'baader-n2': 1, 'baader-n3': 0 } })
  })

  it('cualquier respuesta resuelve (confirmado, corregido, no_aplica): todos van al final', () => {
    const r = armar(mapa({ SM5: { N2: { estado: 'corregido', codigo: 'X1' } }, B5: { N2: ok }, B25: { N2: { estado: 'no_aplica' } } }))
    expect(r.grupos[0]?.filas.map(f => f.codigo)).toEqual(['SM5', 'B5', 'B25'])
    expect(r.grupos[0]?.resueltos).toBe(3)
  })

  it('cambiar de máquina cambia el estado de la fila, no el de la otra', () => {
    const por = mapa({ B5: { N2: ok } })
    expect(armar(por, 'baader-n2').grupos[0]?.filas.find(f => f.codigo === 'B5')?.estado).toBe('confirmado')
    const n3 = armar(por, 'baader-n3').grupos[0]?.filas.find(f => f.codigo === 'B5')
    expect(n3?.estado).toBe('pendiente')
    expect(n3?.otras).toEqual([{ maquina: 'baader-n2', estado: 'confirmado', codigo: undefined, relacion: undefined }])
  })

  it('solo suma «en ambas» lo resuelto en N2 y en N3', () => {
    const r = armar(mapa({ SM5: { N2: ok, N3: { estado: 'no_aplica' } }, B5: { N2: ok }, B25: { N3: ok } }))
    expect(r.prioritarios.enTodas).toBe(1)
    expect(r.prioritarios.porMaquina).toEqual({ 'baader-n2': 2, 'baader-n3': 2 })
    expect(r.grupos[0]?.filas.find(f => f.codigo === 'SM5')?.enTodas).toBe(true)
  })

  it('piezas distintas entre máquinas: resuelto en ambas y marcado como distinta', () => {
    const r = armar(mapa({ B5: { N2: { estado: 'confirmado', codigo: '42303107' }, N3: { estado: 'confirmado', codigo: '42303109' } } }))
    const f = r.grupos[0]?.filas.find(x => x.codigo === 'B5')
    expect(f).toMatchObject({ enTodas: true, distintas: true })
    expect(f?.otras[0]).toMatchObject({ maquina: 'baader-n3', codigo: '42303109', relacion: 'distinta' })
    expect(r.prioritarios.enTodas).toBe(1)
  })

  it('mismo código en ambas: «igual», no distintas', () => {
    const r = armar(mapa({ B5: { N2: { estado: 'confirmado', codigo: '42303107' }, N3: { estado: 'confirmado', codigo: '42303107' } } }))
    const f = r.grupos[0]?.filas.find(x => x.codigo === 'B5')
    expect(f?.distintas).toBe(false)
    expect(f?.otras[0]?.relacion).toBe('igual')
  })

  it('la confirmación vieja sin máquina es solo pista: no cuenta en ninguna', () => {
    const r = armar(mapa({ B5: { sin: ok } }))
    const f = r.grupos[0]?.filas.find(x => x.codigo === 'B5')
    expect(f).toMatchObject({ estado: 'pendiente', anteriorSinMaquina: true, enTodas: false })
    expect(r.prioritarios).toMatchObject({ resueltos: 0, enTodas: 0 })
  })

  it('sin máquina elegida: todo pendiente y la fila lista las dos máquinas', () => {
    const r = armar(mapa({ B5: { N2: ok } }), null)
    const f = r.grupos[0]?.filas.find(x => x.codigo === 'B5')
    expect(f?.estado).toBe('pendiente')
    expect(f?.otras.map(o => o.maquina)).toEqual(['baader-n2', 'baader-n3'])
    expect(r.prioritarios.resueltos).toBe(0)
  })

  it('candidatos salen de partes (sin repetir) y vacío si no hay', () => {
    const r = armar(new Map())
    expect(r.grupos[0]?.filas[0]?.candidatos).toEqual(['41702013', '41702014'])
    expect(r.grupos[0]?.filas[1]?.candidatos).toEqual([])
  })

  it('el resto excluye prioritarios y no-físicos, y cuenta sus resueltos', () => {
    const r = armar(mapa({ B2: { N2: ok } }))
    expect(r.resto.filas.map(f => f.codigo)).toEqual(['B1', 'SM9', 'B2'])
    expect(r.resto).toMatchObject({ total: 3, resueltos: 1 })
    expect(r.plano).toMatchObject({ resueltos: 1, total: 7, enTodas: 0 })
  })

  it('primeraSeleccion: primera pendiente de la máquina elegida; si no queda, la primera fila', () => {
    const v = (cods: string[]) => mapa(Object.fromEntries(cods.map(c => [c, { N2: ok }])))
    expect(primeraSeleccion(armar(v(['SM5'])))).toBe('B5')
    expect(primeraSeleccion(armar(v(['SM5', 'B5', 'B25', 'Y1'])))).toBe('SM5')
    // lo resuelto en N2 sigue pendiente en N3
    expect(primeraSeleccion(armar(v(['SM5', 'B5', 'B25', 'Y1']), 'baader-n3'))).toBe('SM5')
    expect(armar(v(['SM5']), 'baader-n3').grupos[0]?.filas[0]?.codigo).toBe('SM5')
  })

  it('estaEnLista: acepta prioritarios y resto; rechaza códigos inexistentes y no-físicos', () => {
    const r = armar(null)
    expect(estaEnLista(r, 'SM5')).toBe(true)
    expect(estaEnLista(r, 'B2')).toBe(true)
    expect(estaEnLista(r, 'B999')).toBe(false)
    expect(estaEnLista(r, null)).toBe(false)
  })
})

describe('PRIORIDAD_A3C', () => {
  it('son 6 módulos y 14 elementos sin repetir', () => {
    expect(PRIORIDAD_A3C).toHaveLength(6)
    const cods = PRIORIDAD_A3C.flatMap(m => m.elementos.map(e => e.codigo))
    expect(cods).toHaveLength(14)
    expect(new Set(cods).size).toBe(14)
    expect(TOTAL_PRIORITARIOS).toBe(14)
    expect(PRIORIDAD_A3C.every(m => m.fuentes.length > 0)).toBe(true)
  })
})
