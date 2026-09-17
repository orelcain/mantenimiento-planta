import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Loader2, Minus, Plus, Search, X } from 'lucide-react'
import { Button, SegmentedControl } from '@/components/piel'
import { MAX_CANTIDAD_REPUESTO, MAX_REPUESTOS_EVENTO } from '@/config/bitacora'
import type { RepuestoUsado } from '@/services/bitacora/bitacora.types'
import { nombreRepuesto, normalizarRepuestos } from '@/services/bitacora/presentacionEvento'
import {
  buscarRepuestos,
  esCodigoSap,
  limpiarCodigo,
  type AlcanceBusqueda,
  type DatoBodega,
  type FuenteRepuestos,
  type RepuestoDelCatalogo,
} from '@/services/bitacora/repuestosBitacora'
import { formatNombreSAP } from '@/utils/repuestos/formatNombreSAP'

/**
 * «Repuestos usados» del evento (mockups aprobados 16 y 17-09-2026): un
 * buscador con dos alcances («En este equipo» y «Todos»), resultados con nombre
 * común, nombre SAP, código y bodega, y el nombre común editable desde aquí
 * (se guarda en la ficha del repuesto, el mismo campo que usa Repuestos).
 */

const CAMPO =
  'h-[44px] w-full rounded-ctl border-0 bg-muted-foreground/10 px-3 text-[16px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary'
const ETIQUETA = 'mb-1.5 flex justify-between gap-2 text-footnote text-muted-foreground'
const BOTON_PASO =
  'flex size-11 items-center justify-center rounded-full text-primary transition-colors hover:bg-muted-foreground/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
const FILA =
  'relative flex items-center gap-2 py-1.5 pl-3 pr-1 before:absolute before:left-3 before:right-0 before:top-0 before:h-px before:bg-border before:content-[""] first:before:hidden'

const nombreLegible = (r: { nombre: string }) => formatNombreSAP(r.nombre).nombre || r.nombre

/** "bodega B-7-2 · 3 pzas" / "bodega B-7-2 · sin stock" / ''. */
function textoBodega(b: DatoBodega | undefined): string {
  if (!b) return ''
  const partes = [b.ubicacion ? `bodega ${b.ubicacion}` : '']
  if (b.stock != null) partes.push(b.stock > 0 ? `${b.stock} ${b.unidad || 'un'}` : 'sin stock')
  return partes.filter(Boolean).join(' · ')
}

export function RepuestosUsados({
  valor,
  onChange,
  equipoId,
  fuente,
  puedeEditarMaestro = true,
}: {
  valor: readonly RepuestoUsado[]
  onChange: (repuestos: RepuestoUsado[]) => void
  /** Equipo elegido del buscador: habilita el alcance «En este equipo». */
  equipoId: string | null
  fuente: FuenteRepuestos
  /** El pase de bitácora ve el nombre común pero no escribe en el maestro. */
  puedeEditarMaestro?: boolean
}) {
  const id = useId()
  const [consulta, setConsulta] = useState('')
  const [alcance, setAlcance] = useState<AlcanceBusqueda>(equipoId ? 'equipo' : 'todos')
  const [listaEquipo, setListaEquipo] = useState<{ equipoId: string; items: RepuestoDelCatalogo[] } | null>(null)
  const [listaTodos, setListaTodos] = useState<RepuestoDelCatalogo[] | null>(null)
  const [cargando, setCargando] = useState<AlcanceBusqueda | null>(null)
  const [errorLista, setErrorLista] = useState<string | null>(null)
  const [buscandoCodigo, setBuscandoCodigo] = useState(false)
  const [fueraDelEquipo, setFueraDelEquipo] = useState<RepuestoDelCatalogo | null>(null)
  const [bodega, setBodega] = useState<Map<string, DatoBodega>>(new Map())
  const [aviso, setAviso] = useState<string | null>(null)
  const [edicionComun, setEdicionComun] = useState<{ codigo: string; texto: string } | null>(null)
  const [guardandoComun, setGuardandoComun] = useState(false)
  const inputComunRef = useRef<HTMLInputElement>(null)
  const pedidosBodega = useRef<Set<string>>(new Set())

  // Sin equipo no hay «En este equipo».
  useEffect(() => {
    if (!equipoId) setAlcance('todos')
  }, [equipoId])

  const listaEquipoActual = listaEquipo && listaEquipo.equipoId === equipoId ? listaEquipo.items : null
  const lista = alcance === 'equipo' ? listaEquipoActual : listaTodos
  const codigoEscrito = limpiarCodigo(consulta)
  const esCodigo = esCodigoSap(codigoEscrito)
  const resultados = useMemo(() => {
    if (!lista) return []
    const r = buscarRepuestos(lista, consulta)
    // Un código completo escrito: ese primero, aunque no empiece igual.
    if (esCodigo) {
      const exacto = lista.find((x) => x.codigoSAP === codigoEscrito)
      if (exacto) return [exacto, ...r.filter((x) => x.codigoSAP !== codigoEscrito)]
    }
    return r
  }, [lista, consulta, esCodigo, codigoEscrito])

  const cargar = (cual: AlcanceBusqueda) => {
    if (cual === 'equipo') {
      if (!equipoId || listaEquipoActual || cargando) return
      const pedido = equipoId
      setCargando('equipo')
      setErrorLista(null)
      fuente
        .delEquipo(pedido)
        .then((items) => setListaEquipo({ equipoId: pedido, items }))
        .catch(() => setErrorLista('No se pudieron cargar los repuestos del equipo. Revisa la señal.'))
        .finally(() => setCargando(null))
    } else {
      if (listaTodos || cargando) return
      setCargando('todos')
      setErrorLista(null)
      fuente
        .todos()
        .then(setListaTodos)
        .catch(() => setErrorLista('No se pudo cargar la lista de repuestos. Revisa la señal.'))
        .finally(() => setCargando(null))
    }
  }
  const cambiarAlcance = (v: AlcanceBusqueda) => {
    setAlcance(v)
    setFueraDelEquipo(null)
    cargar(v)
  }

  // Un código completo que no está en el equipo se busca en el maestro y se ofrece igual.
  useEffect(() => {
    setFueraDelEquipo(null)
    if (alcance !== 'equipo' || !esCodigo || !lista || lista.some((x) => x.codigoSAP === codigoEscrito)) return
    let vivo = true
    setBuscandoCodigo(true)
    fuente
      .porCodigo(codigoEscrito)
      .then((r) => vivo && setFueraDelEquipo(r ?? { codigoSAP: codigoEscrito, nombre: '', nombreComun: '', ubicacion: '' }))
      .catch(() => vivo && setFueraDelEquipo({ codigoSAP: codigoEscrito, nombre: '', nombreComun: '', ubicacion: '' }))
      .finally(() => vivo && setBuscandoCodigo(false))
    return () => {
      vivo = false
    }
  }, [alcance, esCodigo, codigoEscrito, lista, fuente])

  // Bodega (ubicación y stock) de lo elegido y de los resultados a la vista: una lectura por código, una vez.
  const codigosAVer = [...valor.map((r) => r.codigoSAP), ...resultados.map((r) => r.codigoSAP), ...(fueraDelEquipo ? [fueraDelEquipo.codigoSAP] : [])]
  const claveBodega = codigosAVer.filter((c) => !pedidosBodega.current.has(c)).join(',')
  useEffect(() => {
    if (!claveBodega) return
    const nuevos = claveBodega.split(',')
    nuevos.forEach((c) => pedidosBodega.current.add(c))
    let vivo = true
    void fuente.bodegaDe(nuevos).then((m) => {
      if (!vivo || !m.size) return
      setBodega((prev) => new Map([...prev, ...m]))
    })
    return () => {
      vivo = false
    }
  }, [claveBodega, fuente])

  const lleno = valor.length >= MAX_REPUESTOS_EVENTO
  const agregar = (r: { codigoSAP: string; nombre: string; nombreComun?: string }) => {
    setAviso(null)
    if (lleno && !valor.some((x) => x.codigoSAP === r.codigoSAP)) {
      setAviso(`Máximo ${MAX_REPUESTOS_EVENTO} repuestos distintos por evento.`)
      return
    }
    onChange(normalizarRepuestos([...valor, { codigoSAP: r.codigoSAP, nombre: r.nombre, nombreComun: r.nombreComun ?? '', cantidad: 1 }]))
    if (!r.nombre) setAviso(`${r.codigoSAP} no está en el maestro: quedó solo el código.`)
  }

  const alEnter = () => {
    const primero = resultados[0] ?? fueraDelEquipo
    if (primero) {
      agregar(primero)
      setConsulta('')
    } else if (esCodigo) {
      agregar({ codigoSAP: codigoEscrito, nombre: '' })
      setConsulta('')
    }
  }

  const cambiarCantidad = (codigoSAP: string, delta: number) =>
    onChange(valor.map((r) => (r.codigoSAP === codigoSAP ? { ...r, cantidad: Math.min(MAX_CANTIDAD_REPUESTO, Math.max(1, r.cantidad + delta)) } : r)))

  const abrirEdicionComun = (r: RepuestoUsado) => {
    setEdicionComun({ codigo: r.codigoSAP, texto: r.nombreComun ?? '' })
    setTimeout(() => inputComunRef.current?.focus(), 0)
  }
  const guardarComun = async () => {
    if (!edicionComun) return
    const { codigo, texto } = edicionComun
    const nuevo = texto.trim().replace(/\s+/g, ' ')
    const actual = valor.find((r) => r.codigoSAP === codigo)
    if ((actual?.nombreComun ?? '') === nuevo) {
      setEdicionComun(null)
      return
    }
    setGuardandoComun(true)
    try {
      await fuente.guardarNombreComun(codigo, nuevo)
      onChange(valor.map((r) => (r.codigoSAP === codigo ? { ...r, nombreComun: nuevo } : r)))
      setEdicionComun(null)
      setAviso(nuevo ? `«${nuevo}» quedó guardado como nombre común de ${codigo}.` : `Se quitó el nombre común de ${codigo}.`)
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo guardar el nombre común. Revisa la señal.')
    } finally {
      setGuardandoComun(false)
    }
  }

  const segmentos = [
    { value: 'equipo' as const, label: listaEquipoActual ? `En este equipo · ${listaEquipoActual.length}` : 'En este equipo' },
    { value: 'todos' as const, label: listaTodos ? `Todos · ${listaTodos.length}` : 'Todos' },
  ]
  const mostrarResultados = consulta.trim().length >= 2 && (lista !== null || fueraDelEquipo)

  return (
    <div className="flex flex-col gap-3">
      <span className={ETIQUETA}>
        <span>Repuestos usados</span>
        <span>Opcional</span>
      </span>

      {valor.length > 0 && (
        <ul className="overflow-hidden rounded-ctl bg-muted-foreground/10" aria-label="Repuestos agregados">
          {valor.map((r) => {
            const comun = (r.nombreComun ?? '').trim()
            const sap = nombreRepuesto(r)
            const editando = edicionComun?.codigo === r.codigoSAP
            return (
              <li key={r.codigoSAP} className={FILA}>
                <div className="min-w-0 flex-1 py-0.5">
                  <p className="text-body font-semibold leading-tight">
                    {comun || sap || <span className="font-normal text-muted-foreground">Sin nombre en el maestro</span>}
                  </p>
                  {comun && sap && <p className="text-footnote leading-tight text-muted-foreground">{sap}</p>}
                  <p className="text-footnote leading-tight text-muted-foreground">
                    <span className="tabular-nums text-foreground">{r.codigoSAP}</span>
                    {textoBodega(bodega.get(r.codigoSAP)) ? ` · ${textoBodega(bodega.get(r.codigoSAP))}` : ''}
                  </p>
                  {/* En su propia línea de 44 px: como enlace en línea medía 16 px (17-09). */}
                  {puedeEditarMaestro && sap && !editando && (
                    <button
                      type="button"
                      className="-mb-2 flex min-h-[44px] items-center text-footnote font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      onClick={() => abrirEdicionComun(r)}
                    >
                      {comun ? 'Editar nombre común' : '＋ nombre común'}
                    </button>
                  )}
                  {editando && (
                    <div className="mt-2 flex flex-col gap-2">
                      <label htmlFor={`${id}-comun`} className="sr-only">
                        Nombre común de {r.codigoSAP}
                      </label>
                      <input
                        ref={inputComunRef}
                        id={`${id}-comun`}
                        maxLength={80}
                        className={CAMPO}
                        value={edicionComun.texto}
                        readOnly={guardandoComun}
                        placeholder="Como le dicen en planta: Filtro FRL, muelle carros…"
                        onChange={(e) => setEdicionComun({ codigo: r.codigoSAP, texto: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void guardarComun()
                          }
                          if (e.key === 'Escape') setEdicionComun(null)
                        }}
                      />
                      <div className="flex gap-2">
                        <Button variant="tinted" size="sm" onClick={() => setEdicionComun(null)} disabled={guardandoComun}>
                          Cancelar
                        </Button>
                        <Button size="sm" onClick={() => void guardarComun()} disabled={guardandoComun}>
                          {guardandoComun ? <Loader2 className="animate-spin" /> : null} Guardar
                        </Button>
                      </div>
                      <p className="text-footnote text-muted-foreground">Queda en la ficha del repuesto: sale en Repuestos, en el buscador y en los correos.</p>
                    </div>
                  )}
                </div>
                {!editando && (
                  <div className="flex shrink-0 items-center" role="group" aria-label={`Cantidad de ${r.codigoSAP}`}>
                    <button type="button" className={BOTON_PASO} onClick={() => cambiarCantidad(r.codigoSAP, -1)} disabled={r.cantidad <= 1} aria-label="Uno menos">
                      <Minus className="size-4" />
                    </button>
                    <span className="min-w-[2ch] text-center text-body font-semibold tabular-nums" aria-live="polite">
                      {r.cantidad}
                    </span>
                    <button type="button" className={BOTON_PASO} onClick={() => cambiarCantidad(r.codigoSAP, 1)} aria-label="Uno más">
                      <Plus className="size-4" />
                    </button>
                    <button type="button" className={BOTON_PASO} onClick={() => onChange(valor.filter((x) => x.codigoSAP !== r.codigoSAP))} aria-label={`Quitar ${r.codigoSAP}`}>
                      <X className="size-4 text-muted-foreground" />
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        {equipoId && <SegmentedControl ariaLabel="Dónde buscar el repuesto" value={alcance} onChange={cambiarAlcance} segments={segmentos} />}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <label htmlFor={`${id}-buscar`} className="sr-only">
            Buscar repuesto por código, nombre o nombre común
          </label>
          <input
            id={`${id}-buscar`}
            autoComplete="off"
            className={`${CAMPO} pl-9`}
            value={consulta}
            placeholder="Buscar por código o nombre"
            onFocus={() => cargar(alcance)}
            onChange={(e) => {
              setConsulta(e.target.value)
              setAviso(null)
              cargar(alcance)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                alEnter()
              }
            }}
          />
        </div>
        {cargando && (
          <p className="flex items-center gap-1.5 text-footnote text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            {cargando === 'equipo' ? 'Cargando los repuestos del equipo…' : 'Cargando la lista de repuestos…'}
          </p>
        )}
        {errorLista && (
          <p role="alert" className="text-footnote font-semibold text-ink-warn">
            {errorLista}
          </p>
        )}
        {mostrarResultados && (
          <ul className="overflow-hidden rounded-ctl bg-muted-foreground/10" aria-label="Repuestos encontrados">
            {resultados.length === 0 && !fueraDelEquipo ? (
              <li className="px-3 py-2.5 text-footnote text-muted-foreground">
                {buscandoCodigo
                  ? 'Buscando el código en el maestro…'
                  : alcance === 'equipo'
                    ? lista?.length === 0
                      ? 'Este equipo no tiene repuestos con código SAP en el maestro. Prueba en «Todos».'
                      : 'Sin coincidencias en este equipo. Prueba en «Todos».'
                    : esCodigo
                      ? `${codigoEscrito} no está en el maestro. Con Enter queda solo el código.`
                      : 'Sin coincidencias.'}
              </li>
            ) : (
              [...resultados, ...(fueraDelEquipo && !resultados.some((x) => x.codigoSAP === fueraDelEquipo.codigoSAP) ? [fueraDelEquipo] : [])].map((r) => {
                const ya = valor.some((x) => x.codigoSAP === r.codigoSAP)
                const esExterno = fueraDelEquipo?.codigoSAP === r.codigoSAP && alcance === 'equipo'
                const b = textoBodega(bodega.get(r.codigoSAP))
                return (
                  <li key={r.codigoSAP} className={FILA}>
                    <div className="min-w-0 flex-1 py-0.5">
                      <p className="text-body leading-tight">
                        {r.nombreComun ? (
                          <>
                            <span className="font-semibold">{r.nombreComun}</span>
                            {r.nombre ? <span className="text-muted-foreground"> · {nombreLegible(r)}</span> : null}
                          </>
                        ) : (
                          nombreLegible(r) || <span className="text-muted-foreground">Sin nombre en el maestro</span>
                        )}
                      </p>
                      <p className="text-footnote leading-tight text-muted-foreground">
                        <span className="tabular-nums">{r.codigoSAP}</span>
                        {b ? ` · ${b}` : ''}
                        {esExterno ? ' · no está vinculado a este equipo' : ''}
                      </p>
                    </div>
                    <Button variant="plain" size="sm" className="shrink-0" onClick={() => agregar(r)}>
                      {ya ? 'Uno más' : 'Agregar'}
                    </Button>
                  </li>
                )
              })
            )}
          </ul>
        )}
      </div>

      {aviso && (
        <p role="status" className="text-footnote font-semibold text-ink-warn">
          {aviso}
        </p>
      )}
    </div>
  )
}
