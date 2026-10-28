/**
 * Cambiar de línea desde la barra lateral, el selector del Duelo o `CambioDeLinea` dejaba al usuario en la
 * pestaña «El turno» aunque estuviera en Análisis o Duelo. La ruta nueva conserva `ver` y `glass`.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/services/shoplogix/publicShiftMonitor.service', () => ({ createPublicShiftMonitor: vi.fn() }))
vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('@/services/firestoreTracked', () => ({}))

import { rutaMonitorConservandoVista } from '../monitorDeLinea'

describe('rutaMonitorConservandoVista', () => {
  it('conserva la pestaña de análisis y la piel', () => {
    expect(rutaMonitorConservandoVista('tk2', '?glass=v2&ver=analisis')).toBe('/monitor/tk2?glass=v2&ver=analisis')
  })
  it('conserva el duelo', () => {
    expect(rutaMonitorConservandoVista('tk2', new URLSearchParams('ver=duelo&glass=v2'))).toBe('/monitor/tk2?glass=v2&ver=duelo')
  })
  it('en «El turno» no hay ver, y glass cae a v2', () => {
    expect(rutaMonitorConservandoVista('tk2', '')).toBe('/monitor/tk2?glass=v2')
  })
  it('no arrastra turno, pantalla ni un ver desconocido', () => {
    expect(rutaMonitorConservandoVista('tk2', '?turno=abc&pantalla=1&ver=otra&glass=v2')).toBe('/monitor/tk2?glass=v2')
  })
})
