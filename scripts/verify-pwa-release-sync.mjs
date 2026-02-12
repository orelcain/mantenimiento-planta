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

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8')
}

async function readJson(filePath) {
  const raw = await readText(filePath)
  return JSON.parse(raw)
}

async function main() {
  const root = findRepoRoot(process.cwd())

  const pwaPackagePath = path.join(root, 'apps/pwa/package.json')
  const versionConstantsPath = path.join(root, 'apps/pwa/src/constants/version.ts')
  const publicVersionPath = path.join(root, 'apps/pwa/public/version.json')
  const versionMdPath = path.join(root, 'VERSION.md')
  const changelogPath = path.join(root, 'CHANGELOG.md')

  const pwaPkg = await readJson(pwaPackagePath)
  const targetVersion = String(pwaPkg.version || '').trim()
  if (!targetVersion) throw new Error('apps/pwa/package.json no contiene versión válida')

  const versionConstants = await readText(versionConstantsPath)
  const publicVersion = await readJson(publicVersionPath)
  const versionMd = await readText(versionMdPath)
  const changelog = await readText(changelogPath)

  const checks = [
    {
      ok: versionConstants.includes(`APP_VERSION = '${targetVersion}'`),
      msg: `APP_VERSION en constants/version.ts debe ser ${targetVersion}`,
    },
    {
      ok: String(publicVersion.version || '').trim() === targetVersion,
      msg: `apps/pwa/public/version.json debe tener version=${targetVersion}`,
    },
    {
      ok: versionMd.includes(`Versión Actual: **v${targetVersion}**`),
      msg: `VERSION.md debe indicar v${targetVersion}`,
    },
    {
      ok: changelog.includes(`## [${targetVersion}]`),
      msg: `CHANGELOG.md debe contener encabezado ## [${targetVersion}]`,
    },
  ]

  const failed = checks.filter((c) => !c.ok)
  if (failed.length > 0) {
    console.error(`[verify-pwa-release-sync] ERROR: ${failed.length} validación(es) fallida(s)`)
    for (const f of failed) console.error(` - ${f.msg}`)
    process.exit(1)
  }

  console.log(`[verify-pwa-release-sync] OK: versión ${targetVersion} sincronizada en package/constants/version.json/VERSION.md/CHANGELOG.md`)
}

await main()
