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

  it('con nombre común del catálogo: común primero y el SAP entre paréntesis', () => {
    const r = resumenDeSolicitudes([{ ...mayo, estado: 'pendiente', textoBreve: 'Cuchillo 94011760', nombresComunes: ['cuchillo circular baader 200'] }])
    expect(r).toContain('Cuchillo circular baader 200 (SAP: Cuchillo 94011760) ×2')
  })

  describe('altas de código (aparte de los pedidos)', () => {
    const alta = {
      tipo: 'alta_codigo', codigoSAP: '', textoBreve: 'Relé en miniatura 24V DC', cantidad: 1, estado: 'pendiente',
      solicitadoPorNombre: 'Danilo', createdAt: new Date('2026-10-08T17:20:00Z'),
      codigoFabricante: '42203183', elementos: ['K20', 'K22'],
    }

    it('no se mezclan con los pedidos: los conteos de pedidos no cambian', () => {
      const sin = resumenDeSolicitudes([mayo])
      const con = resumenDeSolicitudes([mayo, alta, { ...alta, estado: 'creada', sapCreado: '3300112345', codigoFabricante: '42203999' }])
      expect(con).toContain('Registradas: 1 — pendientes de aprobar: 0, aprobadas por entregar: 0, entregadas: 1.')
      expect(con.startsWith(sin)).toBe(true)
      expect(con).not.toContain('[pendiente] Relé')
    })

    it('un bloque aparte las cuenta por estado y dice qué código y qué elementos', () => {
      const r = resumenDeSolicitudes([
        alta,
        { ...alta, estado: 'creada', sapCreado: '3300112345', codigoFabricante: '42203999' },
        { ...alta, estado: 'rechazada', motivoRechazo: 'Falta foto', codigoFabricante: '42203998' },
      ])
      expect(r).toContain('ALTAS DE CÓDIGO')
      expect(r).toContain('no se aprueban ni se entregan')
      expect(r).toContain('Registradas: 3 — pendientes en bodega: 1, creadas: 1, rechazadas: 1.')
      expect(r).toContain('código de fabricante 42203183')
      expect(r).toContain('(elementos K20, K22)')
      expect(r).toContain('SAP 3300112345')
      expect(r).toContain('motivo: Falta foto')
    })

    it('muestra las 8 altas MÁS RECIENTES aunque lleguen desordenadas (la consulta no ordena)', () => {
      const dia = (n: number) => new Date(Date.UTC(2026, 9, n, 15))
      // llegan de la más vieja a la más nueva: 10 altas, días 1..10
      const altas = Array.from({ length: 10 }, (_, i) => ({ ...alta, codigoFabricante: `COD${i + 1}`, createdAt: dia(i + 1) }))
      const r = resumenDeSolicitudes(altas)
      expect(r).toContain('COD10')
      expect(r).toContain('COD3')
      expect(r).not.toContain('COD2 ')
      expect(r).not.toContain('COD1 ')
      expect(r.indexOf('COD10')).toBeLessThan(r.indexOf('COD9'))
      expect(r).toContain('Registradas: 10')
    })

    it('solo altas: los pedidos dicen que no hay ninguno', () => {
      const r = resumenDeSolicitudes([alta])
      expect(r).toContain('No hay ninguna solicitud registrada.')
      expect(r).toContain('ALTAS DE CÓDIGO')
    })
  })
})
