import { describe, it, expect } from 'vitest'
import { origenDeFoto } from '../origenFoto'

const BASE = 'https://firebasestorage.googleapis.com/v0/b/mantenimiento-planta-771a3.firebasestorage.app/o/'

describe('origenDeFoto', () => {
  it('detecta bodega por la carpeta fotos (ruta codificada)', () => {
    expect(origenDeFoto(`${BASE}repuestos%2FnIjUKAay3odasttyZ0yj%2F3300070160%2Ffotos%2Fbe5f.webp?alt=media&token=abc`)).toBe('bodega')
  })
  it('detecta manual por la carpeta manual (ruta codificada)', () => {
    expect(origenDeFoto(`${BASE}repuestos%2FnIjUKAay3odasttyZ0yj%2F3300070160%2Fmanual%2Ffc4b.jpg?alt=media&token=abc`)).toBe('manual')
  })
  it('acepta rutas sin codificar', () => {
    expect(origenDeFoto('https://x.test/repuestos/a/b/fotos/c.webp')).toBe('bodega')
    expect(origenDeFoto('https://x.test/repuestos/a/b/manual/c.jpg')).toBe('manual')
  })
  it('lo demas es otra', () => {
    expect(origenDeFoto('https://x.test/otra/cosa.jpg')).toBe('otra')
    expect(origenDeFoto('')).toBe('otra')
  })
  it('no confunde un token con la ruta', () => {
    expect(origenDeFoto(`${BASE}x%2Fy.jpg?alt=media&token=%2Ffotos%2F`)).toBe('otra')
  })
})
