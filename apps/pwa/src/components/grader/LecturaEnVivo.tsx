/**
 * Lectura en vivo a pedido (E1.4), dentro de la tarjeta del espejo, junto al estado del lector.
 *
 * Lo normal es leer cada 5 min. «En vivo 15 min» pide al lector del PC de planta que lea cada minuto hasta
 * esa hora; después vuelve solo a 5 min. La pastilla dice «En vivo hasta HH:MM» solo cuando el latido del
 * lector lo confirma: antes, el pedido está escrito pero el lector lo toma en su próximo envío (hasta 5 min).
 *
 * `LecturaEnVivoFila` solo presenta (con tests); `LecturaEnVivo` le conecta Firestore.
 */
import { useEffect, useState } from 'react'
import { Radio } from 'lucide-react'
import { Button, Pill } from '@/components/piel'
import { cn } from '@/lib/utils'
import type { EstadoLector } from '@/services/grader/espejo/espejoEstado'
import { VERSION_CON_VIVO, VIVO_MIN, estadoVivo, type EstadoVivo } from '@/services/grader/espejo/lecturaVivo'
import { pedirVivo, terminarVivo, useControlVivo } from '@/services/grader/espejo/lecturaVivo.service'

function hora(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function nota(e: EstadoVivo, pedidoNombre: string | null, version: string | undefined): string {
  const quien = pedidoNombre ? ` Lo pidió ${pedidoNombre}.` : ''
  switch (e.modo) {
    case 'vivo': return `Lee cada minuto y vuelve solo a 5 min.${quien}`
    case 'pedido': return `El lector lo toma en su próximo envío, en 5 min o menos.${quien}`
    case 'sin-soporte': return `El lector ${version ?? 'instalado'} no lee en vivo: publica la ${VERSION_CON_VIVO} en Diagnóstico Matrix.`
    default: return `Para revisar en terreno: lee cada minuto durante ${VIVO_MIN} min.`
  }
}

export function LecturaEnVivoFila({ estado, pedidoNombre, version, ocupado, error, onPedir, onTerminar, className }: {
  estado: EstadoVivo
  pedidoNombre: string | null
  version: string | undefined
  ocupado: boolean
  error: string | null
  onPedir: () => void
  onTerminar: () => void
  className?: string
}) {
  const activo = estado.modo !== 'normal' && estado.hastaMs !== null
  return (
    <div className={cn('mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 pt-3', className)} data-testid="lectura-en-vivo" data-modo={estado.modo}>
      <div className="min-w-0 flex-1">
        {estado.modo === 'vivo' && estado.hastaMs !== null ? (
          <Pill tone="ok" dot="pulse"><span className="tabular-nums">En vivo hasta {hora(estado.hastaMs)}</span></Pill>
        ) : estado.modo === 'pedido' && estado.hastaMs !== null ? (
          <Pill tone="info" dot><span className="tabular-nums">En vivo pedido hasta {hora(estado.hastaMs)}</span></Pill>
        ) : estado.modo === 'sin-soporte' ? (
          <Pill tone="warning" dot>Cada 5 min</Pill>
        ) : (
          <Pill tone="neutral" dot>Cada 5 min</Pill>
        )}
        <p className="mt-1 text-footnote text-muted-foreground">{nota(estado, pedidoNombre, version)}</p>
        {error && <p className="mt-1 text-footnote text-ink-warn" role="alert">{error}</p>}
      </div>
      {activo ? (
        <Button variant="plain" onClick={onTerminar} disabled={ocupado}>Volver a 5 min</Button>
      ) : (
        <Button variant="tinted" onClick={onPedir} disabled={ocupado}>
          <Radio aria-hidden />En vivo {VIVO_MIN} min
        </Button>
      )}
    </div>
  )
}

/** Hora real para la pastilla: se refresca sola para volver a «Cada 5 min» al vencer. */
function useAhora(cadaMs = 15_000): number {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), cadaMs)
    return () => clearInterval(id)
  }, [cadaMs])
  return t
}

export function LecturaEnVivo({ linea, lector, className }: { linea: string; lector: EstadoLector; className?: string }) {
  const control = useControlVivo(linea)
  const ahora = useAhora()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const estado = estadoVivo({ hastaMs: control.hastaMs, ahoraMs: ahora, latidoVivo: lector.estado.vivo, version: lector.estado.version })
  const correr = (f: (l: string) => Promise<void>) => {
    setOcupado(true)
    setError(null)
    f(linea)
      .catch((e: unknown) => setError(e instanceof Error && e.message.startsWith('Inicia') ? e.message : 'No se pudo guardar el pedido. Revisa la conexión e inténtalo de nuevo.'))
      .finally(() => setOcupado(false))
  }
  return (
    <LecturaEnVivoFila
      estado={estado}
      pedidoNombre={control.pedidoNombre}
      version={lector.estado.version}
      ocupado={ocupado}
      error={error}
      onPedir={() => correr(pedirVivo)}
      onTerminar={() => correr(terminarVivo)}
      className={className}
    />
  )
}
