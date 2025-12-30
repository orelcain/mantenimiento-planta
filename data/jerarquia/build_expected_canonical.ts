import fs from 'fs'
import path from 'path'

/**
 * Construye un dataset canónico (sin duplicados) desde:
 * - JERARQUIA_COMPLETA_VERIFICADA.json (raíz, áreas nivel 2, páginas disponibles)
 * - imagen_01..10_equipos.json
 *
 * Salida:
 * - jerarquia/EXPECTED_CANONICAL.json
 * - jerarquia/EXPECTED_CONFLICTS.json
 *
 * Regla de consolidación (canónico): último valor no vacío gana.
 * Además se reportan conflictos (múltiples padres/nombres distintos para el mismo código).
 */

type RawNode = { codigo: string; denominacion: string; padre: string | null; source: string }

type CanonicalNode = { codigo: string; denominacion: string; padre: string | null }

type Conflict = {
  codigo: string
  padres: Array<{ padre: string | null; source: string }>
  denominaciones: Array<{ denominacion: string; source: string }>
}

const OUT_CANON = path.resolve(__dirname, 'EXPECTED_CANONICAL.json')
const OUT_CONFLICTS = path.resolve(__dirname, 'EXPECTED_CONFLICTS.json')

const JSON_MAIN = path.resolve(__dirname, 'JERARQUIA_COMPLETA_VERIFICADA.json')

function listImageJsonPaths(): string[] {
  const paths: string[] = []
  for (let i = 1; i <= 10; i++) {
    const p = path.resolve(__dirname, `imagen_${String(i).padStart(2, '0')}_equipos.json`)
    if (fs.existsSync(p)) paths.push(p)
  }
  return paths
}

function normalizeCode(value: any) {
  return String(value ?? '').trim()
}

function normalizeText(value: any) {
  return String(value ?? '').trim()
}

function normalizePadre(value: any): string | null {
  const p = String(value ?? '').trim()
  return p ? p : null
}

function loadAllRawNodes(): { nodes: RawNode[]; sources: string[] } {
  const nodes: RawNode[] = []
  const sources: string[] = []

  const main = JSON.parse(fs.readFileSync(JSON_MAIN, 'utf8'))
  sources.push(JSON_MAIN)

  if (main.estructura?.raiz?.codigo) {
    nodes.push({
      codigo: normalizeCode(main.estructura.raiz.codigo),
      denominacion: normalizeText(main.estructura.raiz.denominacion),
      padre: null,
      source: JSON_MAIN,
    })
  }

  if (Array.isArray(main.estructura?.areas_nivel_2)) {
    for (const a of main.estructura.areas_nivel_2) {
      nodes.push({
        codigo: normalizeCode(a.codigo),
        denominacion: normalizeText(a.denominacion),
        padre: normalizePadre(a.padre),
        source: JSON_MAIN,
      })
    }
  }

  for (const key of Object.keys(main).filter(k => k.startsWith('PAGINA_'))) {
    const equipos = main[key]?.equipos
    if (!Array.isArray(equipos)) continue
    for (const eq of equipos) {
      nodes.push({
        codigo: normalizeCode(eq.codigo),
        denominacion: normalizeText(eq.denominacion),
        padre: normalizePadre(eq.padre),
        source: `${JSON_MAIN}::${key}`,
      })
    }
  }

  for (const imgPath of listImageJsonPaths()) {
    const img = JSON.parse(fs.readFileSync(imgPath, 'utf8'))
    sources.push(imgPath)

    const areas = img?.areas_y_equipos
    if (!Array.isArray(areas)) continue

    for (const area of areas) {
      const areaCodeRaw = normalizeText(area.area)
      const isContinuation = areaCodeRaw.includes('(continuación)')
      const areaCode = areaCodeRaw.replace(/\s*\(continuación\)\s*/i, '').trim()

      if (area.denominacion && !isContinuation && areaCode) {
        const parts = areaCode.split('-')
        const padre = parts.length > 1 ? parts.slice(0, -1).join('-') : null
        nodes.push({
          codigo: areaCode,
          denominacion: normalizeText(area.denominacion),
          padre: padre || null,
          source: imgPath,
        })
      }

      if (Array.isArray(area.equipos)) {
        for (const eq of area.equipos) {
          nodes.push({
            codigo: normalizeCode(eq.codigo),
            denominacion: normalizeText(eq.denominacion),
            padre: normalizePadre(eq.padre),
            source: imgPath,
          })
        }
      }
    }
  }

  return { nodes, sources }
}

function main() {
  const { nodes } = loadAllRawNodes()

  const byCode = new Map<string, RawNode[]>()
  for (const n of nodes) {
    if (!n.codigo) continue
    const arr = byCode.get(n.codigo) ?? []
    arr.push(n)
    byCode.set(n.codigo, arr)
  }

  const canonical: CanonicalNode[] = []
  const conflicts: Conflict[] = []

  for (const [codigo, arr] of byCode.entries()) {
    // canónico: último valor no vacío gana
    let denominacion = ''
    let padre: string | null = null

    for (const n of arr) {
      if (n.denominacion) denominacion = n.denominacion
      if (n.padre) padre = n.padre
    }

    canonical.push({ codigo, denominacion, padre })

    const uniquePadres = new Map<string, string>()
    const uniqueDen = new Map<string, string>()

    for (const n of arr) {
      uniquePadres.set(String(n.padre ?? 'null'), n.source)
      if (n.denominacion) uniqueDen.set(n.denominacion, n.source)
    }

    const padres = Array.from(uniquePadres.entries()).map(([p, source]) => ({ padre: p === 'null' ? null : p, source }))
    const denominaciones = Array.from(uniqueDen.entries()).map(([d, source]) => ({ denominacion: d, source }))

    if (padres.length > 1 || denominaciones.length > 1) {
      conflicts.push({ codigo, padres, denominaciones })
    }
  }

  canonical.sort((a, b) => a.codigo.localeCompare(b.codigo))
  conflicts.sort((a, b) => a.codigo.localeCompare(b.codigo))

  fs.writeFileSync(
    OUT_CANON,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        codigo_unicos: canonical.length,
        nodes: canonical,
      },
      null,
      2
    ) + '\n',
    'utf8'
  )

  fs.writeFileSync(
    OUT_CONFLICTS,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        conflictos: conflicts.length,
        items: conflicts,
      },
      null,
      2
    ) + '\n',
    'utf8'
  )

  console.log(`OK: canónico escrito en ${OUT_CANON}`)
  console.log(`OK: conflictos escritos en ${OUT_CONFLICTS} (total: ${conflicts.length})`)
}

main()
