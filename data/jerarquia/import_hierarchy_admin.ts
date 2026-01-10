import fs from 'fs'
import path from 'path'
import admin from 'firebase-admin'

/**
 * Script de carga masiva de jerarquía a Firestore usando credenciales de servicio (firebase-admin).
 * Requisitos previos:
 * 1. Definir GOOGLE_APPLICATION_CREDENTIALS apuntando al JSON de servicio.
 * 2. Instalar dependencia en el workspace raíz: pnpm add -w firebase-admin
 * 3. Ejecutar: pnpm ts-node jerarquia/import_hierarchy_admin.ts
 */

type FlatNode = {
  codigo: string
  denominacion: string
  padre: string | null
}

const CREDENTIALS_ENV = 'GOOGLE_APPLICATION_CREDENTIALS'
const COLLECTION = 'hierarchy'
const JSON_PATH = path.resolve(__dirname, 'JERARQUIA_COMPLETA_VERIFICADA.json')
const CANON_PATH = path.resolve(__dirname, 'EXPECTED_CANONICAL.json')
const CANON_EXT_PATH = path.resolve(__dirname, 'EXPECTED_CANONICAL_EXTENDED.json')

function initFirebase() {
  if (admin.apps.length === 0) {
    const credentialsPath = process.env[CREDENTIALS_ENV]
    if (credentialsPath && fs.existsSync(credentialsPath)) {
      const raw = fs.readFileSync(credentialsPath, 'utf8')
      const serviceAccount = JSON.parse(raw)
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      })
      console.log(`[initFirebase] Usando Service Account: ${credentialsPath}`)
      return
    }

    // Alternativa: Application Default Credentials (ADC)
    // Ej:
    //   gcloud auth application-default login
    // Esto permite correr scripts sin bajar un JSON de servicio.
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    })
    console.log('[initFirebase] Usando Application Default Credentials (ADC)')
  }
}

function loadJson(): { estructura: any; [key: string]: any } {
  const raw = fs.readFileSync(JSON_PATH, 'utf8')
  return JSON.parse(raw)
}

function loadNodesPreferCanonical(): { nodes: FlatNode[]; source: string } {
  const preferred = fs.existsSync(CANON_EXT_PATH) ? CANON_EXT_PATH : CANON_PATH

  if (fs.existsSync(preferred)) {
    const raw = fs.readFileSync(preferred, 'utf8')
    const parsed = JSON.parse(raw) as any
    const nodes: FlatNode[] = Array.isArray(parsed?.nodes)
      ? parsed.nodes.map((n: any) => ({
          codigo: String(n.codigo ?? '').trim(),
          denominacion: String(n.denominacion ?? '').trim(),
          padre: n.padre ? String(n.padre).trim() : null,
        }))
      : []
    return { nodes: nodes.filter(n => n.codigo), source: preferred }
  }

  const data = loadJson()
  return { nodes: collectNodes(data), source: JSON_PATH }
}

function collectNodes(data: any): FlatNode[] {
  const nodes: FlatNode[] = []
  // Raíz
  if (data.estructura?.raiz) {
    nodes.push({
      codigo: data.estructura.raiz.codigo,
      denominacion: data.estructura.raiz.denominacion,
      padre: null,
    })
  }
  // Áreas nivel 2
  if (Array.isArray(data.estructura?.areas_nivel_2)) {
    data.estructura.areas_nivel_2.forEach((a: any) => {
      nodes.push({
        codigo: a.codigo,
        denominacion: a.denominacion,
        padre: a.padre,
      })
    })
  }
  // Equipos por página
  Object.keys(data)
    .filter(k => k.startsWith('PAGINA_'))
    .forEach(k => {
      const equipos = data[k]?.equipos
      if (Array.isArray(equipos)) {
        equipos.forEach((eq: any) => {
          nodes.push({
            codigo: eq.codigo,
            denominacion: eq.denominacion,
            padre: eq.padre,
          })
        })
      }
    })
  return nodes
}

type ExistingNode = {
  id: string
  codigo: string
  nivel: number
  parentId: string | null
  path: string[]
  orden: number
}

async function loadExisting(): Promise<Map<string, ExistingNode>> {
  const db = admin.firestore()
  const snap = await db.collection(COLLECTION).where('activo', '==', true).get()
  const map = new Map<string, ExistingNode>()
  snap.forEach(doc => {
    const d = doc.data() as any
    map.set(d.codigo, {
      id: doc.id,
      codigo: d.codigo,
      nivel: d.nivel,
      parentId: d.parentId ?? null,
      path: Array.isArray(d.path) ? d.path : [],
      orden: d.orden ?? 0,
    })
  })
  console.log(`[loadExisting] ${map.size} nodos activos encontrados`)
  return map
}

async function importNodes(nodes: FlatNode[]) {
  const db = admin.firestore()
  const existing = await loadExisting()

  // Precontar hijos existentes por parentId para asignar orden incremental
  const childCount = new Map<string | null, number>()
  existing.forEach(n => {
    const key = n.parentId ?? null
    childCount.set(key, (childCount.get(key) ?? 0) + 1)
  })

  const pending = [...nodes]
  const processed = new Set<string>()
  const maxPasses = nodes.length + 5
  let pass = 0
  let created = 0
  let updated = 0

  while (pending.length && pass < maxPasses) {
    pass++
    let progress = false

    for (let i = pending.length - 1; i >= 0; i--) {
      const node = pending[i]
      const parentCode = node.padre
      const parent = parentCode ? existing.get(parentCode) : null

      // Si tiene padre y aún no existe, posponer
      if (parentCode && !parent) {
        continue
      }

      const parentId = parent?.id ?? null
      const parentPath = parent?.path ?? []
      const nivel = parent ? (parent.nivel + 1) : 1
      const orden = (childCount.get(parentId) ?? 0) + 1

      const pathArr = parentId ? [...parentPath, parentId] : []

      // ¿Existe por código?
      const existingNode = existing.get(node.codigo)
      if (existingNode) {
        // Actualizar nombre, parentId, orden, nivel, path si cambió
        const ref = db.collection(COLLECTION).doc(existingNode.id)
        await ref.update({
          nombre: node.denominacion,
          parentId,
          nivel,
          orden,
          path: pathArr,
          activo: true,
          actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
        })
        updated++
      } else {
        // Crear
        const ref = db.collection(COLLECTION).doc()
        await ref.set({
          nombre: node.denominacion,
          codigo: node.codigo,
          parentId,
          nivel,
          orden,
          path: pathArr,
          activo: true,
          creadoEn: admin.firestore.FieldValue.serverTimestamp(),
          actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
        })
        existing.set(node.codigo, {
          id: ref.id,
          codigo: node.codigo,
          nivel,
          parentId,
          path: pathArr,
          orden,
        })
        created++
      }

      // Actualizar contadores y marcar como procesado
      childCount.set(parentId, (childCount.get(parentId) ?? 0) + 1)
      processed.add(node.codigo)
      pending.splice(i, 1)
      progress = true
    }

    if (!progress) {
      console.warn('[importNodes] Sin progreso en esta pasada. Posibles padres faltantes:', pending.slice(0, 10))
      break
    }
  }

  console.log(`[importNodes] Creado: ${created}, Actualizado: ${updated}, Pendientes: ${pending.length}`)
  if (pending.length > 0) {
    console.warn('[importNodes] No se pudieron resolver estos nodos (padre faltante):')
    console.warn(pending)
  }
}

async function main() {
  try {
    initFirebase()
    const { nodes, source } = loadNodesPreferCanonical()
    console.log(`[main] Fuente: ${source}`)
    console.log(`[main] Nodos a procesar: ${nodes.length}`)
    await importNodes(nodes)
    console.log('[main] Importación finalizada')
  } catch (err) {
    console.error('[main] Error', err)
    process.exit(1)
  }
}

main()
