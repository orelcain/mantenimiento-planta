import { useId, useState } from 'react'
import { Loader2, Minus, Plus, X } from 'lucide-react'
import { Button } from '@/components/piel'
import { MAX_CANTIDAD_REPUESTO, MAX_REPUESTOS_EVENTO } from '@/config/bitacora'
import type { RepuestoUsado } from '@/services/bitacora/bitacora.types'
import { nombreRepuesto, normalizarRepuestos } from '@/services/bitacora/presentacionEvento'
import {
  buscarRepuestos,
  esCodigoSap,
  limpiarCodigo,
  type FuenteRepuestos,
  type RepuestoDelCatalogo,
} from '@/services/bitacora/repuestosBitacora'
import { formatNombreSAP } from '@/utils/repuestos/formatNombreSAP'

/**
 * «Repuestos usados» del evento (mockup aprobado 16-09-2026): por código SAP o
 * buscando por nombre entre los repuestos del equipo elegido, con cantidad.
 */

const CAMPO =
  'h-[44px] w-full rounded-ctl border-0 bg-muted-foreground/10 px-3 text-[16px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary'
const ETIQUETA = 'mb-1.5 flex justify-between gap-2 text-footnote text-muted-foreground'
const BOTON_PASO =
  'flex size-11 items-center justify-center rounded-full text-primary transition-colors hover:bg-muted-foreground/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

export function RepuestosUsados({
  valor,
  onChange,
  equipoId,
  fuente,
}: {
  valor: readonly RepuestoUsado[]
  onChange: (repuestos: RepuestoUsado[]) => void
  /** Equipo elegido del buscador: habilita la búsqueda por nombre. */
  equipoId: string | null
  fuente: FuenteRepuestos
}) {
  const id = useId()
  const [codigo, setCodigo] = useState('')
  const [buscandoCodigo, setBuscandoCodigo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [consulta, setConsulta] = useState('')
  const [lista, setLista] = useState<{ equipoId: string; items: RepuestoDelCatalogo[] } | null>(null)
  const [cargandoLista, setCargandoLista] = useState(false)
  const [errorLista, setErrorLista] = useState<string | null>(null)

  const lleno = valor.length >= MAX_REPUESTOS_EVENTO
  const listaDelEquipo = lista && lista.equipoId === equipoId ? lista.items : null
  const resultados = listaDelEquipo ? buscarRepuestos(listaDelEquipo, consulta) : []

  const agregar = (r: { codigoSAP: string; nombre: string }) => {
    if (lleno && !valor.some((x) => x.codigoSAP === r.codigoSAP)) {
      setAviso(`Máximo ${MAX_REPUESTOS_EVENTO} repuestos distintos por evento.`)
      return
    }
    onChange(normalizarRepuestos([...valor, { ...r, cantidad: 1 }]))
  }

  const agregarPorCodigo = async () => {
    const c = limpiarCodigo(codigo)
    setAviso(null)
    if (!esCodigoSap(c)) {
      setAviso('Un código SAP son solo números (6 a 12 dígitos).')
      return
    }
    const existente = valor.find((r) => r.codigoSAP === c)
    if (existente) {
      agregar(existente)
      setCodigo('')
      return
    }
    setBuscandoCodigo(true)
    try {
      const r = await fuente.porCodigo(c)
      agregar({ codigoSAP: c, nombre: r?.nombre ?? '' })
      if (!r) setAviso(`${c} no está en el maestro: quedó solo el código.`)
      setCodigo('')
    } catch {
      // Sin señal igual se registra: el código es lo que importa.
      agregar({ codigoSAP: c, nombre: '' })
      setAviso(`Sin señal para buscar el nombre de ${c}: quedó solo el código.`)
      setCodigo('')
    } finally {
      setBuscandoCodigo(false)
    }
  }

  const cargarLista = () => {
    if (!equipoId || listaDelEquipo || cargandoLista) return
    setCargandoLista(true)
    setErrorLista(null)
    const pedido = equipoId
    fuente
      .delEquipo(pedido)
      .then((items) => setLista({ equipoId: pedido, items }))
      .catch(() => setErrorLista('No se pudieron cargar los repuestos del equipo. Revisa la señal.'))
      .finally(() => setCargandoLista(false))
  }

  const cambiarCantidad = (codigoSAP: string, delta: number) =>
    onChange(
      valor.map((r) =>
        r.codigoSAP === codigoSAP ? { ...r, cantidad: Math.min(MAX_CANTIDAD_REPUESTO, Math.max(1, r.cantidad + delta)) } : r,
      ),
    )

  return (
    <div className="flex flex-col gap-3">
      <span className={ETIQUETA}>
        <span>Repuestos usados</span>
        <span>Opcional</span>
      </span>

      {valor.length > 0 && (
        <ul className="overflow-hidden rounded-ctl bg-muted-foreground/10" aria-label="Repuestos agregados">
          {valor.map((r) => (
            <li
              key={r.codigoSAP}
              className='relative flex items-center gap-2 py-1.5 pl-3 pr-1 before:absolute before:left-3 before:right-0 before:top-0 before:h-px before:bg-border before:content-[""] first:before:hidden'
            >
              <div className="min-w-0 flex-1">
                <p className="text-footnote tabular-nums text-muted-foreground">{r.codigoSAP}</p>
                <p className="text-body leading-tight">{nombreRepuesto(r) || <span className="text-muted-foreground">Sin nombre en el maestro</span>}</p>
              </div>
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
                <button
                  type="button"
                  className={BOTON_PASO}
                  onClick={() => onChange(valor.filter((x) => x.codigoSAP !== r.codigoSAP))}
                  aria-label={`Quitar ${r.codigoSAP}`}
                >
                  <X className="size-4 text-muted-foreground" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <label htmlFor={`${id}-codigo`} className={ETIQUETA}>
          Agregar por código SAP
        </label>
        <div className="flex gap-2">
          <input
            id={`${id}-codigo`}
            inputMode="numeric"
            autoComplete="off"
            maxLength={16}
            className={`${CAMPO} tabular-nums`}
            value={codigo}
            // readOnly y no disabled: un campo deshabilitado pierde el foco y el teclado se cierra.
            readOnly={buscandoCodigo}
            placeholder="Ej: 3300011612"
            onChange={(e) => {
              setCodigo(e.target.value)
              setAviso(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void agregarPorCodigo()
              }
            }}
          />
          <Button variant="tinted" className="shrink-0" onClick={() => void agregarPorCodigo()} disabled={buscandoCodigo || !codigo.trim()}>
            {buscandoCodigo ? <Loader2 className="animate-spin" /> : null} Agregar
          </Button>
        </div>
        <p className="mt-1.5 text-footnote text-muted-foreground">El código de la etiqueta de bodega o de la reserva.</p>
      </div>

      {equipoId && (
        <div>
          <label htmlFor={`${id}-buscar`} className={ETIQUETA}>
            <span>O buscar en los repuestos de este equipo</span>
            {listaDelEquipo && <span className="tabular-nums">{listaDelEquipo.length} con código SAP</span>}
          </label>
          <input
            id={`${id}-buscar`}
            autoComplete="off"
            className={CAMPO}
            value={consulta}
            placeholder="Nombre o parte del código"
            onFocus={cargarLista}
            onChange={(e) => {
              setConsulta(e.target.value)
              setAviso(null)
              cargarLista()
            }}
          />
          {cargandoLista && (
            <p className="mt-1.5 flex items-center gap-1.5 text-footnote text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> Cargando los repuestos del equipo…
            </p>
          )}
          {errorLista && (
            <p role="alert" className="mt-1.5 text-footnote font-semibold text-ink-warn">
              {errorLista}
            </p>
          )}
          {listaDelEquipo && consulta.trim().length >= 2 && (
            <ul className="mt-2 overflow-hidden rounded-ctl bg-muted-foreground/10" aria-label="Repuestos encontrados">
              {resultados.length === 0 ? (
                <li className="px-3 py-2.5 text-footnote text-muted-foreground">
                  {listaDelEquipo.length === 0 ? 'Este equipo no tiene repuestos con código SAP en el maestro.' : 'Sin coincidencias en este equipo.'}
                </li>
              ) : (
                resultados.map((r) => {
                  const ya = valor.some((x) => x.codigoSAP === r.codigoSAP)
                  return (
                    <li
                      key={r.codigoSAP}
                      className='relative flex items-center gap-2 py-1 pl-3 pr-1 before:absolute before:left-3 before:right-0 before:top-0 before:h-px before:bg-border before:content-[""] first:before:hidden'
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-body leading-tight">{formatNombreSAP(r.nombre).nombre || r.nombre}</p>
                        <p className="text-footnote tabular-nums text-muted-foreground">{[r.codigoSAP, r.ubicacion].filter(Boolean).join(' · ')}</p>
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
      )}

      {aviso && (
        <p role="status" className="text-footnote font-semibold text-ink-warn">
          {aviso}
        </p>
      )}
    </div>
  )
}
