/**
 * Escritura de repuestos de ARIA — la ÚNICA lógica que graba en el maestro `repuestos` desde un chat.
 *
 * POR QUÉ EXISTE
 * --------------
 * Regla de Orel (11-11-2026, «ARIA y Aiko en piedra»): la PWA es de ARIA y Aiko —la asistente personal de
 * Orel— no puede tener una copia propia de esta lógica. Hasta ahora estas funciones vivían sueltas en
 * index.js (ariaAdjuntarFotoARepuesto, ariaCrearRepuestoNuevo, ariaEditarRepuesto) y Aiko había escrito
 * su propia versión en Python, sin `historial`, `audit_log` ni `plantId`.
 *
 * Ahora:
 *  - Los tres escritores de ARIA viven aquí con las dependencias inyectadas (db, Storage, Telegram).
 *    index.js deja envoltorios con el mismo nombre y firma: ARIA se comporta igual (lo fija el test).
 *  - `completar` agrega varios campos a un repuesto existente, SOLO si están vacíos.
 *  - `atenderPedidoAiko` es el endpoint `ariaRepuestoDesdeFoto`: Aiko le pide a ARIA que grabe lo que Orel
 *    ya aprobó con ✅. Falla cerrado: token de la cuenta de servicio, lista blanca de campos, SAP válido,
 *    búsqueda por id Y por `codigoSAP` (218 repuestos tienen id ≠ SAP) y 409 ante cualquier conflicto.
 */

const SAP_VALIDO = /^\d{7,10}$/
const CAMPOS_AIKO = ['textoBreve', 'ubicacionBodega', 'marca', 'codigoFabricante', 'observaciones']
const MAX_FOTO_BYTES = 8 * 1024 * 1024
const MAX_TEXTO = 300

class ConflictoRepuesto extends Error {
  constructor(motivo, extra = {}) {
    super(motivo)
    this.motivo = motivo
    Object.assign(this, extra)
  }
}

/**
 * @param deps.db           Firestore (admin)
 * @param deps.FieldValue   FieldValue de firebase-admin/firestore
 * @param deps.randomUUID   crypto.randomUUID
 * @param deps.subirFoto    (docId, buffer, idx, carpeta) => url   (uploadPhotoToStorage de index.js)
 * @param deps.alCambiar    () => void   invalida el caché de búsqueda de ARIA
 */
function crearEscritorRepuestos({ db, FieldValue, randomUUID, subirFoto, alCambiar = () => {} }) {
  /** Sube la foto a Storage y la agrega a fotosReales del repuesto (escritura confirmada) */
  async function adjuntarFoto(codigoSAP, obtenerFoto) {
    const snap = await db.collection('repuestos').where('codigoSAP', '==', codigoSAP).limit(1).get()
    if (snap.empty) throw new Error(`no encontré el repuesto SAP ${codigoSAP} al confirmar`)
    const doc = snap.docs[0]
    const buffer = await obtenerFoto()
    const url = await subirFoto(doc.id, buffer, 0, 'repuestos')
    await doc.ref.update({
      // FieldValue.serverTimestamp() no se puede usar DENTRO de un elemento de arrayUnion
      // (Firestore lo rechaza) — se usa Date() normal, igual que uploadPhotoToStorage/tgHandlePhoto.
      fotosReales: FieldValue.arrayUnion({
        id: randomUUID(), url, descripcion: 'Foto vía ARIA (Telegram)', orden: 0, esPrincipal: false,
        tipo: 'real', createdAt: new Date(),
      }),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return doc.data()
  }

  /**
   * Crea un repuesto NUEVO en el maestro `repuestos` (escritura confirmada) —
   * misma forma que useRepuestoCrud.createRepuesto de la PWA, + `plantId` (regla
   * multi-planta 2026-07-04) + historial/audit_log para trazabilidad.
   * `opciones` (solo Aiko): extra = campos de la lista blanca que pisan los vacíos por defecto;
   * fuente / descripcionFoto para la trazabilidad. Sin opciones, idéntico a ARIA.
   */
  async function crearNuevo(pending, fromName, telegramUserId, obtenerFoto = null, opciones = {}) {
    const codigoSAP = pending.codigoSAP || ''
    const fuente = opciones.fuente || 'aria-telegram'
    const descripcionFoto = opciones.descripcionFoto || 'Foto vía ARIA (Telegram)'
    const nuevo = {
      codigoSAP,
      codigoFabricante: '',
      textoBreve: pending.nombre,
      descripcion: pending.descFoto || '',
      nombreManual: '',
      valorUnitario: 0,
      cantidadPorMaquina: 0,
      ubicacionEnPlanta: '',
      observaciones: `Creado vía ARIA (Telegram) por ${fromName}`,
      vinculosManual: [],
      imagenesManual: [],
      fotosReales: [],
      equipos: pending.equipoNodeId ? [pending.equipoNodeId] : [],
      equiposCodigos: pending.equipoNodeId ? [(pending.equipoCodigo || '').trim() || `s/c:${pending.equipoNodeId}`] : [],
      clase: pending.clase || 'repuesto',
      tieneSap: Boolean(codigoSAP),
      plantId: 'chonchi',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(opciones.extra || {}),
    }
    // Convención del maestro: docId = código SAP cuando existe; .create() falla si
    // ya hay un doc con ese id (no pisa un material existente)
    const ref = codigoSAP ? db.collection('repuestos').doc(codigoSAP) : db.collection('repuestos').doc()
    await ref.create(nuevo)

    let url = null
    if (obtenerFoto) {
      const buffer = await obtenerFoto()
      url = await subirFoto(ref.id, buffer, 0, 'repuestos')
      await ref.update({
        fotosReales: FieldValue.arrayUnion({
          id: randomUUID(), url, descripcion: descripcionFoto, orden: 0, esPrincipal: true,
          tipo: 'real', createdAt: new Date(), subidaPor: `ARIA (Telegram) — ${fromName}`,
        }),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
    // Trazabilidad con la misma forma que la PWA (useRepuestoCrud + writeAuditLog)
    await ref.collection('historial').add({
      campo: 'creacion', valorAnterior: null,
      valorNuevo: JSON.stringify({ textoBreve: pending.nombre, clase: nuevo.clase, codigoSAP, equipo: pending.equipoNombre || null }),
      fecha: FieldValue.serverTimestamp(),
    })
    await db.collection('audit_log').add({
      action: 'create', collection: 'repuestos', documentId: ref.id,
      documentLabel: `${codigoSAP || 's/SAP'} — ${pending.nombre}`,
      userId: `telegram:${telegramUserId}`, userName: fromName,
      metadata: { source: fuente },
      timestamp: FieldValue.serverTimestamp(),
    })
    alCambiar() // que la próxima búsqueda ya lo vea
    return opciones.conUrl ? { docId: ref.id, fotoUrl: url } : ref.id
  }

  /**
   * Edita un campo simple de un repuesto EXISTENTE (hoy: codigoFabricante) + foto
   * opcional. Misma trazabilidad que la PWA (historial + audit_log). Escritura
   * confirmada.
   */
  async function editar(pending, fromName, telegramUserId, obtenerFoto = null) {
    const snap = await db.collection('repuestos').where('codigoSAP', '==', pending.codigoSAP).limit(1).get()
    if (snap.empty) throw new Error(`no encontré el repuesto SAP ${pending.codigoSAP} al confirmar`)
    const doc = snap.docs[0]
    const anterior = doc.data()[pending.campo] || ''
    const update = { [pending.campo]: pending.valor, updatedAt: FieldValue.serverTimestamp() }
    if (obtenerFoto) {
      const buffer = await obtenerFoto()
      const url = await subirFoto(doc.id, buffer, 0, 'repuestos')
      update.fotosReales = FieldValue.arrayUnion({
        id: randomUUID(), url, descripcion: 'Foto vía ARIA (Telegram)', orden: 0, esPrincipal: false,
        tipo: 'real', createdAt: new Date(), subidaPor: `ARIA (Telegram) — ${fromName}`,
      })
    }
    await doc.ref.update(update)
    await doc.ref.collection('historial').add({
      campo: pending.campo, valorAnterior: anterior || null, valorNuevo: pending.valor,
      fecha: FieldValue.serverTimestamp(),
    })
    await db.collection('audit_log').add({
      action: 'update', collection: 'repuestos', documentId: doc.id,
      documentLabel: `${pending.codigoSAP} — ${pending.nombre || ''}`.trim(),
      userId: `telegram:${telegramUserId}`, userName: fromName,
      metadata: { source: 'aria-telegram', campo: pending.campo },
      timestamp: FieldValue.serverTimestamp(),
    })
    alCambiar()
    return doc.id
  }

  /**
   * Completa VARIOS campos de un repuesto existente, solo si están vacíos (si alguno ya tiene valor,
   * lanza ConflictoRepuesto y no escribe nada), + foto opcional. Misma trazabilidad que `editar`.
   */
  async function completar(docId, campos, fromName, userId, obtenerFoto = null, opciones = {}) {
    const ref = db.collection('repuestos').doc(docId)
    const snap = await ref.get()
    if (!snap.exists) throw new ConflictoRepuesto('no_existe')
    const actual = snap.data() || {}
    const ocupados = Object.keys(campos).filter((k) => String(actual[k] ?? '').trim())
    if (ocupados.length) throw new ConflictoRepuesto('campo_ocupado', { campos: ocupados })
    const update = { ...campos, updatedAt: FieldValue.serverTimestamp() }
    let url = null
    if (obtenerFoto) {
      const buffer = await obtenerFoto()
      url = await subirFoto(ref.id, buffer, 0, 'repuestos')
      update.fotosReales = FieldValue.arrayUnion({
        id: randomUUID(), url, descripcion: opciones.descripcionFoto || 'Foto vía ARIA (Telegram)', orden: 0,
        esPrincipal: false, tipo: 'real', createdAt: new Date(), subidaPor: `ARIA (Telegram) — ${fromName}`,
      })
    }
    await ref.update(update)
    for (const [campo, valor] of Object.entries(campos)) {
      await ref.collection('historial').add({ campo, valorAnterior: null, valorNuevo: valor, fecha: FieldValue.serverTimestamp() })
    }
    await db.collection('audit_log').add({
      action: 'update', collection: 'repuestos', documentId: ref.id,
      documentLabel: `${actual.codigoSAP || docId} — ${actual.textoBreve || ''}`.trim(),
      userId, userName: fromName,
      metadata: { source: opciones.fuente || 'aria-telegram', campos: Object.keys(campos), foto: Boolean(url) },
      timestamp: FieldValue.serverTimestamp(),
    })
    alCambiar()
    return { docId: ref.id, fotoUrl: url }
  }

  return { adjuntarFoto, crearNuevo, editar, completar }
}

/** Todos los documentos de un SAP: por id del documento Y por el campo codigoSAP (sin repetir). */
async function buscarPorSap(db, sap) {
  const ids = new Set()
  const porId = await db.collection('repuestos').doc(sap).get()
  if (porId.exists) ids.add(porId.id)
  const porCampo = await db.collection('repuestos').where('codigoSAP', '==', sap).limit(5).get()
  porCampo.docs.forEach((d) => ids.add(d.id))
  return [...ids]
}

/** Valida el cuerpo del pedido de Aiko. Devuelve { error } o el pedido limpio. */
function validarPedido(body) {
  const b = body && typeof body === 'object' ? body : {}
  const sap = String(b.sap || '')
  if (!SAP_VALIDO.test(sap)) return { error: 'sap_invalido' }
  if (b.modo !== 'crear' && b.modo !== 'completar') return { error: 'modo_invalido' }
  const campos = b.campos && typeof b.campos === 'object' && !Array.isArray(b.campos) ? b.campos : null
  if (!campos) return { error: 'campos_invalidos' }
  const limpios = {}
  for (const [k, v] of Object.entries(campos)) {
    if (!CAMPOS_AIKO.includes(k) || typeof v !== 'string' || !v.trim() || v.length > MAX_TEXTO) {
      return { error: 'campo_no_permitido', campo: k }
    }
    limpios[k] = v.trim()
  }
  if (b.modo === 'crear' && !limpios.textoBreve) return { error: 'falta_texto_breve' }
  let foto = null
  if (b.fotoBase64 != null) {
    if (typeof b.fotoBase64 !== 'string') return { error: 'foto_invalida' }
    foto = Buffer.from(b.fotoBase64, 'base64')
    if (!foto.length || foto.length > MAX_FOTO_BYTES) return { error: 'foto_invalida' }
  }
  if (b.modo === 'completar' && !Object.keys(limpios).length && !foto) return { error: 'nada_que_grabar' }
  const docId = b.docId == null ? null : String(b.docId)
  if (docId !== null && !/^[\w-]{1,128}$/.test(docId)) return { error: 'doc_invalido' }
  return { sap, modo: b.modo, campos: limpios, foto, docId }
}

/**
 * El endpoint `ariaRepuestoDesdeFoto`, sin Express: devuelve { status, json }.
 * @param verificar  (token) => email verificado del llamador (lanza si el token no sirve)
 * @param permitido  email de la cuenta de servicio autorizada
 */
async function atenderPedidoAiko({ metodo, autorizacion, body, verificar, permitido, db, escritor }) {
  if (metodo !== 'POST') return { status: 405, json: { error: 'solo_post' } }
  const m = /^Bearer (.+)$/.exec(autorizacion || '')
  if (!m) return { status: 401, json: { error: 'sin_token' } }
  let email
  try {
    email = await verificar(m[1])
  } catch {
    return { status: 401, json: { error: 'token_invalido' } }
  }
  if (!email || email !== permitido) return { status: 403, json: { error: 'no_autorizado' } }
  const p = validarPedido(body)
  if (p.error) return { status: 400, json: p }
  const ids = await buscarPorSap(db, p.sap)
  const obtenerFoto = p.foto ? async () => p.foto : null
  const quien = 'Aiko (Telegram de Orel)'
  try {
    if (p.modo === 'crear') {
      if (ids.length) return { status: 409, json: { error: 'ya_existe', ids } }
      const { textoBreve, ...extra } = p.campos
      const r = await escritor.crearNuevo({ codigoSAP: p.sap, nombre: textoBreve }, quien, 'aiko', obtenerFoto,
        { extra, fuente: 'aiko-telegram', descripcionFoto: 'Foto vía Aiko → ARIA (Telegram)', conUrl: true })
      return { status: 200, json: { ok: true, ...r } }
    }
    if (ids.length !== 1 || (p.docId && ids[0] !== p.docId)) return { status: 409, json: { error: 'no_unico', ids } }
    const r = await escritor.completar(ids[0], p.campos, quien, 'telegram:aiko', obtenerFoto,
      { fuente: 'aiko-telegram', descripcionFoto: 'Foto vía Aiko → ARIA (Telegram)' })
    return { status: 200, json: { ok: true, ...r } }
  } catch (e) {
    if (e instanceof ConflictoRepuesto) return { status: 409, json: { error: e.motivo, campos: e.campos } }
    if (e && (e.code === 6 || /already exists/i.test(String(e.message)))) return { status: 409, json: { error: 'ya_existe' } }
    throw e
  }
}

module.exports = { crearEscritorRepuestos, atenderPedidoAiko, validarPedido, buscarPorSap, ConflictoRepuesto, CAMPOS_AIKO, SAP_VALIDO }
