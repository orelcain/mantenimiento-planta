/**
 * Subir archivos de equipos — manuales, catálogos y planos (p. ej. de la GEA, hasta 100 MB) que
 * quedan guardados en Storage y aparecen como manuales del equipo en Repuestos.
 *
 * Solo admin: la ruta va envuelta en RequireReAuth (pide la clave al entrar) y Storage solo deja
 * escribir `documentosEquipos/` a un admin. Cada archivo queda en la colección `manuales` con los
 * equipos elegidos, así un repuesto de esos equipos lo hereda (ver `useManualesDeEquipos`).
 */
import { useRef, useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { Cog, FileUp, Search, X } from 'lucide-react'
import { auth, db, storage } from '@/services/firebase'
import { useGlobalEquipmentSearch, type GlobalEquipmentResult } from '@/hooks/useGlobalEquipmentSearch'
import { useManualesDeEquipos } from '@/hooks/repuestos/useManualesDeEquipos'
import { ListCell, ListGroup } from '@/components/piel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { logger } from '@/lib/logger'
import { formatoTamano, rutaDocumento, separarPorTamano, tituloDeArchivo } from '@/utils/admin/archivosEquipos'

type Estado = 'espera' | 'subiendo' | 'listo' | 'error'
interface Subida { archivo: File; estado: Estado; avance: number; error?: string }

export function SubirArchivosEquiposPage() {
  const [busca, setBusca] = useState('')
  const [equipos, setEquipos] = useState<GlobalEquipmentResult[]>([])
  const [subidas, setSubidas] = useState<Subida[]>([])
  const [rechazados, setRechazados] = useState<string[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [recarga, setRecarga] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { results, loading } = useGlobalEquipmentSearch(busca)
  const ids = equipos.map((e) => e.id)
  // `recarga` en la clave: tras subir, la lista de abajo vuelve a leer `manuales`.
  const { manuales } = useManualesDeEquipos(recarga ? [...ids, `__${recarga}`] : ids)

  const elegirEquipo = (e: GlobalEquipmentResult) => {
    setEquipos((prev) => (prev.some((x) => x.id === e.id) ? prev : [...prev, e]))
    setBusca('')
  }

  const elegirArchivos = (lista: FileList | null) => {
    if (!lista) return
    const { validos, rechazados: fuera } = separarPorTamano(Array.from(lista))
    setSubidas((prev) => [...prev.filter((s) => s.estado !== 'listo'), ...validos.map((archivo) => ({ archivo, estado: 'espera' as Estado, avance: 0 }))])
    setRechazados(fuera.map((r) => `${r.archivo.name}: ${r.motivo}`))
    if (inputRef.current) inputRef.current.value = ''
  }

  const actualizar = (i: number, cambio: Partial<Subida>) =>
    setSubidas((prev) => prev.map((s, k) => (k === i ? { ...s, ...cambio } : s)))

  const subirUno = (s: Subida, i: number) =>
    new Promise<void>((resolve) => {
      const principal = equipos[0]!
      const ruta = rutaDocumento(principal.id, s.archivo.name, Date.now())
      const tarea = uploadBytesResumable(ref(storage, ruta), s.archivo, {
        contentType: s.archivo.type || 'application/octet-stream',
      })
      actualizar(i, { estado: 'subiendo', avance: 0, error: undefined })
      tarea.on(
        'state_changed',
        (snap) => actualizar(i, { avance: snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0 }),
        (err) => {
          logger.error('Subir archivo de equipo', err)
          actualizar(i, { estado: 'error', error: err.code === 'storage/unauthorized' ? 'sin permiso (solo admin)' : 'no se pudo subir' })
          resolve()
        },
        async () => {
          try {
            const url = await getDownloadURL(tarea.snapshot.ref)
            await addDoc(collection(db, 'manuales'), {
              titulo: tituloDeArchivo(s.archivo.name),
              url,
              equipos: ids,
              machineOrigen: principal.alias || principal.nombre,
              ruta,
              nombreArchivo: s.archivo.name,
              tipoArchivo: s.archivo.type || null,
              tamano: s.archivo.size,
              origen: 'admin-subida',
              subidoPor: auth.currentUser?.uid ?? null,
              subidoEn: serverTimestamp(),
            })
            actualizar(i, { estado: 'listo', avance: 1 })
          } catch (err) {
            logger.error('Registrar archivo de equipo', err instanceof Error ? err : new Error(String(err)))
            actualizar(i, { estado: 'error', error: 'se subió, pero no se pudo registrar' })
          }
          resolve()
        },
      )
    })

  const subirTodo = async () => {
    setSubiendo(true)
    // Uno a la vez: con archivos de 100 MB en la red de planta, en paralelo se ahogan entre sí.
    for (let i = 0; i < subidas.length; i++) {
      if (subidas[i]!.estado === 'listo') continue
      await subirUno(subidas[i]!, i)
    }
    setSubiendo(false)
    setRecarga((n) => n + 1)
  }

  const pendientes = subidas.filter((s) => s.estado !== 'listo').length

  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-title1 font-bold">Subir archivos de equipos</h1>
        <p className="text-subhead text-muted-foreground">
          Manuales, catálogos y planos de hasta 100 MB por archivo. Quedan guardados y aparecen como
          manuales de los equipos elegidos en Repuestos.
        </p>
      </div>

      <ListGroup title="1 · Equipo" footer="Puedes elegir varios: el archivo se verá en todos.">
        <div className="space-y-3 p-3">
          {equipos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {equipos.map((e) => (
                <span key={e.id} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-muted pl-3 pr-1 text-subhead">
                  {e.alias || e.nombre}
                  <button type="button" aria-label={`Quitar ${e.alias || e.nombre}`} disabled={subiendo}
                          onClick={() => setEquipos((prev) => prev.filter((x) => x.id !== e.id))}
                          className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-background">
                    <X className="size-4" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar equipo (p. ej. GEA, termoformadora)…" className="pl-9" />
          </div>
          {busca.trim().length >= 2 && (
            <div className="max-h-[40vh] space-y-1 overflow-y-auto">
              {loading && <p className="px-1 py-2 text-footnote text-muted-foreground">Cargando equipos…</p>}
              {!loading && results.filter((e) => !e.oculto).length === 0 && (
                <p className="px-1 py-2 text-footnote text-muted-foreground">Sin equipos que coincidan.</p>
              )}
              {results.filter((e) => !e.oculto).map((e) => (
                <button key={e.id} type="button" onClick={() => elegirEquipo(e)}
                        className="flex min-h-[44px] w-full items-center gap-2 rounded-card border border-border bg-card px-3 text-left text-subhead hover:bg-muted">
                  <Cog className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{e.alias || e.nombre}</span>
                  {e.codigo && <span className="shrink-0 font-mono text-footnote text-muted-foreground">{e.codigo}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </ListGroup>

      <ListGroup title="2 · Archivos" footer="PDF, Excel, Word, imágenes, ZIP o planos. Tope de 100 MB por archivo.">
        <div className="space-y-3 p-3">
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => elegirArchivos(e.target.files)} />
          <Button type="button" variant="outline" className="min-h-[44px] w-full" disabled={subiendo} onClick={() => inputRef.current?.click()}>
            <FileUp className="mr-2 size-4" /> Elegir archivos
          </Button>
          {rechazados.length > 0 && (
            <ul className="space-y-1 text-footnote text-ink-crit">
              {rechazados.map((r) => <li key={r}>No se sube {r}</li>)}
            </ul>
          )}
          {subidas.length > 0 && (
            <ul className="space-y-2">
              {subidas.map((s, i) => (
                <li key={`${s.archivo.name}-${i}`} className="rounded-card border border-border px-3 py-2">
                  <div className="flex items-center gap-2 text-subhead">
                    <span className="min-w-0 flex-1 truncate">{s.archivo.name}</span>
                    <span className="shrink-0 tabular-nums text-footnote text-muted-foreground">{formatoTamano(s.archivo.size)}</span>
                    {s.estado === 'espera' && !subiendo && (
                      <button type="button" aria-label={`Quitar ${s.archivo.name}`} onClick={() => setSubidas((prev) => prev.filter((_, k) => k !== i))}
                              className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full transition-[width] ${s.estado === 'error' ? 'bg-fill-critical' : s.estado === 'listo' ? 'bg-fill-ok' : 'bg-primary'}`}
                         style={{ width: `${Math.round(s.avance * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-footnote text-muted-foreground">
                    {s.estado === 'espera' && 'Listo para subir'}
                    {s.estado === 'subiendo' && `Subiendo… ${Math.round(s.avance * 100)} %`}
                    {s.estado === 'listo' && 'Guardado'}
                    {s.estado === 'error' && <span className="text-ink-crit">Error: {s.error}</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Button type="button" className="min-h-[44px] w-full" disabled={subiendo || pendientes === 0 || equipos.length === 0} onClick={() => void subirTodo()}>
            {subiendo ? 'Subiendo…' : equipos.length === 0 ? 'Elige un equipo primero' : pendientes === 0 ? 'Elige archivos' : `Subir ${pendientes} ${pendientes === 1 ? 'archivo' : 'archivos'}`}
          </Button>
        </div>
      </ListGroup>

      {equipos.length > 0 && (
        <ListGroup title="Ya guardados en estos equipos" footer={manuales.length ? undefined : 'Todavía no hay archivos para estos equipos.'}>
          {manuales.map((m) => (
            <ListCell key={m.id} title={m.titulo} subtitle={m.machineOrigen} onClick={() => window.open(m.url, '_blank', 'noopener')} />
          ))}
        </ListGroup>
      )}
    </div>
  )
}
