#!/usr/bin/env node
/**
 * ci-local.mjs — corre en local los MISMOS pasos que el CI de despliegue
 * (`.github/workflows/deploy.yml`), en el mismo orden, y se detiene en el
 * primer fallo indicando cuál fue.
 *
 * ⚠ DEBE REFLEJAR `.github/workflows/deploy.yml`. Si cambias, agregas o quitas
 * un paso allá, cámbialo acá en el mismo PR. Regla de piedra: el CI nunca debe
 * caer por un paso que no se corrió en local (ya van 3 caídas así).
 *
 * Uso:
 *   pnpm ci:local            → todos los pasos de verificación
 *   pnpm ci:local -- --build → además el build de la PWA y la copia de la demo
 *
 * Diferencias conocidas con el CI (a propósito):
 *   - No corre `pnpm install --frozen-lockfile`: asume node_modules al día y
 *     avisa si faltan. Correrlo aquí reinstala todo cada vez.
 *   - Los tests de functions reciben los archivos ya resueltos: Windows no
 *     expande el glob `*.test.js` como el shell de Linux del CI.
 *   - Las variables VITE_* del build vienen de apps/pwa/.env.local, no de secrets.
 *
 * Al final restaura `apps/pwa/src/constants/version.ts` si los tests lo
 * reescribieron (sello de fecha de build). Sin dependencias nuevas.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, copyFileSync, mkdirSync, cpSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PWA = join(ROOT, 'apps', 'pwa')
const FUNCTIONS = join(ROOT, 'functions')
const VERSION_FILE = join(PWA, 'src', 'constants', 'version.ts')
const BUILD = process.argv.includes('--build')

/** Equivalente al glob `dir/*.test.js` del CI, resuelto en Node (Windows no lo expande). */
function archivosDeTest(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.test.js'))
    .sort()
    .map((f) => relative(FUNCTIONS, join(dir, f)).split('\\').join('/'))
}

/** Los pasos, en el mismo orden que deploy.yml. Los de `run` lanzan un proceso; los de `fn` son código. */
const PASOS = [
  { nombre: 'Rutas SPA (GitHub Pages)', cwd: ROOT, cmd: 'node', args: ['scripts/validate-gh-pages-route-collisions.mjs'] },
  { nombre: 'Type check', cwd: PWA, cmd: 'pnpm', args: ['exec', 'tsc', '--noEmit'] },
  { nombre: 'Lint', cwd: PWA, cmd: 'pnpm', args: ['exec', 'eslint', '.', '--max-warnings', '30'] },
  { nombre: 'Tests PWA', cwd: PWA, cmd: 'pnpm', args: ['exec', 'vitest', 'run', '--reporter=dot'] },
  {
    nombre: 'Tests functions',
    cwd: FUNCTIONS,
    cmd: 'node',
    args: ['--test', ...archivosDeTest(join(FUNCTIONS, 'shoplogix', '__tests__')), ...archivosDeTest(join(FUNCTIONS, '__tests__'))],
  },
  { nombre: 'Audit gráficos', cwd: ROOT, cmd: 'node', args: ['scripts/audit-graficos.mjs', '--ci'] },
  { nombre: 'Audit piel', cwd: ROOT, cmd: 'node', args: ['scripts/audit-piel.mjs', '--verbose'] },
  { nombre: 'Audit voseo', cwd: ROOT, cmd: 'node', args: ['scripts/audit-voseo.mjs', '--verbose'] },
  { nombre: 'Audit decimales', cwd: ROOT, cmd: 'node', args: ['scripts/audit-decimales.mjs', '--verbose'] },
]

if (BUILD) {
  PASOS.push({ nombre: 'Build PWA', cwd: PWA, cmd: 'pnpm', args: ['build'] })
  PASOS.push({ nombre: 'Copia de la demo de clima', fn: copiarDemoClima })
}

/** Igual que el paso «Include Chonchi weather demo» del workflow. */
function copiarDemoClima() {
  mkdirSync(join(PWA, 'dist', 'demo', 'assets'), { recursive: true })
  copyFileSync(join(ROOT, 'docs', 'DEMO_CLIMA_PUERTO_CHONCHI.html'), join(PWA, 'dist', 'demo', 'clima-puerto-chonchi.html'))
  cpSync(join(ROOT, 'docs', 'assets'), join(PWA, 'dist', 'demo', 'assets'), { recursive: true })
  return 0
}

function correrPaso(paso) {
  if (paso.fn) return paso.fn()
  const r = spawnSync(paso.cmd, paso.args, { cwd: paso.cwd, stdio: 'inherit', shell: true, env: process.env })
  return r.status ?? 1
}

/** Restaura version.ts si algún paso lo reescribió (los tests le ponen la fecha de build). */
function restaurarVersion() {
  const rel = relative(ROOT, VERSION_FILE).split('\\').join('/')
  const cambio = spawnSync('git', ['diff', '--quiet', '--', rel], { cwd: ROOT })
  if (cambio.status !== 0) {
    spawnSync('git', ['checkout', '--', rel], { cwd: ROOT, stdio: 'ignore' })
    console.log(`\n↺ Restaurado ${rel} (lo reescribió un paso de test).`)
  }
}

function main() {
  if (!existsSync(join(ROOT, 'node_modules')) || !existsSync(join(PWA, 'node_modules'))) {
    console.error('✗ Faltan node_modules. Corre `pnpm install --frozen-lockfile` en la raíz del repo y vuelve a intentar.')
    return 1
  }

  const resumen = []
  let fallo = null
  try {
    for (const paso of PASOS) {
      console.log(`\n━━━ ${paso.nombre} ━━━`)
      const inicio = Date.now()
      const status = correrPaso(paso)
      const seg = ((Date.now() - inicio) / 1000).toFixed(1)
      resumen.push({ nombre: paso.nombre, ok: status === 0, seg })
      if (status !== 0) {
        fallo = { paso, status }
        break
      }
    }
  } finally {
    restaurarVersion()
  }

  console.log('\n━━━ Resumen ━━━')
  for (const r of resumen) console.log(`${r.ok ? '✓' : '✗'} ${r.nombre} (${r.seg} s)`)
  if (fallo) {
    console.log(`\n✗ Se detuvo en: «${fallo.paso.nombre}» (código ${fallo.status}). Los pasos siguientes no se corrieron.`)
    return 1
  }
  console.log(`\n✓ CI local en verde${BUILD ? ' (con build)' : ''}: ${resumen.length} pasos.`)
  return 0
}

process.exit(main())
