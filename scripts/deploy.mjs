#!/usr/bin/env node
/**
 * Script de Deploy Automático
 * 
 * Uso:
 *   node scripts/deploy.mjs 2.32.0
 *   node scripts/deploy.mjs --patch  (incrementa patch: 2.31.10 → 2.31.11)
 *   node scripts/deploy.mjs --minor  (incrementa minor: 2.31.10 → 2.32.0)
 *   node scripts/deploy.mjs --major  (incrementa major: 2.31.10 → 3.0.0)
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
}

function log(color, ...args) {
  console.log(`${colors[color]}${args.join(' ')}${colors.reset}`)
}

function findRepoRoot(startDir) {
  let dir = startDir
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('No se encontró pnpm-workspace.yaml')
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

async function writeJson(filePath, obj) {
  await fs.writeFile(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8')
}

function incrementVersion(version, type) {
  const parts = version.split('.').map(Number)
  if (type === 'major') {
    parts[0]++
    parts[1] = 0
    parts[2] = 0
  } else if (type === 'minor') {
    parts[1]++
    parts[2] = 0
  } else if (type === 'patch') {
    parts[2]++
  }
  return parts.join('.')
}

async function main() {
  const root = findRepoRoot(process.cwd())
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    log('red', '❌ Error: Especifica la versión o usa --patch, --minor, --major')
    log('yellow', 'Uso:')
    log('yellow', '  node scripts/deploy.mjs 2.32.0')
    log('yellow', '  node scripts/deploy.mjs --patch')
    log('yellow', '  node scripts/deploy.mjs --minor')
    process.exit(1)
  }

  try {
    // 1. Leer versión actual
    const rootPkgPath = path.join(root, 'package.json')
    const pwaPkgPath = path.join(root, 'apps/pwa/package.json')
    const rootPkg = await readJson(rootPkgPath)
    const pwaPkg = await readJson(pwaPkgPath)
    
    const currentVersion = String(rootPkg.version || '').trim()
    log('blue', `\n📦 Versión actual: ${colors.bright}v${currentVersion}${colors.reset}`)

    // 2. Determinar nueva versión
    let newVersion = args[0]
    if (newVersion.startsWith('--')) {
      const incrementType = newVersion.slice(2)
      newVersion = incrementVersion(currentVersion, incrementType)
    }

    log('green', `✅ Nueva versión: ${colors.bright}v${newVersion}${colors.reset}\n`)

    // 3. Actualizar package.json (raíz)
    log('blue', '📝 Actualizando package.json (raíz)...')
    rootPkg.version = newVersion
    await writeJson(rootPkgPath, rootPkg)
    log('green', '   ✅ Actualizado')

    // 4. Actualizar apps/pwa/package.json
    log('blue', '📝 Actualizando apps/pwa/package.json...')
    pwaPkg.version = newVersion
    await writeJson(pwaPkgPath, pwaPkg)
    log('green', '   ✅ Actualizado')

    // 5. Correr script de sincronización
    log('blue', '🔄 Sincronizando versiones en archivos...')
    execSync('pnpm sync:version:pwa', { stdio: 'inherit', cwd: root })
    log('green', '   ✅ Versiones sincronizadas\n')

    // 6. Verificar cambios
    log('blue', '📊 Cambios detectados:')
    const status = execSync('git status --short', { cwd: root, encoding: 'utf8' })
    if (status.trim()) {
      console.log(status)
    }

    // 7. Commit
    log('blue', '\n💾 Haciendo commit...')
    execSync(`git add -A`, { stdio: 'inherit', cwd: root })
    execSync(`git commit -m "chore: bump version to ${newVersion}"`, { 
      stdio: 'inherit', 
      cwd: root 
    })
    log('green', '   ✅ Commit realizado')

    // 8. Push
    log('blue', '🚀 Haciendo push a GitHub...')
    execSync('git push', { stdio: 'inherit', cwd: root })
    log('green', '   ✅ Push realizado\n')

    // 9. Resumen
    log('green', `\n${colors.bright}✨ DEPLOY COMPLETADO ✨${colors.reset}`)
    log('green', `Version: v${newVersion}`)
    log('green', `GitHub Actions se disparará automáticamente...`)
    log('green', `Cambios visibles en 2-3 minutos en:\n   https://orelcain.github.io/Incidencias-Plant/`)

  } catch (error) {
    log('red', `\n❌ Error: ${error.message}`)
    if (error.stderr) {
      log('red', error.stderr.toString())
    }
    process.exit(1)
  }
}

main()
