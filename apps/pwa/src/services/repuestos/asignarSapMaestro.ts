/**
 * Asignar un código SAP a una pieza del maestro `repuestos` — lógica compartida.
 *
 * Dos usos:
 *  - «Asignar SAP» a una pieza de despiece (RepuestosAreaHub.handleAsignarSap): si el SAP ya existe en
 *    otro doc del maestro se FUSIONAN (`buscarDestinoDeFusion`); si no, se le asigna al mismo doc.
 *  - Alta de código A3C: bodega registra el SAP que creó para un código de fabricante
 *    (`registrarAltaConMaestro`: maestro + alta en UNA transacción; `planAltaSap` decide, es pura).
 *
 * ATOMICIDAD (`registrarAltaConMaestro`): el SDK de cliente no permite consultas dentro de una
 * transacción, así que las consultas (docs con ese código de fabricante, doc con ese SAP por campo) buscan
 * los CANDIDATOS fuera, y la transacción relee cada candidato por id junto con `repuestos/{SAP}` y la alta,
 * y decide con lo que lee ahí. Nunca hay `setDoc` sobre un doc que existe.
 *
 * LÍMITES QUE QUEDAN (documentados, no resueltos):
 *  1. Dos altas DISTINTAS a las que se les registra el MISMO SAP en el mismo instante pueden confirmarse las dos,
 *     porque no hay una reserva única por SAP. Si ambas van a CREAR `repuestos/{SAP}`, Firestore las serializa
 *     (las dos leen ese doc y la segunda reintenta y ve el de la primera → error). Pero si cada una le ASIGNA el
 *     SAP a un doc de despiece distinto (ninguna escribe `repuestos/{SAP}`), no hay conflicto y ambas cierran.
 *     El riesgo práctico es bajo: el número lo asigna SAP. Arreglo futuro: un doc de reserva por SAP creado
 *     dentro de la misma transacción.
 *  2. Un doc NUEVO con ese código de fabricante (o con ese SAP en el campo, con otro id) creado justo entre la
 *     consulta y la transacción no se ve: el SDK de cliente no consulta dentro de una transacción. Un doc con
 *     id = SAP sí se ve.
 */
import { collection, doc, getDoc, getDocs, limit, query, runTransaction, serverTimestamp, Timestamp, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { getGlobalRepuestosCache } from '@/hooks/repuestos/useGlobalSearch'
import { normCodigo } from '@/utils/repuestos/normCodigo'

/** El SAP de un alta: exactamente 10 dígitos (lo exige firestore.rules). */
export const esSapDeAlta = (s: string) => /^\d{10}$/.test(s.trim())

export interface RepuestoMinimo {
  id: string
  codigoSAP?: string
  codigoFabricante?: string
  textoBreve?: string
}

/**
 * «Asignar SAP» desde el hub: el doc (ya existente) que tiene ese SAP y no es la pieza de despiece. Si
 * existe, el despiece se fusiona en él; si no, el SAP se le asigna a la propia pieza.
 */
export function buscarDestinoDeFusion<T extends RepuestoMinimo>(sap: string, despieceId: string, repuestos: readonly T[]): T | undefined {
  const s = sap.trim()
  return repuestos.find((r) => (r.codigoSAP || '').trim() === s && r.id !== despieceId)
}

export type PlanAltaSap =
  /** El SAP ya es un doc del maestro (id = SAP o campo codigoSAP): se le completa el código de fabricante. */
  | { accion: 'completar-fabricante'; id: string; escribe: boolean }
  /** Hay un doc con ese código de fabricante y sin SAP: se le asigna el SAP. */
  | { accion: 'asignar-sap'; id: string }
  /** El doc con ese código de fabricante ya tiene este mismo SAP: no hay nada que escribir. */
  | { accion: 'ya-estaba'; id: string }
  /** No hay ninguno: se crea `repuestos/{SAP}`. */
  | { accion: 'crear'; id: string }
  /** El SAP ya es OTRO repuesto (otro código de fabricante): no se cierra el alta vinculada a él. */
  | { accion: 'error'; motivo: 'sap-de-otro-repuesto'; id: string; nombre: string; codigoFabricante: string }

/**
 * Qué hacer en el maestro al registrar el SAP de un alta. Orden:
 *  1. El SAP ya es un doc del maestro (`repuestos/{SAP}` o campo codigoSAP):
 *     - sin código de fabricante → se lo completa;
 *     - con ESTE código de fabricante → nada que escribir;
 *     - con OTRO → ERROR `sap-de-otro-repuesto` (el alta no puede quedar vinculada a otro repuesto).
 *  2. Un doc con ese código de fabricante y sin SAP → se le asigna el SAP.
 *  3. Nada → se crea `repuestos/{SAP}`.
 */
export function planAltaSap(args: {
  sap: string
  codigoFabricante: string
  /** Docs del maestro cuyo codigoFabricante coincide (normalizado) con el del alta. */
  porFabricante: readonly RepuestoMinimo[]
  /** El doc del maestro que ya es este SAP (por id o por campo), si existe. */
  conEseSap?: RepuestoMinimo | null
}): PlanAltaSap {
  const sap = args.sap.trim()
  const norm = normCodigo(args.codigoFabricante)
  const { conEseSap } = args
  if (conEseSap) {
    const fab = normCodigo(conEseSap.codigoFabricante || '')
    if (fab && fab !== norm) {
      return {
        accion: 'error',
        motivo: 'sap-de-otro-repuesto',
        id: conEseSap.id,
        nombre: conEseSap.textoBreve || conEseSap.codigoFabricante || 'otro repuesto',
        codigoFabricante: conEseSap.codigoFabricante || '',
      }
    }
    return { accion: 'completar-fabricante', id: conEseSap.id, escribe: !fab }
  }
  const sinSap = args.porFabricante.find((r) => normCodigo(r.codigoFabricante || '') === norm && !(r.codigoSAP || '').trim())
  if (sinSap) return { accion: 'asignar-sap', id: sinSap.id }
  const mismo = args.porFabricante.find((r) => normCodigo(r.codigoFabricante || '') === norm && (r.codigoSAP || '').trim() === sap)
  if (mismo) return { accion: 'ya-estaba', id: mismo.id }
  return { accion: 'crear', id: sap }
}

/**
 * Formas en que el maestro puede tener guardado un código de fabricante: tal cual, normalizado y, si es
 * corto, con UN espacio o guion en cada posición («999 0608», «999-0608»). El maestro no tiene un campo
 * normalizado, así que no se puede consultar de otra manera sin leerlo entero.
 */
export function variantesDeCodigo(codigo: string): string[] {
  const crudo = codigo.trim()
  const norm = normCodigo(crudo)
  const v = new Set<string>([crudo, norm].filter(Boolean))
  if (norm.length >= 4 && norm.length <= 12) {
    for (let i = 1; i < norm.length; i++) {
      v.add(`${norm.slice(0, i)} ${norm.slice(i)}`)
      v.add(`${norm.slice(0, i)}-${norm.slice(i)}`)
    }
  }
  return [...v].slice(0, 30) // tope del `in` de Firestore
}

function minimo(id: string, x: Record<string, unknown>): RepuestoMinimo {
  return {
    id,
    codigoSAP: typeof x.codigoSAP === 'string' ? x.codigoSAP : '',
    codigoFabricante: typeof x.codigoFabricante === 'string' ? x.codigoFabricante : '',
    textoBreve: typeof x.textoBreve === 'string' ? x.textoBreve : '',
  }
}

/** El repuesto del maestro que ya es ese SAP (doc con id = SAP, o con el campo codigoSAP), o null. */
export async function buscarRepuestoPorSap(sap: string): Promise<RepuestoMinimo | null> {
  const s = sap.trim()
  if (!s) return null
  const porId = await getDoc(doc(db, 'repuestos', s))
  if (porId.exists()) return minimo(porId.id, porId.data())
  const q = await getDocs(query(collection(db, 'repuestos'), where('codigoSAP', '==', s), limit(1)))
  const d = q.docs[0]
  return d ? minimo(d.id, d.data()) : null
}

export type CodigoErrorAlta = 'sap-invalido' | 'alta-inexistente' | 'alta-no-pendiente' | 'sap-de-otro-repuesto'

/** Error de negocio al registrar un alta: `message` es apto para mostrárselo a bodega. */
export class ErrorAltaSap extends Error {
  readonly codigo: CodigoErrorAlta
  constructor(codigo: CodigoErrorAlta, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorAltaSap'
    this.codigo = codigo
  }
}

export interface ResultadoMaestro {
  plan: Exclude<PlanAltaSap['accion'], 'error'>
  id: string
}

/**
 * Registra el SAP de un alta: lee el alta, `repuestos/{SAP}` y los candidatos del código de fabricante DENTRO
 * de una transacción y escribe maestro + alta de forma atómica. Exige que el alta siga `pendiente` (si otro
 * operador ya la cerró, no escribe nada) y que el SAP no sea de otro repuesto.
 */
export async function registrarAltaConMaestro(args: {
  altaId: string
  sap: string
  origen: 'nuevo' | 'ya_existia'
  userId: string
  userName: string
}): Promise<ResultadoMaestro> {
  const sap = args.sap.trim()
  if (!esSapDeAlta(sap)) throw new ErrorAltaSap('sap-invalido', 'El SAP debe tener 10 dígitos.')
  const altaRef = doc(db, 'solicitudes_repuestos', args.altaId)

  // Fuera de la transacción (el SDK no consulta dentro): quiénes PODRÍAN ser el doc de este código/SAP.
  const previa = await getDoc(altaRef)
  if (!previa.exists()) throw new ErrorAltaSap('alta-inexistente', 'La solicitud de alta ya no existe.')
  const fab = String(previa.data().codigoFabricante ?? '').trim()
  const ids = new Set<string>()
  const [porFab, porCampoSap] = await Promise.all([
    getDocs(query(collection(db, 'repuestos'), where('codigoFabricante', 'in', variantesDeCodigo(fab)), limit(20))),
    getDocs(query(collection(db, 'repuestos'), where('codigoSAP', '==', sap), limit(1))),
  ])
  porFab.docs.forEach((d) => ids.add(d.id))
  porCampoSap.docs.forEach((d) => ids.add(d.id))
  // Caché global del maestro (si está tibia): atrapa variantes con separadores que la consulta no enumera.
  const norm = normCodigo(fab)
  for (const r of getGlobalRepuestosCache() ?? []) {
    if (norm && normCodigo(r.repuesto.codigoFabricante || '') === norm) ids.add(r.repuesto.id)
  }
  ids.delete(sap) // se lee siempre aparte, por su id

  return runTransaction(db, async (tx) => {
    // ── Lecturas (todas antes de escribir) ──
    const altaSnap = await tx.get(altaRef)
    if (!altaSnap.exists()) throw new ErrorAltaSap('alta-inexistente', 'La solicitud de alta ya no existe.')
    if (altaSnap.data().estado !== 'pendiente') {
      throw new ErrorAltaSap('alta-no-pendiente', 'Otra persona ya resolvió esta alta. Recarga la lista.')
    }
    const codigoFabricante = String(altaSnap.data().codigoFabricante ?? '').trim()
    const textoBreve = String(altaSnap.data().textoBreve ?? '')
    const sapRef = doc(db, 'repuestos', sap)
    const sapSnap = await tx.get(sapRef)
    const candidatos: RepuestoMinimo[] = []
    for (const id of ids) {
      const s = await tx.get(doc(db, 'repuestos', id))
      if (s.exists()) candidatos.push(minimo(id, s.data()))
    }
    const conEseSap = sapSnap.exists()
      ? minimo(sap, sapSnap.data())
      : (candidatos.find((c) => (c.codigoSAP || '').trim() === sap) ?? null)

    const plan = planAltaSap({ sap, codigoFabricante, porFabricante: candidatos, conEseSap })
    if (plan.accion === 'error') {
      throw new ErrorAltaSap('sap-de-otro-repuesto', `El SAP ${sap} ya es «${plan.nombre}»${plan.codigoFabricante ? ` (fabricante ${plan.codigoFabricante})` : ''} en el maestro: revisa el número.`)
    }

    // ── Escrituras: maestro + alta, atómicas ──
    const ahora = Timestamp.now()
    if (plan.accion === 'asignar-sap') {
      tx.update(doc(db, 'repuestos', plan.id), { codigoSAP: sap, tieneSap: true, solicitudAltaId: args.altaId, updatedAt: ahora })
    } else if (plan.accion === 'completar-fabricante') {
      if (plan.escribe) tx.update(doc(db, 'repuestos', plan.id), { codigoFabricante: codigoFabricante, updatedAt: ahora })
    } else if (plan.accion === 'crear') {
      // El doc `repuestos/{SAP}` NO existe (lo leímos arriba, en esta misma transacción): no pisa nada.
      tx.set(sapRef, {
        codigoSAP: sap,
        codigoFabricante,
        textoBreve,
        tieneSap: true,
        origen: 'alta_codigo',
        solicitudAltaId: args.altaId,
        createdAt: ahora,
        updatedAt: ahora,
      })
    }
    tx.update(altaRef, {
      estado: 'creada',
      sapCreado: sap,
      codigoSAP: sap,
      origenSap: args.origen,
      creadaPor: args.userId,
      creadaPorNombre: args.userName,
      creadaAt: serverTimestamp(),
    })
    return { plan: plan.accion, id: plan.id }
  })
}
