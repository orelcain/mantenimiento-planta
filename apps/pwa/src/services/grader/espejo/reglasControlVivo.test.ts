import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guardarraíl de `graderEspejoControl` (lectura en vivo a pedido, E1.4) en `firestore.rules`. Lee el texto de las
 * reglas, como `reglasAcr.test.ts`: si alguien afloja una cláusula, falla acá y no en planta. Cada cláusula tiene
 * su `it`, así quitar una rompe exactamente un caso (rotura a propósito verificada al escribirlo).
 */
const REGLAS = readFileSync(join(process.cwd(), '..', '..', 'firestore.rules'), 'utf8').replace(/\r\n/g, '\n')

function bloque(marca: string, fin: string): string {
  const i = REGLAS.indexOf(marca)
  if (i < 0) throw new Error(`No se encontró «${marca}» en firestore.rules`)
  return REGLAS.slice(i, REGLAS.indexOf(fin, i))
}

const B = bloque('match /graderEspejoControl/{linea}', '\n    }\n')
const ESCRITURA = B.slice(B.indexOf('allow create, update'), B.indexOf('allow delete'))

describe('firestore.rules · graderEspejoControl (lectura en vivo)', () => {
  it('leer y escribir piden sesión no anónima; nadie borra', () => {
    expect(B).toContain('allow read: if isNotAnonymous();')
    expect(ESCRITURA).toContain('allow create, update: if isNotAnonymous()')
    expect(B).toContain('allow delete: if false;')
  })
  it('el id es una línea corta (minúsculas, dígitos, _ y -)', () => {
    expect(ESCRITURA).toContain("linea.matches('^[a-z0-9_-]{1,40}$')")
  })
  it('solo los 4 campos del pedido', () => {
    expect(ESCRITURA).toContain("request.resource.data.keys().hasOnly(['hasta', 'pedidoPor', 'pedidoNombre', 'pedidoEn'])")
  })
  it('quién lo pidió es quien escribe, y cuándo lo pone el servidor', () => {
    expect(ESCRITURA).toContain('request.resource.data.pedidoPor == request.auth.uid')
    expect(ESCRITURA).toContain('request.resource.data.pedidoEn == request.time')
  })
  it('el nombre es texto de hasta 60', () => {
    expect(ESCRITURA).toContain('request.resource.data.pedidoNombre is string')
    // Con el fin de línea: «<= 600» también contiene «<= 60».
    expect(ESCRITURA).toContain('request.resource.data.pedidoNombre.size() <= 60\n')
  })
  it('hasta es una fecha entre ahora y ahora + 30 min', () => {
    expect(ESCRITURA).toContain('request.resource.data.hasta is timestamp')
    expect(ESCRITURA).toContain('request.resource.data.hasta >= request.time')
    expect(ESCRITURA).toContain("request.resource.data.hasta <= request.time + duration.value(30, 'm');")
  })
})
