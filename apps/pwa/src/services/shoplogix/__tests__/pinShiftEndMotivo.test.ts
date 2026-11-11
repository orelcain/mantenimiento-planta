/**
 * El motivo de la perilla (`setMonitorPerilla` y `normMotivoPerilla`): se recorta a 60 caracteres, vacío es «sin motivo» y queda
 * en la perilla y en su entrada del historial. La clave se escribe siempre, aunque esté vacía: el guardado va con `merge`, y una
 * clave que no se escribe dejaría el motivo de la anotación anterior.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}))

vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('@/services/firestoreTracked', () => ({
  doc: (...args: unknown[]) => ({ path: `${String(args[1])}/${String(args[2])}` }),
  getDoc: (...args: unknown[]) => mocks.getDoc(...args),
  setDoc: (...args: unknown[]) => mocks.setDoc(...args),
  serverTimestamp: () => 'TS',
}))

import { normMotivoPerilla, setMonitorPerilla } from '../pinShiftEnd'

beforeEach(() => {
  mocks.getDoc.mockReset()
  mocks.setDoc.mockReset()
  mocks.getDoc.mockResolvedValue({ data: () => ({ monitorPerillasHistorial: [] }) })
  mocks.setDoc.mockResolvedValue(undefined)
})

/** Lo que se escribió en el documento de la línea: la llamada a setDoc (referencia, datos, opciones). */
function escrito() {
  const [ref, datos, opciones] = mocks.setDoc.mock.calls[0]!
  return { ref, datos, opciones }
}

describe('normMotivoPerilla', () => {
  it('vacío, solo espacios o no texto dan cadena vacía: sin motivo', () => {
    expect(normMotivoPerilla('')).toBe('')
    expect(normMotivoPerilla('   ')).toBe('')
    expect(normMotivoPerilla(null)).toBe('')
    expect(normMotivoPerilla(undefined)).toBe('')
  })

  it('recorta los espacios de los extremos y conserva los acentos', () => {
    expect(normMotivoPerilla('  por el Knuro  ')).toBe('por el Knuro')
    expect(normMotivoPerilla('cambio de lote, ñandú')).toBe('cambio de lote, ñandú')
  })

  it('tope de 60 caracteres, contando caracteres y no unidades de código', () => {
    expect(normMotivoPerilla('a'.repeat(80))).toBe('a'.repeat(60))
    expect(Array.from(normMotivoPerilla('😀'.repeat(61)))).toHaveLength(60)
  })
})

describe('setMonitorPerilla guarda el motivo', () => {
  it('en la perilla de la máquina y en su entrada del historial, recortado', async () => {
    await setMonitorPerilla({ plantSlug: 'chonchi', machineId: 'ev1', cpm: 17, por: 'orel@test', motivo: '  por el Knuro ' })
    const { ref, datos, opciones } = escrito()
    expect(ref).toEqual({ path: 'graderModuleConfigs/global' })
    expect(opciones).toEqual({ merge: true })
    expect(datos.monitorPerillas.ev1).toMatchObject({ cpm: 17, por: 'orel@test', motivo: 'por el Knuro' })
    expect(datos.monitorPerillasHistorial.slice(-1)[0]).toMatchObject({ machineId: 'ev1', cpm: 17, motivo: 'por el Knuro' })
  })

  it('sin motivo escribe la clave vacía en la perilla y en el historial, para que el merge no deje el motivo anterior', async () => {
    await setMonitorPerilla({ plantSlug: 'chonchi', machineId: 'ev1', cpm: 17, por: 'orel@test' })
    const { datos } = escrito()
    expect(datos.monitorPerillas.ev1).toHaveProperty('motivo', '')
    expect(datos.monitorPerillasHistorial.slice(-1)[0]).toHaveProperty('motivo', '')
  })
})
