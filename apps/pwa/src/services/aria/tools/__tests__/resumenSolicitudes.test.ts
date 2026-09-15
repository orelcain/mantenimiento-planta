import { describe, it, expect } from 'vitest'
import { resumenDeSolicitudes } from '../resumenSolicitudes'

// La única solicitud real: AMORTIGUADOR 1421003000 ×2, pedida el 31-05, entregada.
const mayo = {
  codigoSAP: '3300054757',
  textoBreve: 'AMORTIGUADOR 1421003000',
  cantidad: 2,
  estado: 'entregada',
  solicitadoPorNombre: 'Danilo',
  createdAt: new Date('2026-05-31T23:43:25Z'),
}

describe('resumenDeSolicitudes', () => {
  it('el caso real: 1 entregada, NINGUNA abierta — ARIA inventó 7 «pendientes»', () => {
    const r = resumenDeSolicitudes([mayo])
    expect(r).toContain('Registradas: 1 — pendientes de aprobar: 0, aprobadas por entregar: 0, entregadas: 1.')
    expect(r).toContain('Abiertas: ninguna')
    expect(r).toContain('AMORTIGUADOR 1421003000 ×2')
  })

  it('le dice a ARIA que el módulo existe y que el catálogo no es la fuente', () => {
    const r = resumenDeSolicitudes([])
    expect(r).toContain('No hay ninguna solicitud registrada.')
    expect(r).toMatch(/NO digas que el módulo no existe/)
    expect(r).toMatch(/NO busques «pendiente» en el catálogo/)
  })

  it('las abiertas van primero, con quién aprobó', () => {
    const r = resumenDeSolicitudes([
      mayo,
      { ...mayo, textoBreve: 'CILINDRO CRHD-32-85', codigoSAP: '3300138386', estado: 'pendiente', cantidad: 1 },
      { ...mayo, textoBreve: 'ABRAZADERA 34752009', codigoSAP: '3300120607', estado: 'aprobada', aprobadaPor: 'Orel', aprobadaAt: new Date('2026-09-15T12:00:00Z') },
    ])
    expect(r).toContain('pendientes de aprobar: 1, aprobadas por entregar: 1, entregadas: 1')
    expect(r.indexOf('CILINDRO')).toBeLessThan(r.indexOf('Últimas entregadas'))
    expect(r).toContain('aprobada por Orel el 15-09')
  })
})
