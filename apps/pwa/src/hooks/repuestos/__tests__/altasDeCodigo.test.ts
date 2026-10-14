/**
 * Altas de código en `solicitudes_repuestos`: lo que se escribe al pedir, registrar el SAP, rechazar y
 * reabrir, y cómo se lee un doc (pedido normal vs alta). Firestore va simulado: se prueba el CONTENIDO de
 * cada escritura, que es lo que firestore.rules valida (scripts/reglas/solicitudesAlta.test.mjs).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const f = vi.hoisted(() => ({
  existe: false,
  datosExistentes: {} as Record<string, unknown>,
  set: vi.fn(),
  updateDoc: vi.fn(async () => {}),
  registrar: vi.fn(async () => ({ plan: 'crear', id: '3300112345' })),
}))

vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  addDoc: vi.fn(),
  updateDoc: (...a: unknown[]) => f.updateDoc(...(a as [])),
  onSnapshot: () => () => {},
  query: () => ({}),
  orderBy: () => ({}),
  where: () => ({}),
  deleteField: () => 'DELETE',
  serverTimestamp: () => 'TS',
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      get: async () => ({ exists: () => f.existe, id: 'alta_42203183', data: () => f.datosExistentes }),
      set: f.set,
    }),
  Timestamp: class {},
}))
vi.mock('@/services/repuestos/asignarSapMaestro', async () => {
  const real = await vi.importActual<typeof import('@/services/repuestos/asignarSapMaestro')>('@/services/repuestos/asignarSapMaestro')
  return { ...real, registrarAltaConMaestro: f.registrar }
})

import { crearAltaCodigo, docASolicitud, esAlta, rechazarAlta, reabrirAlta, registrarAltaCreada, type NuevaAlta } from '../useSolicitudes'

const nueva = (): NuevaAlta => ({
  tipo: 'alta_codigo', codigoFabricante: '42203183', codigoNorm: '42203183', textoBreve: 'Relé en miniatura 24V DC', fuentes: ['499 catálogo'], nivel: 'pieza',
  confianza: 'catalogo', planoSlug: 'baader-142-888', maquina: 'N2', elemento: 'K20', elementos: ['K20', 'K22'], cantidad: 1,
})

beforeEach(() => {
  f.existe = false
  f.datosExistentes = {}
  f.set.mockClear()
  f.updateDoc.mockClear()
  f.registrar.mockClear()
  f.registrar.mockResolvedValue({ plan: 'crear', id: '3300112345' })
})

describe('crearAltaCodigo', () => {
  it('crea alta_<código> en transacción con lo que firestore.rules exige y sin undefined', async () => {
    const r = await crearAltaCodigo('alta_42203183', nueva(), 2, 'u1', 'Danilo')
    expect(r).toEqual({ resultado: 'creada' })
    expect(f.set).toHaveBeenCalledTimes(1)
    const [ref, payload] = f.set.mock.calls[0] as unknown as [{ path: string }, Record<string, unknown>]
    expect(ref.path).toBe('solicitudes_repuestos/alta_42203183')
    expect(payload).toMatchObject({
      tipo: 'alta_codigo', codigoSAP: '', estado: 'pendiente', cantidad: 2, solicitadoPor: 'u1', solicitadoPorNombre: 'Danilo',
      createdAt: 'TS', elementos: ['K20', 'K22'], codigoFabricante: '42203183',
    })
    expect(Object.values(payload).some(v => v === undefined)).toBe(false)
    expect('observaciones' in payload).toBe(false)
  })

  it('acota la cantidad a 1–999 (entero) y recorta la nota', async () => {
    await crearAltaCodigo('alta_42203183', { ...nueva(), observaciones: '  nota  ' }, 5000, 'u1', 'D')
    expect((f.set.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1]).toMatchObject({ cantidad: 999, observaciones: 'nota' })
    f.set.mockClear()
    await crearAltaCodigo('alta_42203183', nueva(), 0.2, 'u1', 'D')
    expect((f.set.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1]).toMatchObject({ cantidad: 1 })
  })

  it('si ya existe (pendiente, creada o rechazada) NO la pisa y devuelve la existente', async () => {
    for (const estado of ['pendiente', 'creada', 'rechazada']) {
      f.existe = true
      f.datosExistentes = { tipo: 'alta_codigo', estado, codigoFabricante: '42203183', cantidad: 1 }
      const r = await crearAltaCodigo('alta_42203183', nueva(), 1, 'u9', 'Otro')
      expect(r.resultado).toBe('existente')
      expect(r.resultado === 'existente' && r.alta.estado).toBe(estado)
    }
    expect(f.set).not.toHaveBeenCalled()
  })
})

describe('registrarAltaCreada', () => {
  // La escritura de maestro + alta es UNA transacción en `registrarAltaConMaestro` (ver registrarAltaConMaestro.test.ts).
  const alta = { id: 'alta_42203183' }

  it('delega en la transacción con el id del alta, el SAP, el origen y quién', async () => {
    const r = await registrarAltaCreada(alta, ' 3300112345 ', 'nuevo', 'u1', 'Pedro')
    expect(r).toEqual({ plan: 'crear', id: '3300112345' })
    expect(f.registrar).toHaveBeenCalledWith({ altaId: 'alta_42203183', sap: ' 3300112345 ', origen: 'nuevo', userId: 'u1', userName: 'Pedro' })
  })

  it('«ya existía» viaja tal cual', async () => {
    await registrarAltaCreada(alta, '3300112345', 'ya_existia', 'u1', 'Pedro')
    expect(f.registrar).toHaveBeenCalledWith(expect.objectContaining({ origen: 'ya_existia' }))
  })

  it('los errores de la transacción llegan intactos y la hook no escribe por su cuenta', async () => {
    f.registrar.mockRejectedValueOnce(new Error('alta-no-pendiente'))
    await expect(registrarAltaCreada(alta, '3300112345', 'nuevo', 'u1', 'P')).rejects.toThrow('alta-no-pendiente')
    expect(f.updateDoc).not.toHaveBeenCalled()
  })
})

describe('rechazarAlta', () => {
  it('escribe el motivo y quién rechazó', async () => {
    await rechazarAlta('alta_42203183', '  Falta foto de la etiqueta ', 'u1', 'Pedro')
    expect((f.updateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1]).toEqual({
      estado: 'rechazada', motivoRechazo: 'Falta foto de la etiqueta', rechazadaPor: 'u1', rechazadaPorNombre: 'Pedro', rechazadaAt: 'TS',
    })
  })
  it('sin motivo no escribe; el motivo se corta a 300', async () => {
    await expect(rechazarAlta('alta_1', '   ', 'u1', 'P')).rejects.toThrow('obligatorio')
    expect(f.updateDoc).not.toHaveBeenCalled()
    await rechazarAlta('alta_1', 'x'.repeat(400), 'u1', 'P')
    expect(((f.updateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1].motivoRechazo as string).length).toBe(300)
  })
})

describe('reabrirAlta («Volver a solicitar»)', () => {
  it('vuelve a pendiente con quien la pide ahora y borra el rechazo anterior', async () => {
    await reabrirAlta('alta_42203183', { cantidad: 3, observaciones: ' Con foto ', fotoUrl: 'https://f' }, 'u2', 'Ana')
    expect((f.updateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1]).toEqual({
      estado: 'pendiente', solicitadoPor: 'u2', solicitadoPorNombre: 'Ana', cantidad: 3, observaciones: 'Con foto', fotoUrl: 'https://f',
      createdAt: 'TS', motivoRechazo: 'DELETE', rechazadaPor: 'DELETE', rechazadaPorNombre: 'DELETE', rechazadaAt: 'DELETE',
    })
  })
  it('sin nota ni foto las borra en vez de dejar undefined', async () => {
    await reabrirAlta('alta_42203183', { cantidad: 1 }, 'u2', 'Ana')
    const data = (f.updateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1]
    expect(data).toMatchObject({ observaciones: 'DELETE', fotoUrl: 'DELETE' })
    expect(Object.values(data).some(v => v === undefined)).toBe(false)
  })
})

describe('docASolicitud', () => {
  it('un pedido normal (sin tipo) se lee como siempre', () => {
    const s = docASolicitud('s1', { codigoSAP: '3300054757', textoBreve: 'AMORTIGUADOR', cantidad: 2, estado: 'entregada', solicitadoPor: 'u1', solicitadoPorNombre: 'Danilo', entregadaPor: 'Pedro' })
    expect(esAlta(s)).toBe(false)
    expect(s).toMatchObject({ id: 's1', estado: 'entregada', cantidad: 2, entregadaPor: 'Pedro' })
  })
  it('un alta se lee con su ciclo propio y los campos de resolución', () => {
    const s = docASolicitud('alta_42203183', {
      tipo: 'alta_codigo', codigoFabricante: '42203183', codigoNorm: '42203183', textoBreve: 'Relé', cantidad: 1, estado: 'creada', nivel: 'conjunto', elementos: ['K20', 7, 'K22'],
      sapCreado: '3300112345', origenSap: 'ya_existia', creadaPorNombre: 'Pedro',
    })
    expect(esAlta(s)).toBe(true)
    expect(s).toMatchObject({ codigoNorm: '42203183', estado: 'creada', nivel: 'conjunto', elementos: ['K20', 'K22'], sapCreado: '3300112345', origenSap: 'ya_existia', creadaPorNombre: 'Pedro' })
  })
  it('un estado desconocido de alta cuenta como pendiente', () => {
    expect(docASolicitud('a', { tipo: 'alta_codigo', estado: 'aprobada' }).estado).toBe('pendiente')
  })
})
