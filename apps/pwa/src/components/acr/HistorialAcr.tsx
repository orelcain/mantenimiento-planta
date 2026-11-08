/**
 * HistorialAcr — la página Causa raíz: todos los análisis en una lista, lo urgente arriba
 * (Por cerrar, Verificación vencida, Historial). Celular: la lectura abre en una hoja. PC: la
 * lista a la izquierda y la lectura del seleccionado a la derecha. `#acr=<id>` lo selecciona.
 * Según la opción A aprobada (acr-historial.html). Los filtros no hacen consultas nuevas.
 */
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, ListCell, ListGroup, Pill } from '@/components/piel'
import { AcrLectura, AcrLecturaCuerpo } from './AcrLectura'
import { AcrRapidoSheet } from './AcrRapidoSheet'
import { guardarAcr, leerEventoAcr, listarAcrsConCache } from '@/services/acr/acrFirestore'
import {
  agruparHistorial,
  equiposDe,
  fechaVerificacion,
  fuerzaMaxima,
  verificacionVencida,
  type FiltrosAcr,
} from '@/services/acr/acrHistorial'
import { motivoNoCierra } from '@/services/acr/acrLogica'
import {
  ETIQUETA_FUERZA,
  type Acr,
  type EstadoAcr,
  type EventoRefAcr,
  type FuerzaAccion,
} from '@/services/acr/acr.types'
import { useEsPC } from '@/hooks/useEsPC'
import { fechaLocal } from '@/services/bitacora/turnoMantencion'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { dec1 } from '@/utils/formatoNumeros'

const FILTROS_INICIALES: FiltrosAcr = { equipo: null, dias: 90, estado: null, fuerza: null }
const CLASE_SELECT =
  'min-h-11 shrink-0 appearance-none rounded-full bg-muted-foreground/10 px-4 text-subhead text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
const FUERZAS: readonly FuerzaAccion[] = ['debil', 'media', 'fuerte']
const TEXTO_FUERZA: Record<FuerzaAccion, string> = { debil: 'Acción débil', media: 'Acción media', fuerte: 'Acción fuerte' }

/** DD-MM (sin año), como en las filas. */
const ddmm = (iso: string): string => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`
/** DD-MM-AAAA, como en la lectura. */
const ddmmaaaa = (iso: string): string => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`
const minutosTexto = (m: number): string => (Number.isInteger(m) ? String(m) : dec1(m))

/** `#acr=<id>` del hash de la URL, o null. */
function idDelHash(hash: string): string | null {
  const id = /(?:^|[#&])acr=([^&]+)/.exec(hash)?.[1]
  return id ? decodeURIComponent(id) : null
}

export function HistorialAcr() {
  const navigate = useNavigate()
  const location = useLocation()
  const esPC = useEsPC()
  const [acrs, setAcrs] = useState<Acr[] | null>(null)
  const [error, setError] = useState(false)
  const [filtros, setFiltros] = useState<FiltrosAcr>(FILTROS_INICIALES)
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [hojaId, setHojaId] = useState<string | null>(null)
  const [editando, setEditando] = useState<{ acr: Acr; evento: EventoRefAcr } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    listarAcrsConCache()
      .then((lista) => {
        if (vivo) setAcrs(lista)
      })
      .catch((e: unknown) => {
        logger.error('No se pudieron leer los análisis de causa raíz', e instanceof Error ? e : undefined)
        if (vivo) setError(true)
      })
    return () => {
      vivo = false
    }
  }, [])

  // `#acr=<id>` selecciona el análisis (y lo abre en la hoja, en celular).
  useEffect(() => {
    const id = idDelHash(location.hash)
    if (!id || !acrs?.some((a) => a.id === id)) return
    setSeleccion(id)
    if (!esPC) setHojaId(id)
  }, [location.hash, acrs, esPC])

  const hoy = fechaLocal(new Date())
  const grupos = useMemo(() => (acrs ? agruparHistorial(acrs, filtros, hoy) : null), [acrs, filtros, hoy])
  const equipos = useMemo(() => (acrs ? equiposDe(acrs) : []), [acrs])
  const visibles = grupos ? [...grupos.porCerrar, ...grupos.vencidas, ...grupos.historial] : []
  const actual = visibles.find((a) => a.id === seleccion) ?? visibles[0] ?? null
  const hoja = acrs?.find((a) => a.id === hojaId) ?? null

  /** Guarda un cambio y lo deja en la lista sin recargar. */
  const actualizar = (a: Acr) => {
    setAcrs((prev) => (prev ? prev.map((x) => (x.id === a.id ? a : x)) : prev))
    guardarAcr(a, false).catch((e: unknown) => {
      logger.error('No se pudo guardar el análisis de causa raíz', e instanceof Error ? e : undefined, { acrId: a.id })
      setAviso('No se guardó el cambio. Revisa la conexión y tus permisos.')
    })
  }

  const editar = (acr: Acr) => {
    setHojaId(null)
    const eventoId = acr.eventoBitacoraIds[0]
    if (!eventoId) {
      setAviso('Este análisis no tiene un evento de la Bitácora para editar.')
      return
    }
    leerEventoAcr(eventoId)
      .then((evento) => {
        if (evento) setEditando({ acr, evento })
        else setAviso('No se encontró el evento de la Bitácora de este análisis.')
      })
      .catch((e: unknown) => {
        logger.error('No se pudo leer el evento de la Bitácora del análisis', e instanceof Error ? e : undefined, { acrId: acr.id })
        setAviso('No se pudo abrir el evento de la Bitácora.')
      })
  }

  const filtro = <T extends string | number>(
    etiqueta: string,
    valor: T | null,
    opciones: readonly { valor: T | ''; texto: string }[],
    alCambiar: (v: T | null) => void,
  ) => (
    <select
      aria-label={etiqueta}
      className={CLASE_SELECT}
      value={valor ?? ''}
      onChange={(e) => {
        const crudo = e.target.value
        const hallada = opciones.find((o) => String(o.valor) === crudo)
        alCambiar(hallada && hallada.valor !== '' ? hallada.valor : null)
      }}
    >
      {opciones.map((o) => (
        <option key={String(o.valor)} value={String(o.valor)}>
          {o.texto}
        </option>
      ))}
    </select>
  )

  const cuerpo = (() => {
    if (error) {
      return (
        <ListGroup>
          <ListCell title="No se pudieron leer los análisis." subtitle="Revisa la conexión y vuelve a abrir la página." />
        </ListGroup>
      )
    }
    if (!acrs) {
      return (
        <ListGroup>
          <ListCell title="Cargando análisis…" />
        </ListGroup>
      )
    }
    if (acrs.length === 0) {
      return (
        <ListGroup>
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <h2 className="text-headline font-semibold text-foreground">Aún no hay análisis</h2>
            <p className="text-footnote text-muted-foreground">Un análisis parte desde una detención en la Bitácora de turno.</p>
            <Button variant="tinted" onClick={() => navigate('/bitacora')}>
              Ir a la Bitácora
            </Button>
          </div>
        </ListGroup>
      )
    }
    if (visibles.length === 0) {
      return (
        <ListGroup>
          <ListCell title="Ningún análisis con estos filtros." />
        </ListGroup>
      )
    }
    return (
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:items-start lg:gap-7">
        <div className="flex min-w-0 flex-col gap-6">
          <GrupoLista titulo="Por cerrar" acrs={grupos?.porCerrar ?? []} hoy={hoy} conMotivo seleccion={actual?.id ?? null} esPC={esPC} onElegir={(id) => { setSeleccion(id); if (!esPC) setHojaId(id) }} />
          <GrupoLista titulo="Verificación vencida" acrs={grupos?.vencidas ?? []} hoy={hoy} seleccion={actual?.id ?? null} esPC={esPC} onElegir={(id) => { setSeleccion(id); if (!esPC) setHojaId(id) }} />
          <GrupoLista titulo="Historial" acrs={grupos?.historial ?? []} hoy={hoy} seleccion={actual?.id ?? null} esPC={esPC} onElegir={(id) => { setSeleccion(id); if (!esPC) setHojaId(id) }} />
        </div>
        {esPC && actual && (
          <section className="flex min-w-0 flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="text-title2 font-semibold text-foreground">Análisis de causa raíz</h2>
                <p className="text-footnote text-muted-foreground">
                  {`${actual.equipo}, ${ddmmaaaa(actual.fechaTurno)}${actual.minutosDetencion != null ? `, ${minutosTexto(actual.minutosDetencion)} min` : ''}`}
                </p>
              </div>
              <Button variant="filled" onClick={() => editar(actual)}>
                Editar
              </Button>
            </div>
            <AcrLecturaCuerpo key={actual.id} acr={actual} onActualizar={actualizar} />
          </section>
        )}
      </div>
    )
  })()

  return (
    <div className="flex flex-col gap-5">
      <div className="flex lg:justify-end">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {filtro<string>('Equipo', filtros.equipo, [{ valor: '', texto: 'Todos los equipos' }, ...equipos.map((e) => ({ valor: e, texto: e }))], (v) =>
            setFiltros((f) => ({ ...f, equipo: v })),
          )}
          {filtro<number>('Período', filtros.dias, [
            { valor: 30, texto: 'Últimos 30 días' },
            { valor: 90, texto: 'Últimos 90 días' },
            { valor: 365, texto: 'Último año' },
            { valor: '', texto: 'Todo el período' },
          ], (v) => setFiltros((f) => ({ ...f, dias: v as FiltrosAcr['dias'] })))}
          {filtro<EstadoAcr>('Estado', filtros.estado, [
            { valor: '', texto: 'Todos los estados' },
            { valor: 'borrador', texto: 'Borrador' },
            { valor: 'cerrado', texto: 'Cerrado' },
          ], (v) => setFiltros((f) => ({ ...f, estado: v })))}
          {filtro<FuerzaAccion>('Fuerza', filtros.fuerza, [
            { valor: '', texto: 'Toda la fuerza' },
            ...FUERZAS.map((f) => ({ valor: f, texto: ETIQUETA_FUERZA[f] })),
          ], (v) => setFiltros((f) => ({ ...f, fuerza: v })))}
        </div>
      </div>

      {cuerpo}

      {aviso && (
        <p role="status" className="text-footnote text-muted-foreground">
          {aviso}
        </p>
      )}

      {!esPC && hoja && (
        <AcrLectura
          open
          acr={hoja}
          onClose={() => setHojaId(null)}
          onEditar={() => editar(hoja)}
          onActualizar={actualizar}
        />
      )}

      {editando && (
        <AcrRapidoSheet
          open
          onClose={() => setEditando(null)}
          evento={editando.evento}
          acrExistente={editando.acr}
          onGuardar={actualizar}
        />
      )}
    </div>
  )
}

interface GrupoListaProps {
  titulo: string
  acrs: Acr[]
  hoy: string
  /** Por cerrar: muestra por qué no se puede cerrar todavía. */
  conMotivo?: boolean
  seleccion: string | null
  esPC: boolean
  onElegir: (id: string) => void
}

function GrupoLista({ titulo, acrs, hoy, conMotivo = false, seleccion, esPC, onElegir }: GrupoListaProps) {
  if (acrs.length === 0) return null
  return (
    <ListGroup title={titulo} action={<span className="tabular-nums">{acrs.length}</span>}>
      {acrs.map((a) => (
        <FilaAcr
          key={a.id}
          acr={a}
          hoy={hoy}
          motivo={conMotivo ? motivoNoCierra(a) : null}
          seleccionado={esPC && a.id === seleccion}
          onClick={() => onElegir(a.id)}
        />
      ))}
    </ListGroup>
  )
}

function FilaAcr({
  acr,
  hoy,
  motivo,
  seleccionado,
  onClick,
}: {
  acr: Acr
  hoy: string
  motivo: string | null
  seleccionado: boolean
  onClick: () => void
}) {
  const fuerza = fuerzaMaxima(acr)
  const vencida = verificacionVencida(acr, hoy)
  const vence = fechaVerificacion(acr)
  // Una sola píldora, solo si exige atención. Fuerza y causa son palabras secundarias.
  const detalle: string[] = []
  if (fuerza) detalle.push(TEXTO_FUERZA[fuerza])
  if (typeof acr.causaJK === 'string') detalle.push(acr.causaJK)
  if (motivo) detalle.push(motivo)
  else if (acr.estado === 'cerrado') {
    if (acr.verificacion.resultado === 'pendiente') detalle.push(vencida ? `venció el ${ddmm(vence)}` : `verifica el ${ddmm(vence)}`)
    else detalle.push(acr.verificacion.resultado === 'eficaz' ? 'verificado, eficaz' : 'verificado, no eficaz')
  }
  const pastilla = vencida ? <Pill tone="critical">Vencida</Pill> : acr.estado === 'borrador' ? <Pill tone="neutral">Borrador</Pill> : null

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[52px] w-full items-start justify-between gap-4 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        seleccionado && 'bg-primary/[0.12]',
      )}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body text-foreground">{acr.equipo}</span>
        <span className="text-footnote text-muted-foreground">{acr.definicion}</span>
        <span className="text-footnote text-muted-foreground">{detalle.join(', ')}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 text-right tabular-nums">
        <span className="text-footnote text-muted-foreground">{ddmm(acr.fechaTurno)}</span>
        {acr.minutosDetencion != null && (
          <span className="text-footnote text-muted-foreground">{`${minutosTexto(acr.minutosDetencion)} min`}</span>
        )}
        {pastilla}
      </span>
    </button>
  )
}
