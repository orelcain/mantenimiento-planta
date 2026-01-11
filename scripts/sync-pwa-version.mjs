import fs from 'node:fs/promises'
import path from 'node:path'
import { existsSync } from 'node:fs'

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

function formatDateISO(d) {
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

async function writeIfChanged(filePath, content) {
  let current = null
  try {
    current = await fs.readFile(filePath, 'utf8')
  } catch {
    // ignore
  }
  if (current === content) return false
  await fs.writeFile(filePath, content, 'utf8')
  return true
}

async function main() {
  const root = findRepoRoot(process.cwd())

  const pwaPackagePath = path.join(root, 'apps/pwa/package.json')
  const pwaPkg = await readJson(pwaPackagePath)
  const version = String(pwaPkg.version || '').trim()
  if (!version) throw new Error('apps/pwa/package.json no tiene "version"')

  const now = new Date()
  const today = formatDateISO(now)
  const nowTs = Date.now()

  const updates = []

  // 1) apps/pwa/src/constants/version.ts
  {
    const filePath = path.join(root, 'apps/pwa/src/constants/version.ts')
    const src = await fs.readFile(filePath, 'utf8')
    const next = src
      .replace(
        /export const APP_VERSION = '([^']*)' as const/g,
        `export const APP_VERSION = '${version}' as const`
      )
      .replace(
        /export const VERSION_DATE = '([^']*)' as const/g,
        `export const VERSION_DATE = '${today}' as const`
      )

    const changed = await writeIfChanged(filePath, next)
    if (changed) updates.push('apps/pwa/src/constants/version.ts')
  }

  // 2) apps/pwa/vite.config.ts (manifest.version)
  {
    const filePath = path.join(root, 'apps/pwa/vite.config.ts')
    const src = await fs.readFile(filePath, 'utf8')
    const next = src.replace(/version:\s*'[^']*'/, `version: '${version}'`)
    const changed = await writeIfChanged(filePath, next)
    if (changed) updates.push('apps/pwa/vite.config.ts')
  }

  // 3) apps/pwa/public/version.json (solo estampar fecha/timestamp si cambia la versión)
  {
    const filePath = path.join(root, 'apps/pwa/public/version.json')
    const obj = await readJson(filePath)
    const currentVersion = String(obj.version || '').trim()
    if (currentVersion !== version) {
      obj.version = version
      obj.buildDate = today
      obj.buildTimestamp = nowTs
      const next = `${JSON.stringify(obj, null, 2)}\n`
      const changed = await writeIfChanged(filePath, next)
      if (changed) updates.push('apps/pwa/public/version.json')
    }
  }

  // 4) VERSION.md (solo versión actual)
  {
    const filePath = path.join(root, 'VERSION.md')
    const src = await fs.readFile(filePath, 'utf8')
    const next = src.replace(
      /## Versión Actual:\s*\*\*v[^*]+\*\*/,
      `## Versión Actual: **v${version}**`
    )
    const changed = await writeIfChanged(filePath, next)
    if (changed) updates.push('VERSION.md')
  }

  if (updates.length === 0) {
    console.log(`[sync-pwa-version] OK: ya estaba sincronizado (v${version})`)
    return
  }

  console.log(`[sync-pwa-version] Sincronizado a v${version}:`)
  for (const u of updates) console.log(` - ${u}`)
}

await main()
