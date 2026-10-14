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
// La Tarjeta A3C lee el partes.json del 888 con las designaciones de SUS hojas (22/23): la propia
// A3C, sus condensadores, resistencias y transformadores no están en el índice del visor.
const A3C_DATOS = join(__dirname, '..', '..', '..', 'public', 'learning-assets', 'baader-142', 'a3c', 'a3c-datos.json')
const elementosA3c = Object.keys(
  (JSON.parse(readFileSync(A3C_DATOS, 'utf8')) as { elementos: Record<string, unknown> }).elementos,
)

type Entrada = {
  nr: string
  es: string
  fig: string | null
  hoja: number | null
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
        const enA3c = slug === 'baader-142-888' && elementosA3c.includes(tag)
        expect(indice.indice[tag] ?? (enA3c || undefined), `${tag} no existe en el índice de ${slug}`).toBeDefined()
      }
    })

    it('cada entrada tiene los campos mínimos y confianza válida', () => {
      for (const [tag, entradas] of Object.entries(partes.aparatos)) {
        expect(entradas.length, `${tag} sin entradas`).toBeGreaterThan(0)
        for (const e of entradas) {
          expect(e.nr, `${tag} sin nr`).toMatch(/^\d{6,10}$/)
          expect(e.es, `${tag} sin nombre ES`).toBeTruthy()
          // Figura del catálogo 2006 («70-8», con hoja en el visor de despiece) o del 2014
          // («120 (2014)», sin hoja). Un candidato sin figura nunca puede decir «catálogo».
          if (e.fig == null) {
            expect(e.hoja, `${tag} candidato sin figura con hoja`).toBeNull()
            expect(e.confianza, `${tag} sin figura no puede ser catálogo`).toBe('propuesto')
          } else {
            expect(e.fig, `${tag} figura inválida`).toMatch(/^[\d-]+( \(2014\))?$/)
            if (e.fig.includes('2014')) expect(e.hoja, `${tag} figura 2014 sin visor`).toBeNull()
            // Lo «según catálogo 2006» siempre aterriza en el visor; un propuesto puede no tener
            // página (la ficha oculta «Ver dibujo» en vez de mandar a una hoja inexistente).
            else if (e.hoja != null || e.confianza === 'catalogo') expect(e.hoja, `${tag} hoja inválida`).toBeGreaterThan(0)
          }
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
