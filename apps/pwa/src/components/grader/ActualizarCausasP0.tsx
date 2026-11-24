/**
 * «Actualizar causas P0» (e1.10), dentro de la tarjeta del espejo, bajo la lectura en vivo.
 *
 * Pide al lector del PC de planta que lea el informe «Puerta 0» de Matrix (el motivo real de cada pieza de P0). El
 * lector lo toma en su próximo envío (5 min o menos) y vuelve solo a «Pieza pieza Grader». Mientras no llega, las
 * causas del monitor son las deducidas del seteo, rotuladas «estimado».
 *
 * `ActualizarCausasP0Fila` solo presenta; `ActualizarCausasP0` le conecta Firestore.
 */
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, Pill } from '@/components/piel'
import { cn } from '@/lib/utils'
import type { EstadoLector } from '@/services/grader/espejo/espejoEstado'
import { VERSION_CON_P0, estadoPedidoP0, type FuenteP0, type ModoPedidoP0 } from '@/services/grader/espejo/espejoP0'
import { pedirP0, usePedidoP0 } from '@/services/grader/espejo/espejoP0.service'

function hora(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function nota(modo: ModoPedidoP0, fuente: FuenteP0 | null, version: string | undefined, quien: string | null): string {
  const por = quien ? ` Lo pidió ${quien}.` : ''
  switch (modo) {
    case 'pedido': return `El lector lo toma en su próximo envío, en 5 min o menos.${por}`
    case 'atendido': return `Leída la Puerta 0 de Matrix.${por}`
    case 'apagado': return 'El lector tiene apagado el cambio de informe (archivo ALTERNAR): las causas siguen estimadas.'
    case 'fallo': return 'El lector no pudo leer la Puerta 0 esta vez: las causas siguen estimadas. Detalle en Diagnóstico Matrix.'
    case 'sin-soporte': return `El lector ${version ?? 'instalado'} no lee Puerta 0: publica la ${VERSION_CON_P0} en Diagnóstico Matrix.`
    default:
      return fuente === 'espejo' ? 'Motivo real de la Puerta 0 que lee el espejo.'
        : fuente === 'excel' ? 'Motivo real del Excel de Puerta 0.'
          : 'Sin Puerta 0: causas estimadas por el seteo leído.'
  }
}

export function ActualizarCausasP0Fila({ modo, pedidoEnMs, fuente, version, pedidoNombre, ocupado, error, onPedir, className }: {
  modo: ModoPedidoP0
  pedidoEnMs: number | null
  fuente: FuenteP0 | null
  version: string | undefined
  pedidoNombre: string | null
  ocupado: boolean
  error: string | null
  onPedir: () => void
  className?: string
}) {
  return (
    <div className={cn('mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 pt-3', className)} data-testid="actualizar-causas-p0" data-modo={modo}>
      <div className="min-w-0 flex-1">
        {modo === 'pedido' && pedidoEnMs !== null ? (
          <Pill tone="info" dot><span className="tabular-nums">Puerta 0 pedida {hora(pedidoEnMs)}</span></Pill>
        ) : fuente ? (
          <Pill tone="ok" dot>Causas reales</Pill>
        ) : (
          <Pill tone={modo === 'fallo' || modo === 'sin-soporte' ? 'warning' : 'neutral'} dot>Causas estimadas</Pill>
        )}
        <p className="mt-1 text-footnote text-muted-foreground">{nota(modo, fuente, version, pedidoNombre)}</p>
        {error && <p className="mt-1 text-footnote text-ink-warn" role="alert">{error}</p>}
      </div>
      <Button variant="tinted" onClick={onPedir} disabled={ocupado || modo === 'pedido' || modo === 'sin-soporte'}>
        <RefreshCw aria-hidden />Actualizar causas P0
      </Button>
    </div>
  )
}

function useAhora(cadaMs = 15_000): number {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), cadaMs)
    return () => clearInterval(id)
  }, [cadaMs])
  return t
}

export function ActualizarCausasP0({ linea, lector, fuente, className }: { linea: string; lector: EstadoLector; fuente: FuenteP0 | null; className?: string }) {
  const pedido = usePedidoP0(linea)
  const ahora = useAhora()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const e = estadoPedidoP0({ pedidoEnMs: pedido.pedidoEnMs, ahoraMs: ahora, version: lector.estado.version, p0: lector.p0?.estado ?? null })
  const pedir = () => {
    setOcupado(true)
    setError(null)
    pedirP0(linea)
      .catch((x: unknown) => setError(x instanceof Error && x.message.startsWith('Inicia') ? x.message : 'No se pudo guardar el pedido (un pedido por minuto). Inténtalo de nuevo.'))
      .finally(() => setOcupado(false))
  }
  return (
    <ActualizarCausasP0Fila
      modo={e.modo}
      pedidoEnMs={e.pedidoEnMs}
      fuente={fuente}
      version={lector.estado.version}
      pedidoNombre={pedido.pedidoNombre}
      ocupado={ocupado}
      error={error}
      onPedir={pedir}
      className={className}
    />
  )
}
