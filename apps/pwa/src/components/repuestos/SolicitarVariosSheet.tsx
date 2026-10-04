/**
 * «Solicitar repuestos» de una máquina: uno o varios de una vez.
 *
 * Lista agrupada (comunes → con 1 unidad → resto → sin SAP), casilla y cantidad
 * por línea (arranca en 1: el usuario la sube si hace falta), aviso de stock
 * por línea y un solo botón que crea todas las solicitudes. Lógica pura en
 * `utils/repuestos/solicitudMultiple.ts`. Sirve en PC y en el celular (Sheet).
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Minus, Plus, Search, Send } from 'lucide-react'
import { Button, Sheet } from '@/components/piel'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { nombreVisible } from '@/utils/repuestos/nombreVisible'
import type { NuevaSolicitud } from '@/hooks/repuestos/useSolicitudes'
import type { StockDeSolicitud } from '@/hooks/repuestos/solicitudDeRepuesto'
import {
  acotarCantidad, agruparParaSolicitar, resumenDeSeleccion, sePuedePedir, solicitudesDe,
  TITULO_GRUPO, type PiezaSolicitable,
} from '@/utils/repuestos/solicitudMultiple'

interface Props {
  open: boolean
  onClose: () => void
  /** Nombre de la máquina, para el título. */
  maquina: string
  piezas: PiezaSolicitable[]
  /** Si las piezas vienen sin stock (expediente), se lee al abrir con esto. */
  cargarStock?: (saps: string[]) => Promise<Map<string, StockDeSolicitud>>
  /** Crea TODAS las solicitudes; el que llama avisa (toast) y cierra. */
  onSubmit: (solicitudes: NuevaSolicitud[]) => Promise<void>
}

const CAMPO = 'h-11 w-full rounded-ctl bg-muted pl-9 pr-3 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40'

export function SolicitarVariosSheet({ open, onClose, maquina, piezas, cargarStock, onSubmit }: Props) {
  const [query, setQuery] = useState('')
  const [seleccion, setSeleccion] = useState<Map<string, number>>(() => new Map())
  const [observaciones, setObservaciones] = useState('')
  const [stockCargado, setStockCargado] = useState<Map<string, StockDeSolicitud> | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Al abrir: limpio y, si hace falta, el stock de esos SAP.
  useEffect(() => {
    if (!open) return
    setQuery(''); setSeleccion(new Map()); setObservaciones(''); setError(null); setStockCargado(null)
    if (!cargarStock) return
    let vivo = true
    cargarStock(piezas.map((p) => p.codigoSAP)).then((m) => { if (vivo) setStockCargado(m) }).catch(() => { if (vivo) setStockCargado(new Map()) })
    return () => { vivo = false }
  }, [open, cargarStock, piezas])

  const conStock = useMemo(
    () => (stockCargado ? piezas.map((p) => ({ ...p, stock: p.stock ?? stockCargado.get(p.codigoSAP.trim()) })) : piezas),
    [piezas, stockCargado],
  )
  const grupos = useMemo(() => agruparParaSolicitar(conStock, query), [conStock, query])
  const resumen = useMemo(() => resumenDeSeleccion(conStock, seleccion), [conStock, seleccion])

  const alternar = (p: PiezaSolicitable, marcar: boolean) => setSeleccion((prev) => {
    const next = new Map(prev)
    if (marcar) next.set(p.clave, prev.get(p.clave) ?? 1)
    else next.delete(p.clave)
    return next
  })
  const fijar = (clave: string, n: number) => setSeleccion((prev) => new Map(prev).set(clave, acotarCantidad(n)))

  const enviar = async () => {
    const lineas = solicitudesDe(conStock, seleccion, observaciones)
    if (!lineas.length) { setError('Marca al menos un repuesto.'); return }
    setEnviando(true); setError(null)
    try { await onSubmit(lineas) }
    catch { setError('No se pudieron crear las solicitudes. Intenta de nuevo.') }
    finally { setEnviando(false) }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="wide"
      title={`Solicitar repuestos · ${maquina}`}
      description={`${conStock.filter(sePuedePedir).length} con SAP${cargarStock && !stockCargado ? ' · leyendo stock…' : ''}`}
      actions={
        <>
          <Button variant="tinted" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button variant="filled" onClick={enviar} disabled={enviando || resumen.repuestos === 0}>
            {enviando ? <Loader2 className="animate-spin" /> : <Send />}
            {resumen.repuestos === 0 ? 'Solicitar' : `Solicitar ${resumen.repuestos} ${resumen.repuestos === 1 ? 'repuesto' : 'repuestos'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} className={CAMPO} autoComplete="off"
                 placeholder="Buscar por nombre, SAP o código de fabricante" aria-label="Buscar repuesto" />
        </label>

        {grupos.length === 0 && <p className="py-8 text-center text-footnote text-muted-foreground">Ningún repuesto coincide.</p>}

        {grupos.map(({ grupo, piezas: lista }) => (
          <section key={grupo}>
            <h3 className="px-1 pb-1 pt-2 text-caption uppercase tracking-wide text-muted-foreground">{TITULO_GRUPO[grupo]} · {lista.length}</h3>
            <ul className="divide-y divide-border/60 overflow-hidden rounded-card bg-card">
              {lista.map((p) => {
                const pedible = sePuedePedir(p)
                const cant = seleccion.get(p.clave)
                const marcada = cant != null
                const aviso = resumen.avisos.get(p.clave)
                const st = p.stock
                const nv = nombreVisible(p)
                return (
                  <li key={p.clave} className={cn('flex items-center gap-3 px-3 py-2', marcada && 'bg-primary/[0.06]', !pedible && 'opacity-60')}>
                    <Checkbox checked={marcada} disabled={!pedible} onCheckedChange={(v) => alternar(p, v === true)}
                              aria-label={`Marcar ${nv.titulo}`} className="h-5 w-5" />
                    <button type="button" disabled={!pedible} onClick={() => alternar(p, !marcada)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-body font-medium text-foreground">{p.textoBreve || nv.esComun ? nv.titulo : <span className="italic text-muted-foreground">Sin nombre</span>}</div>
                      {nv.oficial && <div className="truncate text-footnote text-muted-foreground">{nv.oficial}</div>}
                      <div className="text-caption text-muted-foreground">
                        {pedible ? <span className="font-mono">SAP {p.codigoSAP}</span> : 'sin SAP: no se puede solicitar hasta asignarle uno'}
                        {p.codigoFabricante && <> · <span className="font-mono">{p.codigoFabricante}</span></>}
                        {p.cantidadPorMaquina ? <> · la máquina lleva {p.cantidadPorMaquina}</> : null}
                      </div>
                      {pedible && (
                        <div className={cn('text-caption', st?.configurado ? (st.stockActual === 0 ? 'text-ink-crit' : st.stockActual === 1 ? 'text-ink-warn' : 'text-ink-ok') : 'text-muted-foreground')}>
                          {st?.configurado ? `● ${st.stockActual} en bodega${st.ubicacionBodega ? ` · ${st.ubicacionBodega}` : ''}` : 'sin registro en bodega'}
                        </div>
                      )}
                      {aviso && <div className="mt-0.5 flex items-center gap-1 text-caption text-ink-warn"><AlertTriangle className="h-3 w-3 shrink-0" /> {aviso}</div>}
                    </button>
                    {pedible && (
                      <div className={cn('flex shrink-0 items-center overflow-hidden rounded-ctl border border-border', !marcada && 'opacity-40')}>
                        <button type="button" aria-label="Menos" disabled={!marcada} onClick={() => fijar(p.clave, (cant ?? 1) - 1)}
                                className="flex h-9 w-9 items-center justify-center hover:bg-muted disabled:cursor-default"><Minus className="h-3.5 w-3.5" /></button>
                        <input type="number" inputMode="numeric" min={1} aria-label={`Cantidad de ${nv.titulo}`}
                               value={cant ?? 1} disabled={!marcada}
                               onChange={(e) => fijar(p.clave, Number(e.target.value))}
                               className="h-9 w-12 bg-muted text-center text-body tabular-nums text-foreground focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                        <button type="button" aria-label="Más" disabled={!marcada} onClick={() => fijar(p.clave, (cant ?? 1) + 1)}
                                className="flex h-9 w-9 items-center justify-center hover:bg-muted disabled:cursor-default"><Plus className="h-3.5 w-3.5" /></button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        <label className="block">
          <span className="text-caption text-muted-foreground">Observación (va en todas las solicitudes, opcional)</span>
          <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} maxLength={200}
                 className="mt-1 h-11 w-full rounded-ctl bg-muted px-3 text-body text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                 placeholder="Para el cambio de cuchillas del lunes" />
        </label>

        <p className="text-footnote text-muted-foreground" aria-live="polite">
          {resumen.repuestos === 0 ? 'Nada marcado todavía.' : <>
            <span className="font-medium text-foreground">{resumen.repuestos} {resumen.repuestos === 1 ? 'repuesto' : 'repuestos'} · {resumen.unidades} unidades</span>
            {resumen.avisos.size > 0 && <span className="text-ink-warn"> · {resumen.avisos.size} {resumen.avisos.size === 1 ? 'aviso' : 'avisos'} de stock</span>}
          </>}
        </p>
        {error && <p className="text-footnote text-ink-crit">{error}</p>}
      </div>
    </Sheet>
  )
}
