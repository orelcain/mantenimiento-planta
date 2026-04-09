/**
 * pdfCache — Caché in-memory + Cache API para PDFs
 *
 * Almacena PDFDocumentProxy en memoria para evitar re-descargar y re-parsear
 * el mismo PDF cada vez que se abre el modal.
 *
 * Estrategia:
 *  1. In-memory Map<url, PDFDocumentProxy> → acceso instantáneo si ya se cargó
 *  2. Cache API (pdfBlobCache) → persiste los bytes entre navegaciones (no entre
 *     sesiones de browser cerrado)
 *  3. preloadMachinePdfs(machine) → descarga en background cuando se selecciona
 *     una máquina, así los PDFs ya están listos al hacer clic en "Ver en manual"
 *
 * Uso:
 *   import { getCachedPdf, preloadMachinePdfs, preloadMachinePdfsWithProgress } from '@/services/pdfCache'
 *   const pdf = await getCachedPdf(url)
 */

import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Machine } from '@/types/repuestos'
import { ref, listAll, getDownloadURL } from 'firebase/storage'
import { storage } from '@/services/firebase'

// Worker self-hosted en public/vendor/pdfjs/ — evita CDN externa, compatible con pdfjs-dist 4+/5+
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}vendor/pdfjs/pdf.worker.min.mjs`
}

// ─── Config ────────────────────────────────────────────────
// cmaps: pdfjs los necesita para fuentes CJK. El paquete los trae en node_modules/pdfjs-dist/cmaps/
// Los copiamos a public/vendor/pdfjs/cmaps/ via script de build (o se pueden omitir si no hay PDFs CJK).
const CMAPS_URL = `${import.meta.env.BASE_URL}vendor/pdfjs/cmaps/`
const CACHE_NAME = 'pdf-manuals-v1'
const MAX_MEMORY_ENTRIES = 10 // evitar memory leaks con muchos PDFs grandes

// ─── In-memory cache ───────────────────────────────────────
const memoryCache = new Map<string, PDFDocumentProxy>()
const accessOrder: string[] = []  // LRU tracking

function evictIfNeeded() {
  while (memoryCache.size > MAX_MEMORY_ENTRIES && accessOrder.length > 0) {
    const oldest = accessOrder.shift()
    if (oldest) {
      const doc = memoryCache.get(oldest)
      if (doc) {
        doc.destroy().catch(() => {})
        memoryCache.delete(oldest)
      }
    }
  }
}

function touchKey(url: string) {
  const idx = accessOrder.indexOf(url)
  if (idx >= 0) accessOrder.splice(idx, 1)
  accessOrder.push(url)
}

// ─── Cache API helpers ─────────────────────────────────────
async function getCacheStorage(): Promise<Cache | null> {
  try {
    if (typeof caches !== 'undefined') {
      return await caches.open(CACHE_NAME)
    }
  } catch { /* Cache API not available */ }
  return null
}

async function getBlobFromCacheAPI(url: string): Promise<ArrayBuffer | null> {
  const cache = await getCacheStorage()
  if (!cache) return null
  try {
    const resp = await cache.match(url)
    if (resp) return await resp.arrayBuffer()
  } catch { /* miss */ }
  return null
}

async function storeBlobInCacheAPI(url: string, data: ArrayBuffer): Promise<void> {
  const cache = await getCacheStorage()
  if (!cache) return
  try {
    const resp = new Response(data, {
      headers: { 'Content-Type': 'application/pdf' },
    })
    await cache.put(url, resp)
  } catch { /* storage quota exceeded, etc */ }
}

// ─── In-flight dedup ───────────────────────────────────────
const inflightLoads = new Map<string, Promise<PDFDocumentProxy>>()

// ─── Public API ────────────────────────────────────────────

/**
 * Obtiene un PDFDocumentProxy desde caché o lo descarga.
 * Múltiples llamadas al mismo URL comparten la misma promesa (dedup).
 */
export function getCachedPdf(url: string): Promise<PDFDocumentProxy> {
  // 1. Check memory
  const cached = memoryCache.get(url)
  if (cached) {
    touchKey(url)
    return Promise.resolve(cached)
  }

  // 2. Check if already loading
  const inflight = inflightLoads.get(url)
  if (inflight) return inflight

  // 3. Load: try Cache API first, then network
  const loadPromise = (async () => {
    try {
      // Try Cache API (blob already downloaded before)
      const cachedBlob = await getBlobFromCacheAPI(url)

      let pdf: PDFDocumentProxy
      if (cachedBlob) {
        // Parse from cached bytes (no network!)
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(cachedBlob),
          cMapUrl: CMAPS_URL,
          cMapPacked: true,
        })
        pdf = await loadingTask.promise
      } else {
        // Network fetch + parse
        const loadingTask = pdfjsLib.getDocument({
          url,
          cMapUrl: CMAPS_URL,
          cMapPacked: true,
        })
        pdf = await loadingTask.promise

        // Store raw bytes in Cache API for next time
        // Fetch the blob in background (pdf.js already downloaded it)
        try {
          const resp = await fetch(url)
          if (resp.ok) {
            const blob = await resp.arrayBuffer()
            await storeBlobInCacheAPI(url, blob)
          }
        } catch { /* non-critical: cache store failed */ }
      }

      memoryCache.set(url, pdf)
      touchKey(url)
      evictIfNeeded()
      return pdf
    } finally {
      inflightLoads.delete(url)
    }
  })()

  inflightLoads.set(url, loadPromise)
  return loadPromise
}

/**
 * Pre-descarga un PDF en background (no bloquea UI).
 * Retorna true si se cacheo con éxito, false si ya estaba o hubo error.
 */
export async function preloadPdf(url: string): Promise<boolean> {
  if (memoryCache.has(url)) return false
  try {
    await getCachedPdf(url)
    return true
  } catch {
    return false
  }
}

/**
 * Pre-descarga todos los PDFs de una máquina en background.
 * Llama esto cuando el usuario selecciona una máquina en el Dashboard.
 */
export async function preloadMachinePdfs(machine: Machine): Promise<void> {
  const urls = new Set<string>()

  // 1. From machine.manuals[]
  if (machine.manuals) {
    for (const url of machine.manuals) {
      urls.add(url)
    }
  }

  // 2. From Firebase Storage folder
  try {
    const folderRef = ref(storage, `machines/${machine.id}/manuales`)
    const listResult = await listAll(folderRef)
    for (const item of listResult.items) {
      if (item.name.toLowerCase().endsWith('.pdf')) {
        const url = await getDownloadURL(item)
        urls.add(url)
      }
    }
  } catch { /* no folder, skip */ }

  // 3. Preload all in parallel (with concurrency limit)
  const urlArray = [...urls]
  const CONCURRENCY = 2  // no saturar la red
  for (let i = 0; i < urlArray.length; i += CONCURRENCY) {
    const batch = urlArray.slice(i, i + CONCURRENCY)
    await Promise.allSettled(batch.map(u => preloadPdf(u)))
  }
}

/**
 * Número de PDFs actualmente en caché de memoria.
 */
export function getCacheSize(): number {
  return memoryCache.size
}

/**
 * Verifica si un URL ya está en caché de memoria.
 */
export function isCached(url: string): boolean {
  return memoryCache.has(url)
}

/**
 * Pre-descarga todos los PDFs de una máquina con reporte de progreso.
 *
 * @param machine — La máquina cuyos PDFs se pre-descargarán
 * @param onProgress — Callback con { loaded, total, done }
 * @returns — Las URLs que se intentaron precargar
 */
export async function preloadMachinePdfsWithProgress(
  machine: Machine,
  onProgress: (info: { loaded: number; total: number; done: boolean }) => void,
): Promise<string[]> {
  const urls = new Set<string>()

  // 1. From machine.manuals[]
  if (machine.manuals) {
    for (const url of machine.manuals) {
      urls.add(url)
    }
  }

  // 2. From Firebase Storage folder
  try {
    const folderRef = ref(storage, `machines/${machine.id}/manuales`)
    const listResult = await listAll(folderRef)
    for (const item of listResult.items) {
      if (item.name.toLowerCase().endsWith('.pdf')) {
        const url = await getDownloadURL(item)
        urls.add(url)
      }
    }
  } catch { /* no folder, skip */ }

  const urlArray = [...urls]
  const total = urlArray.length
  let loaded = urlArray.filter(u => memoryCache.has(u)).length

  // Report initial state
  onProgress({ loaded, total, done: loaded >= total })

  if (loaded >= total) return urlArray

  // Preload remaining
  const remaining = urlArray.filter(u => !memoryCache.has(u))
  const CONCURRENCY = 2
  for (let i = 0; i < remaining.length; i += CONCURRENCY) {
    const batch = remaining.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(batch.map(u => preloadPdf(u)))
    for (const r of results) {
      if (r.status === 'fulfilled') loaded++
    }
    onProgress({ loaded, total, done: loaded >= total })
  }

  return urlArray
}

/**
 * Limpia toda la caché (memory + Cache API).
 */
export async function clearPdfCache(): Promise<void> {
  for (const [, doc] of memoryCache) {
    doc.destroy().catch(() => {})
  }
  memoryCache.clear()
  accessOrder.length = 0
  inflightLoads.clear()
  try {
    if (typeof caches !== 'undefined') {
      await caches.delete(CACHE_NAME)
    }
  } catch { /* ok */ }
}
