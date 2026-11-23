import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guardarraíl de `graderEspejoPedidoP0` («Actualizar causas P0», e1.10) en `firestore.rules`: si alguien afloja una
 * cláusula, falla acá y no en planta. Mismo método que `reglasControlVivo.test.ts`.
 */
const REGLAS = readFileSync(join(process.cwd(), '..', '..', 'firestore.rules'), 'utf8').replace(/\r\n/g, '\n')
const i = REGLAS.indexOf('match /graderEspejoPedidoP0/{linea}')
const B = REGLAS.slice(i, REGLAS.indexOf('\n    }\n', i))
const ESCRITURA = B.slice(B.indexOf('allow create, update'), B.indexOf('allow delete'))

describe('firestore.rules · graderEspejoPedidoP0', () => {
  it('existe; leer y escribir piden sesión no anónima; nadie borra', () => {
    expect(i).toBeGreaterThan(0)
    expect(B).toContain('allow read: if isNotAnonymous();')
    expect(ESCRITURA).toContain('allow create, update: if isNotAnonymous()')
    expect(B).toContain('allow delete: if false;')
  })
  it('id de línea corto y solo los 3 campos del pedido', () => {
    expect(ESCRITURA).toContain("linea.matches('^[a-z0-9_-]{1,40}$')")
    expect(ESCRITURA).toContain("request.resource.data.keys().hasOnly(['pedidoPor', 'pedidoNombre', 'pedidoEn'])")
  })
  it('quién lo pidió es quien escribe, y cuándo lo pone el servidor', () => {
    expect(ESCRITURA).toContain('request.resource.data.pedidoPor == request.auth.uid')
    expect(ESCRITURA).toContain('request.resource.data.pedidoEn == request.time')
    expect(ESCRITURA).toContain('request.resource.data.pedidoNombre.size() <= 60')
  })
  it('como mucho un pedido por minuto', () => {
    expect(ESCRITURA).toContain("(resource == null || request.time > resource.data.pedidoEn + duration.value(1, 'm'))")
  })
})
