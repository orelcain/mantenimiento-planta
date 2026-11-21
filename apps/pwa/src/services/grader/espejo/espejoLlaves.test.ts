import { describe, it, expect } from 'vitest'
import { aBase64Url, esHashValido, esLlaveValida, generarLlave, limpiarNombre, sha256Hex } from './espejoLlavesLogica'

describe('llave del lector', () => {
  it('son 43 caracteres base64url y el hash es sha256 hex de 64', async () => {
    const { llave, hash } = await generarLlave()
    expect(llave).toHaveLength(43)
    expect(esLlaveValida(llave)).toBe(true)
    expect(llave).not.toMatch(/[+/=]/)
    expect(esHashValido(hash)).toBe(true)
    expect(hash).toBe(await sha256Hex(llave))
  })

  it('cada llave es distinta', async () => {
    const a = await generarLlave()
    const b = await generarLlave()
    expect(a.llave).not.toBe(b.llave)
    expect(a.hash).not.toBe(b.hash)
  })

  it('sha256 de «abc» coincide con el vector conocido', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('base64url sin relleno ni + /', () => {
    expect(aBase64Url(new Uint8Array([251, 255, 254]))).toBe('-__-')
    expect(esLlaveValida('corta')).toBe(false)
    expect(esLlaveValida('a'.repeat(42) + '=')).toBe(false)
  })

  it('limpia el nombre', () => {
    expect(limpiarNombre('  PC   Matrix ')).toBe('PC Matrix')
    expect(limpiarNombre('x'.repeat(100))).toHaveLength(60)
  })
})
