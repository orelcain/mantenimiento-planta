/**
 * Guard de CI del puente eléctrico→pieza (BAADER 142).
 *
 * La versión profunda (anclas OCR, figuras, Storage) vive en
 * scripts/planos/auditar_despiece_142.py y corre local tras regenerar datos;
 * este guard valida en cada PR lo que SÍ viaja en el repo: que partes.json
 * sea consistente consigo mismo y con los índices de los planos eléctricos.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PUB = join(__dirname, '..', '..', '..', 'public', 'planos')

type Entrada = {
  nr: string
  es: string
  fig: string
  hoja: number
  pos: string
  confianza: string
  sap?: string
}

function cargar(slug: string) {
  const partes = JSON.parse(readFileSync(join(PUB, slug, 'partes.json'), 'utf8')) as {
    despiece: string
    aparatos: Record<string, Entrada[]>
  }
  const indice = JSON.parse(readFileSync(join(PUB, slug, 'indice.json'), 'utf8')) as {
    indice: Record<string, unknown>
  }
  return { partes, indice }
}

for (const slug of ['baader-142-888', 'baader-142-860']) {
  describe(`partes.json de ${slug}`, () => {
    const { partes, indice } = cargar(slug)

    it('apunta al despiece correcto', () => {
      expect(partes.despiece).toBe('baader-142-despiece')
    })

    it('tiene al menos los 14 sensores del catálogo', () => {
      expect(Object.keys(partes.aparatos).length).toBeGreaterThanOrEqual(14)
    })

    it('cada aparato mapeado EXISTE en el plano eléctrico', () => {
      for (const tag of Object.keys(partes.aparatos)) {
        expect(indice.indice[tag], `${tag} no existe en el índice de ${slug}`).toBeDefined()
      }
    })

    it('cada entrada tiene los campos mínimos y confianza válida', () => {
      for (const [tag, entradas] of Object.entries(partes.aparatos)) {
        expect(entradas.length, `${tag} sin entradas`).toBeGreaterThan(0)
        for (const e of entradas) {
          expect(e.nr, `${tag} sin nr`).toMatch(/^\d{6,10}$/)
          expect(e.es, `${tag} sin nombre ES`).toBeTruthy()
          expect(e.fig, `${tag} sin figura`).toMatch(/^[\d-]+$/)
          expect(e.hoja, `${tag} hoja inválida`).toBeGreaterThan(0)
          expect(['catalogo', 'propuesto', 'confirmado']).toContain(e.confianza)
          if (e.sap) expect(e.sap, `${tag} SAP inválido`).toMatch(/^\d{10}$/)
        }
      }
    })

    it('B14 sigue mapeado al 42303077 en la figura 70-8 (el caso canónico)', () => {
      const b14 = partes.aparatos['B14']?.[0]
      expect(b14?.nr).toBe('42303077')
      expect(b14?.fig).toBe('70-8')
    })
  })
}
