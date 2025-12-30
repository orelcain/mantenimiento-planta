import fs from 'fs'
import path from 'path'
import admin from 'firebase-admin'

/**
 * Verificador de reconciliación: JSON (mandante) vs Firestore vs OCR (PDF).
 *
 * Uso:
 *  - Solo JSON:        pnpm ts-node jerarquia/verify_reconciliation.ts
 *  - JSON vs Firestore pnpm ts-node jerarquia/verify_reconciliation.ts --firestore
 *  - JSON vs OCR:      pnpm ts-node jerarquia/verify_reconciliation.ts --ocr
 *  - Todo:             pnpm ts-node jerarquia/verify_reconciliation.ts --firestore --ocr
 *
 * Requisito Firestore:
 *  - Definir GOOGLE_APPLICATION_CREDENTIALS con el JSON de servicio.
 */

type FlatNode = {
  codigo: string
  denominacion: string
  padre: string | null
}

type ExistingNode = {
  id: string
  codigo: string
  nombre?: string
  nivel?: number
  parentId: string | null
  activo?: boolean
}

const CREDENTIALS_ENV = 'GOOGLE_APPLICATION_CREDENTIALS'
const COLLECTION = 'hierarchy'

const JSON_PATH = path.resolve(__dirname, 'JERARQUIA_COMPLETA_VERIFICADA.json')
const OCR_PATH = path.resolve(__dirname, 'ocr_resultado.txt')
const CANON_PATH = path.resolve(__dirname, 'EXPECTED_CANONICAL.json')

function listImageJsonPaths(): string[] {
  const paths: string[] = []
  for (let i = 1; i <= 10; i++) {
    const p = path.resolve(__dirname, `imagen_${String(i).padStart(2, '0')}_equipos.json`)
    if (fs.existsSync(p)) paths.push(p)
  }
  return paths
}

function parseArgs(argv: string[]) {
  const set = new Set(argv)
  return {
    firestore: set.has('--firestore'),
    ocr: set.has('--ocr'),
  }
}

function loadJson(): any {
  const raw = fs.readFileSync(JSON_PATH, 'utf8')
  return JSON.parse(raw)
}

function loadExpectedFromAllSources(): { nodes: FlatNode[]; meta: { sources: string[] } } {
  // Si existe un dataset canónico, usarlo directamente.
  if (fs.existsSync(CANON_PATH)) {
    const raw = fs.readFileSync(CANON_PATH, 'utf8')
    const parsed = JSON.parse(raw) as any
    const nodes: FlatNode[] = Array.isArray(parsed?.nodes)
      ? parsed.nodes.map((n: any) => ({
          codigo: String(n.codigo).trim(),
          denominacion: String(n.denominacion ?? '').trim(),
          padre: n.padre ? String(n.padre).trim() : null,
        }))
      : []

    return { nodes, meta: { sources: [CANON_PATH] } }
  }

  const sources: string[] = []
  const nodes: FlatNode[] = []

  const main = loadJson()
  sources.push(JSON_PATH)

  // Raíz
  if (main.estructura?.raiz) {
    nodes.push({
      codigo: String(main.estructura.raiz.codigo).trim(),
      denominacion: String(main.estructura.raiz.denominacion ?? '').trim(),
      padre: null,
    })
  }

  // Áreas nivel 2
  if (Array.isArray(main.estructura?.areas_nivel_2)) {
    for (const a of main.estructura.areas_nivel_2) {
      nodes.push({
        codigo: String(a.codigo).trim(),
        denominacion: String(a.denominacion ?? '').trim(),
        padre: a.padre ? String(a.padre).trim() : null,
      })
    }
  }

  // Equipos del JSON principal (PAGINA_1, PAGINA_2... lo que exista)
  for (const key of Object.keys(main).filter(k => k.startsWith('PAGINA_'))) {
    const equipos = main[key]?.equipos
    if (!Array.isArray(equipos)) continue
    for (const eq of equipos) {
      nodes.push({
        codigo: String(eq.codigo).trim(),
        denominacion: String(eq.denominacion ?? '').trim(),
        padre: eq.padre ? String(eq.padre).trim() : null,
      })
    }
  }

  // Equipos/áreas desde los JSON de imágenes (imagen_01..10)
  for (const imgPath of listImageJsonPaths()) {
    try {
      const raw = fs.readFileSync(imgPath, 'utf8')
      const imageData = JSON.parse(raw)
      sources.push(imgPath)

      const areas = imageData?.areas_y_equipos
      if (!Array.isArray(areas)) continue

      for (const area of areas) {
        const areaCodeRaw = String(area.area ?? '').trim()
        const isContinuation = areaCodeRaw.includes('(continuación)')
        const areaCode = areaCodeRaw.replace(/\s*\(continuación\)\s*/i, '').trim()

        if (area.denominacion && !isContinuation && areaCode) {
          // Inferir padre por prefijo (AQ-IN-CHO-EXTE-ESTA => AQ-IN-CHO-EXTE)
          const parts = areaCode.split('-')
          const padre = parts.length > 1 ? parts.slice(0, -1).join('-') : null
          nodes.push({
            codigo: areaCode,
            denominacion: String(area.denominacion).trim(),
            padre: padre || null,
          })
        }

        if (Array.isArray(area.equipos)) {
          for (const eq of area.equipos) {
            nodes.push({
              codigo: String(eq.codigo).trim(),
              denominacion: String(eq.denominacion ?? '').trim(),
              padre: eq.padre ? String(eq.padre).trim() : null,
            })
          }
        }
      }
    } catch {
      // ignorar archivos corruptos
    }
  }

  return { nodes, meta: { sources } }
}

function collectNodes(data: any): FlatNode[] {
  const nodes: FlatNode[] = []

  if (data.estructura?.raiz) {
    nodes.push({
      codigo: String(data.estructura.raiz.codigo).trim(),
      denominacion: String(data.estructura.raiz.denominacion ?? '').trim(),
      padre: null,
    })
  }

  if (Array.isArray(data.estructura?.areas_nivel_2)) {
    for (const a of data.estructura.areas_nivel_2) {
      nodes.push({
        codigo: String(a.codigo).trim(),
        denominacion: String(a.denominacion ?? '').trim(),
        padre: a.padre ? String(a.padre).trim() : null,
      })
    }
  }

  for (const key of Object.keys(data).filter(k => k.startsWith('PAGINA_'))) {
    const equipos = data[key]?.equipos
    if (!Array.isArray(equipos)) continue

    for (const eq of equipos) {
      nodes.push({
        codigo: String(eq.codigo).trim(),
        denominacion: String(eq.denominacion ?? '').trim(),
        padre: eq.padre ? String(eq.padre).trim() : null,
      })
    }
  }

  return nodes
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

function diffSets(a: Set<string>, b: Set<string>) {
  const onlyA: string[] = []
  for (const v of a) if (!b.has(v)) onlyA.push(v)

  const onlyB: string[] = []
  for (const v of b) if (!a.has(v)) onlyB.push(v)

  return { onlyA, onlyB }
}

function printSample(title: string, items: string[], limit = 20) {
  const head = items.slice(0, limit)
  console.log(`${title}: ${items.length}${items.length > limit ? ` (muestra ${limit})` : ''}`)
  if (head.length) console.log(head.join('\n'))
}

function findJsonIssues(nodes: FlatNode[]) {
  const byCode = new Map<string, FlatNode[]>()
  for (const n of nodes) {
    const arr = byCode.get(n.codigo) ?? []
    arr.push(n)
    byCode.set(n.codigo, arr)
  }

  const duplicates = Array.from(byCode.entries())
    .filter(([, arr]) => arr.length > 1)
    .map(([codigo]) => codigo)
    .sort()

  const codeSet = new Set(nodes.map(n => n.codigo))
  const missingParents = unique(
    nodes
      .filter(n => n.padre && !codeSet.has(n.padre))
      .map(n => `${n.codigo} -> padre faltante ${n.padre}`)
  ).sort()

  return { duplicates, missingParents }
}

function buildConsolidatedByCode(nodes: FlatNode[]) {
  const byCode = new Map<string, FlatNode>()
  for (const n of nodes) {
    const codigo = n.codigo.trim()
    if (!codigo) continue

    const prev = byCode.get(codigo)
    const denominacion = n.denominacion?.trim() ? n.denominacion.trim() : (prev?.denominacion ?? '')
    const padre = (n.padre !== null && String(n.padre).trim() !== '') ? String(n.padre).trim() : (prev?.padre ?? null)

    byCode.set(codigo, { codigo, denominacion, padre })
  }
  return byCode
}

function ensureFirebase() {
  if (admin.apps.length === 0) {
    if (!process.env[CREDENTIALS_ENV]) {
      throw new Error(`Falta ${CREDENTIALS_ENV}. Para comparar con Firestore, defínalo apuntando al JSON de servicio.`)
    }
    admin.initializeApp({ credential: admin.credential.applicationDefault() })
  }
}

async function loadExistingActive(): Promise<{ byCodigo: Map<string, ExistingNode>; byId: Map<string, ExistingNode> }> {
  const db = admin.firestore()
  const snap = await db.collection(COLLECTION).where('activo', '==', true).get()

  const byCodigo = new Map<string, ExistingNode>()
  const byId = new Map<string, ExistingNode>()

  for (const doc of snap.docs) {
    const d = doc.data() as any
    const node: ExistingNode = {
      id: doc.id,
      codigo: String(d.codigo ?? '').trim(),
      nombre: d.nombre,
      nivel: d.nivel,
      parentId: d.parentId ?? null,
      activo: d.activo,
    }

    // Puede haber duplicados por código (debería ser 0); los detectamos más abajo.
    if (!byCodigo.has(node.codigo)) byCodigo.set(node.codigo, node)
    byId.set(node.id, node)
  }

  return { byCodigo, byId }
}

function parseOcrCodes(text: string): string[] {
  const codes: string[] = []

  // Ej: 720004340... (códigos numéricos largos)
  const numeric = text.match(/\b\d{6,}\b/g) ?? []
  codes.push(...numeric)

  // Ej: AQ-IN-CHO (códigos alfanuméricos con guiones)
  const dashed = text.match(/\b[A-Z]{2,}(?:-[A-Z0-9]{2,})+\b/g) ?? []
  codes.push(...dashed)

  return unique(codes.map(c => c.trim()).filter(Boolean)).sort()
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const expected = loadExpectedFromAllSources()
  const jsonNodes = expected.nodes
  const jsonCodes = jsonNodes.map(n => n.codigo)
  const jsonCodeSet = new Set(jsonCodes)

  console.log('=== RECONCILIACIÓN: JSON (mandante) ===')
  console.log('Fuentes:')
  expected.meta.sources.forEach(s => console.log(`- ${s}`))
  console.log(`Total nodos (JSON): ${jsonNodes.length}`)
  console.log(`Códigos únicos (JSON): ${jsonCodeSet.size}`)

  const jsonIssues = findJsonIssues(jsonNodes)
  printSample('Duplicados en JSON (por codigo)', jsonIssues.duplicates)
  printSample('Relaciones con padre faltante (JSON)', jsonIssues.missingParents)

  if (args.ocr) {
    console.log('\n=== OCR (PDF) ===')
    if (!fs.existsSync(OCR_PATH)) {
      console.log(`No existe ${OCR_PATH}`)
      console.log('Genera el OCR ejecutando: pnpm ts-node jerarquia/hacer_ocr.py (o corre el script python correspondiente)')
    } else {
      const ocrText = fs.readFileSync(OCR_PATH, 'utf8')
      const ocrCodes = parseOcrCodes(ocrText)
      const ocrSet = new Set(ocrCodes)

      console.log(`Códigos detectados por OCR: ${ocrCodes.length}`)

      const { onlyA: inOcrNotJson, onlyB: inJsonNotOcr } = diffSets(ocrSet, jsonCodeSet)
      printSample('OCR pero NO en JSON', inOcrNotJson.sort())
      printSample('JSON pero NO en OCR', inJsonNotOcr.sort())
    }
  }

  if (args.firestore) {
    console.log('\n=== FIRESTORE (activo=true) ===')
    ensureFirebase()

    const { byCodigo, byId } = await loadExistingActive()
    const firestoreCodeSet = new Set(Array.from(byCodigo.keys()).filter(Boolean))

    console.log(`Nodos activos (Firestore): ${byId.size}`)
    console.log(`Códigos únicos (Firestore): ${firestoreCodeSet.size}`)

    // Detectar duplicados reales por código (contando ids)
    // Nota: byCodigo solo guarda el primero; por eso hacemos un conteo a partir de byId.
    const codeToCount = new Map<string, number>()
    for (const n of byId.values()) {
      const c = n.codigo
      codeToCount.set(c, (codeToCount.get(c) ?? 0) + 1)
    }
    const firestoreDupCodes = Array.from(codeToCount.entries())
      .filter(([, count]) => count > 1)
      .map(([codigo]) => codigo)
      .sort()
    printSample('Duplicados en Firestore (por codigo)', firestoreDupCodes)

    const { onlyA: missingInFirestore, onlyB: extraInFirestore } = diffSets(jsonCodeSet, firestoreCodeSet)
    printSample('JSON pero NO en Firestore', missingInFirestore.sort())
    printSample('Firestore pero NO en JSON', extraInFirestore.sort())

    // Orfandad por parentId (id inexistente)
    const orphanById: string[] = []
    for (const n of byId.values()) {
      if (n.parentId && !byId.has(n.parentId)) orphanById.push(`${n.codigo} -> parentId inexistente ${n.parentId}`)
    }
    orphanById.sort()
    printSample('Orfandad (Firestore) por parentId inexistente', orphanById)

    // Alcanzables desde raíces (renderable aproximado)
    const roots = Array.from(byId.values()).filter(n => !n.parentId)
    const childrenByParentId = new Map<string | null, ExistingNode[]>()
    for (const n of byId.values()) {
      const key = n.parentId ?? null
      const arr = childrenByParentId.get(key) ?? []
      arr.push(n)
      childrenByParentId.set(key, arr)
    }

    const visited = new Set<string>()
    const queue: ExistingNode[] = [...roots]
    while (queue.length) {
      const cur = queue.shift()!
      if (visited.has(cur.id)) continue
      visited.add(cur.id)
      const kids = childrenByParentId.get(cur.id) ?? []
      queue.push(...kids)
    }

    const unreachable = Array.from(byId.values()).filter(n => !visited.has(n.id)).map(n => n.codigo).sort()
    console.log(`Raíces (parentId null): ${roots.length}`)
    console.log(`Alcanzables desde raíces (aprox renderables): ${visited.size}`)
    printSample('No alcanzables desde raíces (posible no renderable en app)', unreachable)

    // Comparar padre esperado (JSON) vs padre real (Firestore) por código
    const idToCode = new Map<string, string>()
    for (const n of byId.values()) idToCode.set(n.id, n.codigo)

    const consolidated = buildConsolidatedByCode(jsonNodes)
    const jsonParentByCode = new Map<string, string | null>()
    consolidated.forEach((n, code) => jsonParentByCode.set(code, n.padre ?? null))

    const parentMismatches: string[] = []
    for (const code of jsonCodeSet) {
      const expectedParent = jsonParentByCode.get(code) ?? null
      const fsNode = byCodigo.get(code)
      if (!fsNode) continue

      const actualParentCode = fsNode.parentId ? (idToCode.get(fsNode.parentId) ?? `ID:${fsNode.parentId}`) : null
      if ((expectedParent ?? null) !== (actualParentCode ?? null)) {
        parentMismatches.push(`${code} -> esperado: ${expectedParent ?? 'null'} | real: ${actualParentCode ?? 'null'}`)
      }
    }
    parentMismatches.sort()
    printSample('Padre distinto (JSON vs Firestore)', parentMismatches)
  }
}

main().catch(err => {
  console.error('[verify_reconciliation] Error', err)
  process.exit(1)
})
