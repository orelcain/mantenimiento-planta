/**
 * /causa-raiz/:acrId — un análisis de causa raíz como página de PC, con enlace propio.
 * Sin ventana: lo que se lee ocupa la pantalla. El editor sigue siendo la hoja del ACR.
 */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { Button, Skeleton } from '@/components/piel'
import { AcrDocumento } from '@/components/acr/AcrDocumento'
import { HojasAcr, type VistaAcr } from '@/components/acr/AcrEntrada'
import { escucharAcr, leerEventoDeAcr } from '@/services/acr/acrPagina'
import { guardarAcr } from '@/services/acr/acrFirestore'
import { esEventoJK, eventoRefDesdeAcr } from '@/services/acr/desdeJackKnife'
import type { Acr, EventoRefAcr } from '@/services/acr/acr.types'
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'
import { logger } from '@/lib/logger'

type Lectura = { fase: 'cargando' } | { fase: 'error' } | { fase: 'lista'; acr: Acr | null }

export function CausaRaizDetallePage() {
  const { acrId } = useParams<{ acrId: string }>()
  const [lectura, setLectura] = useState<Lectura>({ fase: 'cargando' })
  const [eventoBitacora, setEventoBitacora] = useState<EventoBitacora | null>(null)
  const [vista, setVista] = useState<VistaAcr>('ninguna')
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    if (!acrId) return
    setLectura({ fase: 'cargando' })
    return escucharAcr(
      acrId,
      (acr) => setLectura({ fase: 'lista', acr }),
      () => setLectura({ fase: 'error' }),
    )
  }, [acrId])

  const acr = lectura.fase === 'lista' ? lectura.acr : null
  const eventoId = acr?.eventoBitacoraIds[0]
  const desdeJK = eventoId !== undefined && esEventoJK(eventoId)
  useEffect(() => {
    // Un análisis nacido del Jack-Knife no tiene evento de Bitácora que leer.
    if (!eventoId || desdeJK) return
    let vigente = true
    leerEventoDeAcr(eventoId)
      .then((e) => {
        if (vigente) setEventoBitacora(e)
      })
      .catch((e: unknown) => {
        logger.error('No se pudo leer el evento del análisis', e instanceof Error ? e : undefined, { eventoId })
      })
    return () => {
      vigente = false
    }
  }, [eventoId, desdeJK])

  const evento: EventoRefAcr | null = acr && desdeJK ? eventoRefDesdeAcr(acr) : eventoBitacora

  /** Guarda el cambio y lo muestra de inmediato; la escucha del análisis lo confirma después. */
  const actualizar = (a: Acr) => {
    setLectura({ fase: 'lista', acr: a })
    guardarAcr(a, false).catch((e: unknown) => {
      logger.error('No se pudo guardar el análisis de causa raíz', e instanceof Error ? e : undefined, { acrId: a.id })
      setAviso('No se guardó el cambio. Revisa la conexión y tus permisos.')
    })
  }

  return (
    <div className="w-full px-4 pb-8 pt-3 lg:px-6 lg:pb-8 lg:pt-6">
      <header className="mb-3 flex min-h-[44px] items-center justify-between gap-4">
        <Link
          to="/causa-raiz"
          className="-ml-1 inline-flex min-h-[44px] items-center gap-1.5 rounded-ctl px-1 text-subhead text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronLeft className="h-4 w-4 flex-none" aria-hidden />
          Causa raíz
        </Link>
        {acr && evento && (
          <Button variant="tinted" onClick={() => setVista('editor')}>
            Editar
          </Button>
        )}
      </header>

      {lectura.fase === 'cargando' && (
        <div role="status" aria-label="Cargando el análisis" className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,32%)] lg:gap-x-[56px]">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="mt-6 h-40 w-full" />
          </div>
          <Skeleton className="mt-6 aspect-[3/2] w-full lg:mt-0" />
        </div>
      )}
      {lectura.fase === 'error' && <p className="text-body text-muted-foreground">No se pudo leer este análisis.</p>}
      {lectura.fase === 'lista' && !acr && <p className="text-body text-muted-foreground">Este análisis ya no existe.</p>}
      {acr && <AcrDocumento acr={acr} onActualizar={actualizar} />}
      {aviso && (
        <p role="status" className="mt-4 text-footnote text-muted-foreground">
          {aviso}
        </p>
      )}

      {evento && <HojasAcr evento={evento} acr={acr} repeticion={null} vista={vista} onVista={setVista} />}
    </div>
  )
}
