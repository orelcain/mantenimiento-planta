import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Loader2, Minus, Plus, Search, Star, X } from 'lucide-react'
import { Button, SegmentedControl } from '@/components/piel'
import { MAX_CANTIDAD_REPUESTO, MAX_REPUESTOS_EVENTO } from '@/config/bitacora'
import type { RepuestoUsado } from '@/services/bitacora/bitacora.types'
import { clampCantidadRepuesto, nombreRepuesto, normalizarRepuestos } from '@/services/bitacora/presentacionEvento'
import {
  buscarRepuestos,
  esCodigoSap,
  favoritosDeLista,
  limpiarCodigo,
  type AlcanceBusqueda,
  type DatoBodega,
  type FavoritosRepuestos,
  type FuenteRepuestos,
  type RepuestoDelCatalogo,
} from '@/services/bitacora/repuestosBitacora'
import { formatNombreSAP } from '@/utils/repuestos/formatNombreSAP'

/**
 * «Repuestos usados» del evento (mockups aprobados 16 y 17-09-2026): un
 * buscador con dos alcances («En este equipo» y «Todos»), resultados con nombre
 * común, nombre SAP, código y bodega, y el nombre común editable desde aquí
 * (se guarda en la ficha del repuesto, el mismo campo que usa Repuestos).
 *
 * Estrella de favoritos (mockup aprobado 19-09-2026): «Solo mis favoritos» se
 * combina con el alcance — los favoritos de ESTE equipo o todos — y se ven sin
 * escribir. Con la estrella apagada, los favoritos van primero y cada resultado
 * tiene su estrella. Son los mismos de Repuestos y del Centro Técnico.
 */

const CAMPO =
  'h-[44px] w-full rounded-ctl border-0 bg-muted-foreground/10 px-3 text-campo text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary'
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
  favoritos = null,
}: {
  valor: readonly RepuestoUsado[]
  onChange: (repuestos: RepuestoUsado[]) => void
  /** Equipo elegido del buscador: habilita el alcance «En este equipo». */
  equipoId: string | null
  fuente: FuenteRepuestos
  /** El pase de bitácora ve el nombre común pero no escribe en el maestro. */
  puedeEditarMaestro?: boolean
  /** Sin favoritos (el pase) no hay estrella. */
  favoritos?: FavoritosRepuestos | null
}) {
  const id = useId()
  const [consulta, setConsulta] = useState('')
  const [alcance, setAlcance] = useState<AlcanceBusqueda>(equipoId ? 'equipo' : 'todos')
  const [soloFavoritos, setSoloFavoritos] = useState(false)
  const [listaEquipo, setListaEquipo] = useState<{ equipoId: string; items: RepuestoDelCatalogo[] } | null>(null)
  const [listaTodos, setListaTodos] = useState<RepuestoDelCatalogo[] | null>(null)
  const [cargando, setCargando] = useState<AlcanceBusqueda | null>(null)
  const [errorLista, setErrorLista] = useState<string | null>(null)
  const [buscandoCodigo, setBuscandoCodigo] = useState(false)
  const [fueraDelEquipo, setFueraDelEquipo] = useState<RepuestoDelCatalogo | null>(null)
  const [bodega, setBodega] = useState<Map<string, DatoBodega>>(new Map())
  const [aviso, setAviso] = useState<string | null>(null)
  const [edicionComun, setEdicionComun] = useState<{ codigo: string; texto: string } | null>(null)
  /** Lo que se está escribiendo en el campo de cantidad, libre hasta soltar el foco. */
  const [borradorCantidad, setBorradorCantidad] = useState<Record<string, string>>({})
  const [guardandoComun, setGuardandoComun] = useState(false)
  const inputComunRef = useRef<HTMLInputElement>(null)
  const inputBuscarRef = useRef<HTMLInputElement>(null)
  const pedidosBodega = useRef<Set<string>>(new Set())

  // Sin equipo no hay «En este equipo».
  useEffect(() => {
    if (!equipoId) setAlcance('todos')
  }, [equipoId])

  const listaEquipoActual = listaEquipo && listaEquipo.equipoId === equipoId ? listaEquipo.items : null
  const lista = alcance === 'equipo' ? listaEquipoActual : listaTodos
  const codigoEscrito = limpiarCodigo(consulta)
  const esCodigo = esCodigoSap(codigoEscrito)
  const claves = favoritos?.claves
  const verFavoritos = soloFavoritos && Boolean(claves)
  const resultados = useMemo(() => {
    if (!lista) return []
    if (verFavoritos && claves) return favoritosDeLista(lista, claves, consulta)
    const r = buscarRepuestos(lista, consulta, 8, claves)
    // Un código completo escrito: ese primero, aunque no empiece igual.
    if (esCodigo) {
      const exacto = lista.find((x) => x.codigoSAP === codigoEscrito)
      if (exacto) return [exacto, ...r.filter((x) => x.codigoSAP !== codigoEscrito)]
    }
    return r
  }, [lista, consulta, esCodigo, codigoEscrito, verFavoritos, claves])
  /** Cuántos de los favoritos están en la lista a la vista (para «3 de tus 8…»). */
  const favoritosEnLista = useMemo(() => (lista && claves ? favoritosDeLista(lista, claves, '').length : 0), [lista, claves])

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
    if (verFavoritos || alcance !== 'equipo' || !esCodigo || !lista || lista.some((x) => x.codigoSAP === codigoEscrito)) return
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
  }, [alcance, esCodigo, codigoEscrito, lista, fuente, verFavoritos])

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
    onChange(valor.map((r) => (r.codigoSAP === codigoSAP ? { ...r, cantidad: clampCantidadRepuesto(r.cantidad + delta, r.cantidad) } : r)))

  /** Al salir del campo o con Enter: entero 1–MAX, o vuelve al valor anterior (no borra el repuesto). */
  const aplicarCantidadEscrita = (codigoSAP: string) => {
    const texto = borradorCantidad[codigoSAP]
    if (texto !== undefined) {
      const actual = valor.find((r) => r.codigoSAP === codigoSAP)
      if (actual) {
        const nueva = clampCantidadRepuesto(texto, actual.cantidad)
        if (nueva !== actual.cantidad) onChange(valor.map((r) => (r.codigoSAP === codigoSAP ? { ...r, cantidad: nueva } : r)))
      }
    }
    setBorradorCantidad((prev) => {
      const { [codigoSAP]: _quitado, ...resto } = prev
      return resto
    })
  }

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
    { value: 'equipo' as const, label: listaEquipoActual ? `Este equipo · ${listaEquipoActual.length}` : 'Este equipo' },
    { value: 'todos' as const, label: listaTodos ? `Todos · ${listaTodos.length}` : 'Todos' },
  ]
  // Con la estrella y sin texto, la línea «Ninguno de tus N favoritos…» ya lo dice: sin lista vacía debajo.
  const mostrarResultados = (verFavoritos && lista !== null && (resultados.length > 0 || consulta.trim().length >= 2)) || (consulta.trim().length >= 2 && (lista !== null || fueraDelEquipo))
  const totalFavoritos = claves?.size ?? 0

  const alternarSoloFavoritos = () => {
    const nuevo = !soloFavoritos
    setSoloFavoritos(nuevo)
    setFueraDelEquipo(null)
    if (nuevo) cargar(alcance)
  }
  // HIG «Segmented controls»: «dónde buscar» y «qué mostrar» son dos preguntas;
  // la estrella va aparte de las pestañas (junto al buscador) para que se combinen.
  const estrella = favoritos ? (
    <button
      type="button"
      aria-pressed={soloFavoritos}
      aria-label="Solo mis favoritos"
      title="Solo mis favoritos"
      onClick={alternarSoloFavoritos}
      className={`flex size-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        soloFavoritos ? 'bg-ink-warn/15 text-ink-warn' : 'bg-muted text-muted-foreground'
      }`}
    >
      <Star className="size-5" fill={soloFavoritos ? 'currentColor' : 'none'} aria-hidden />
    </button>
  ) : null

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
                  <div className="flex shrink-0 items-center">
                    <div className="flex items-center" role="group" aria-label={`Cantidad de ${r.codigoSAP}`}>
                      <button type="button" className={BOTON_PASO} onClick={() => cambiarCantidad(r.codigoSAP, -1)} disabled={r.cantidad <= 1} aria-label="Uno menos">
                        <Minus className="size-4" />
                      </button>
                      {/* HIG «Steppers»: la cantidad también se escribe, para no
                          gastar 40 toques en subir de 1 a 40 (19-09-2026). */}
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={String(MAX_CANTIDAD_REPUESTO).length}
                        aria-label={`Cantidad de ${comun || sap || r.codigoSAP}`}
                        value={borradorCantidad[r.codigoSAP] ?? String(r.cantidad)}
                        onChange={(e) => {
                          const solo = e.target.value.replace(/[^0-9]/g, '')
                          setBorradorCantidad((prev) => ({ ...prev, [r.codigoSAP]: solo }))
                        }}
                        onBlur={() => aplicarCantidadEscrita(r.codigoSAP)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            e.currentTarget.blur()
                          }
                        }}
                        className="size-11 rounded-ctl bg-transparent text-center text-body font-semibold tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      />
                      <button type="button" className={BOTON_PASO} onClick={() => cambiarCantidad(r.codigoSAP, 1)} aria-label="Uno más">
                        <Plus className="size-4" />
                      </button>
                    </div>
                    {/* Separada de la cantidad: pegada a «+» se quitaba el
                        repuesto por error al querer sumar (19-09-2026). */}
                    <button
                      type="button"
                      className={`${BOTON_PASO} ml-2`}
                      onClick={() => onChange(valor.filter((x) => x.codigoSAP !== r.codigoSAP))}
                      aria-label={`Quitar ${r.codigoSAP}`}
                    >
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
        {/* Las pestañas a todo el ancho y la estrella junto al buscador: con la letra
            grande del teléfono, pestañas + estrella en una fila cortaban «En este eq…»
            (capturas reales al 135 %, 19-09-2026). */}
        {equipoId && <SegmentedControl ariaLabel="Dónde buscar el repuesto" value={alcance} onChange={cambiarAlcance} segments={segmentos} />}
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <label htmlFor={`${id}-buscar`} className="sr-only">
              Buscar repuesto por código, nombre o nombre común
            </label>
            <input
              ref={inputBuscarRef}
              id={`${id}-buscar`}
              autoComplete="off"
              className={`${CAMPO} pl-9 pr-9`}
              value={consulta}
              placeholder={verFavoritos ? 'En tus favoritos' : 'Código o nombre'}
              // HIG «Virtual keyboards»: acá Enter agrega el primer resultado.
              enterKeyHint="search"
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
            {/* HIG «Search fields»: borrar sin cinco toques de backspace; el foco
                se queda en el campo para seguir buscando (19-09-2026). */}
            {consulta.length > 0 && (
              <button
                type="button"
                aria-label="Borrar búsqueda"
                onClick={() => {
                  setConsulta('')
                  setAviso(null)
                  inputBuscarRef.current?.focus()
                }}
                className="absolute right-0 top-0 flex h-[44px] w-[44px] items-center justify-center text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          {estrella}
        </div>
        {verFavoritos && lista && (
          <p className="text-footnote text-muted-foreground" role="status">
            {totalFavoritos === 0 ? (
              'Aún no tienes favoritos: márcalos con la estrella de cada resultado.'
            ) : alcance === 'equipo' ? (
              favoritosEnLista > 0 ? (
                <>
                  <span className="font-semibold text-ink-warn">
                    {favoritosEnLista} de tus {totalFavoritos} favoritos
                  </span>{' '}
                  {favoritosEnLista === 1 ? 'está' : 'están'} en este equipo
                </>
              ) : (
                `Ninguno de tus ${totalFavoritos} favoritos está en este equipo. Prueba en «Todos».`
              )
            ) : (
              <>
                <span className="font-semibold text-ink-warn">
                  {favoritosEnLista === 1 ? 'Tu favorito' : `Tus ${favoritosEnLista} favoritos`}
                </span>
                , de todos los equipos
              </>
            )}
          </p>
        )}
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
                {verFavoritos
                  ? 'Ningún favorito coincide.'
                  : buscandoCodigo
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
                    {favoritos && (
                      <button
                        type="button"
                        aria-pressed={favoritos.claves.has(r.codigoSAP)}
                        aria-label={
                          favoritos.claves.has(r.codigoSAP) ? `Quitar ${r.codigoSAP} de favoritos` : `Marcar ${r.codigoSAP} como favorito`
                        }
                        onClick={() => favoritos.alternar(r.codigoSAP)}
                        className={`flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          favoritos.claves.has(r.codigoSAP) ? 'text-ink-warn' : 'text-muted-foreground'
                        }`}
                      >
                        <Star className="size-5" fill={favoritos.claves.has(r.codigoSAP) ? 'currentColor' : 'none'} aria-hidden />
                      </button>
                    )}
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
