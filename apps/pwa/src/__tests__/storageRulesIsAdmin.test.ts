import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * En Storage, `isAdmin()` (lee Firestore cross-service) DENIEGA SIEMPRE en producción: al agente
 * de Rules le falta el rol IAM (ver el comentario de /models3d en storage.rules). Mordió tres
 * veces: models3d (05-08-2026), maps y documentosEquipos (16-10-2026, un admin con 403).
 * Este test impide sumar un cuarto. Para restringir a admin: la ruta de la app + Firestore.
 */
const CONOCIDOS = ['/maps/{locationId}/{fileName}'] // roto desde antes; documentado, sin uso hoy

describe('storage.rules', () => {
  it('no usa isAdmin() en reglas nuevas', () => {
    const reglas = readFileSync(resolve(__dirname, '../../../../storage.rules'), 'utf-8')
    const usos: string[] = []
    let match = ''
    for (const linea of reglas.split('\n')) {
      const m = linea.match(/^\s*match\s+(\S+)\s*\{/)
      if (m) match = m[1]!
      if (/allow\b.*isAdmin\(\)/.test(linea) && !linea.trim().startsWith('//')) usos.push(match)
    }
    expect(usos.filter((u) => !CONOCIDOS.includes(u))).toEqual([])
  })
})
