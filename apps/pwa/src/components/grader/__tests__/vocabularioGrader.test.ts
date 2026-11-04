/**
 * Vocabulario del Grader: ningún texto que lea una persona dice «paro», «parada(s)», «parado(s)», «paró», «microparada(s)»,
 * «casualidad» ni «azar» (decisión de Mantención, 03-11-2026: se dice «detención/detenciones» y «microdetención»).
 *
 * Lee el código de `components/grader/`, `pages/AnalisisGrader/` y `services/grader/` (PDF, resúmenes, rótulos) con el parser de TypeScript y revisa SOLO los textos: literales
 * de string, plantillas y texto JSX. Los comentarios, los identificadores (`paros`, `getParosByPlantLine`), las rutas de import
 * (`@/services/paros`) y los tipos literales no son texto visible y no se revisan.
 * Un literal que es una clave interna y no se muestra (p. ej. `tier === 'parada'`) se marca con el comentario `vocab-ok` en su
 * línea, igual que `voseo-ok` en `scripts/audit-voseo.mjs`.
 * El patrón es el mismo de las pruebas del monitor (`pages/monitor/__tests__/vocabulario.ts`).
 */
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { PROHIBIDAS } from '@/pages/monitor/__tests__/vocabulario'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const CARPETAS = ['components/grader', 'pages/AnalisisGrader', 'services/grader']

/** Los textos de un archivo que tienen una palabra prohibida, como `línea «texto»`. */
export function textosProhibidos(codigo: string, nombre = 'x.tsx'): string[] {
  const sf = ts.createSourceFile(nombre, codigo, ts.ScriptTarget.Latest, true, nombre.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const lineas = codigo.split(/\r?\n/)
  const hallados: string[] = []
  const revisar = (nodo: ts.Node, texto: string) => {
    if (!PROHIBIDAS.test(texto)) return
    const linea = sf.getLineAndCharacterOfPosition(nodo.getStart(sf)).line
    if (/vocab-ok/.test(lineas[linea] ?? '')) return
    hallados.push(`${linea + 1} «${texto.replace(/\s+/g, ' ').trim()}»`)
  }
  const visitar = (nodo: ts.Node): void => {
    const padre = nodo.parent
    if (ts.isStringLiteral(nodo)) {
      const noVisible =
        (padre && (ts.isImportDeclaration(padre) || ts.isExportDeclaration(padre) || ts.isLiteralTypeNode(padre) || ts.isExternalModuleReference(padre))) ||
        (padre && ts.isPropertyAssignment(padre) && padre.name === nodo) ||
        (padre && ts.isCallExpression(padre) && padre.expression.kind === ts.SyntaxKind.ImportKeyword)
      if (!noVisible) revisar(nodo, nodo.text)
    } else if (ts.isNoSubstitutionTemplateLiteral(nodo) || ts.isTemplateHead(nodo) || ts.isTemplateMiddle(nodo) || ts.isTemplateTail(nodo)) {
      revisar(nodo, nodo.text)
    } else if (ts.isJsxText(nodo)) {
      revisar(nodo, nodo.text)
    }
    ts.forEachChild(nodo, visitar)
  }
  visitar(sf)
  return hallados
}

const archivos = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n)
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : archivos(p)
    return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []
  })

describe('vocabulario del Grader', () => {
  it('el lector ve los textos y no los comentarios, identificadores, imports ni tipos', () => {
    const codigo = [
      "import { getParosByPlantLine } from '@/services/paros'",
      "type Dominante = 'paros' | 'velocidad'",
      '// un paro en un comentario no cuenta',
      'const paros = getParosByPlantLine()',
      "const clave = { 'paros': 1 }",
      "const tier = p.tier === 'parada' ? 1 : 0 // vocab-ok: clave interna",
      'const a = <p title="Un paro largo">Sin paros</p>',
      'const b = `${n} paros más`',
      "const c = 'La línea quedó parada'",
      "const d = 'Se detuvo la máquina'",
    ].join('\n')
    expect(textosProhibidos(codigo)).toEqual(['7 «Un paro largo»', '7 «Sin paros»', '8 «paros más»', '9 «La línea quedó parada»'])
  })

  it('ningún texto visible del Grader dice «paro», «parada», «parado» ni «paró»', () => {
    const lista = CARPETAS.flatMap((c) => archivos(path.join(SRC, c)))
    expect(lista.length).toBeGreaterThan(50)
    const hallados = lista.flatMap((f) => textosProhibidos(readFileSync(f, 'utf8'), f).map((h) => `${path.relative(SRC, f).replace(/\\/g, '/')}:${h}`))
    expect(hallados, `Textos con vocabulario prohibido (usar «detención/detenciones»):\n${hallados.join('\n')}`).toEqual([])
  })
})
