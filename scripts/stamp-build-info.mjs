/**
 * Sella `dist/version.json` con la identidad real del build (SHA + fecha).
 *
 * Por qué en `dist` y no en `public`: `public/version.json` está versionado en
 * git. Si se escribiera ahí, cada `pnpm build` local dejaría el árbol sucio con
 * un SHA distinto y ensuciaría todos los diffs. El archivo que la app consulta
 * en runtime es el de `dist`, así que se estampa ahí, después de que Vite copió
 * `public/`.
 *
 * Para qué sirve: `useAppVersion` compara este archivo contra el bundle en
 * ejecución para avisar "hay una versión nueva". Antes solo miraba el semver, y
 * como el semver depende de que alguien se acuerde de subirlo (estuvo 13 días
 * congelado en 3.99.6 con 39 mejoras desplegadas), el aviso no se disparaba
 * nunca. Con `buildSha` el aviso sale en cada deploy, sin depender de nadie.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

function findRepoRoot(startDir) {
  let dir = startDir
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('No se encontró pnpm-workspace.yaml (root del repo)')
}

/** Mismo criterio que vite.config.ts: CI → git → 'dev'. */
function resolveBuildSha() {
  const fromCI = process.env.GITHUB_SHA
  if (fromCI) return fromCI.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'dev'
  }
}

async function main() {
  const root = findRepoRoot(process.cwd())
  const distVersionPath = path.join(root, 'apps/pwa/dist/version.json')

  if (!existsSync(distVersionPath)) {
    // Sin dist no hay nada que sellar: probablemente se corrió fuera de `build`.
    console.error('[stamp-build-info] ERROR: no existe apps/pwa/dist/version.json — ¿corriste `vite build` antes?')
    process.exit(1)
  }

  const obj = JSON.parse(await fs.readFile(distVersionPath, 'utf8'))
  obj.buildSha = resolveBuildSha()
  obj.buildTimestamp = Date.now()
  obj.buildDate = new Date().toISOString().slice(0, 10)

  await fs.writeFile(distVersionPath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8')
  console.log(`[stamp-build-info] dist/version.json sellado: v${obj.version} · ${obj.buildSha} · ${obj.buildDate}`)
}

await main()
