/**
 * Caso real, monitor público de Chonchi el 25-08 a las 13:08: faltaban
 * 10.580 pz y 33 min de producción, así que el ritmo requerido daba
 * **320,7 pz/min andando**. La línea venía a 24,7 y su techo son 38.
 *
 * La regla lo mostraba como "para la meta 320,7", con la marca del objetivo
 * clavada en el extremo derecho — mientras tres líneas más arriba la misma
 * pantalla decía "Ya no da el tiempo: faltan 10.580 pz y quedan 41 min".
 */
import { describe, it, expect } from 'vitest'
import { pedidoFueraDeAlcance, pedidoAndando } from '../monitorRitmo'

describe('pedidoFueraDeAlcance', () => {
  it('el caso del 25-08: 320,7 pedidos contra un techo de 38', () => {
    expect(pedidoFueraDeAlcance(320.7, 38)).toBe(true)
  })

  it('un pedido exigente pero posible NO se descarta', () => {
    expect(pedidoFueraDeAlcance(34, 38)).toBe(false)
    expect(pedidoFueraDeAlcance(38, 38)).toBe(false)
  })

  it('sin techo conocido no se afirma nada', () => {
    expect(pedidoFueraDeAlcance(320.7, null)).toBe(false)
    expect(pedidoFueraDeAlcance(320.7, 0)).toBe(false)
  })

  it('sin pedido tampoco', () => {
    expect(pedidoFueraDeAlcance(null, 38)).toBe(false)
    expect(pedidoFueraDeAlcance(0, 38)).toBe(false)
  })

  it('el pedido se dispara justo cuando se acaba el turno', () => {
    // Mismo requerido de reloj, pero la línea produce el 55 % del tiempo.
    const holgado = pedidoAndando(14, 240, 300)
    const apretado = pedidoAndando(176, 240, 300)
    expect(holgado).toBeCloseTo(17.5, 1)
    expect(pedidoFueraDeAlcance(holgado, 38)).toBe(false)
    expect(pedidoFueraDeAlcance(apretado, 38)).toBe(true)
  })
})
