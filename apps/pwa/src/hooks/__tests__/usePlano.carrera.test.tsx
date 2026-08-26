import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePlano } from '../usePlano'

/**
 * Regresion de un bug REPRODUCIDO EN PRODUCCION: al abrir el despiece con un
 * deep-link `?fig=70-8` teniendo una hoja recordada en localStorage, quedaban
 * dos cargas en vuelo (la recordada y la de la figura) y ganaba **la que
 * resolvia ultima**, no la que el usuario pidio ultima. El tecnico que recibia
 * el link por chat aterrizaba en la hoja equivocada.
 *
 * El test invierte los tiempos a proposito: la hoja pedida PRIMERO responde
 * LENTO y la pedida DESPUES responde rapido. Sin el guard, la lenta pisa.
 */
const INDICE = {
  maquina: 'TEST', plano: 'T-1', hojasTotales: 2,
  hojas: [{ blatt: 1, vb: [100, 100], seccion: 's', fig: '1-1' },
          { blatt: 89, vb: [100, 100], seccion: 's', fig: '70-8' }],
}
const RETRASO: Record<string, number> = { 'hoja-01': 120, 'hoja-89': 0 }

function respuesta(cuerpo: unknown, texto = false) {
  return { ok: true, status: 200, json: async () => cuerpo, text: async () => (texto ? '<svg/>' : '') } as Response
}

describe('usePlano · carrera entre dos hojas pedidas', () => {
  beforeEach(() => {
    vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put: async () => {} }) })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('indice.json')) return respuesta(INDICE)
      const clave = Object.keys(RETRASO).find((k) => u.includes(k))
      if (clave) await new Promise((r) => setTimeout(r, RETRASO[clave]))
      return respuesta({ tags: [], xrefs: [] }, u.endsWith('.svg'))
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('gana la ULTIMA pedida aunque su respuesta llegue primero', async () => {
    // `inicial: 1` = la hoja recordada; equivale al localStorage de produccion.
    const { result } = renderHook(() => usePlano('baader-142-despiece', 1))
    await waitFor(() => expect(result.current.indice).not.toBeNull())
    await result.current.abrir(89) // el deep-link, pedido despues
    await new Promise((r) => setTimeout(r, 300)) // margen para que llegue la lenta
    expect(result.current.hoja?.blatt).toBe(89)
  })
})
