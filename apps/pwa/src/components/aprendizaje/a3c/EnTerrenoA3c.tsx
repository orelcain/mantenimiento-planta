/**
 * Bloque «En terreno» de la ficha A3C: una fila por máquina del plano (estado · código · quién ·
 * fecha), la activa marcada «Aquí». Si las máquinas resueltas llevan códigos distintos, una fila
 * informativa (azul, no ámbar: no es un error del catálogo) dice que el repuesto se pide según la
 * máquina. Una confirmación vieja sin máquina se muestra como pista y no cuenta.
 */
import { GitCompareArrows } from 'lucide-react'
import { CellIcon, ListCell, ListGroup } from '@/components/piel'
import type { VinculoTerreno } from '@/hooks/usePlanoVinculos'
import type { MaquinaBaader } from '@/services/baader142/perilla5Protocolo'
import { cn } from '@/lib/utils'
import {
  estadoPorMaquina,
  etiquetaMaquina,
  fechaCortaVinculo,
  type EntradaVinculos,
} from '@/utils/aprendizaje/vinculoTerreno'

const TITULO_ESTADO: Record<VinculoTerreno['estado'], string> = {
  confirmado: 'Confirmado',
  corregido: 'Otra pieza',
  no_aplica: 'No existe',
}

function quienCuando(v: Pick<VinculoTerreno, 'confirmadoPorNombre' | 'actualizado'>): string {
  return [v.confirmadoPorNombre || 'alguien', fechaCortaVinculo(v.actualizado)].filter(Boolean).join(' · ')
}

export function EnTerrenoA3c({
  entrada,
  maquinas,
  maquina,
}: {
  entrada?: EntradaVinculos<Pick<VinculoTerreno, 'estado' | 'codigo' | 'confirmadoPorNombre' | 'actualizado'>>
  maquinas: readonly MaquinaBaader[]
  maquina: MaquinaBaader | null
}) {
  const est = estadoPorMaquina(entrada, maquinas)
  const previo = entrada?.sinMaquina
  return (
    <ListGroup title="En terreno" className="mt-4" data-testid="en-terreno">
      {maquinas.map(m => {
        const v = entrada?.porMaquina[m]
        const aqui = m === maquina
        const mm = etiquetaMaquina(m)
        return (
          <ListCell
            key={m}
            data-testid={`en-terreno-${mm}`}
            leading={
              <CellIcon
                tone="neutral"
                className={cn(
                  'font-mono text-caption font-bold',
                  v && 'bg-success/[0.15] text-ink-ok',
                  aqui && 'ring-2 ring-inset ring-primary',
                )}
              >
                {mm}
              </CellIcon>
            }
            title={
              <>
                {v ? TITULO_ESTADO[v.estado] : 'Pendiente'}
                {aqui && <span className="font-normal text-muted-foreground"> · Aquí</span>}
              </>
            }
            subtitle={
              v ? (
                <>
                  {est.codigos[m] && <span className="font-mono">{est.codigos[m]} · </span>}
                  {quienCuando(v)}
                </>
              ) : (
                `Nadie la ha leído en ${mm}`
              )
            }
          />
        )
      })}
      {previo && (
        <ListCell
          data-testid="en-terreno-previo"
          title="Confirmación anterior (sin máquina)"
          subtitle={
            <>
              {TITULO_ESTADO[previo.estado]}
              {previo.codigo ? <span className="font-mono"> · {previo.codigo}</span> : null} · {quienCuando(previo)}
            </>
          }
        />
      )}
      {est.distintas && (
        <div className="relative flex items-start gap-3 px-4 py-2.5 before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-border" data-testid="piezas-distintas">
          <CellIcon tone="neutral" className="bg-primary/[0.15] text-brand-ink">
            <GitCompareArrows aria-hidden />
          </CellIcon>
          <div className="min-w-0">
            <p className="text-body font-semibold leading-tight">Piezas distintas por máquina</p>
            <p className="mt-0.5 text-footnote text-muted-foreground">
              {maquinas
                .filter(m => est.codigos[m])
                .map((m, i) => (
                  <span key={m}>
                    {i > 0 && ' y '}
                    {etiquetaMaquina(m)} lleva <span className="font-mono">{est.codigos[m]}</span>
                  </span>
                ))}
              . Pide el repuesto según la máquina.
            </p>
          </div>
        </div>
      )}
    </ListGroup>
  )
}
