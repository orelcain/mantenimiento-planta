/**
 * Sección «Repuesto» de la ficha A3C (opción «Pieza al frente»): qué pieza es el elemento, si hay en
 * bodega y dónde, cómo se ve y con qué certeza, y la pregunta «¿Es la pieza instalada en esta
 * máquina?» a un toque. Comparte las confirmaciones con el visor del plano eléctrico: mismo plano
 * (`baader-142-888`) y mismo doc `planoVinculos/<slug>__<aparato>__<maquina>`: el plano sirve a N2 y
 * N3 y una misma designación puede llevar piezas distintas en cada una. La máquina se elige una vez
 * (`useMaquinaPlano`: ?maquina= o la última usada); la ficha no la repite, solo la nombra.
 *
 * Fuentes: `partes.json` (catálogos BAADER 2006 y 2014 cruzados con el maestro SAP; ver
 * scripts/planos/aplicar_cruce_a3c_888.py), `repuestos`/`bodega`
 * en Firestore (foto y stock en vivo) y `planoVinculos` (confirmación en terreno).
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, CheckCircle2, Cog, ImageOff, Layers, Package, FilePlus, RotateCcw } from 'lucide-react'
import { Button, Pill, Sheet } from '@/components/piel'
import { usePartesPlano, type ParteFisica } from '@/hooks/usePartesPlano'
import { usePlanoVinculos, type VinculoTerreno } from '@/hooks/usePlanoVinculos'
import { useMaquinaPlano } from '@/hooks/useMaquinaPlano'
import { SelectorMaquinaPlano } from '@/components/aprendizaje/SelectorMaquinaPlano'
import { EnTerrenoA3c } from './EnTerrenoA3c'
import type { MaquinaBaader } from '@/services/baader142/perilla5Protocolo'
import { useRepuestosByCodigos, type RepuestoResuelto } from '@/hooks/repuestos/useRepuestosByCodigos'
import { useAltasDeCodigo } from '@/hooks/repuestos/useAltasDeCodigo'
import { crearAltaCodigo, reabrirAlta, type AltaCodigo } from '@/hooks/repuestos/useSolicitudes'
import { SolicitarAltaSheet, type DatosEnvioAlta } from './SolicitarAltaSheet'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { armarAltaCodigo, codigoParaAlta, elementosConCodigo, fechaCortaAlta, listaEnFrase, sapEfectivo } from '@/utils/aprendizaje/altaCodigoA3c'
import { normCodigo } from '@/utils/repuestos/normCodigo'
import { certezaDe, clasificarRepuesto, esModoCandidatos, origenPieza, SLUG_PLANO_A3C } from '@/utils/aprendizaje/repuestosA3c'
import {
  MAX_CODIGO_ETIQUETA,
  estadoPorMaquina,
  etiquetaMaquina,
  fechaCortaVinculo,
  guardarVinculoTerreno,
  mensajeErrorTerreno,
  puedeGuardarTerreno,
} from '@/utils/aprendizaje/vinculoTerreno'

type Vinculos = ReturnType<typeof usePlanoVinculos>

/** La máquina activa y lo que hay guardado de este aparato en cada una. */
interface TerrenoProps {
  maquina: MaquinaBaader | null
  maquinas: readonly MaquinaBaader[]
  setMaquina: (m: MaquinaBaader) => void
  entrada?: Vinculos['porAparato'] extends Map<string, infer E> ? E : never
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function RepuestoA3c({ codigo, compacta = false }: { codigo: string; compacta?: boolean }) {
  const partes = usePartesPlano(SLUG_PLANO_A3C)
  const { maquina, setMaquina, maquinas } = useMaquinaPlano(SLUG_PLANO_A3C)
  const vinculosHook = usePlanoVinculos(SLUG_PLANO_A3C, maquina)
  const sesion = useAuthStore(s => s.isAuthenticated)
  const clase = useMemo(() => clasificarRepuesto(codigo, partes), [codigo, partes])
  const candidatos = esModoCandidatos(clase.piezas)
  // Altas de código ya pedidas a bodega: UN listener compartido para toda la pantalla.
  const { porCodigo: altasPorCodigo } = useAltasDeCodigo()
  const vinculoDelAparato = vinculosHook.vinculos.get(codigo)
  const codigosAlta = useMemo(
    () => clase.piezas.map((p, i) => codigoParaAlta(p, candidatos || i === 0 ? vinculoDelAparato : undefined)),
    [clase, candidatos, vinculoDelAparato],
  )
  const altas = useMemo(
    () => clase.piezas.map((p, i) => (p.sap ? undefined : altasPorCodigo.get(normCodigo(codigosAlta[i] ?? p.nr)))),
    [clase, codigosAlta, altasPorCodigo],
  )
  // El SAP vale lo que dice el plano o, si no hay, el que bodega creó para el alta (aparecen foto y stock solos).
  const sapsEfectivos = useMemo(() => clase.piezas.map((p, i) => sapEfectivo(p.sap, altas[i])), [clase, altas])
  const saps = useMemo(() => sapsEfectivos.filter((s): s is string => !!s), [sapsEfectivos])
  const { bySap, loading } = useRepuestosByCodigos(saps)

  // D: nada que mostrar (o el plano aún no cargó). Sin sección, sin ruido.
  if (!partes || clase.estado === 'D') return null
  const size = compacta ? 'sm' : 'md'
  const entrada = vinculosHook.porAparato.get(codigo)
  const distintas = sesion && estadoPorMaquina(entrada, maquinas).distintas
  const terreno: TerrenoProps = { maquina, maquinas, setMaquina, entrada }

  return (
    <section className="mt-5 break-inside-avoid" data-testid="repuesto-a3c" data-estado={clase.estado}>
      {clase.estado === 'C' && clase.familia ? (
        <SoloFamilia familia={clase.familia} despiece={partes.despiece} compacta={compacta} />
      ) : (
        <>
        {distintas && (
          <Pill tone="info" className="mb-3 text-nota">Distinta por máquina</Pill>
        )}
        {candidatos && (
          <p className="mb-3 text-footnote text-muted-foreground" data-testid="repuesto-candidatos">
            El catálogo no dice cuál de estos {clase.piezas.length} códigos va en {codigo}. La etiqueta del
            equipo decide: márcala abajo y queda registrada para esa máquina.
          </p>
        )}
        {clase.piezas.map((p, i) => (
          <PiezaBloque
            key={`${p.nr}-${p.pos}-${i}`}
            className={i > 0 ? 'mt-5' : undefined}
            codigo={codigo}
            pieza={p}
            indice={i}
            total={clase.piezas.length}
            despiece={partes.despiece}
            vinculos={vinculosHook}
            sesion={sesion}
            repuesto={sapsEfectivos[i] ? bySap.get(sapsEfectivos[i]!) : undefined}
            sapEf={sapsEfectivos[i]}
            alta={altas[i]}
            codigoAlta={codigosAlta[i] ?? p.nr}
            aparatos={partes.aparatos}
            cargando={loading}
            compacta={compacta}
            candidatos={candidatos}
            nrPrimera={clase.piezas[0]?.nr ?? p.nr}
            terreno={terreno}
          />
        ))}
        {candidatos && clase.piezas[0] && (
          <PreguntaTerreno
            codigo={codigo}
            pieza={clase.piezas[0]}
            candidatos={clase.piezas}
            vinculo={vinculosHook.vinculos.get(codigo)}
            vinculos={vinculosHook}
            sesion={sesion}
            size={size}
            terreno={terreno}
          />
        )}
        </>
      )}
    </section>
  )
}

function Encabezado({ pill, sufijo }: { pill: React.ReactNode; sufijo?: string }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h4 className="text-footnote font-semibold text-muted-foreground">Repuesto{sufijo}</h4>
      {pill}
    </div>
  )
}

function SoloFamilia({ familia, despiece, compacta }: { familia: NonNullable<ReturnType<typeof clasificarRepuesto>['familia']>; despiece: string; compacta: boolean }) {
  const navigate = useNavigate()
  return (
    <>
      <Encabezado pill={<Pill tone="neutral" className="text-nota">Solo familia</Pill>} />
      <div className="flex items-start gap-3">
        <div className={cn('grid shrink-0 place-items-center rounded-ctl bg-muted text-muted-foreground', compacta ? 'size-[52px]' : 'size-16')}>
          <Cog className="size-[22px]" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-subhead font-semibold leading-snug">{mayuscula(familia.etiqueta)}</p>
          <p className="text-footnote text-muted-foreground">Pieza exacta sin identificar en el catálogo.</p>
        </div>
      </div>
      <p className="mt-3 text-footnote text-muted-foreground">Buscar en el despiece:</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {familia.figuras.slice(0, 3).map(f => (
          <Button
            key={f.fig}
            variant="tinted"
            size={compacta ? 'sm' : 'md'}
            aria-label={`Fig. ${f.fig}, ${f.titulo}`}
            onClick={() => navigate(`/aprendizaje/planos/${despiece}?hoja=${f.hoja}`)}
          >
            <Layers aria-hidden />
            Fig. {f.fig}
          </Button>
        ))}
      </div>
      <p className="mt-3 text-footnote text-muted-foreground">Lee la etiqueta en terreno: el catálogo no rotula esta designación.</p>
    </>
  )
}

interface PiezaBloqueProps {
  className?: string
  codigo: string
  pieza: ParteFisica
  indice: number
  total: number
  despiece: string
  vinculos: Vinculos
  sesion: boolean
  repuesto?: RepuestoResuelto
  cargando: boolean
  compacta: boolean
  /** Varias piezas candidatas: la pregunta va una sola vez, al final de la sección. */
  candidatos: boolean
  nrPrimera: string
  terreno: TerrenoProps
  /** SAP que vale: el del plano o el que bodega creó para el alta de código. */
  sapEf?: string
  /** Alta de código pedida para el código de esta pieza (cualquier estado), si existe. */
  alta?: AltaCodigo
  /** Código de fabricante que se pediría: el de la etiqueta leída en terreno o el del catálogo. */
  codigoAlta: string
  aparatos: Record<string, ParteFisica[]>
}

function PiezaBloque({ className, codigo, pieza, indice, total, despiece, vinculos, sesion, repuesto, cargando, compacta, candidatos, nrPrimera, terreno, sapEf, alta, codigoAlta, aparatos }: PiezaBloqueProps) {
  const navigate = useNavigate()
  const usuario = useAuthStore(s => s.user)
  const [altaAbierta, setAltaAbierta] = useState(false)
  const size = compacta ? 'sm' : 'md'
  // El vínculo es por aparato, no por pieza: solo la primera lo lleva (igual que el visor eléctrico),
  // salvo con candidatos, donde el código guardado dice cuál quedó y cuáles se descartan.
  const v = candidatos || indice === 0 ? vinculos.vinculos.get(codigo) : undefined
  const cert = certezaDe(pieza.confianza, v, pieza.nr, nrPrimera)
  const [foto, setFoto] = useState(false)
  // El nombre y la ubicación del cruce (`partes.json`) hablan del SAP del plano; para el de un alta creada, el maestro.
  const nombreSap = pieza.sap ? (repuesto?.nombre ?? pieza.sapNombre) : (repuesto?.nombre ?? alta?.textoBreve)
  const ubicacion = pieza.sap ? (repuesto?.ubicacion ?? pieza.sapUbicacion) : repuesto?.ubicacion
  const elementosAlta = useMemo(() => elementosConCodigo(aparatos, codigoAlta), [aparatos, codigoAlta])
  const codigoLeido = normCodigo(codigoAlta) !== normCodigo(pieza.nr)

  const enviarAlta = async ({ cantidad, observaciones, archivo }: DatosEnvioAlta) => {
    if (!usuario) throw new Error('Hay que iniciar sesión.')
    const fotoUrl = archivo ? await vinculos.subirFoto(archivo) : undefined
    if (alta?.estado === 'rechazada') {
      await reabrirAlta(alta.id, { cantidad, observaciones, fotoUrl }, usuario.id, usuario.nombre)
    } else {
      const { id, data } = armarAltaCodigo({ codigo: codigoAlta, pieza, elemento: codigo, maquina: terreno.maquina, aparatos, planoSlug: SLUG_PLANO_A3C, observaciones, fotoUrl })
      await crearAltaCodigo(id, data, cantidad, usuario.id, usuario.nombre)
    }
    setAltaAbierta(false)
  }
  /** «Confirmar en terreno primero»: cierra el formulario y deja la pregunta de la ficha a la vista. */
  const irAPregunta = () => {
    setAltaAbierta(false)
    requestAnimationFrame(() => {
      const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      document.querySelector('[data-testid="pregunta-terreno"]')?.scrollIntoView?.({ block: 'center', behavior: reducido ? 'auto' : 'smooth' })
    })
  }
  const origen = `${origenPieza(pieza)}${pieza.generacion ? ` · ${pieza.generacion}` : ''}`

  return (
    <div className={className} data-testid="repuesto-pieza">
      <Encabezado sufijo={total > 1 ? ` ${indice + 1}/${total}` : ''} pill={<Pill tone={cert.tono} className="text-nota">{cert.texto}</Pill>} />
      <div className="flex items-start gap-3">
        {repuesto?.fotoUrl ? (
          <button
            type="button"
            onClick={() => setFoto(true)}
            aria-label={`Ampliar foto de ${pieza.nr}`}
            className={cn('shrink-0 overflow-hidden rounded-ctl bg-muted', compacta ? 'size-[52px]' : 'size-16')}
          >
            <img src={repuesto.fotoUrl} alt="" loading="lazy" className="size-full object-cover" />
          </button>
        ) : (
          <div
            className={cn(
              'grid shrink-0 place-items-center rounded-ctl bg-transparent text-muted-foreground ring-1 ring-inset ring-muted-foreground/35',
              compacta ? 'size-[52px]' : 'size-16',
            )}
            role="img"
            aria-label="Sin foto"
          >
            <ImageOff className="size-[22px]" aria-hidden />
          </div>
        )}
        <div className="min-w-0">
          <p className="break-all font-mono text-title3 font-semibold tabular-nums">{pieza.nr}</p>
          <p className="text-subhead leading-snug">{pieza.es}</p>
          <p className="text-nota text-muted-foreground">{origen}</p>
        </div>
      </div>
      {pieza.nivel === 'conjunto' && (
        <p className="mt-2 text-footnote text-muted-foreground">
          Código del conjunto completo: la pieza sola no tiene código propio en el catálogo.
        </p>
      )}
      {pieza.confianza !== 'catalogo' && pieza.razon && (
        <p className="mt-2 text-footnote text-muted-foreground" data-testid="repuesto-razon">{pieza.razon}</p>
      )}

      {v?.estado === 'corregido' && v.codigo && (
        <p className="mt-2 text-subhead">
          Etiqueta leída en terreno: <span className="font-mono font-semibold tabular-nums">{v.codigo}</span>
          <span className="block text-footnote text-muted-foreground">
            el catálogo decía <span className="font-mono line-through">{pieza.nr}</span>
          </span>
        </p>
      )}

      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-subhead">
        <dt className="pt-0.5 text-footnote text-muted-foreground">SAP</dt>
        {sapEf ? (
          <dd>
            <span className="font-mono tabular-nums">{sapEf}</span>
            {nombreSap && <span className="block text-footnote text-muted-foreground">{nombreSap}</span>}
          </dd>
        ) : (
          <dd className="font-semibold text-ink-warn">Sin código SAP en el maestro</dd>
        )}
        {sapEf && ubicacion && (
          <>
            <dt className="pt-0.5 text-footnote text-muted-foreground">Bodega</dt>
            <dd>{ubicacion}</dd>
          </>
        )}
        {sapEf && (
          <>
            <dt className="pt-0.5 text-footnote text-muted-foreground">Stock</dt>
            <dd>
              <Stock repuesto={repuesto} cargando={cargando} />
            </dd>
          </>
        )}
      </dl>

      {!sapEf && <EstadoAlta alta={alta} elemento={codigo} elementos={elementosAlta} sesion={sesion} />}
      {sapEf && alta?.estado === 'creada' && !pieza.sap && (
        <p className="mt-2.5 flex items-start gap-1.5 text-footnote text-ink-ok" data-testid="alta-gracias">
          <CheckCircle2 className="mt-px size-4 shrink-0" aria-hidden />
          <span>Alta gracias a Mantención · pedida {fechaCortaAlta(alta.createdAt)}{alta.creadaAt ? `, creada ${fechaCortaAlta(alta.creadaAt)}` : ''}</span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {sapEf ? (
          <Button variant="tinted" size={size} onClick={() => navigate(`/repuestos?q=${encodeURIComponent(sapEf)}`)}>
            <Package aria-hidden />
            Ver en Repuestos
          </Button>
        ) : sesion && alta?.estado === 'rechazada' ? (
          <Button variant="tinted" size={size} onClick={() => setAltaAbierta(true)}>
            <RotateCcw aria-hidden />
            Volver a solicitar
          </Button>
        ) : sesion && !alta ? (
          <Button variant="tinted" size={size} onClick={() => setAltaAbierta(true)}>
            <FilePlus aria-hidden />
            Solicitar alta de código
          </Button>
        ) : null}
        {pieza.hoja != null && (
          <Button
            variant="plain"
            size={size}
            onClick={() => navigate(`/aprendizaje/planos/${despiece}?hoja=${pieza.hoja}&ap=${encodeURIComponent(pieza.pos)}`)}
          >
            Ver dibujo · fig. {pieza.fig}
          </Button>
        )}
      </div>

      {indice === 0 && !candidatos && <PreguntaTerreno codigo={codigo} pieza={pieza} vinculo={v} vinculos={vinculos} sesion={sesion} size={size} terreno={terreno} />}

      {!sapEf && sesion && (!alta || alta.estado === 'rechazada') && (
        <SolicitarAltaSheet
          open={altaAbierta}
          onClose={() => setAltaAbierta(false)}
          codigo={codigoAlta}
          codigoLeido={codigoLeido}
          pieza={pieza}
          elemento={codigo}
          maquina={terreno.maquina}
          elementos={elementosAlta.includes(codigo) ? elementosAlta : [...elementosAlta, codigo]}
          inicial={alta?.estado === 'rechazada' ? { cantidad: alta.cantidad, observaciones: alta.observaciones } : undefined}
          onEnviar={enviarAlta}
          onConfirmarEnTerreno={irAPregunta}
        />
      )}

      <Sheet open={foto} onClose={() => setFoto(false)} title={pieza.nr} description={nombreSap ?? pieza.es}>
        {repuesto?.fotoUrl && <img src={repuesto.fotoUrl} alt={`Foto de ${pieza.nr}`} className="mx-auto max-h-[60dvh] w-full rounded-ctl object-contain" />}
      </Sheet>
    </div>
  )
}

/** Bajo la fila SAP, mientras no hay SAP: qué pasó con la solicitud de alta de ese código (o cómo pedirla). */
function EstadoAlta({ alta, elemento, elementos, sesion }: { alta?: AltaCodigo; elemento: string; elementos: readonly string[]; sesion: boolean }) {
  if (!alta) {
    const otros = elementos.filter(e => e !== elemento)
    return (
      <>
        {otros.length > 0 && (
          <p className="mt-2 text-footnote text-muted-foreground">Un solo pedido sirve para {listaEnFrase([...otros, elemento])}.</p>
        )}
        {!sesion && <p className="mt-2 text-footnote text-muted-foreground">Inicia sesión para solicitar el alta.</p>}
      </>
    )
  }
  const desde = alta.elemento && alta.elemento !== elemento ? ` · desde ${alta.elemento}` : ''
  if (alta.estado === 'pendiente') {
    return (
      <div className="mt-2.5 flex flex-col items-start gap-1.5" data-testid="alta-estado" data-alta="pendiente">
        <Pill tone="warning" className="text-nota">Alta solicitada · pendiente</Pill>
        <p className="text-footnote text-muted-foreground">
          por {alta.solicitadoPorNombre || 'alguien'} · {fechaCortaAlta(alta.createdAt)} · {alta.cantidad} {alta.cantidad === 1 ? 'unidad' : 'unidades'}{desde}
        </p>
      </div>
    )
  }
  if (alta.estado === 'rechazada') {
    return (
      <div className="mt-2.5 flex flex-col items-start gap-1.5" data-testid="alta-estado" data-alta="rechazada">
        <Pill tone="neutral" className="text-nota">Alta rechazada</Pill>
        {alta.motivoRechazo && <p className="text-subhead">«{alta.motivoRechazo}»</p>}
        <p className="text-footnote text-muted-foreground">
          {alta.rechazadaPorNombre || 'bodega'}{alta.rechazadaAt ? ` · ${fechaCortaAlta(alta.rechazadaAt)}` : ''}
        </p>
      </div>
    )
  }
  return null
}

function Stock({ repuesto, cargando }: { repuesto?: RepuestoResuelto; cargando: boolean }) {
  if (repuesto?.stockFisico == null) {
    return <span className="text-footnote text-muted-foreground">{cargando ? 'stock en vivo' : 'Sin dato de stock'}</span>
  }
  if (repuesto.stockFisico <= 0) return <span className="font-semibold text-ink-warn">Sin stock</span>
  return <span className="tabular-nums">{repuesto.stockFisico}</span>
}

function PreguntaTerreno({
  codigo, pieza, candidatos, vinculo, vinculos, sesion, size, terreno,
}: {
  codigo: string
  pieza: ParteFisica
  /** Con candidatos: un botón por código («Es 42303107») en vez de «Sí, es esta». */
  candidatos?: ParteFisica[]
  vinculo?: VinculoTerreno
  vinculos: Vinculos
  sesion: boolean
  size: 'sm' | 'md'
  terreno: TerrenoProps
}) {
  const { maquina, maquinas, setMaquina, entrada } = terreno
  const mm = maquina ? etiquetaMaquina(maquina) : null
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [otra, setOtra] = useState(false)
  const [etiqueta, setEtiqueta] = useState('')
  const [nota, setNota] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guardar = async (estado: VinculoTerreno['estado'], nrElegido: string = pieza.nr) => {
    if (!maquina || !puedeGuardarTerreno(estado, etiqueta)) return
    setGuardando(true)
    setError(null)
    try {
      await guardarVinculoTerreno(vinculos, {
        aparato: codigo,
        estado,
        codigoCatalogo: nrElegido,
        codigoLeido: etiqueta,
        nota,
        foto: archivo,
      })
      setOtra(false)
      setCorrigiendo(false)
      setEtiqueta('')
      setNota('')
      setArchivo(null)
    } catch (e) {
      setError(mensajeErrorTerreno(e))
    } finally {
      setGuardando(false)
    }
  }

  const separador = 'relative mt-4 pt-3.5 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-border'

  if (!sesion) {
    return (
      <div className={separador}>
        <p className="text-footnote text-muted-foreground">Inicia sesión para confirmar</p>
      </div>
    )
  }

  const enTerreno = <EnTerrenoA3c entrada={entrada} maquinas={maquinas} maquina={maquina} />

  if (vinculo && !corrigiendo) {
    const quien = `${vinculo.confirmadoPorNombre || 'alguien'}${vinculo.actualizado ? ` · ${fechaCortaVinculo(vinculo.actualizado)}` : ''}`
    const texto =
      vinculo.estado === 'confirmado'
        ? `Confirmada en ${mm}${candidatos && vinculo.codigo ? ` (${vinculo.codigo})` : ''} por ${quien}.`
        : vinculo.estado === 'corregido'
          ? `En ${mm} se anotó otra pieza, por ${quien}.`
          : `Marcado en terreno: el elemento no tiene esta pieza en ${mm}, por ${quien}.`
    // El hook no permite borrar un vínculo, así que no hay «Deshacer»: solo volver a responder.
    return (
      <>
        {enTerreno}
        <div className={separador}>
          <p className="text-footnote text-muted-foreground">{texto}</p>
          <Button variant="plain" size={size} className="-ml-2.5" onClick={() => setCorrigiendo(true)}>
            Corregir respuesta de {mm}
          </Button>
        </div>
      </>
    )
  }

  const sinMaquina = !maquina
  return (
    <>
    {enTerreno}
    <div className={separador} data-testid="pregunta-terreno">
      {sinMaquina && (
        // Sin máquina elegida no se responde: un default silencioso guardaría en la equivocada.
        <div className="mb-3" data-testid="elige-maquina">
          <p className="mb-2 text-subhead font-semibold">¿En cuál máquina estás?</p>
          <SelectorMaquinaPlano maquina={maquina} maquinas={maquinas} onChange={setMaquina} />
        </div>
      )}
      <p className="mb-2 text-subhead font-semibold">
        {candidatos ? '¿Qué código dice la etiqueta' : '¿Es la pieza instalada'}
        {mm ? ` en ${mm}` : ''}?
      </p>
      <div className="flex flex-wrap gap-1.5">
        {candidatos ? (
          candidatos.map(c => (
            <Button key={c.nr} variant="tinted" size={size} disabled={guardando || sinMaquina} onClick={() => void guardar('confirmado', c.nr)}>
              Es {c.nr}
            </Button>
          ))
        ) : (
          <Button variant="tinted" size={size} disabled={guardando || sinMaquina} onClick={() => void guardar('confirmado')}>
            Sí, es esta
          </Button>
        )}
        <Button variant="plain" size={size} disabled={guardando || sinMaquina} onClick={() => setOtra(true)}>
          {candidatos ? 'Otro código' : 'Es otra'}
        </Button>
        <Button variant="plain" size={size} disabled={guardando || sinMaquina} onClick={() => void guardar('no_aplica')}>
          No existe aquí
        </Button>
      </div>
      {error && !otra && <p role="alert" className="mt-2 text-footnote text-ink-crit">{error}</p>}

      <Sheet
        open={otra}
        onClose={() => setOtra(false)}
        title="Es otra pieza"
        description={candidatos ? `${codigo} · candidatos ${candidatos.map(c => c.nr).join(' / ')}` : `${codigo} · el catálogo dice ${pieza.nr}`}
        actions={
          <>
            <Button variant="plain" onClick={() => setOtra(false)}>Cancelar</Button>
            <Button variant="filled" disabled={guardando || !puedeGuardarTerreno('corregido', etiqueta)} onClick={() => void guardar('corregido')}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {/* maxLength = tope de la regla de Firestore; pegar de más rebota con «permission-denied». */}
          <input
            type="text"
            inputMode="numeric"
            maxLength={MAX_CODIGO_ETIQUETA}
            placeholder="Código de la etiqueta"
            aria-label="Código de la etiqueta"
            value={etiqueta}
            onChange={e => setEtiqueta(e.target.value)}
            className="min-h-[44px] rounded-ctl bg-muted px-3 text-subhead text-foreground placeholder:text-muted-foreground"
          />
          <textarea
            rows={2}
            maxLength={500}
            placeholder="Nota (opcional)"
            aria-label="Nota"
            value={nota}
            onChange={e => setNota(e.target.value)}
            className="rounded-ctl bg-muted px-3 py-2 text-subhead text-foreground placeholder:text-muted-foreground"
          />
          {/* Sin `capture`: el teléfono deja elegir cámara o galería. La foto de la placa es lo que hace irrefutable el vínculo. */}
          <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-full bg-primary/[0.13] px-4 text-subhead font-semibold text-brand-ink">
            <Camera className="size-4" aria-hidden />
            {archivo ? 'Foto lista' : 'Foto de la etiqueta (opcional)'}
            <input type="file" accept="image/*" className="hidden" onChange={e => setArchivo(e.target.files?.[0] ?? null)} />
          </label>
          {error && <p role="alert" className="text-footnote text-ink-crit">{error}</p>}
        </div>
      </Sheet>
    </div>
    </>
  )
}
