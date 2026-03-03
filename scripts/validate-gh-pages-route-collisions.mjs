import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const appPath = path.join(repoRoot, 'apps', 'pwa')
const appRoutesFile = path.join(appPath, 'src', 'App.tsx')
const publicDir = path.join(appPath, 'public')

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walk(full))
    } else {
      files.push(full)
    }
  }
  return files
}

function normalizeRoute(route) {
  if (!route) return null
  if (route === '/' || route === '*') return null

  let value = route.trim()
  if (value.startsWith('/')) value = value.slice(1)
  if (!value) return null

  if (value.includes(':')) return null
  if (value.includes('*')) return null

  return value
}

function getRoutePaths(tsx) {
  const results = new Set()
  const routeRegex = /path\s*=\s*"([^"]+)"/g
  let match

  while ((match = routeRegex.exec(tsx)) !== null) {
    const normalized = normalizeRoute(match[1])
    if (normalized) results.add(normalized)
  }

  return results
}

function getPublicHtmlPaths(publicRoot) {
  const htmlFiles = walk(publicRoot)
    .filter((file) => file.toLowerCase().endsWith('.html'))

  const excluded = new Set(['404', 'index'])
  const results = new Set()

  for (const file of htmlFiles) {
    const relative = path.relative(publicRoot, file).replace(/\\/g, '/')
    const noExt = relative.replace(/\.html$/i, '')
    if (excluded.has(noExt.toLowerCase())) continue
    results.add(noExt)
  }

  return results
}

if (!fs.existsSync(appRoutesFile)) {
  console.error(`No existe archivo de rutas: ${appRoutesFile}`)
  process.exit(1)
}

if (!fs.existsSync(publicDir)) {
  console.error(`No existe carpeta public: ${publicDir}`)
  process.exit(1)
}

const appTsx = fs.readFileSync(appRoutesFile, 'utf8')
const routes = getRoutePaths(appTsx)
const publicHtml = getPublicHtmlPaths(publicDir)

const collisions = [...routes].filter((route) => publicHtml.has(route))

if (collisions.length > 0) {
  console.error('❌ Colisión detectada entre rutas SPA y archivos HTML estáticos en public/:')
  for (const route of collisions) {
    console.error(`   - Ruta: /${route}  <->  Archivo: apps/pwa/public/${route}.html`)
  }
  console.error('\nAcción requerida: renombra el archivo HTML o cambia la ruta SPA para evitar que GitHub Pages resuelva al archivo estático.')
  process.exit(1)
}

console.log('✅ Sin colisiones de rutas SPA vs public/*.html')
