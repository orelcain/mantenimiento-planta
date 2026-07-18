/**
 * useBodega — Hook para gestión de bodega de repuestos
 *
 * Combina el catálogo del maestro `repuestos` (vía useGlobalSearch → `catalogRepuestos`)
 * con la colección `bodega/{codigoSAP}` (stock overlay). El stock solo se engancha
 * cuando el material tiene SAP.
 *
 * Colecciones Firestore:
 *  - bodega/{codigoSAP}              → stock, ubicación, proveedor, mínimos
 *  - bodega/{codigoSAP}/movimientos   → historial de entradas/salidas/ajustes
 *  - bodega_inventarios/{id}          → sesiones de inventario periódico
 *  - bodega_inventarios/{id}/conteos  → conteos individuales por SAP
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'
import { uploadBodegaPhoto, deleteBodegaPhoto } from '@/services/storage'
import type { GlobalSearchResult } from '@/hooks/repuestos/useGlobalSearch'
import type { MaterialClase } from '@/types/repuestos'

// ══════════════════════════════════════════════
//  TIPOS
// ══════════════════════════════════════════════

export interface BodegaOverlay {
  id: string
  codigoSAP: string
  /** Nombre denormalizado del catálogo (`repuestos.textoBreve`). Lo mantienen
   *  los write-paths de este hook + scripts/backfill-bodega-texto-breve.js;
   *  hace al doc de bodega auto-descriptivo (cards con nombre sin esperar el
   *  merge con el maestro completo). */
  textoBreve?: string
  stockActual: number
  stockMinimo: number
  stockMaximo?: number
  ubicacionBodega: string
  /** Ubicación estructurada (opcional) — Pasillo / Estante / Nivel */
  pasillo?: string
  estante?: string
  nivel?: string
  proveedor?: string
  costoCompra?: number
  unidad: string
  leadTime?: number // días de entrega del proveedor
  ultimaCompra?: Date
  categoria?: 'A' | 'B' | 'C' // clasificación ABC
  observaciones?: string
  /** Sello del último conteo físico (ver `registrarConteo`). */
  ultimoConteoAt?: Date
  ultimoConteoPor?: string
  fotos?: string[]
  createdAt: Date
  updatedAt: Date
}

export interface BodegaMergedItem {
  /** Clave estable y única del item agregado (sap || fab:<fab> || id:<machineId>:<repId>).
   *  Para selección/keys de React: codigoSAP NO sirve (vacío en repuestos sin SAP). */
  rowKey: string
  codigoSAP: string
  codigoFabricante: string
  textoBreve: string
  alias?: string
  nombresComunes?: string[]
  /** Slugs de máquina para las que este repuesto es "común" (marca compartida). */
  comunEn?: string[]
  tipo?: string
  /** Clase del material (maestro unificado): repuesto·insumo·herramienta·… */
  clase?: MaterialClase
  /** ¿tiene SAP real? tier 1 (ordenable) vs tier 2 (despiece) */
  tieneSap?: boolean
  /** Familia SAP (para agrupar transversales sin equipo) */
  familia?: string
  /** Marca física (motores/bombas migrados de plantAssets) — buscable */
  marca?: string
  /** Modelo/tipo físico (ej. RNYM08-1320B-30) — buscable */
  modeloTipo?: string
  descripcion?: string
  /** Observaciones del doc de catálogo (`repuestos`), distintas de las de bodega. */
  observacionesRepuesto?: string
  valorUnitario: number
  equipos: { machineId: string; machineName: string }[]
  bodegaId?: string
  stockActual: number
  stockMinimo: number
  stockMaximo?: number
  ubicacionBodega: string
  /** Ubicación estructurada (opcional) — Pasillo / Estante / Nivel */
  pasillo?: string
  estante?: string
  nivel?: string
  proveedor?: string
  costoCompra?: number
  unidad: string
  leadTime?: number
  ultimaCompra?: Date
  categoria?: 'A' | 'B' | 'C'
  observaciones?: string
  /** Último conteo físico (sello de `registrarConteo`): distingue "contado y da
   *  0" de "nunca contado" — el stock importado no tiene ningún movimiento. */
  ultimoConteoAt?: Date
  ultimoConteoPor?: string
  fotos?: string[]
  /** Fotos del catálogo (fotosReales > imagenesManual > gallery del doc Repuesto).
   *  Complementan `fotos` (overlay de bodega) para mostrar el repuesto aunque
   *  bodega no tenga foto propia. */
  fotosCatalogo?: string[]
  isWatched?: boolean
}

export interface MovimientoBodega {
  id: string
  bodegaItemId: string
  tipo: 'entrada' | 'salida' | 'ajuste'
  cantidad: number
  stockResultante: number
  motivo: string
  realizadoPor: string
  realizadoPorNombre: string
  createdAt: Date
}

export interface BodegaStockData {
  stockActual: number
  stockMinimo: number
  stockMaximo?: number
  ubicacionBodega: string
  /** Ubicación estructurada (opcional) — Pasillo / Estante / Nivel */
  pasillo?: string
  estante?: string
  nivel?: string
  proveedor?: string
  costoCompra?: number
  unidad: string
  leadTime?: number
  categoria?: 'A' | 'B' | 'C'
  observaciones?: string
}

export interface MovimientoFormData {
  tipo: 'entrada' | 'salida' | 'ajuste'
  cantidad: number
  motivo: string
}

// ── Inventario periódico ──

export interface InventarioSesion {
  id: string
  nombre: string
  estado: 'en_curso' | 'finalizado'
  creadoPor: string
  creadoPorNombre: string
  totalItems: number
  contados: number
  conDiferencia: number
  createdAt: Date
  closedAt?: Date
}

export interface InventarioConteo {
  id: string
  codigoSAP: string
  textoBreve: string
  stockSistema: number
  stockFisico: number | null // null = no contado aún
  diferencia: number
  contadoPor?: string
  contadoPorNombre?: string
  observaciones?: string
  createdAt: Date
}

// ══════════════════════════════════════════════
//  CONSTANTES
// ══════════════════════════════════════════════

const BODEGA_COL = 'bodega'
const INVENTARIO_COL = 'bodega_inventarios'

function tsToDate(ts: Timestamp | Date | undefined | null): Date {
  if (!ts) return new Date()
  if (ts instanceof Date) return ts
  if (typeof ts === 'object' && 'toDate' in ts) return ts.toDate()
  return new Date()
}

// ══════════════════════════════════════════════
//  Caché de módulo de los overlays de bodega
// ══════════════════════════════════════════════
// La colección son ~2.200 docs y `useBodega` se monta en Áreas y en Bodega a la
// vez: sin caché, cada montaje volvía a leerla entera. Mismo patrón/TTL que
// `useGlobalSearch`.
let cachedOverlays: Map<string, BodegaOverlay> | null = null
let overlaysCachedAt = 0
const OVERLAYS_TTL = 5 * 60 * 1000

export function invalidateBodegaCache() {
  cachedOverlays = null
  overlaysCachedAt = 0
}

// ══════════════════════════════════════════════
//  HOOK PRINCIPAL
// ══════════════════════════════════════════════

export function useBodega(catalogRepuestos: GlobalSearchResult[]) {
  const [bodegaOverlays, setBodegaOverlays] = useState<Map<string, BodegaOverlay>>(
    () => (cachedOverlays && Date.now() - overlaysCachedAt < OVERLAYS_TTL ? cachedOverlays : new Map()),
  )
  const [bodegaLoading, setBodegaLoading] = useState(true)
  const bodegaLoadedRef = useRef(false)

  /**
   * Aplica el resultado de una escritura al overlay EN MEMORIA (y a la caché)
   * en vez de releer los ~2.200 docs. Antes cada movimiento/conteo/edición de
   * stock disparaba un `reloadBodega()` completo.
   */
  const patchOverlay = useCallback((sap: string, cambios: Partial<BodegaOverlay> & { id: string }) => {
    setBodegaOverlays((prev) => {
      const next = new Map(prev)
      const actual = next.get(sap)
      next.set(sap, { ...(actual ?? ({ codigoSAP: sap, stockActual: 0, stockMinimo: 0, ubicacionBodega: '', unidad: 'pzas', createdAt: new Date(), updatedAt: new Date() } as BodegaOverlay)), ...cambios })
      cachedOverlays = next
      overlaysCachedAt = Date.now()
      return next
    })
  }, [])

  // ── Watch list (Firestore + localStorage fallback) ──
  const [watchlist, setWatchlist] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('bodega_watchlist')
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set<string>()
    } catch { return new Set<string>() }
  })
  const watchLoadedRef = useRef(false)

  // Cargar watchlist desde Firestore al montar
  useEffect(() => {
    if (watchLoadedRef.current) return
    watchLoadedRef.current = true
    const userId = localStorage.getItem('auth-storage')
    if (!userId) return
    try {
      const parsed = JSON.parse(userId)
      const uid = parsed?.state?.user?.id
      if (!uid) return
      import('@/services/userPreferences').then(({ getUserPreferences }) => {
        getUserPreferences(uid).then(prefs => {
          if (prefs.bodegaWatchlist.length > 0) {
            setWatchlist(new Set(prefs.bodegaWatchlist))
          } else {
            // Migrar localStorage a Firestore
            const local = localStorage.getItem('bodega_watchlist')
            if (local) {
              const ids: string[] = JSON.parse(local)
              if (ids.length > 0) {
                import('@/services/userPreferences').then(({ saveBodegaWatchlist }) => {
                  saveBodegaWatchlist(uid, ids)
                })
              }
            }
          }
        })
      })
    } catch { /* noop */ }
  }, [])

  const toggleWatch = useCallback((sap: string) => {
    setWatchlist(prev => {
      const next = new Set(prev)
      if (next.has(sap)) next.delete(sap); else next.add(sap)
      const arr = [...next]
      localStorage.setItem('bodega_watchlist', JSON.stringify(arr))
      // Persistir en Firestore
      try {
        const parsed = JSON.parse(localStorage.getItem('auth-storage') || '{}')
        const uid = parsed?.state?.user?.id
        if (uid) {
          import('@/services/userPreferences').then(({ saveBodegaWatchlist }) => {
            saveBodegaWatchlist(uid, arr)
          })
        }
      } catch { /* noop */ }
      return next
    })
  }, [])

  // ── Cargar datos de bodega ──
  // `force` salta la caché (tras una escritura que no se pueda parchear local).
  const reloadBodega = useCallback(async (force = false) => {
    if (!force && cachedOverlays && Date.now() - overlaysCachedAt < OVERLAYS_TTL) {
      setBodegaOverlays(cachedOverlays)
      setBodegaLoading(false)
      return
    }
    try {
      const snap = await getDocs(collection(db, BODEGA_COL))
      const map = new Map<string, BodegaOverlay>()
      snap.docs.forEach((d) => {
        const data = d.data()
        const sap = (data.codigoSAP || d.id).trim()
        map.set(sap, {
          id: d.id,
          codigoSAP: sap,
          textoBreve: data.textoBreve || undefined,
          stockActual: data.stockActual ?? 0,
          stockMinimo: data.stockMinimo ?? 0,
          stockMaximo: data.stockMaximo ?? undefined,
          ubicacionBodega: data.ubicacionBodega || '',
          pasillo: data.pasillo || undefined,
          estante: data.estante || undefined,
          nivel: data.nivel || undefined,
          proveedor: data.proveedor || undefined,
          costoCompra: data.costoCompra ?? undefined,
          unidad: data.unidad || 'pzas',
          leadTime: data.leadTime ?? undefined,
          ultimaCompra: data.ultimaCompra ? tsToDate(data.ultimaCompra) : undefined,
          categoria: data.categoria || undefined,
          observaciones: data.observaciones || undefined,
          ultimoConteoAt: data.ultimoConteoAt ? tsToDate(data.ultimoConteoAt) : undefined,
          ultimoConteoPor: data.ultimoConteoPor || undefined,
          fotos: Array.isArray(data.fotos) ? data.fotos : undefined,
          createdAt: tsToDate(data.createdAt),
          updatedAt: tsToDate(data.updatedAt),
        })
      })
      cachedOverlays = map
      overlaysCachedAt = Date.now()
      setBodegaOverlays(map)
    } catch (err: any) {
      if (err?.code !== 'permission-denied') {
        logger.error('Error cargando bodega', err instanceof Error ? err : new Error(String(err)))
      }
    } finally {
      setBodegaLoading(false)
    }
  }, [])

  useEffect(() => {
    if (bodegaLoadedRef.current) return
    bodegaLoadedRef.current = true
    reloadBodega()
  }, [reloadBodega])

  // ── Merge: TODOS los repuestos (con y sin SAP) + stock cuando hay SAP ──
  // Clave de deduplicación: SAP si existe; si no, código de fabricante; si no, id único.
  // El stock (overlay de bodega) solo se engancha cuando el repuesto tiene SAP.
  const allItems = useMemo((): BodegaMergedItem[] => {
    const byKey = new Map<string, BodegaMergedItem>()

    // Fotos del doc de catálogo, priorizando foto real sobre captura del manual.
    const catalogPhotosOf = (rep: GlobalSearchResult['repuesto']): string[] =>
      [...(rep.fotosReales || []), ...(rep.imagenesManual || []), ...(rep.gallery || [])]
        .map(i => i.url)
        .filter(Boolean)

    for (const r of catalogRepuestos) {
      const rep = r.repuesto
      const sap = (rep.codigoSAP || '').trim()
      const fab = (rep.codigoFabricante || '').trim()
      // Colección plana: rep.id es globalmente único (un doc puede venir N veces,
      // una por equipo) → la clave id NO incluye machineId para reagrupar el doc.
      const key = sap || (fab ? `fab:${fab}` : `id:${rep.id}`)

      const existing = byKey.get(key)
      if (existing) {
        if (!existing.equipos.find(e => e.machineId === r.machineId)) {
          existing.equipos.push({ machineId: r.machineId, machineName: r.machineName })
        }
        // Si el doc ya fusionado no aportó fotos, tomar las de este duplicado.
        if (!existing.fotosCatalogo?.length) {
          const dupPhotos = catalogPhotosOf(rep)
          if (dupPhotos.length) existing.fotosCatalogo = dupPhotos
        }
        continue
      }

      const overlay = sap ? bodegaOverlays.get(sap) : undefined
      byKey.set(key, {
        rowKey: key,
        codigoSAP: sap,
        codigoFabricante: rep.codigoFabricante || '',
        // Último fallback: nombre denormalizado en el doc de bodega (cubre docs
        // de catálogo con textoBreve vacío que sí tienen nombre sembrado allá).
        textoBreve: rep.textoBreve || rep.descripcion || overlay?.textoBreve || '',
        alias: rep.alias,
        nombresComunes: Array.isArray(rep.nombresComunes) ? rep.nombresComunes : undefined,
        comunEn: Array.isArray(rep.comunEn) ? rep.comunEn : undefined,
        tipo: rep.tipo,
        clase: rep.clase,
        tieneSap: rep.tieneSap ?? !!sap,
        familia: rep.familia,
        marca: rep.marca,
        modeloTipo: rep.modeloTipo,
        descripcion: rep.descripcion,
        observacionesRepuesto: rep.observaciones,
        valorUnitario: rep.valorUnitario || 0,
        equipos: [{ machineId: r.machineId, machineName: r.machineName }],
        bodegaId: overlay?.id,
        stockActual: overlay?.stockActual ?? 0,
        stockMinimo: overlay?.stockMinimo ?? 0,
        stockMaximo: overlay?.stockMaximo,
        ubicacionBodega: overlay?.ubicacionBodega || '',
        pasillo: overlay?.pasillo,
        estante: overlay?.estante,
        nivel: overlay?.nivel,
        proveedor: overlay?.proveedor,
        costoCompra: overlay?.costoCompra,
        unidad: overlay?.unidad || 'pzas',
        leadTime: overlay?.leadTime,
        ultimaCompra: overlay?.ultimaCompra,
        categoria: overlay?.categoria,
        observaciones: overlay?.observaciones,
        ultimoConteoAt: overlay?.ultimoConteoAt,
        ultimoConteoPor: overlay?.ultimoConteoPor,
        fotos: overlay?.fotos,
        fotosCatalogo: (() => { const p = catalogPhotosOf(rep); return p.length ? p : undefined })(),
        isWatched: sap ? watchlist.has(sap) : false,
      })
    }

    return [...byKey.values()].sort((a, b) => a.textoBreve.localeCompare(b.textoBreve, 'es'))
  }, [catalogRepuestos, bodegaOverlays, watchlist])

  // Solo repuestos con SAP (lo que consume Bodega): subconjunto de allItems con su orden propio.
  const items = useMemo((): BodegaMergedItem[] => {
    return allItems
      .filter(i => i.codigoSAP)
      .sort((a, b) => {
        if (a.bodegaId && !b.bodegaId) return -1
        if (!a.bodegaId && b.bodegaId) return 1
        // Sin nombre AL FINAL: '' ordena antes que todo en localeCompare, y eso
        // dejaba los docs sucios (textoBreve vacío) como primera pantalla de Bodega.
        if (a.textoBreve && !b.textoBreve) return -1
        if (!a.textoBreve && b.textoBreve) return 1
        return a.textoBreve.localeCompare(b.textoBreve, 'es')
      })
  }, [allItems])

  // Nombre de catálogo por SAP — para denormalizar `textoBreve` en cada write
  // de bodega (el doc queda auto-descriptivo; ver BodegaOverlay.textoBreve).
  const nombrePorSap = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of catalogRepuestos) {
      const sap = (r.repuesto.codigoSAP || '').trim()
      const nombre = r.repuesto.textoBreve || r.repuesto.descripcion || ''
      if (sap && nombre && !m.has(sap)) m.set(sap, nombre)
    }
    return m
  }, [catalogRepuestos])

  /** Campo `textoBreve` a incluir en un write de bodega ({} si no hay nombre). */
  const denormNombre = useCallback((sap: string): { textoBreve?: string } => {
    const nombre = nombrePorSap.get(sap)
    return nombre ? { textoBreve: nombre } : {}
  }, [nombrePorSap])

  // ── Guardar/actualizar stock ──
  const saveStock = useCallback(async (codigoSAP: string, data: BodegaStockData) => {
    const key = codigoSAP.trim()
    if (!key) return
    const existing = bodegaOverlays.get(key)
    if (existing) {
      await updateDoc(doc(db, BODEGA_COL, existing.id), { ...data, ...denormNombre(key), updatedAt: serverTimestamp() })
    } else {
      await setDoc(doc(db, BODEGA_COL, key), { codigoSAP: key, ...data, ...denormNombre(key), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    }
    // Parche local en vez de releer los ~2.200 docs de la colección.
    patchOverlay(key, { ...data, id: existing?.id ?? key, codigoSAP: key, updatedAt: new Date() })
  }, [bodegaOverlays, patchOverlay, denormNombre])

  // ── Registrar movimiento ──
  const registrarMovimiento = useCallback(async (
    item: BodegaMergedItem,
    mov: MovimientoFormData,
    userId: string,
    userName: string
  ) => {
    const key = item.codigoSAP.trim()
    if (!key) throw new Error('Sin código SAP')

    let nuevoStock: number
    if (mov.tipo === 'entrada') nuevoStock = item.stockActual + mov.cantidad
    else if (mov.tipo === 'salida') nuevoStock = Math.max(0, item.stockActual - mov.cantidad)
    else nuevoStock = mov.cantidad

    let bodegaDocId = item.bodegaId
    if (!bodegaDocId) {
      bodegaDocId = key
      await setDoc(doc(db, BODEGA_COL, key), {
        codigoSAP: key, stockActual: nuevoStock, stockMinimo: item.stockMinimo,
        ubicacionBodega: item.ubicacionBodega || '', unidad: item.unidad || 'pzas',
        ...(item.textoBreve ? { textoBreve: item.textoBreve } : denormNombre(key)),
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
    } else {
      await updateDoc(doc(db, BODEGA_COL, bodegaDocId), { stockActual: nuevoStock, updatedAt: serverTimestamp() })
    }

    await addDoc(collection(db, BODEGA_COL, bodegaDocId, 'movimientos'), {
      bodegaItemId: bodegaDocId, tipo: mov.tipo, cantidad: mov.cantidad,
      stockResultante: nuevoStock, motivo: mov.motivo,
      realizadoPor: userId, realizadoPorNombre: userName, createdAt: serverTimestamp(),
    })
    patchOverlay(key, { id: bodegaDocId, codigoSAP: key, stockActual: nuevoStock, updatedAt: new Date() })
  }, [patchOverlay, denormNombre])

  /**
   * Conteo físico RÁPIDO de un repuesto, desde su ficha (v3.91.0). Fija el stock
   * al valor contado (0 = "no había") y lo deja trazado como movimiento de
   * ajuste + `ultimoConteoAt`. Ese sello distingue "contado y da 0" de "nunca se
   * contó" — clave porque el stock actual viene de una importación sin un solo
   * movimiento registrado.
   *
   * Distinto de `registrarConteo`, que pertenece al flujo de SESIONES de
   * inventario (crearInventario → contar → finalizarInventario) de la retirada
   * pestaña Bodega: ese exige abrir una sesión y nunca se usó.
   */
  const registrarConteoRapido = useCallback(async (
    item: BodegaMergedItem,
    contado: number,
    userId: string,
    userName: string,
  ) => {
    const key = item.codigoSAP.trim()
    if (!key) throw new Error('Sin código SAP')
    const anterior = item.stockActual
    const bodegaDocId = item.bodegaId || key
    const sello = {
      stockActual: contado,
      ultimoConteoAt: serverTimestamp(),
      ultimoConteoPor: userName,
      updatedAt: serverTimestamp(),
    }
    if (item.bodegaId) {
      await updateDoc(doc(db, BODEGA_COL, bodegaDocId), sello)
    } else {
      // Primer conteo de un repuesto sin doc de bodega: `isValidBodega()` de las
      // reglas exige ubicacionBodega NO vacío, así que se siembra "Sin ubicación"
      // (editable luego desde el propio panel) en vez de '' → si no, Firestore
      // rechaza la creación.
      await setDoc(doc(db, BODEGA_COL, key), {
        codigoSAP: key, stockMinimo: item.stockMinimo || 0,
        ubicacionBodega: item.ubicacionBodega?.trim() || 'Sin ubicación',
        unidad: item.unidad || 'pzas',
        ...(item.textoBreve ? { textoBreve: item.textoBreve } : denormNombre(key)),
        createdAt: serverTimestamp(), ...sello,
      })
    }
    await addDoc(collection(db, BODEGA_COL, bodegaDocId, 'movimientos'), {
      bodegaItemId: bodegaDocId, tipo: 'ajuste', cantidad: contado,
      stockResultante: contado,
      motivo: `Conteo físico (antes: ${anterior})`,
      realizadoPor: userId, realizadoPorNombre: userName, createdAt: serverTimestamp(),
    })
    patchOverlay(key, {
      id: bodegaDocId, codigoSAP: key, stockActual: contado,
      ultimoConteoAt: new Date(), ultimoConteoPor: userName, updatedAt: new Date(),
    })
  }, [patchOverlay, denormNombre])

  // ── Cargar movimientos ──
  const loadMovimientos = useCallback(async (bodegaDocId: string, max = 30): Promise<MovimientoBodega[]> => {
    if (!bodegaDocId) return []
    const q = query(collection(db, BODEGA_COL, bodegaDocId, 'movimientos'), orderBy('createdAt', 'desc'), limit(max))
    const snap = await getDocs(q)
    return snap.docs.map(d => {
      const data = d.data()
      return {
        id: d.id, bodegaItemId: data.bodegaItemId || bodegaDocId,
        tipo: data.tipo, cantidad: data.cantidad, stockResultante: data.stockResultante ?? 0,
        motivo: data.motivo || '', realizadoPor: data.realizadoPor || '',
        realizadoPorNombre: data.realizadoPorNombre || '', createdAt: tsToDate(data.createdAt),
      }
    })
  }, [])

  // ── Cargar TODOS los movimientos recientes (para estadísticas) ──
  /**
   * Últimos `max` movimientos de TODA la bodega, en UNA query (collection group).
   *
   * Reemplaza al antiguo `loadAllMovimientos`, que iteraba los ~2.200 ítems
   * haciendo una query por cada uno: abrir "Movimientos" costaba ~2.200 queries
   * (hasta ~108.000 lecturas) y "Estadísticas" otro tanto. Ahora son `max`
   * lecturas (50 → 50). Requiere el índice COLLECTION_GROUP de
   * `movimientos.createdAt` y el match `/{path=**}/movimientos/` en las reglas.
   */
  const loadMovimientosRecientes = useCallback(async (max = 50): Promise<MovimientoBodega[]> => {
    try {
      const q = query(collectionGroup(db, 'movimientos'), orderBy('createdAt', 'desc'), limit(max))
      const snap = await getDocs(q)
      return snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          bodegaItemId: data.bodegaItemId || d.ref.parent.parent?.id || '',
          tipo: data.tipo,
          cantidad: data.cantidad,
          stockResultante: data.stockResultante ?? 0,
          motivo: data.motivo || '',
          realizadoPor: data.realizadoPor || '',
          realizadoPorNombre: data.realizadoPorNombre || '',
          createdAt: tsToDate(data.createdAt),
        } as MovimientoBodega
      })
    } catch (err) {
      logger.error('Error cargando movimientos recientes', err instanceof Error ? err : new Error(String(err)))
      return []
    }
  }, [])

  // ══════════════════════════════════════════
  //  INVENTARIO PERIÓDICO
  // ══════════════════════════════════════════

  // Crear sesión de inventario
  const crearInventario = useCallback(async (
    nombre: string,
    userId: string,
    userName: string,
    itemsToCount: BodegaMergedItem[]
  ): Promise<string> => {
    // Crear sesión
    const sesionRef = await addDoc(collection(db, INVENTARIO_COL), {
      nombre,
      estado: 'en_curso',
      creadoPor: userId,
      creadoPorNombre: userName,
      totalItems: itemsToCount.length,
      contados: 0,
      conDiferencia: 0,
      createdAt: serverTimestamp(),
    })

    // Crear conteos vacíos para cada ítem
    const conteosCol = collection(db, INVENTARIO_COL, sesionRef.id, 'conteos')
    for (const item of itemsToCount) {
      await setDoc(doc(conteosCol, item.codigoSAP), {
        codigoSAP: item.codigoSAP,
        textoBreve: item.textoBreve,
        stockSistema: item.stockActual,
        stockFisico: null,
        diferencia: 0,
        createdAt: serverTimestamp(),
      })
    }

    return sesionRef.id
  }, [])

  // Listar sesiones de inventario
  const loadInventarios = useCallback(async (): Promise<InventarioSesion[]> => {
    const q = query(collection(db, INVENTARIO_COL), orderBy('createdAt', 'desc'), limit(20))
    const snap = await getDocs(q)
    return snap.docs.map(d => {
      const data = d.data()
      return {
        id: d.id, nombre: data.nombre || '', estado: data.estado || 'en_curso',
        creadoPor: data.creadoPor || '', creadoPorNombre: data.creadoPorNombre || '',
        totalItems: data.totalItems ?? 0, contados: data.contados ?? 0,
        conDiferencia: data.conDiferencia ?? 0,
        createdAt: tsToDate(data.createdAt), closedAt: data.closedAt ? tsToDate(data.closedAt) : undefined,
      }
    })
  }, [])

  // Cargar conteos de una sesión
  const loadConteos = useCallback(async (inventarioId: string): Promise<InventarioConteo[]> => {
    const snap = await getDocs(collection(db, INVENTARIO_COL, inventarioId, 'conteos'))
    return snap.docs.map(d => {
      const data = d.data()
      return {
        id: d.id, codigoSAP: data.codigoSAP || d.id, textoBreve: data.textoBreve || '',
        stockSistema: data.stockSistema ?? 0, stockFisico: data.stockFisico ?? null,
        diferencia: data.diferencia ?? 0,
        contadoPor: data.contadoPor, contadoPorNombre: data.contadoPorNombre,
        observaciones: data.observaciones, createdAt: tsToDate(data.createdAt),
      }
    })
  }, [])

  // Registrar conteo físico
  const registrarConteo = useCallback(async (
    inventarioId: string,
    codigoSAP: string,
    stockFisico: number,
    userId: string,
    userName: string,
    observaciones?: string
  ) => {
    const conteoRef = doc(db, INVENTARIO_COL, inventarioId, 'conteos', codigoSAP)
    // Leer stock sistema actual
    const conteos = await loadConteos(inventarioId)
    const conteo = conteos.find(c => c.codigoSAP === codigoSAP)
    const stockSistema = conteo?.stockSistema ?? 0
    const diferencia = stockFisico - stockSistema

    await updateDoc(conteoRef, {
      stockFisico,
      diferencia,
      contadoPor: userId,
      contadoPorNombre: userName,
      observaciones: observaciones || '',
    })

    // Actualizar progreso en la sesión
    const allConteos = await loadConteos(inventarioId)
    const contados = allConteos.filter(c => c.stockFisico !== null).length
    const conDiferencia = allConteos.filter(c => c.stockFisico !== null && c.diferencia !== 0).length
    await updateDoc(doc(db, INVENTARIO_COL, inventarioId), { contados, conDiferencia })
  }, [loadConteos])

  // Finalizar inventario — ajustar stock según conteo físico
  const finalizarInventario = useCallback(async (
    inventarioId: string,
    userId: string,
    userName: string
  ) => {
    const conteos = await loadConteos(inventarioId)
    const contados = conteos.filter(c => c.stockFisico !== null)

    // Ajustar stock para cada ítem con diferencia
    for (const conteo of contados) {
      if (conteo.diferencia === 0 || conteo.stockFisico === null) continue

      const sap = conteo.codigoSAP.trim()
      const existing = bodegaOverlays.get(sap)

      if (existing) {
        await updateDoc(doc(db, BODEGA_COL, existing.id), {
          stockActual: conteo.stockFisico,
          updatedAt: serverTimestamp(),
        })
      } else {
        await setDoc(doc(db, BODEGA_COL, sap), {
          codigoSAP: sap, stockActual: conteo.stockFisico,
          stockMinimo: 0, ubicacionBodega: '', unidad: 'pzas',
          ...denormNombre(sap),
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        })
      }

      // Registrar movimiento de ajuste
      const bodegaDocId = existing?.id || sap
      await addDoc(collection(db, BODEGA_COL, bodegaDocId, 'movimientos'), {
        bodegaItemId: bodegaDocId, tipo: 'ajuste',
        cantidad: conteo.stockFisico, stockResultante: conteo.stockFisico,
        motivo: `Ajuste inventario: ${conteo.diferencia > 0 ? '+' : ''}${conteo.diferencia} (sistema: ${conteo.stockSistema}, físico: ${conteo.stockFisico})`,
        realizadoPor: userId, realizadoPorNombre: userName,
        createdAt: serverTimestamp(),
      })
    }

    // Marcar sesión como finalizada
    await updateDoc(doc(db, INVENTARIO_COL, inventarioId), {
      estado: 'finalizado',
      closedAt: serverTimestamp(),
    })

    // Finalizar ajusta el stock de MUCHOS ítems a la vez: acá sí conviene releer
    // la colección (forzando, para saltar la caché) en vez de parchear uno a uno.
    await reloadBodega(true)
  }, [bodegaOverlays, loadConteos, reloadBodega, denormNombre])

  // ── Movimiento en lote ──
  const registrarMovimientoBatch = useCallback(async (
    batchItems: { item: BodegaMergedItem; cantidad: number }[],
    tipo: 'entrada' | 'salida' | 'ajuste',
    motivo: string,
    userId: string,
    userName: string,
    onProgress?: (done: number, total: number) => void
  ) => {
    let done = 0
    for (const { item, cantidad } of batchItems) {
      await registrarMovimiento(item, { tipo, cantidad, motivo }, userId, userName)
      done++
      onProgress?.(done, batchItems.length)
    }
  }, [registrarMovimiento])

  // ── Estadísticas ──
  const stats = useMemo(() => {
    const conStock = items.filter(i => i.bodegaId)
    const sinConfig = items.filter(i => !i.bodegaId)
    return {
      total: items.length,
      conStock: conStock.length,
      sinConfig: sinConfig.length,
      bajoStock: conStock.filter(i => i.stockMinimo > 0 && i.stockActual <= i.stockMinimo && i.stockActual > 0).length,
      sinStock: conStock.filter(i => i.stockActual === 0 && i.stockMinimo > 0).length,
      stockOk: conStock.filter(i => i.stockMinimo === 0 || i.stockActual > i.stockMinimo).length,
      valorTotal: conStock.reduce((sum, i) => sum + (i.costoCompra ?? i.valorUnitario ?? 0) * i.stockActual, 0),
      // Por tipo
      tipoDistribution: (() => {
        const map = new Map<string, number>()
        for (const i of items) {
          const t = i.tipo || 'Sin tipo'
          map.set(t, (map.get(t) || 0) + 1)
        }
        return [...map.entries()].sort((a, b) => b[1] - a[1])
      })(),
      // Top ítems por valor
      topByValue: conStock
        .map(i => ({ ...i, valorInventario: (i.costoCompra ?? i.valorUnitario ?? 0) * i.stockActual }))
        .filter(i => i.valorInventario > 0)
        .sort((a, b) => b.valorInventario - a.valorInventario)
        .slice(0, 10),
      // Ítems bajo stock (para alertas)
      alertas: conStock
        .filter(i => i.stockMinimo > 0 && i.stockActual <= i.stockMinimo)
        .sort((a, b) => (a.stockActual / (a.stockMinimo || 1)) - (b.stockActual / (b.stockMinimo || 1))),
    }
  }, [items])

  // ── Fotos ──
  const addPhoto = useCallback(async (codigoSAP: string, file: File) => {
    const url = await uploadBodegaPhoto(codigoSAP, file)
    const key = codigoSAP.trim()
    const existing = bodegaOverlays.get(key)
    const currentFotos = existing?.fotos || []
    const newFotos = [...currentFotos, url]
    if (existing) {
      await updateDoc(doc(db, BODEGA_COL, existing.id), { fotos: newFotos, updatedAt: serverTimestamp() })
    } else {
      await setDoc(doc(db, BODEGA_COL, key), {
        codigoSAP: key, stockActual: 0, stockMinimo: 0,
        // `isValidBodega()` de las reglas exige ubicacionBodega no vacío al crear.
        ubicacionBodega: 'Sin ubicación', unidad: 'pzas', fotos: newFotos,
        ...denormNombre(key),
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
    }
    patchOverlay(key, { id: existing?.id ?? key, codigoSAP: key, fotos: newFotos, updatedAt: new Date() })
    return url
  }, [bodegaOverlays, patchOverlay, denormNombre])

  const removePhoto = useCallback(async (codigoSAP: string, url: string) => {
    await deleteBodegaPhoto(url)
    const key = codigoSAP.trim()
    const existing = bodegaOverlays.get(key)
    if (existing) {
      const newFotos = (existing.fotos || []).filter(f => f !== url)
      await updateDoc(doc(db, BODEGA_COL, existing.id), { fotos: newFotos, updatedAt: serverTimestamp() })
      patchOverlay(key, { id: existing.id, fotos: newFotos, updatedAt: new Date() })
    }
  }, [bodegaOverlays, patchOverlay])

  // ── Cálculo de punto de reorden ──
  const calcReorderData = useCallback((item: BodegaMergedItem, movimientos: MovimientoBodega[]) => {
    const salidas = movimientos.filter(m => m.tipo === 'salida')
    if (salidas.length === 0 || !item.leadTime) return null
    const dates = salidas.map(s => s.createdAt.getTime())
    const spanDays = Math.max(1, (Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24))
    const totalSalidas = salidas.reduce((s, m) => s + m.cantidad, 0)
    const consumoDiario = totalSalidas / spanDays
    const puntoReorden = Math.ceil(consumoDiario * item.leadTime) + item.stockMinimo
    const diasRestantes = consumoDiario > 0 ? Math.floor(item.stockActual / consumoDiario) : Infinity
    return { consumoDiario, puntoReorden, diasRestantes, necesitaPedir: item.stockActual <= puntoReorden }
  }, [])

  return {
    items,
    allItems,
    loading: bodegaLoading,
    stats,
    saveStock,
    registrarMovimiento,
    registrarConteoRapido,
    registrarMovimientoBatch,
    loadMovimientos,
    loadMovimientosRecientes,
    reloadBodega,
    // Watch list
    watchlist,
    toggleWatch,
    // Fotos
    addPhoto,
    removePhoto,
    // Reorden
    calcReorderData,
    // Inventario
    crearInventario,
    loadInventarios,
    loadConteos,
    registrarConteo,
    finalizarInventario,
  }
}
