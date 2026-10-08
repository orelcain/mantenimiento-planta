/**
 * «Solicitar alta de código» (ficha A3C, sección Repuesto, pieza sin SAP): pide a bodega que cree el SAP
 * del código de fabricante. Los datos que bodega necesita ya están en el plano y en el catálogo, así que
 * van como lista de SOLO LECTURA; el técnico decide únicamente cantidad, nota y foto. Los avisos van
 * arriba, antes de los datos, y NINGUNO bloquea el envío (15 de los 16 códigos sin SAP son «propuesto»).
 * Diseño: mockup «alta-codigo-a3c» (Sheet agrupado, único `filled` = «Enviar a bodega», sin toast).
 */
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Camera, Layers, Minus, Plus } from 'lucide-react'
import { Button, ListGroup, Sheet } from '@/components/piel'
import type { ParteFisica } from '@/hooks/usePartesPlano'
import type { MaquinaBaader } from '@/services/baader142/perilla5Protocolo'
import { MAX_CANTIDAD_ALTA, acotarCantidadAlta, avisosAlta, compactarElementos, descripcionAlta, resumenElementos } from '@/utils/aprendizaje/altaCodigoA3c'
import { origenPieza } from '@/utils/aprendizaje/repuestosA3c'
import { etiquetaMaquina } from '@/utils/aprendizaje/vinculoTerreno'

export interface DatosEnvioAlta {
  cantidad: number
  observaciones: string
  archivo: File | null
}

interface Props {
  open: boolean
  onClose: () => void
  /** Código de fabricante que se pide: el del catálogo o el leído en la etiqueta. */
  codigo: string
  /** El código viene de la etiqueta leída en terreno, no del catálogo. */
  codigoLeido?: boolean
  pieza: ParteFisica
  elemento: string
  maquina: MaquinaBaader | null
  /** Todos los elementos del plano con ese código (de `partes.json`). */
  elementos: readonly string[]
  /** «Volver a solicitar»: la nota y la cantidad del pedido rechazado. */
  inicial?: { cantidad: number; observaciones?: string }
  /** Crea (o reabre) el alta. Si lanza, el mensaje del error queda en el Sheet y no se cierra. */
  onEnviar: (datos: DatosEnvioAlta) => Promise<void>
  /** «Confirmar en terreno primero»: cierra el Sheet y lleva a la pregunta de la ficha. */
  onConfirmarEnTerreno?: () => void
}

const SEPARADOR = 'relative before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-border first:before:hidden'

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className={`${SEPARADOR} px-4 py-2.5 before:left-4`}>
      <p className="text-footnote text-muted-foreground">{etiqueta}</p>
      <div className="text-body">{children}</div>
    </div>
  )
}

function Aviso({ icono, children }: { icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <div role="note" className={`${SEPARADOR} flex gap-2.5 px-4 py-3 text-subhead before:left-[46px]`}>
      <span className="mt-px shrink-0 [&_svg]:size-5">{icono}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function SolicitarAltaSheet({ open, onClose, codigo, codigoLeido = false, pieza, elemento, maquina, elementos, inicial, onEnviar, onConfirmarEnTerreno }: Props) {
  const [cantidad, setCantidad] = useState(1)
  const [texto, setTexto] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inicialRef = useRef(inicial)
  inicialRef.current = inicial

  // Cada vez que se abre: limpio, salvo lo que trae «Volver a solicitar».
  useEffect(() => {
    if (!open) return
    setCantidad(acotarCantidadAlta(inicialRef.current?.cantidad ?? 1))
    setTexto(inicialRef.current?.observaciones ?? '')
    setArchivo(null)
    setError(null)
    setEnviando(false)
  }, [open])

  const avisos = avisosAlta(pieza, codigoLeido)
  const hayAvisos = avisos.conjunto || avisos.propuesto || !!avisos.generacion
  const descripcion = codigoLeido ? pieza.es : descripcionAlta(pieza.es, pieza.de)
  const usos = elementos.length
  const pieAlPlano = pieza.nivel === 'conjunto'
    ? `Un solo conjunto cubre ${compactarElementos(elementos.length ? elementos : [elemento])}.`
    : `El plano lo usa ${usos > 0 ? usos : 1} ${usos > 1 ? 'veces' : 'vez'} por máquina.`

  const enviar = async () => {
    setEnviando(true)
    setError(null)
    try {
      await onEnviar({ cantidad, observaciones: texto, archivo })
    } catch {
      setError('No se pudo enviar la solicitud. Revisa la conexión e inténtalo de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      surface="grouped"
      title="Solicitar alta de código"
      description="Bodega crea el código SAP con estos datos."
      actions={
        <>
          <Button variant="plain" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button variant="filled" onClick={() => void enviar()} disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar a bodega'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" data-testid="alta-sheet">
        {hayAvisos && (
          <ListGroup>
            {avisos.conjunto && (
              <Aviso icono={<Layers className="text-brand-ink" aria-hidden />}>
                <p>
                  <b className="font-semibold">Es un conjunto ({pieza.es.toLowerCase()} {codigo}): se pide el conjunto completo.</b>{' '}
                  La pieza sola no tiene código en el catálogo.
                </p>
              </Aviso>
            )}
            {avisos.propuesto && (
              <Aviso icono={<AlertTriangle className="text-ink-warn" aria-hidden />}>
                <p><b className="font-semibold">Código propuesto, no confirmado en terreno: confírmalo antes si puedes.</b></p>
                {onConfirmarEnTerreno && (
                  <Button variant="plain" size="md" className="-ml-5" onClick={onConfirmarEnTerreno}>
                    Confirmar en terreno primero
                  </Button>
                )}
              </Aviso>
            )}
            {avisos.generacion && (
              <Aviso icono={<AlertTriangle className="text-ink-warn" aria-hidden />}>
                <p><b className="font-semibold">{avisos.generacion}</b></p>
              </Aviso>
            )}
          </ListGroup>
        )}

        <ListGroup title="Lo que recibe bodega" footer="Viene del plano 888 y del catálogo; no se edita aquí.">
          <Dato etiqueta={codigoLeido ? 'Código de fabricante (leído en la etiqueta)' : 'Código de fabricante'}>
            <span className="font-mono font-semibold tabular-nums">{codigo}</span>
          </Dato>
          <Dato etiqueta="Descripción">{descripcion}</Dato>
          {!codigoLeido && <Dato etiqueta="Catálogo">{origenPieza(pieza).replace(/^Catálogo /, '')}</Dato>}
          <Dato etiqueta="Dónde">{elemento}{maquina ? ` en ${etiquetaMaquina(maquina)}` : ''}</Dato>
          {elementos.length > 1 && <Dato etiqueta="Mismo código en el plano">{resumenElementos(elementos)}</Dato>}
        </ListGroup>

        <ListGroup title="Cantidad" footer={pieAlPlano}>
          <div className="flex min-h-[60px] items-center justify-between gap-3 py-2 pl-4 pr-2">
            <span className="text-body">Unidades</span>
            <span className="inline-flex items-center overflow-hidden rounded-full bg-muted">
              <button
                type="button"
                aria-label="Menos"
                disabled={cantidad <= 1}
                onClick={() => setCantidad((c) => acotarCantidadAlta(c - 1))}
                className="grid size-[44px] place-items-center disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Unidades"
                value={cantidad}
                onChange={(e) => setCantidad(acotarCantidadAlta(Number(e.target.value.replace(/\D/g, ''))))}
                className="size-[44px] bg-transparent text-center text-body font-semibold tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              />
              <button
                type="button"
                aria-label="Más"
                disabled={cantidad >= MAX_CANTIDAD_ALTA}
                onClick={() => setCantidad((c) => acotarCantidadAlta(c + 1))}
                className="grid size-[44px] place-items-center disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </span>
          </div>
        </ListGroup>

        <ListGroup title="Nota (opcional)">
          <textarea
            rows={3}
            maxLength={500}
            aria-label="Nota"
            placeholder="Para qué se necesita, urgencia, proveedor…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="block w-full resize-none bg-transparent px-4 py-3 text-body text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
          />
        </ListGroup>

        {/* Sin `capture`: el teléfono deja elegir cámara o galería. Misma cápsula que «Es otra pieza». */}
        <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-full bg-primary/[0.13] px-4 text-subhead font-semibold text-brand-ink">
          <Camera className="size-4" aria-hidden />
          {archivo ? 'Foto lista' : 'Foto de la etiqueta (opcional)'}
          <input type="file" accept="image/*" aria-label="Foto de la etiqueta" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        </label>

        {error && <p role="alert" className="text-footnote text-ink-crit">{error}</p>}
      </div>
    </Sheet>
  )
}
