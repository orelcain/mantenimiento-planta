import { describe, expect, it } from 'vitest'
import {
  encolarBorrado,
  leerBorradosPendientes,
  purgarBorradosPendientes,
  quitarBorrado,
  type AlmacenSimple,
} from '../borradosPendientes'

/** localStorage de mentira: la cola tiene que funcionar sin navegador. */
function almacenFalso(inicial: Record<string, string> = {}): AlmacenSimple & { datos: Record<string, string> } {
  const datos = { ...inicial }
  return {
    datos,
    getItem: (k) => datos[k] ?? null,
    setItem: (k, v) => {
      datos[k] = v
    },
  }
}

const A = 'bitacora/2026-09-15_tarde/e1/a.jpg'
const B = 'bitacora/2026-09-15_tarde/e1/b.jpg'

describe('cola de fotos por borrar', () => {
  it('anota sin duplicar y deja quitar', () => {
    const al = almacenFalso()
    encolarBorrado(A, al)
    encolarBorrado(A, al)
    encolarBorrado(B, al)
    expect(leerBorradosPendientes(al)).toEqual([A, B])
    quitarBorrado(A, al)
    expect(leerBorradosPendientes(al)).toEqual([B])
  })

  it('lo que vuelve a fallar SIGUE en la cola (la señal de planta se cae de nuevo)', async () => {
    const al = almacenFalso()
    encolarBorrado(A, al)
    encolarBorrado(B, al)
    const r = await purgarBorradosPendientes(async (p) => {
      if (p === B) throw new Error('sin señal')
    }, al)
    expect(r).toEqual({ borradas: 1, pendientes: 1 })
    expect(leerBorradosPendientes(al)).toEqual([B])
    // Al volver la señal se vacía sola.
    expect(await purgarBorradosPendientes(async () => undefined, al)).toEqual({ borradas: 1, pendientes: 0 })
    expect(leerBorradosPendientes(al)).toEqual([])
  })

  it('aguanta un almacenamiento roto o con basura', () => {
    expect(leerBorradosPendientes(null)).toEqual([])
    expect(leerBorradosPendientes(almacenFalso({ 'bitacora.fotosPorBorrar': 'no es json' }))).toEqual([])
    expect(leerBorradosPendientes(almacenFalso({ 'bitacora.fotosPorBorrar': '[1,"x",null]' }))).toEqual(['x'])
  })
})
