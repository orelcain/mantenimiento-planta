/**
 * Empaqueta el núcleo PURO del marcador del Duelo para las Cloud Functions.
 *
 * Mismo motivo que `build-grader-core.js`: el cierre congelado del Duelo tiene que contar con la MISMA regla que la
 * pantalla; una copia en JS se separa con el primer cambio. Diferencia: este artefacto SÍ se commitea, porque el deploy
 * de Functions solo corre `npm ci` dentro de `functions/` y no tiene cómo generarlo.
 *
 * Uso:    node scripts/build-duelo-nucleo.mjs
 * Salida: functions/lib/dueloNucleo.cjs
 * Guardia: apps/pwa/src/pages/monitor/__tests__/dueloNucleo.test.ts lo regenera en memoria y falla si difiere.
 */
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const SALIDA = path.join(RAIZ, 'functions', 'lib', 'dueloNucleo.cjs')
const ENTRADA = 'apps/pwa/src/pages/monitor/dueloNucleo.ts'

const BANNER = `/* GENERADO por scripts/build-duelo-nucleo.mjs desde ${ENTRADA}. NO EDITAR A MANO:
   cambiar la regla en la PWA y correr \`node scripts/build-duelo-nucleo.mjs\`. */`

/** esbuild llega con Vite (sin dependencia nueva); se resuelve desde la PWA, que es quien lo tiene. */
function cargarEsbuild() {
  const desdePwa = createRequire(path.join(RAIZ, 'apps', 'pwa', 'package.json'))
  return createRequire(desdePwa.resolve('vite'))('esbuild')
}

/** El texto del bundle, con saltos de línea LF (el checkout de Windows puede traer CRLF). */
export async function construirNucleo() {
  const r = await cargarEsbuild().build({
    absWorkingDir: RAIZ,
    entryPoints: [ENTRADA],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    alias: { '@': './apps/pwa/src' },
    banner: { js: BANNER },
    legalComments: 'none',
    write: false,
    outfile: SALIDA,
    logLevel: 'error',
  })
  return r.outputFiles[0].text.replace(/\r\n/g, '\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const texto = await construirNucleo()
  mkdirSync(path.dirname(SALIDA), { recursive: true })
  writeFileSync(SALIDA, texto)
  console.log(`functions/lib/dueloNucleo.cjs generado (${Math.round(texto.length / 1024)} KB)`)
}
