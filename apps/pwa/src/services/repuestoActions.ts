/**
 * Repuesto Actions Service — "ARIA Mode" (escritura)
 *
 * Da a ARIA (chat de la PWA) la capacidad de crear/vincular repuestos en el
 * maestro y editar su código de fabricante, con el mismo flujo de confirmación
 * que ya usa `chatActions.ts` para incidencias (PendingAction: collecting →
 * confirming → executing).
 *
 * Espeja el trabajo ya hecho en ARIA-Telegram (functions/index.js,
 * ariaDecidirRepuesto/ariaCrearRepuestoNuevo/ariaLigarRepuestoAEquipo/
 * ariaEditarRepuesto) adaptado a este cliente: mismo modelo de datos
 * (`repuestos` colección plana, `equipos:[nodeIds de hierarchy]`), misma
 * regla dura (SAP = 10 dígitos exactos; nunca match por texto libre de un
 * número — evita el falso positivo real que tuvo Telegram con dos cilindros
 * parecidos), mismo patrón historial + audit_log que `useRepuestoCrud`.
 *
 * v1 — decisiones de alcance:
 * - Sin fotos: el input de fotos del chat está cableado a incidencias
 *   (`uploadIncidentPhoto`), no a repuestos (`uploadRepuestoFoto`, que necesita
 *   el id del doc ya creado). Se puede sumar en una iteración futura.
 * - Sin criterio LLM: cuando el SAP es explícito (10 dígitos, tipeado o el
 *   caso típico), la decisión crear-vs-vincular es 100% determinista, igual
 *   que en Telegram. Si no hay SAP, se pide explícitamente en vez de adivinar
 *   — más simple y seguro que invocar un LLM para un caso que hoy es raro.
 */
import { collection, addDoc, doc, getDoc, updateDoc, getDocs, query, where, limit, Timestamp } from 'firebase/firestore'
import { db } from './firebase'
import { logger } from '@/lib/logger'
import { writeAuditLog } from './auditLog'
import type { MaterialClase } from '@/types/repuestos'

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// ─── Tipos ───────────────────────────────────────────────────────────

export interface HierarchyEquipoNode {
  id: string
  codigo: string
  nombre: string
}

/** Borrador de repuesto: crear nuevo, vincular uno existente, o editar cód. fabricante */
export interface RepuestoDraft {
  modo: 'crear' | 'vincular' | 'editar'
  nombre: string
  codigoSAP: string
  clase: MaterialClase
  codigoFabricante?: string
  equipoTexto?: string
  equipoNodeId?: string
  equipoCodigo?: string
  equipoNombre?: string
  equipoCandidatos?: HierarchyEquipoNode[]
  /** doc existente cuando modo==='vincular'|'editar' */
  existenteId?: string
  existenteNombre?: string
  parecidos?: { nombre: string; codigoSAP: string }[]
}

// ─── Cache liviano de nodos hierarchy (equipo) — TTL 5min ────────────

let cachedEquipoNodes: HierarchyEquipoNode[] | null = null
let cacheAt = 0
const HIERARCHY_CACHE_TTL = 5 * 60 * 1000

async function loadHierarchyEquipos(): Promise<HierarchyEquipoNode[]> {
  if (cachedEquipoNodes && Date.now() - cacheAt < HIERARCHY_CACHE_TTL) return cachedEquipoNodes
  try {
    const snap = await getDocs(query(collection(db, 'hierarchy'), where('activo', '==', true)))
    const nodes: HierarchyEquipoNode[] = []
    snap.forEach((d) => {
      const x = d.data()
      if (x.tipoNodo !== 'equipo') return
      nodes.push({ id: d.id, codigo: x.codigo || '', nombre: x.alias || x.nombre || d.id })
    })
    cachedEquipoNodes = nodes
    cacheAt = Date.now()
    return nodes
  } catch (err) {
    logger.error('repuestoActions: error cargando hierarchy', err instanceof Error ? err : undefined)
    return cachedEquipoNodes || []
  }
}

/** Busca el equipo por texto libre contra los nodos `hierarchy` (tipoNodo==='equipo') */
export async function buscarEquipoEnJerarquia(texto: string): Promise<{ mejor: HierarchyEquipoNode | null; candidatos: HierarchyEquipoNode[] }> {
  const nodes = await loadHierarchyEquipos()
  const terms = normalize(texto).split(' ').filter((t) => t.length >= 2)
  if (!terms.length) return { mejor: null, candidatos: [] }
  const scored = nodes
    .map((n) => {
      const blob = normalize(`${n.nombre} ${n.codigo}`)
      const score = terms.filter((t) => blob.includes(t)).length
      return { n, score }
    })
    .filter((x) => x.score >= Math.min(2, terms.length))
    .sort((a, b) => b.score - a.score || a.n.nombre.length - b.n.nombre.length)
  return { mejor: scored[0]?.n || null, candidatos: scored.slice(0, 5).map((x) => x.n) }
}

// ─── Búsqueda directa por SAP (sin depender del cache de la pestaña Repuestos) ─

export interface RepuestoMaestroDoc {
  id: string
  codigoSAP: string
  textoBreve: string
  descripcion?: string
  codigoFabricante?: string
}

/** Match EXACTO por codigoSAP — nunca por texto libre (evita el falso positivo de Telegram) */
export async function buscarSapEnMaestro(sap: string): Promise<RepuestoMaestroDoc | null> {
  if (!/^\d{10}$/.test(sap)) return null
  try {
    const snap = await getDocs(query(collection(db, 'repuestos'), where('codigoSAP', '==', sap), limit(1)))
    if (snap.empty) return null
    const d = snap.docs[0]!
    const x = d.data()
    return { id: d.id, codigoSAP: x.codigoSAP, textoBreve: x.textoBreve || '', descripcion: x.descripcion || '', codigoFabricante: x.codigoFabricante || '' }
  } catch (err) {
    logger.error('repuestoActions: error buscando SAP', err instanceof Error ? err : undefined)
    return null
  }
}

// Cache liviano {textoBreve,descripcion,codigoSAP} para el chequeo de "parecidos".
// Preferimos el cache YA TIBIO de la pestaña Repuestos (useGlobalSearch, costo cero);
// si está frío, un solo fetch completo (mismo costo que ya paga esa pestaña) que
// además guardamos acá para no repetirlo en la misma sesión de chat.
let cachedMaestroLite: { textoBreve: string; descripcion: string; codigoSAP: string }[] | null = null
let maestroCacheAt = 0
const MAESTRO_CACHE_TTL = 5 * 60 * 1000

async function loadMaestroLite(): Promise<{ textoBreve: string; descripcion: string; codigoSAP: string }[]> {
  if (cachedMaestroLite && Date.now() - maestroCacheAt < MAESTRO_CACHE_TTL) return cachedMaestroLite
  try {
    const { getGlobalRepuestosCache } = await import('@/hooks/repuestos/useGlobalSearch')
    const warm = getGlobalRepuestosCache()
    if (warm) {
      const seen = new Set<string>()
      const out: { textoBreve: string; descripcion: string; codigoSAP: string }[] = []
      for (const r of warm) {
        if (seen.has(r.repuesto.id)) continue
        seen.add(r.repuesto.id)
        out.push({ textoBreve: r.repuesto.textoBreve || '', descripcion: r.repuesto.descripcion || '', codigoSAP: r.repuesto.codigoSAP || '' })
      }
      cachedMaestroLite = out
      maestroCacheAt = Date.now()
      return out
    }
    const snap = await getDocs(collection(db, 'repuestos'))
    const out = snap.docs.map((d) => {
      const x = d.data()
      return { textoBreve: x.textoBreve || '', descripcion: x.descripcion || '', codigoSAP: x.codigoSAP || '' }
    })
    cachedMaestroLite = out
    maestroCacheAt = Date.now()
    return out
  } catch (err) {
    logger.error('repuestoActions: error cargando maestro lite', err instanceof Error ? err : undefined)
    return cachedMaestroLite || []
  }
}

/** Repuestos con nombre parecido (para avisar posibles duplicados antes de crear) */
async function buscarParecidosPorNombre(nombre: string, excluirSap?: string): Promise<{ nombre: string; codigoSAP: string }[]> {
  const terms = normalize(nombre).split(' ').filter((t) => t.length >= 3)
  if (!terms.length) return []
  const items = await loadMaestroLite()
  const out: { nombre: string; codigoSAP: string }[] = []
  for (const x of items) {
    if (out.length >= 2) break
    if (excluirSap && x.codigoSAP === excluirSap) continue
    const blob = normalize(`${x.textoBreve} ${x.descripcion}`)
    if (terms.every((t) => blob.includes(t))) out.push({ nombre: x.textoBreve || x.descripcion, codigoSAP: x.codigoSAP })
  }
  return out
}

// ─── Deducción de clase (mismo criterio que Telegram ariaDeducirClase) ─

export function deducirClase(texto: string): MaterialClase {
  const t = texto.toUpperCase()
  if (/ACEITE|GRASA|LUBRICANTE|\bOIL\b|FLUID/.test(t)) return 'lubricante'
  if (/REFRIGERANTE|FRE[OÓ]N|AMONIACO|\bNH3\b|GLICOL/.test(t)) return 'refrigeracion'
  if (/QU[IÍ]MICO|DETERGENTE|DESINFECTANTE|SODA C[AÁ]USTICA|[AÁ]CIDO|SANITIZANTE/.test(t)) return 'quimico'
  if (/HERRAMIENTA|DESTORNILLADOR|ALICATE|TALADRO|LLAVE (PUNTA|CORONA|ALLEN|INGLESA)/.test(t)) return 'herramienta'
  if (/GUANTE|TRAPO|PAPEL|CINTA|BROCHA|PINTURA|SILICONA|TEFL[OÓ]N|SOLDADURA/.test(t)) return 'insumo'
  return 'repuesto'
}

// ─── Parser de código de fabricante ("código de fabricante es 999 0566") ─

export function parseCodigoFabricante(texto: string): string {
  const m = texto.match(/c[oó]d(?:igo)?\.?\s*(?:de\s*)?(?:fabricante|f[aá]brica|fab)\b/i)
  if (!m) return ''
  let rest = texto.slice(m.index! + m[0].length).replace(/^[\s:=,-]+/, '')
  for (;;) {
    // Relleno de conectores ("es", "que", "del SAP 1234567890 a", …) — cubre
    // frases que nombran el repuesto por SAP en la misma oración ("actualiza
    // el código de fabricante del SAP 3300138398 a LOV-13"), no solo la
    // declarativa simple ("...es LOV-13").
    const w = rest.match(/^(es|que|q|el|la|lo|su|un|una|valor|numero|n[úu]mero|del|en|para|a|sap|:|=)\b[\s:=]*/i) ||
      rest.match(/^\d{10}\b[\s:=]*/)
    if (!w) break
    rest = rest.slice(w[0].length)
  }
  const out: string[] = []
  for (const tk of rest.split(/\s+/)) {
    const clean = tk.replace(/[.,;)]+$/, '')
    if (!clean) continue
    const esCodigo = /\d/.test(clean) || /^[A-Z0-9][A-Z0-9-]*$/.test(clean)
    if (!esCodigo) break
    out.push(clean)
  }
  return out.join(' ').slice(0, 30)
}

// ─── Extracción de equipo del texto ("...para/del/en el equipo X") ───
// \b (límite de palabra) es clave: sin él, "al" matchea dentro de "materiAL"
// o "radiAL" y trunca mal la frase (bug real encontrado en dry-run con
// "agrega el material X para Knuro" → daba "X para Knuro" en vez de "Knuro").
// Se toma la ÚLTIMA preposición de la frase (más cercana al nombre del equipo).

const EQUIPO_PREPOSICION = /\b(?:para|del|de la|al|en el|en la)\b\s+(?:equipo\s+)?/gi

/** Posición (inicio de la preposición, fin de la preposición) de la ÚLTIMA
 *  ocurrencia en el texto, o null si no hay ninguna. `start` sirve para
 *  cortar el nombre (todo lo anterior a la frase de equipo); `end` para
 *  extraer el texto del equipo (todo lo posterior). */
function ultimaPosicionInicio(texto: string): { start: number; end: number } | null {
  EQUIPO_PREPOSICION.lastIndex = 0
  let found: { start: number; end: number } | null = null
  let m: RegExpExecArray | null
  while ((m = EQUIPO_PREPOSICION.exec(texto)) !== null) {
    found = { start: m.index, end: m.index + m[0].length }
    if (m[0].length === 0) EQUIPO_PREPOSICION.lastIndex++ // evitar loop infinito en match vacío
  }
  return found
}

// ─── Construcción de borrador: crear/vincular repuesto ───────────────

const TRIGGER_CREAR = /\b(cre[aá]\w*|agreg\w*|d[aá]\s+de\s+alta|d[aá]lo\s+de\s+alta|s[uú]ma\w*|registr\w*)\b/i
const PALABRA_REPUESTO = /\b(repuesto|material|insumo)\b/i

export function detectRepuestoAction(texto: string): 'create_repuesto' | 'edit_repuesto' | null {
  const t = texto.trim()
  if (!t) return null
  if (/c[oó]d(?:igo)?\.?\s*(?:de\s*)?(?:fabricante|f[aá]brica|fab)\b/i.test(t) && (TRIGGER_CREAR.test(t) || /\bpon[eé]?\w*|actualiz\w*|edit\w*|cambi\w*/i.test(t))) {
    return 'edit_repuesto'
  }
  if (TRIGGER_CREAR.test(t) && PALABRA_REPUESTO.test(t)) {
    return 'create_repuesto'
  }
  return null
}

export interface UltimoRepuesto {
  id: string
  codigoSAP: string
  nombre: string
}

// ─── "Último repuesto" — contexto local para "ese mismo repuesto" ────
// Espeja `ultimoRepuesto` de la sesión de ARIA-Telegram (Firestore, TTL 60min)
// pero en localStorage por usuario (no hay sesión de servidor en el chat PWA).

const LAST_REPUESTO_PREFIX = 'chatbot_last_repuesto_'
const LAST_REPUESTO_TTL = 60 * 60 * 1000 // 1 hora

export function saveUltimoRepuesto(userId: string, r: UltimoRepuesto): void {
  try {
    localStorage.setItem(`${LAST_REPUESTO_PREFIX}${userId}`, JSON.stringify({ ...r, at: Date.now() }))
  } catch { /* localStorage lleno o no disponible */ }
}

export function loadUltimoRepuesto(userId: string | undefined): UltimoRepuesto | null {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(`${LAST_REPUESTO_PREFIX}${userId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as UltimoRepuesto & { at: number }
    if (Date.now() - parsed.at > LAST_REPUESTO_TTL) return null
    return { id: parsed.id, codigoSAP: parsed.codigoSAP, nombre: parsed.nombre }
  } catch {
    return null
  }
}

export async function buildRepuestoDraft(
  texto: string,
): Promise<{ draft: RepuestoDraft; missingFields: string[] }> {
  const sapMatch = texto.match(/\b\d{10}\b/)
  const sap = sapMatch ? sapMatch[0] : ''
  // Una sola pasada: la posición de la última preposición sirve tanto para
  // extraer el texto del equipo (lo que sigue) como para cortar el nombre
  // (lo que precede), sin repetir el regex ni arriesgar desincronización.
  const equipoPos = ultimaPosicionInicio(texto)
  const equipoTexto = equipoPos ? texto.slice(equipoPos.end).trim().replace(/[.!?]+$/, '').slice(0, 60) : ''
  const equipo = equipoTexto ? await buscarEquipoEnJerarquia(equipoTexto) : { mejor: null, candidatos: [] }

  // SAP explícito → decisión determinista: existe→vincular, si no→crear con ese SAP
  if (sap) {
    const existente = await buscarSapEnMaestro(sap)
    if (existente) {
      return {
        draft: {
          modo: 'vincular', nombre: existente.textoBreve || existente.descripcion || '', codigoSAP: sap,
          clase: 'repuesto', equipoTexto, equipoNodeId: equipo.mejor?.id, equipoCodigo: equipo.mejor?.codigo,
          equipoNombre: equipo.mejor?.nombre, equipoCandidatos: equipo.candidatos,
          existenteId: existente.id, existenteNombre: existente.textoBreve || existente.descripcion,
        },
        missingFields: equipoTexto && !equipo.mejor ? ['equipo'] : [],
      }
    }
  }

  // Nombre: quitamos disparador + frase de equipo (todo desde la preposición
  // que la introduce) + el SAP, lo que queda es el nombre.
  const sinEquipo = equipoPos ? texto.slice(0, equipoPos.start) : texto
  let nombre = sinEquipo
    .replace(TRIGGER_CREAR, ' ')
    .replace(PALABRA_REPUESTO, ' ')
    .replace(/\b\d{10}\b/, ' ')
    .replace(/\bsap\b/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(el|la|los|las|un|una)\s+/i, '') // artículo suelto que dejan los replace de arriba
  // Sin descripción real ("crea un repuesto para la bomba") solo queda un
  // artículo suelto ("un") — tratarlo como sin nombre, no como nombre válido.
  if (/^(el|la|los|las|un|una|de|del)$/i.test(nombre)) nombre = ''
  nombre = nombre.slice(0, 120)

  const clase = deducirClase(`${nombre} ${texto}`)
  const parecidos = nombre ? await buscarParecidosPorNombre(nombre) : []

  const missingFields: string[] = []
  if (!nombre) missingFields.push('nombre')
  if (equipoTexto && !equipo.mejor) missingFields.push('equipo')

  return {
    draft: {
      modo: 'crear', nombre, codigoSAP: sap, clase, equipoTexto,
      equipoNodeId: equipo.mejor?.id, equipoCodigo: equipo.mejor?.codigo, equipoNombre: equipo.mejor?.nombre,
      equipoCandidatos: equipo.candidatos, parecidos,
    },
    missingFields,
  }
}

/** Borrador de edición de código de fabricante (usa el último repuesto si no hay SAP explícito) */
export async function buildEditDraft(
  texto: string,
  ultimoRepuesto: UltimoRepuesto | null,
): Promise<{ draft: RepuestoDraft | null; error?: string }> {
  const sapMatch = texto.match(/\b\d{10}\b/)
  const sapExplicito = sapMatch ? sapMatch[0] : null
  // SAP tipeado explícito manda; si no, "ese mismo repuesto"/"al mismo" (o la
  // ausencia total de SAP) cae al último repuesto tocado en esta sesión de chat.
  const targetSap = sapExplicito || ultimoRepuesto?.codigoSAP || null

  const valor = parseCodigoFabricante(texto)
  if (!targetSap) {
    return { draft: null, error: '¿A qué repuesto le pongo el código de fabricante? Decime el SAP (10 dígitos), o pedímelo justo después de crear/buscar uno ("al mismo").' }
  }
  if (!valor) {
    return { draft: null, error: '¿Cuál es el código de fabricante? Decímelo así: "el código de fabricante es 999 0566".' }
  }
  const existente = await buscarSapEnMaestro(targetSap)
  if (!existente) {
    return { draft: null, error: `No encontré un repuesto con SAP ${targetSap} en el maestro.` }
  }
  return {
    draft: {
      modo: 'editar', nombre: existente.textoBreve || existente.descripcion || '', codigoSAP: targetSap,
      clase: 'repuesto', codigoFabricante: valor, existenteId: existente.id, existenteNombre: existente.textoBreve || existente.descripcion,
    },
  }
}

// ─── Formato para mostrar en el chat ──────────────────────────────────

export function formatRepuestoDraftForDisplay(draft: RepuestoDraft): string {
  if (draft.modo === 'editar') {
    return `🔧 **Código de fabricante:** \`${draft.codigoFabricante}\`\n📦 **Repuesto:** ${draft.existenteNombre} (SAP \`${draft.codigoSAP}\`)`
  }
  const lines = [`📦 **Repuesto:** ${draft.nombre}`]
  if (draft.modo === 'vincular') {
    lines[0] = `📦 **Repuesto (ya existe):** ${draft.existenteNombre}`
  }
  lines.push(`🏷️ **Clase:** ${draft.clase}`)
  lines.push(draft.codigoSAP ? `🔖 **SAP:** \`${draft.codigoSAP}\`` : '🔖 **SAP:** sin código')
  lines.push(draft.equipoNombre ? `🏭 **Equipo:** ${draft.equipoNombre}` : '🏭 **Equipo:** sin vincular (se puede hacer después en la app)')
  if (draft.parecidos?.length) {
    lines.push(`⚠️ Parecidos en el maestro: ${draft.parecidos.map((p) => `${p.nombre}${p.codigoSAP ? ` (SAP ${p.codigoSAP})` : ''}`).join(' · ')} — si es uno de esos, decime "no" y lo vinculamos en vez de duplicar.`)
  }
  return lines.join('\n')
}

// ─── Ejecución (escritura confirmada) ─────────────────────────────────

async function addHistorial(repuestoId: string, campo: string, valorAnterior: unknown, valorNuevo: unknown) {
  try {
    await addDoc(collection(db, `repuestos/${repuestoId}/historial`), {
      campo, valorAnterior: valorAnterior ?? null, valorNuevo: valorNuevo ?? null, fecha: Timestamp.now(),
    })
  } catch (err) {
    logger.error('repuestoActions: error guardando historial', err instanceof Error ? err : undefined)
  }
}

export async function executeCreateRepuesto(
  draft: RepuestoDraft, userId: string, userName: string,
): Promise<{ success: boolean; repuestoId?: string; error?: string }> {
  try {
    const nuevo = {
      codigoSAP: draft.codigoSAP || '',
      codigoFabricante: '',
      textoBreve: draft.nombre,
      descripcion: '',
      nombreManual: '',
      valorUnitario: 0,
      cantidadPorMaquina: 0,
      ubicacionEnPlanta: '',
      observaciones: `Creado vía ARIA (chat) por ${userName}`,
      vinculosManual: [],
      imagenesManual: [],
      fotosReales: [],
      equipos: draft.equipoNodeId ? [draft.equipoNodeId] : [],
      equiposCodigos: draft.equipoNodeId ? [draft.equipoCodigo || `s/c:${draft.equipoNodeId}`] : [],
      clase: draft.clase,
      tieneSap: Boolean(draft.codigoSAP),
      plantId: 'chonchi',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }
    const docRef = await addDoc(collection(db, 'repuestos'), nuevo)
    await addHistorial(docRef.id, 'creacion', null, JSON.stringify({ textoBreve: draft.nombre, clase: draft.clase, codigoSAP: draft.codigoSAP, equipo: draft.equipoNombre || null }))
    await writeAuditLog({
      action: 'create', collection: 'repuestos', documentId: docRef.id,
      documentLabel: `${draft.codigoSAP || 's/SAP'} — ${draft.nombre}`,
      userId, userName, after: nuevo, metadata: { source: 'aria-chat' },
    })
    logger.info('repuestoActions: repuesto creado vía ARIA chat', { repuestoId: docRef.id })
    return { success: true, repuestoId: docRef.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    logger.error('repuestoActions: error creando repuesto', err instanceof Error ? err : undefined)
    return { success: false, error: msg }
  }
}

export async function executeVincularRepuesto(
  draft: RepuestoDraft, userId: string, userName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!draft.existenteId || !draft.equipoNodeId) return { success: false, error: 'Falta el repuesto o el equipo a vincular.' }
    const ref = doc(db, 'repuestos', draft.existenteId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return { success: false, error: 'El repuesto ya no existe en el maestro.' }
    const data = snap.data()
    const equipos: string[] = Array.isArray(data.equipos) ? data.equipos : []
    const equiposCodigos: string[] = Array.isArray(data.equiposCodigos) ? data.equiposCodigos : []
    if (!equipos.includes(draft.equipoNodeId)) equipos.push(draft.equipoNodeId)
    const codigoTag = draft.equipoCodigo || `s/c:${draft.equipoNodeId}`
    if (!equiposCodigos.includes(codigoTag)) equiposCodigos.push(codigoTag)
    await updateDoc(ref, { equipos, equiposCodigos, updatedAt: Timestamp.now() })
    await addHistorial(draft.existenteId, 'equipos', data.equipos || [], equipos)
    await writeAuditLog({
      action: 'update', collection: 'repuestos', documentId: draft.existenteId,
      documentLabel: `${draft.codigoSAP} — ${draft.existenteNombre}`,
      userId, userName, before: { equipos: data.equipos }, after: { equipos }, metadata: { source: 'aria-chat' },
    })
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    logger.error('repuestoActions: error vinculando repuesto', err instanceof Error ? err : undefined)
    return { success: false, error: msg }
  }
}

export async function executeEditRepuesto(
  draft: RepuestoDraft, userId: string, userName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!draft.existenteId || !draft.codigoFabricante) return { success: false, error: 'Falta el repuesto o el valor a editar.' }
    const ref = doc(db, 'repuestos', draft.existenteId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return { success: false, error: 'El repuesto ya no existe en el maestro.' }
    const anterior = snap.data().codigoFabricante || ''
    await updateDoc(ref, { codigoFabricante: draft.codigoFabricante, updatedAt: Timestamp.now() })
    await addHistorial(draft.existenteId, 'codigoFabricante', anterior, draft.codigoFabricante)
    await writeAuditLog({
      action: 'update', collection: 'repuestos', documentId: draft.existenteId,
      documentLabel: `${draft.codigoSAP} — ${draft.existenteNombre}`,
      userId, userName, before: { codigoFabricante: anterior }, after: { codigoFabricante: draft.codigoFabricante },
      metadata: { source: 'aria-chat' },
    })
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    logger.error('repuestoActions: error editando repuesto', err instanceof Error ? err : undefined)
    return { success: false, error: msg }
  }
}
