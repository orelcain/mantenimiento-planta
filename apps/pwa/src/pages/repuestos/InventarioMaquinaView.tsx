import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronLeft, Loader2, Pencil, Search, X } from 'lucide-react'
import { Button, ListGroup, SegmentedControl, Tag, type TagTone } from '@/components/piel'
import { haystackMatchesAll, normalizeForSearch } from '@/utils/repuestos'
import type { useBodega, InventarioLinea, InventarioSesion, MotivoDuda, BodegaMergedItem } from '@/hooks/repuestos/useBodega'

/**
 * Inventario de la bodega de UNA máquina, contado a mano y cargado desde el
 * cuaderno. Dos listas:
 *  - Inventario: lo confirmado, por ubicación, con contado vs sistema.
 *  - Dudosos: lo que el papel no deja cerrar (código que no existe, cantidad
 *    sobrescrita, SAP que es de otra pieza, sin SAP). Al validar una línea
 *    pasa al inventario. El código del cuaderno nunca se pisa.
 */

const MOTIVO: Record<MotivoDuda, { texto: string; tono: TagTone }> = {
  codigo: { texto: 'Revisar código', tono: 1 },
  cantidad: { texto: 'Revisar cantidad', tono: 3 },
  sap: { texto: 'SAP no corresponde', tono: 3 },
  sin_sap: { texto: 'Sin SAP', tono: 5 },
}

const normCodigo = (s: string) => s.toUpperCase().replace(/[\s.\-/]/g, '')

/** El repuesto del maestro con ese código de fabricante (el que tenga SAP). */
function buscarEnMaestro(items: BodegaMergedItem[], codigo: string): BodegaMergedItem | undefined {
  const k = normCodigo(codigo)
  if (!k) return undefined
  return items.find(i => i.codigoSAP && normCodigo(i.codigoFabricante || '') === k)
}

export function InventarioMaquinaView({ sesion, bodega, user, onVolver }: {
  sesion: InventarioSesion
  bodega: ReturnType<typeof useBodega>
  user: { id: string; nombre: string } | null
  onVolver: () => void
}) {
  const { items, loadLineas, validarLinea } = bodega
  const [lineas, setLineas] = useState<InventarioLinea[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<'inventario' | 'dudosos'>('inventario')
  const [busca, setBusca] = useState('')

  const recargar = useCallback(async () => {
    try {
      setLineas(await loadLineas(sesion.id))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las líneas.')
    }
  }, [loadLineas, sesion.id])
  useEffect(() => { void recargar() }, [recargar])

  const validadas = useMemo(() => (lineas ?? []).filter(l => l.estado === 'validado'), [lineas])
  const dudosas = useMemo(() => (lineas ?? []).filter(l => l.estado === 'dudoso'), [lineas])
  // Los totales salen de las MISMAS listas que se muestran (contador = filtro).
  const unidades = (lineas ?? []).reduce((a, l) => a + (l.cantidad ?? 0), 0)
  const conDif = validadas.filter(l => l.stockSistema != null && l.cantidad != null && l.cantidad !== l.stockSistema).length

  const filtrar = useCallback((ls: InventarioLinea[]) => {
    const t = normalizeForSearch(busca).split(/\s+/).filter(Boolean)
    if (!t.length) return ls
    return ls.filter(l => haystackMatchesAll(normalizeForSearch(
      `${l.codigoFabricante} ${l.codigoCuaderno} ${l.codigoSAP} ${l.textoBreve} ${l.descripcion} ${l.nombreComun} ${l.ubicacion}`), t))
  }, [busca])

  const porUbicacion = useMemo(() => {
    const m = new Map<string, InventarioLinea[]>()
    for (const l of filtrar(validadas)) {
      if (!m.has(l.ubicacion)) m.set(l.ubicacion, [])
      m.get(l.ubicacion)!.push(l)
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
  }, [validadas, filtrar])

  const guardar = async (l: InventarioLinea, datos: Parameters<typeof validarLinea>[2]) => {
    if (!user) throw new Error('Hay que iniciar sesión.')
    await validarLinea(sesion.id, l.id, datos, user.id, user.nombre)
    await recargar()
  }

  return (
    <div className="space-y-4">
      <div>
        <button type="button" onClick={onVolver}
                className="-ml-1 mb-1 flex min-h-[44px] items-center gap-1 text-subhead text-primary">
          <ChevronLeft className="h-4 w-4" /> Inventarios
        </button>
        <h3 className="text-title3 font-bold text-foreground">{sesion.nombre}</h3>
        <p className="text-footnote text-muted-foreground tabular-nums">
          {sesion.maquina ? `${sesion.maquina} · ` : ''}{lineas?.length ?? '…'} líneas · {unidades} unidades
          {conDif > 0 && ` · ${conDif} con diferencia contra el sistema`}
        </p>
      </div>

      <SegmentedControl
        value={vista} onChange={setVista} ariaLabel="Vista del inventario"
        segments={[
          { value: 'inventario', label: <>Inventario <span className="tabular-nums text-muted-foreground">{validadas.length}</span></> },
          { value: 'dudosos', label: <>Dudosos <span className="tabular-nums text-ink-warn">{dudosas.length}</span></> },
        ]} />

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input type="search" value={busca} onChange={e => setBusca(e.target.value)}
               placeholder="Código de fabricante, SAP o nombre…"
               className="h-11 w-full rounded-full bg-muted pl-10 pr-4 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
      </div>

      {error && <p className="flex items-center gap-1.5 text-footnote text-ink-crit"><AlertTriangle className="h-4 w-4" />{error}</p>}
      {!lineas && !error && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}

      {lineas && vista === 'inventario' && (
        porUbicacion.length === 0
          ? <p className="py-8 text-center text-footnote text-muted-foreground">{busca ? 'Sin coincidencias' : 'Todavía no hay líneas validadas.'}</p>
          : porUbicacion.map(([ubi, ls]) => (
              <ListGroup key={ubi}
                         title={<>{ubi} <span className="tabular-nums font-normal">· {ls.length} líneas · {ls.reduce((a, l) => a + (l.cantidad ?? 0), 0)} unidades</span></>}>
                {ls.map(l => <FilaValidada key={l.id} linea={l} items={items} onGuardar={guardar} />)}
              </ListGroup>
            ))
      )}

      {lineas && vista === 'dudosos' && (
        filtrar(dudosas).length === 0
          ? <p className="py-8 text-center text-footnote text-muted-foreground">{busca ? 'Sin coincidencias' : 'No quedan dudosos: todo está validado.'}</p>
          : <div className="space-y-3">
              <p className="text-footnote text-muted-foreground">
                Confirma cada línea con la etiqueta de la pieza. Al validarla pasa al inventario; lo que decía el cuaderno queda guardado.
              </p>
              {filtrar(dudosas).map(l => <TarjetaDudosa key={l.id} linea={l} items={items} onGuardar={guardar} />)}
            </div>
      )}
    </div>
  )
}

/* ── Una línea confirmada: nombre, códigos, contado vs sistema; se puede corregir ── */

function FilaValidada({ linea: l, items, onGuardar }: {
  linea: InventarioLinea
  items: BodegaMergedItem[]
  onGuardar: (l: InventarioLinea, d: Parameters<ReturnType<typeof useBodega>['validarLinea']>[2]) => Promise<void>
}) {
  const [editando, setEditando] = useState(false)
  const dif = l.stockSistema != null && l.cantidad != null ? l.cantidad - l.stockSistema : null
  if (editando) {
    return (
      <div className="border-b border-border/40 p-3 last:border-b-0">
        <FormularioLinea linea={l} items={items} textoBoton="Guardar"
                         onCancelar={() => setEditando(false)}
                         onGuardar={async d => { await onGuardar(l, d); setEditando(false) }} />
      </div>
    )
  }
  return (
    <div className="flex min-h-[56px] items-center gap-3 border-b border-border/40 px-4 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-foreground">{l.textoBreve || l.descripcion || 'Sin nombre'}</p>
        <p className="text-footnote text-muted-foreground">
          <span className="font-mono tabular-nums">{l.codigoFabricante}</span>
          {' · '}
          {l.codigoSAP ? <span className="font-mono tabular-nums">SAP {l.codigoSAP}</span> : <span className="text-ink-warn">sin SAP</span>}
          {l.codigoCuaderno && l.codigoCuaderno !== l.codigoFabricante && <> · cuaderno: <span className="font-mono">{l.codigoCuaderno}</span></>}
          {l.nombreComun && <> · {l.nombreComun}</>}
        </p>
      </div>
      <div className="w-14 shrink-0 text-right">
        <p className="text-headline font-bold tabular-nums text-foreground">{l.cantidad ?? '—'}</p>
        {l.stockSistema != null && (
          <p className={`text-caption tabular-nums ${dif ? (dif > 0 ? 'text-ink-ok' : 'text-ink-crit') : 'text-muted-foreground'}`}>
            sist. {l.stockSistema}{dif ? ` (${dif > 0 ? '+' : ''}${dif})` : ''}
          </p>
        )}
      </div>
      <button type="button" onClick={() => setEditando(true)} aria-label="Corregir línea"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  )
}

/* ── Una línea dudosa: qué dice el cuaderno, por qué duda, y el formulario ── */

function TarjetaDudosa({ linea: l, items, onGuardar }: {
  linea: InventarioLinea
  items: BodegaMergedItem[]
  onGuardar: (l: InventarioLinea, d: Parameters<ReturnType<typeof useBodega>['validarLinea']>[2]) => Promise<void>
}) {
  const m = l.motivo ? MOTIVO[l.motivo] : undefined
  return (
    <div className="space-y-3 rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
      <div className="flex flex-wrap items-center gap-2">
        {m && <Tag tone={m.tono}>{m.texto}</Tag>}
        <span className="text-footnote text-muted-foreground">{l.ubicacion}</span>
      </div>
      <p className="text-body text-foreground">
        Cuaderno: <b className="font-mono tabular-nums">{l.codigoCuaderno}</b>
        {' '}<span className="tabular-nums">× {l.cantidad ?? '?'}</span>
        {l.notaCuaderno && <span className="text-muted-foreground"> · «{l.notaCuaderno}»</span>}
      </p>
      {l.detalleDuda && <p className="text-footnote text-muted-foreground">{l.detalleDuda}</p>}
      <FormularioLinea linea={l} items={items} textoBoton="Validar" onGuardar={d => onGuardar(l, d)} />
    </div>
  )
}

/* ── Formulario común: código, cantidad y SAP, con el maestro buscando solo ── */

function FormularioLinea({ linea: l, items, textoBoton, onGuardar, onCancelar }: {
  linea: InventarioLinea
  items: BodegaMergedItem[]
  textoBoton: string
  onGuardar: (d: Parameters<ReturnType<typeof useBodega>['validarLinea']>[2]) => Promise<void>
  onCancelar?: () => void
}) {
  const [codigo, setCodigo] = useState(l.estado === 'dudoso' && l.motivo === 'codigo' ? (l.sugerencia || l.codigoCuaderno) : l.codigoFabricante)
  const [cantidad, setCantidad] = useState<string>(l.cantidad != null ? String(l.cantidad) : '')
  // Un SAP que "no corresponde" no se ofrece de nuevo: se escribe el correcto.
  const [sap, setSap] = useState(l.motivo === 'sap' && l.estado === 'dudoso' ? '' : l.codigoSAP)
  const [sapTocado, setSapTocado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const enMaestro = useMemo(() => buscarEnMaestro(items, codigo), [items, codigo])
  // El SAP sigue al código mientras nadie lo haya escrito a mano.
  useEffect(() => {
    if (sapTocado) return
    if (l.motivo === 'sap' && l.estado === 'dudoso') return
    setSap(enMaestro?.codigoSAP ?? (codigo === l.codigoFabricante ? l.codigoSAP : ''))
  }, [enMaestro, codigo, sapTocado, l])
  const itemSap = useMemo(() => items.find(i => i.codigoSAP === sap.trim()), [items, sap])

  const n = Number(cantidad)
  const valido = codigo.trim().length >= 4 && cantidad.trim() !== '' && Number.isInteger(n) && n >= 0

  const enviar = async () => {
    if (!valido) return
    setGuardando(true); setErr(null)
    try {
      await onGuardar({
        codigoFabricante: codigo.trim(),
        cantidad: n,
        codigoSAP: sap.trim(),
        textoBreve: itemSap?.textoBreve || (sap.trim() ? l.textoBreve : '') || l.descripcion || l.textoBreve,
        // Sin ficha de bodega el "stock" es un 0 por defecto, no un dato: no se compara.
        stockSistema: itemSap?.bodegaId ? itemSap.stockActual : null,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally { setGuardando(false) }
  }

  const campo = 'h-11 w-full rounded-ctl bg-muted px-3 text-body text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40'
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_5.5rem] gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted-foreground">Código de fabricante</span>
          <input value={codigo} onChange={e => setCodigo(e.target.value)} inputMode="text" autoComplete="off"
                 className={`${campo} font-mono`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted-foreground">Cantidad</span>
          <input value={cantidad} onChange={e => setCantidad(e.target.value.replace(/\D/g, ''))} inputMode="numeric"
                 className={`${campo} text-center font-semibold tabular-nums`} />
        </label>
      </div>
      {l.sugerencia && codigo !== l.sugerencia && l.estado === 'dudoso' && (
        <button type="button" onClick={() => setCodigo(l.sugerencia!)}
                className="min-h-[36px] text-footnote text-primary">
          Usar la sugerencia: <span className="font-mono">{l.sugerencia}</span>
        </button>
      )}
      <p className="text-footnote text-muted-foreground">
        {enMaestro
          ? <>En el maestro: <b className="text-foreground">{enMaestro.textoBreve}</b> · SAP <span className="font-mono">{enMaestro.codigoSAP}</span>{enMaestro.bodegaId ? ` · stock sistema ${enMaestro.stockActual}` : ' · sin stock configurado en bodega'}</>
          : codigo.trim().length >= 4 ? 'Ese código no tiene SAP en el maestro: se puede validar igual y asignar el SAP a mano.' : ''}
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-caption text-muted-foreground">Código SAP (opcional)</span>
        <input value={sap} onChange={e => { setSap(e.target.value.replace(/\D/g, '')); setSapTocado(true) }} inputMode="numeric"
               placeholder={l.motivo === 'sap' ? `El actual (${l.codigoSAP}) es de otra pieza` : 'Sin SAP'}
               className={`${campo} font-mono tabular-nums`} />
      </label>
      {sap.trim() && !itemSap && <p className="text-footnote text-ink-warn">Ese SAP no está en la bodega de la app.</p>}
      {itemSap && sapTocado && <p className="text-footnote text-muted-foreground">SAP {itemSap.codigoSAP}: {itemSap.textoBreve}</p>}
      {err && <p className="text-footnote text-ink-crit">{err}</p>}
      <div className="flex gap-2">
        <Button variant="filled" onClick={enviar} disabled={!valido || guardando}>
          {guardando ? <Loader2 className="animate-spin" /> : <Check />} {textoBoton}
        </Button>
        {onCancelar && <Button variant="plain" onClick={onCancelar}><X /> Cancelar</Button>}
      </div>
    </div>
  )
}
