/**
 * Carpeta de Matrix: botones «Revisar ahora» y «Cambiar carpeta», subcarpetas y
 * el aviso de otros tipos (Puerta 0). Lógica sin DOM: los handles y el store de
 * IndexedDB son falsos.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  leerHandle: vi.fn(),
  guardarHandle: vi.fn(),
  limpiarAvisos: vi.fn(),
}))
const carga = vi.hoisted(() => ({ revisarCarpeta: vi.fn() }))

vi.mock('../carpetaMatrixStore', () => ({ carpetaMatrixStore: store }))
vi.mock('../carpetaMatrixCarga', () => carga)
vi.mock('@/store', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'u1', nombre: 'Ana', apellido: 'Paz', email: 'a@x.cl' } }) },
}))

import { useCarpetaMatrixEstado } from '@/store/carpetaMatrixEstado'
import { elegirCarpetaMatrix, revisarAhoraCarpetaMatrix } from '../carpetaMatrixAcciones'
import {
  CM_MAX_PROFUNDIDAD,
  OPCIONES_LISTADO_CARPETA,
  ultimoOtroTrasLote,
  ultimoTrasResultado,
  type CortadoInfo,
  type UltimoResultado,
} from '../carpetaMatrix'
import { listarExcelsEnCarpeta, type ArchivoHandle, type CarpetaHandle } from '../diagnosticoMatrix'
import type { HandleCarpeta } from '../carpetaMatrixStore'

// ---------- handles falsos ----------
function archivo(nombre: string, modificado = 1): ArchivoHandle {
  return { kind: 'file', name: nombre, getFile: async () => ({ size: 10, lastModified: modificado }) as unknown as File }
}
function carpeta(nombre: string, hijos: Array<ArchivoHandle | CarpetaHandle>): CarpetaHandle {
  return {
    kind: 'directory',
    name: nombre,
    values: async function* () {
      for (const h of hijos) yield h
    },
  }
}
function handleCarpeta(nombre: string): HandleCarpeta {
  return {
    kind: 'directory',
    name: nombre,
    values: async function* () {},
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
  }
}
const rutas = (r: { archivos: { ruta: string }[] }) => r.archivos.map((a) => a.ruta).sort()

describe('listado de la carga automática: subcarpetas', () => {
  it('incluye un archivo a profundidad 3 y deja fuera el de profundidad 4', async () => {
    const raiz = carpeta('Matrix', [
      carpeta('1-11-26 al 15-11-26', [
        archivo('Pieza pieza Grader a.xlsx'),
        carpeta('n2', [carpeta('n3', [archivo('tres.xlsx'), carpeta('n4', [archivo('cuatro.xlsx')])])]),
      ]),
    ])
    const r = await listarExcelsEnCarpeta(raiz, OPCIONES_LISTADO_CARPETA)
    expect(CM_MAX_PROFUNDIDAD).toBe(3)
    expect(rutas(r)).toEqual([
      '1-11-26 al 15-11-26/Pieza pieza Grader a.xlsx',
      '1-11-26 al 15-11-26/n2/n3/tres.xlsx',
    ])
  })

  it('el tope de 500 cuenta archivos y carpetas de todos los niveles: pasarse es «demasiados»', async () => {
    const enSub = Array.from({ length: 300 }, (_, i) => archivo(`s${i}.xlsx`))
    const enRaiz = Array.from({ length: 300 }, (_, i) => archivo(`r${i}.xlsx`))
    const r = await listarExcelsEnCarpeta(carpeta('Matrix', [carpeta('sub', enSub), ...enRaiz]), OPCIONES_LISTADO_CARPETA)
    expect(r.truncado).toBe(true)
    expect(r.totalEntradas).toBe(500)
  })

  it('exactamente 500 entradas (la carpeta incluida) no es truncado', async () => {
    const enSub = Array.from({ length: 499 }, (_, i) => archivo(`s${i}.xlsx`))
    const r = await listarExcelsEnCarpeta(carpeta('Matrix', [carpeta('sub', enSub)]), OPCIONES_LISTADO_CARPETA)
    expect(r.truncado).toBe(false)
    expect(r.totalEntradas).toBe(500)
  })

  it('ignora los temporales de Excel (~$) y no los cuenta en el tope', async () => {
    const raiz = carpeta('Matrix', [archivo('~$Pieza pieza.xlsx'), archivo('Pieza pieza.xlsx'), carpeta('q', [archivo('~$otro.xlsx')])])
    const r = await listarExcelsEnCarpeta(raiz, OPCIONES_LISTADO_CARPETA)
    expect(rutas(r)).toEqual(['Pieza pieza.xlsx'])
    expect(r.totalEntradas).toBe(2)
  })
})

describe('«Revisar ahora» y «Cambiar carpeta»', () => {
  const resultadoVacio = {
    ultimo: null,
    cortado: null,
    ultimoOtro: null,
    ultimoPiezaAPieza: null,
    alDia: true,
    demasiados: false,
    errorReciente: false,
    errorTexto: null,
  }
  const cortadoViejo: CortadoInfo = { archivo: 'viejo.xlsx', registros: 10_000, modificado: 5, detectadoEn: 6 }

  beforeEach(() => {
    vi.clearAllMocks()
    store.guardarHandle.mockResolvedValue(undefined)
    store.limpiarAvisos.mockResolvedValue(undefined)
    carga.revisarCarpeta.mockResolvedValue(resultadoVacio)
    useCarpetaMatrixEstado.setState({
      estado: 'cortado',
      nombreCarpeta: 'Vieja',
      cortado: cortadoViejo,
      ultimo: { tipo: 'omitido', archivo: 'x.xlsx', detectadoEn: 1 },
      ultimoOtro: null,
      revisando: false,
      errorTexto: null,
    })
  })

  it('con una revisión en curso, «Revisar ahora» no lanza una segunda', async () => {
    store.leerHandle.mockResolvedValue(handleCarpeta('Matrix'))
    let terminar: (v: typeof resultadoVacio) => void = () => {}
    carga.revisarCarpeta.mockReturnValue(new Promise((res) => (terminar = res)))
    const a = revisarAhoraCarpetaMatrix()
    const b = revisarAhoraCarpetaMatrix()
    await new Promise((r) => setTimeout(r, 0))
    expect(carga.revisarCarpeta).toHaveBeenCalledTimes(1)
    expect(useCarpetaMatrixEstado.getState().revisando).toBe(true)
    terminar(resultadoVacio)
    await Promise.all([a, b])
    expect(carga.revisarCarpeta).toHaveBeenCalledTimes(1)
    expect(useCarpetaMatrixEstado.getState().revisando).toBe(false)
  })

  it('cambiar de carpeta reemplaza el handle, limpia el «cortado» anterior y revisa de inmediato', async () => {
    const nueva = handleCarpeta('Nueva')
    ;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = vi.fn().mockResolvedValue(nueva)
    await elegirCarpetaMatrix()
    expect(store.guardarHandle).toHaveBeenCalledWith(nueva)
    expect(store.limpiarAvisos).toHaveBeenCalledTimes(1)
    expect(carga.revisarCarpeta).toHaveBeenCalledTimes(1)
    expect(carga.revisarCarpeta.mock.calls[0]![0]).toBe(nueva)
    const s = useCarpetaMatrixEstado.getState()
    expect(s.cortado).toBeNull()
    expect(s.nombreCarpeta).toBe('Nueva')
    expect(s.estado).not.toBe('cortado')
  })

  it('cancelar el selector no cambia nada: ni handle, ni avisos, ni revisión', async () => {
    ;(window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('cancelado'), { name: 'AbortError' }))
    await elegirCarpetaMatrix()
    expect(store.guardarHandle).not.toHaveBeenCalled()
    expect(store.limpiarAvisos).not.toHaveBeenCalled()
    expect(carga.revisarCarpeta).not.toHaveBeenCalled()
    const s = useCarpetaMatrixEstado.getState()
    expect(s.estado).toBe('cortado')
    expect(s.cortado).toEqual(cortadoViejo)
    expect(s.nombreCarpeta).toBe('Vieja')
  })
})

describe('aviso de otros tipos (Puerta 0)', () => {
  const pieza: UltimoResultado = {
    tipo: 'cargado', archivo: 'Pieza pieza Grader.xlsx', tamano: 1, modificado: 100, piezas: 50,
    desde: null, hasta: null, turnoDocId: null, cargadoEn: 200,
  }

  it('un Puerta 0 cargado queda registrado y no tapa ni cambia el Pieza a pieza', () => {
    const lote = [
      { tipoArchivo: 'PIEZA_PIEZA' as const, kind: 'PIEZA_PIEZA' as const, archivo: 'Pieza pieza Grader.xlsx', modificado: 100 },
      { tipoArchivo: 'OTRO' as const, kind: 'PUERTA_0' as const, archivo: 'Puerta 0 Grader.xlsx', modificado: 150 },
    ]
    const otro = ultimoOtroTrasLote(null, lote, 300)
    expect(otro).toEqual({ tipo: 'PUERTA_0', archivo: 'Puerta 0 Grader.xlsx', modificado: 150, cargadoEn: 300 })
    // El «último» del Pieza a pieza solo cambia con un Pieza a pieza.
    expect(ultimoTrasResultado(pieza, 'OTRO', { tipo: 'omitido', archivo: 'p0.xlsx', detectadoEn: 1 })).toBe(pieza)
  })

  it('un lote solo con Pieza a pieza deja igual el último otro; uno más viejo no pisa al más nuevo', () => {
    const previo = { tipo: 'PUERTA_0' as const, archivo: 'p0.xlsx', modificado: 500, cargadoEn: 600 }
    const soloPieza = [{ tipoArchivo: 'PIEZA_PIEZA' as const, kind: 'PIEZA_PIEZA' as const, archivo: 'pp.xlsx', modificado: 900 }]
    expect(ultimoOtroTrasLote(previo, soloPieza, 1000)).toBe(previo)
    const viejo = [{ tipoArchivo: 'OTRO' as const, kind: 'PUERTA_0' as const, archivo: 'p0-viejo.xlsx', modificado: 400 }]
    expect(ultimoOtroTrasLote(previo, viejo, 1000)).toBe(previo)
  })
})
