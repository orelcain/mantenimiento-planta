import fs from 'fs'
import path from 'path'
import admin from 'firebase-admin'

/**
 * Reconciliación Firestore -> dataset esperado (derivado del PDF):
 * - Desactiva nodos cuyo `codigo` no existe en el dataset esperado.
 * - Para `codigo` duplicado en Firestore: mantiene 1 doc (heurística) y desactiva el resto.
 * - Repara `parentId`, `nivel` y `path` según relación `padre` del dataset esperado.
 *
 * Ejecutar:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS="...json"; pnpm ts-node jerarquia/reconcile_firestore_to_expected.ts
 */

type ExpectedNode = {
  codigo: string
  nombre: string
  padre: string | null
}

type FsNode = {
  id: string
  codigo: string
  nombre: string
  parentId: string | null
  nivel?: number
  path?: string[]
  orden?: number
  activo?: boolean
  actualizadoEn?: any
  creadoEn?: any
}

const COLLECTION = 'hierarchy'
const JSON_MAIN = path.resolve(__dirname, 'JERARQUIA_COMPLETA_VERIFICADA.json')
const CANON_PATH = path.resolve(__dirname, 'EXPECTED_CANONICAL.json')
const CANON_EXT_PATH = path.resolve(__dirname, 'EXPECTED_CANONICAL_EXTENDED.json')

function listImageJsonPaths(): string[] {
  const paths: string[] = []
  for (let i = 1; i <= 10; i++) {
    const p = path.resolve(__dirname, `imagen_${String(i).padStart(2, '0')}_equipos.json`)
    if (fs.existsSync(p)) paths.push(p)
  }
  return paths
}

function loadExpected(): { nodes: ExpectedNode[]; byCode: Map<string, ExpectedNode> } {
  // Preferir dataset canónico si existe.
  const preferred = fs.existsSync(CANON_EXT_PATH) ? CANON_EXT_PATH : CANON_PATH
  if (fs.existsSync(preferred)) {
    const raw = fs.readFileSync(preferred, 'utf8')
    const parsed = JSON.parse(raw) as any
    const nodes: ExpectedNode[] = Array.isArray(parsed?.nodes)
      ? parsed.nodes.map((n: any) => ({
          codigo: String(n.codigo).trim(),
          nombre: String(n.denominacion ?? '').trim(),
          padre: n.padre ? String(n.padre).trim() : null,
        }))
      : []

    const byCode = new Map<string, ExpectedNode>()
    for (const n of nodes) {
      if (n.codigo) byCode.set(n.codigo, n)
    }

    return { nodes, byCode }
  }

  const nodes: ExpectedNode[] = []

  const mainRaw = fs.readFileSync(JSON_MAIN, 'utf8')
  const main = JSON.parse(mainRaw)

  // raíz
  if (main.estructura?.raiz?.codigo) {
    nodes.push({
      codigo: String(main.estructura.raiz.codigo).trim(),
      nombre: String(main.estructura.raiz.denominacion ?? '').trim(),
      padre: null,
    })
  }

  // areas nivel 2
  if (Array.isArray(main.estructura?.areas_nivel_2)) {
    for (const a of main.estructura.areas_nivel_2) {
      nodes.push({
        codigo: String(a.codigo).trim(),
        nombre: String(a.denominacion ?? '').trim(),
        padre: a.padre ? String(a.padre).trim() : null,
      })
    }
  }

  // equipos del main (paginas disponibles)
  for (const key of Object.keys(main).filter(k => k.startsWith('PAGINA_'))) {
    const equipos = main[key]?.equipos
    if (!Array.isArray(equipos)) continue
    for (const eq of equipos) {
      nodes.push({
        codigo: String(eq.codigo).trim(),
        nombre: String(eq.denominacion ?? '').trim(),
        padre: eq.padre ? String(eq.padre).trim() : null,
      })
    }
  }

  // imagenes 01..10
  for (const imgPath of listImageJsonPaths()) {
    const raw = fs.readFileSync(imgPath, 'utf8')
    const img = JSON.parse(raw)

    const areas = img?.areas_y_equipos
    if (!Array.isArray(areas)) continue

    for (const area of areas) {
      const areaCodeRaw = String(area.area ?? '').trim()
      const isContinuation = areaCodeRaw.includes('(continuación)')
      const areaCode = areaCodeRaw.replace(/\s*\(continuación\)\s*/i, '').trim()

      if (area.denominacion && !isContinuation && areaCode) {
        const parts = areaCode.split('-')
        const padre = parts.length > 1 ? parts.slice(0, -1).join('-') : null
        nodes.push({
          codigo: areaCode,
          nombre: String(area.denominacion).trim(),
          padre: padre || null,
        })
      }

      if (Array.isArray(area.equipos)) {
        for (const eq of area.equipos) {
          nodes.push({
            codigo: String(eq.codigo).trim(),
            nombre: String(eq.denominacion ?? '').trim(),
            padre: eq.padre ? String(eq.padre).trim() : null,
          })
        }
      }
    }
  }

  // Consolidar por código con regla: "último valor no vacío gana".
  // Esto ayuda cuando un mismo código aparece en más de una imagen con distinta relación de padre.
  const byCode = new Map<string, ExpectedNode>()
  for (const n of nodes) {
    const codigo = n.codigo.trim()
    if (!codigo) continue

    const prev = byCode.get(codigo)
    const nombre = n.nombre?.trim() ? n.nombre.trim() : (prev?.nombre ?? '')
    const padre = (n.padre !== null && String(n.padre).trim() !== '')
      ? String(n.padre).trim()
      : (prev?.padre ?? null)

    byCode.set(codigo, { codigo, nombre, padre })
  }

  return { nodes, byCode }
}

function initFirebase() {
  if (admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() })
  }
}

async function loadFsAllActive(): Promise<FsNode[]> {
  const db = admin.firestore()
  const snap = await db.collection(COLLECTION).where('activo', '==', true).get()
  return snap.docs.map(d => {
    const data = d.data() as any
    return {
      id: d.id,
      codigo: String(data.codigo ?? '').trim(),
      nombre: String(data.nombre ?? '').trim(),
      parentId: data.parentId ?? null,
      nivel: data.nivel,
      path: Array.isArray(data.path) ? data.path : undefined,
      orden: data.orden,
      activo: data.activo,
      actualizadoEn: data.actualizadoEn,
      creadoEn: data.creadoEn,
    }
  })
}

async function loadFsIdToCodigoAll(): Promise<Map<string, string>> {
  // Usamos TODOS los docs (activos e inactivos) para poder resolver parentId viejo.
  const db = admin.firestore()
  const snap = await db.collection(COLLECTION).get()
  const map = new Map<string, string>()
  snap.docs.forEach(d => {
    const data = d.data() as any
    const codigo = String(data.codigo ?? '').trim()
    if (codigo) map.set(d.id, codigo)
  })
  return map
}

function isLikelyAutoId(id: string, codigo: string) {
  if (!id) return false
  if (id === codigo) return false
  if (id.length < 15) return false
  if (id.includes('-')) return false
  // ids tipo 720004340 (numérico) no son autoId
  if (/^\d+$/.test(id)) return false
  return true
}

function toSeconds(ts: any): number {
  // Timestamp admin tiene _seconds
  if (!ts) return 0
  if (typeof ts._seconds === 'number') return ts._seconds
  if (typeof ts.seconds === 'number') return ts.seconds
  return 0
}

function pickCanonicalForCode(
  codigo: string,
  candidates: FsNode[],
  expectedParentCode: string | null,
  idToCodigoAll: Map<string, string>
): FsNode {
  const scored = candidates
    .map(n => {
      const parentCode = n.parentId ? (idToCodigoAll.get(n.parentId) ?? null) : null
      const parentMatches = expectedParentCode ? parentCode === expectedParentCode : n.parentId === null
      const autoId = isLikelyAutoId(n.id, codigo)
      const updated = toSeconds(n.actualizadoEn) || toSeconds(n.creadoEn)

      // score mayor = mejor
      let score = 0
      if (parentMatches) score += 1000
      if (autoId) score += 100
      score += updated

      return { n, score }
    })
    .sort((a, b) => b.score - a.score)

  return scored[0]!.n
}

function computeLevelAndPath(
  codigo: string,
  expectedByCode: Map<string, ExpectedNode>,
  codeToId: Map<string, string>
): { nivel: number; path: string[]; parentId: string | null } {
  const expected = expectedByCode.get(codigo)
  const padreCode = expected?.padre ?? null

  if (!padreCode) {
    return { nivel: 1, path: [], parentId: null }
  }

  const parentId = codeToId.get(padreCode) ?? null

  // armar ancestros por código
  const ancestors: string[] = []
  const visited = new Set<string>()
  let cursor: string | null = padreCode

  while (cursor) {
    if (visited.has(cursor)) break
    visited.add(cursor)

    const id = codeToId.get(cursor)
    if (id) ancestors.unshift(id)

    const nextParent: string | null = (expectedByCode.get(cursor)?.padre ?? null) as string | null
    cursor = nextParent
  }

  const nivel = ancestors.length + 1
  return { nivel, path: ancestors, parentId }
}

async function main() {
  initFirebase()
  const db = admin.firestore()

  const expected = loadExpected()
  const expectedByCode = expected.byCode
  const expectedCodes = new Set(Array.from(expectedByCode.keys()))

  console.log('=== RECONCILIACIÓN FIRESTORE -> ESPERADO ===')
  console.log(`Esperado (códigos únicos): ${expectedCodes.size}`)

  const idToCodigoAll = await loadFsIdToCodigoAll()
  const active = await loadFsAllActive()
  console.log(`Firestore activos antes: ${active.length}`)

  // Agrupar activos por código
  const byCode = new Map<string, FsNode[]>()
  for (const n of active) {
    if (!n.codigo) continue
    const arr = byCode.get(n.codigo) ?? []
    arr.push(n)
    byCode.set(n.codigo, arr)
  }

  // Paso 1: desactivar extras (códigos no esperados)
  const extras: FsNode[] = []
  for (const n of active) {
    if (n.codigo && !expectedCodes.has(n.codigo)) extras.push(n)
  }

  console.log(`Extras a desactivar: ${extras.length}`)

  // Paso 2: elegir canónicos por código y desactivar duplicados
  const toDeactivate: string[] = []
  const keepByCode = new Map<string, FsNode>()

  for (const [codigo, candidates] of byCode.entries()) {
    if (!expectedCodes.has(codigo)) continue
    const expectedParent = expectedByCode.get(codigo)?.padre ?? null

    if (candidates.length === 1) {
      keepByCode.set(codigo, candidates[0]!)
      continue
    }

    const keep = pickCanonicalForCode(codigo, candidates, expectedParent, idToCodigoAll)
    keepByCode.set(codigo, keep)

    for (const c of candidates) {
      if (c.id !== keep.id) toDeactivate.push(c.id)
    }
  }

  for (const e of extras) toDeactivate.push(e.id)

  console.log(`Duplicados a desactivar (incluye extras): ${toDeactivate.length}`)

  // Map código->id canónico
  const codeToId = new Map<string, string>()
  for (const [codigo, node] of keepByCode.entries()) codeToId.set(codigo, node.id)

  // Paso 3: actualizar canónicos con parentId/nivel/path/nombre
  const toUpdate: Array<{ id: string; data: any }> = []
  for (const [codigo, fsNode] of keepByCode.entries()) {
    const expectedNode = expectedByCode.get(codigo)
    if (!expectedNode) continue

    const { nivel, path: computedPath, parentId } = computeLevelAndPath(codigo, expectedByCode, codeToId)

    const updateData: any = {
      activo: true,
      codigo,
      nombre: expectedNode.nombre || fsNode.nombre,
      parentId,
      nivel,
      path: computedPath,
      actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
    }

    // Mantener orden si existe
    if (typeof fsNode.orden === 'number') {
      updateData.orden = fsNode.orden
    }

    toUpdate.push({ id: fsNode.id, data: updateData })
  }

  console.log(`Actualizaciones a aplicar (canónicos): ${toUpdate.length}`)

  // Ejecutar escrituras en batches
  const MAX_BATCH = 400
  let batch = db.batch()
  let ops = 0
  let committed = 0

  const flush = async () => {
    if (ops === 0) return
    await batch.commit()
    committed += ops
    batch = db.batch()
    ops = 0
  }

  // 3a) desactivar
  for (const id of toDeactivate) {
    batch.update(db.collection(COLLECTION).doc(id), {
      activo: false,
      actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
    })
    ops++
    if (ops >= MAX_BATCH) await flush()
  }

  // 3b) actualizar canónicos
  for (const u of toUpdate) {
    batch.update(db.collection(COLLECTION).doc(u.id), u.data)
    ops++
    if (ops >= MAX_BATCH) await flush()
  }

  await flush()

  console.log(`Escrituras aplicadas: ${committed}`)

  // Reporte post
  const after = await loadFsAllActive()
  const afterByCode = new Map<string, number>()
  for (const n of after) afterByCode.set(n.codigo, (afterByCode.get(n.codigo) ?? 0) + 1)
  const dupAfter = Array.from(afterByCode.entries()).filter(([, c]) => c > 1)

  // orfandad post (parentId activo inexistente)
  const afterIds = new Set(after.map(n => n.id))
  const orphan = after.filter(n => n.parentId && !afterIds.has(n.parentId))

  console.log('=== POST-REPORTE ===')
  console.log(`Activos después: ${after.length}`)
  console.log(`Duplicados por código (post): ${dupAfter.length}`)
  console.log(`Orfandad por parentId inexistente (post): ${orphan.length}`)
}

main().catch(err => {
  console.error('[reconcile_firestore_to_expected] Error', err)
  process.exit(1)
})
