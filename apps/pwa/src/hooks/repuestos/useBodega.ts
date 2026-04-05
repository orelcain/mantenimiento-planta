/**
 * useBodega — Hook para gestión de bodega de repuestos
 *
 * Solo repuestos con código SAP.
 * Combina catálogo (machines/{id}/repuestos) con colección bodega/{codigoSAP}.
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
  doc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { GlobalSearchResult } from '@/hooks/repuestos/useGlobalSearch'

// ══════════════════════════════════════════════
//  TIPOS
// ══════════════════════════════════════════════

export interface BodegaOverlay {
  id: string
  codigoSAP: string
  stockActual: number
  stockMinimo: number
  ubicacionBodega: string
  proveedor?: string
  costoCompra?: number
  unidad: string
  observaciones?: string
  createdAt: Date
  updatedAt: Date
}

export interface BodegaMergedItem {
  codigoSAP: string
  codigoFabricante: string
  textoBreve: string
  alias?: string
  tipo?: string
  valorUnitario: number
  equipos: { machineId: string; machineName: string }[]
  bodegaId?: string
  stockActual: number
  stockMinimo: number
  ubicacionBodega: string
  proveedor?: string
  costoCompra?: number
  unidad: string
  observaciones?: string
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
  ubicacionBodega: string
  proveedor?: string
  costoCompra?: number
  unidad: string
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
//  HOOK PRINCIPAL
// ══════════════════════════════════════════════

export function useBodega(catalogRepuestos: GlobalSearchResult[]) {
  const [bodegaOverlays, setBodegaOverlays] = useState<Map<string, BodegaOverlay>>(new Map())
  const [bodegaLoading, setBodegaLoading] = useState(true)
  const bodegaLoadedRef = useRef(false)

  // ── Cargar datos de bodega ──
  const reloadBodega = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, BODEGA_COL))
      const map = new Map<string, BodegaOverlay>()
      snap.docs.forEach((d) => {
        const data = d.data()
        const sap = (data.codigoSAP || d.id).trim()
        map.set(sap, {
          id: d.id,
          codigoSAP: sap,
          stockActual: data.stockActual ?? 0,
          stockMinimo: data.stockMinimo ?? 0,
          ubicacionBodega: data.ubicacionBodega || '',
          proveedor: data.proveedor || undefined,
          costoCompra: data.costoCompra ?? undefined,
          unidad: data.unidad || 'pzas',
          observaciones: data.observaciones || undefined,
          createdAt: tsToDate(data.createdAt),
          updatedAt: tsToDate(data.updatedAt),
        })
      })
      setBodegaOverlays(map)
    } catch (err: any) {
      if (err?.code !== 'permission-denied') {
        console.error('Error cargando bodega:', err)
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

  // ── Merge: solo repuestos con código SAP ──
  const items = useMemo((): BodegaMergedItem[] => {
    const byKey = new Map<string, BodegaMergedItem>()

    for (const r of catalogRepuestos) {
      const rep = r.repuesto
      const sap = (rep.codigoSAP || '').trim()
      if (!sap) continue // ← SOLO con SAP

      const existing = byKey.get(sap)
      if (existing) {
        if (!existing.equipos.find(e => e.machineId === r.machineId)) {
          existing.equipos.push({ machineId: r.machineId, machineName: r.machineName })
        }
        continue
      }

      const overlay = bodegaOverlays.get(sap)
      byKey.set(sap, {
        codigoSAP: sap,
        codigoFabricante: rep.codigoFabricante || '',
        textoBreve: rep.textoBreve || rep.descripcion || '',
        alias: rep.alias,
        tipo: rep.tipo,
        valorUnitario: rep.valorUnitario || 0,
        equipos: [{ machineId: r.machineId, machineName: r.machineName }],
        bodegaId: overlay?.id,
        stockActual: overlay?.stockActual ?? 0,
        stockMinimo: overlay?.stockMinimo ?? 0,
        ubicacionBodega: overlay?.ubicacionBodega || '',
        proveedor: overlay?.proveedor,
        costoCompra: overlay?.costoCompra,
        unidad: overlay?.unidad || 'pzas',
        observaciones: overlay?.observaciones,
      })
    }

    return [...byKey.values()].sort((a, b) => {
      if (a.bodegaId && !b.bodegaId) return -1
      if (!a.bodegaId && b.bodegaId) return 1
      return a.textoBreve.localeCompare(b.textoBreve, 'es')
    })
  }, [catalogRepuestos, bodegaOverlays])

  // ── Guardar/actualizar stock ──
  const saveStock = useCallback(async (codigoSAP: string, data: BodegaStockData) => {
    const key = codigoSAP.trim()
    if (!key) return
    const existing = bodegaOverlays.get(key)
    if (existing) {
      await updateDoc(doc(db, BODEGA_COL, existing.id), { ...data, updatedAt: serverTimestamp() })
    } else {
      await setDoc(doc(db, BODEGA_COL, key), { codigoSAP: key, ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    }
    await reloadBodega()
  }, [bodegaOverlays, reloadBodega])

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
    await reloadBodega()
  }, [bodegaOverlays, reloadBodega])

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
  const loadAllMovimientos = useCallback(async (maxPerItem = 10): Promise<MovimientoBodega[]> => {
    const all: MovimientoBodega[] = []
    for (const [, overlay] of bodegaOverlays) {
      try {
        const movs = await loadMovimientos(overlay.id, maxPerItem)
        all.push(...movs)
      } catch { /* skip */ }
    }
    return all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }, [bodegaOverlays, loadMovimientos])

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

    await reloadBodega()
  }, [bodegaOverlays, loadConteos, reloadBodega])

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

  return {
    items,
    loading: bodegaLoading,
    stats,
    saveStock,
    registrarMovimiento,
    loadMovimientos,
    loadAllMovimientos,
    reloadBodega,
    // Inventario
    crearInventario,
    loadInventarios,
    loadConteos,
    registrarConteo,
    finalizarInventario,
  }
}
