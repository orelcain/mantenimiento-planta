/**
 * Los detalles de la pestaña Análisis en PC: una ventana expediente en vez del panel lateral de 460 px. A la izquierda la
 * pregunta y el índice de sus secciones; a la derecha la respuesta como título y la evidencia como tablas (estilos `.an-pc`
 * en `analisisV2.css`). Sirve a los 7 detalles sin tocarlos: todos usan `Resp`, `Sec` y `Ev`. En celular sigue la hoja.
 * Mockup aprobado (opción A): https://claude.ai/artifact/D6JxKGxisCL61DH9RQjQ9N
 */
import { X } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Sheet } from '@/components/piel'

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

export interface DetalleExpedientePCProps { abierto: boolean; titulo: string; sub?: string; onClose: () => void; children: ReactNode }

export function DetalleExpedientePC({ abierto, titulo, sub, onClose, children }: DetalleExpedientePCProps) {
  const cuerpo = useRef<HTMLDivElement>(null)
  const [indice, setIndice] = useState<string[]>([])

  /* El índice sale de las secciones que el detalle dibujó (`Sec` → h4): así ningún detalle tiene que declararlo. */
  useLayoutEffect(() => {
    if (!abierto) return
    const h = cuerpo.current?.querySelectorAll('.an-d-sec > h4') ?? []
    setIndice(Array.from(h, (e) => (e.textContent ?? '').replace(/^\d+/, '').trim()))
    cuerpo.current?.scrollTo({ top: 0 })
  }, [abierto, titulo, children])

  const ir = (i: number) => {
    const h = cuerpo.current?.querySelectorAll('.an-d-sec > h4')[i]
    h?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  return (
    <Sheet open={abierto} onClose={onClose} presentacionPC="libre" title={titulo}>
      <div className="v2-vars grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]">
        <aside aria-label="La pregunta" className="min-h-0 overflow-y-auto overscroll-contain border-r border-border bg-background px-5 py-[18px]">
          <p className="text-headline text-foreground">{titulo}</p>
          {sub && <p className="mt-1 text-footnote text-muted-foreground">{sub}</p>}
          {indice.length > 1 && (
            <nav aria-label="Secciones" className="mt-6">
              <h3 className="mb-1 text-footnote text-muted-foreground">En este detalle</h3>
              <ol>
                {indice.map((t, i) => (
                  <li key={`${i}-${t}`} className="border-t border-border">
                    <button type="button" onClick={() => ir(i)} className={`flex min-h-8 w-full items-baseline gap-2.5 py-1.5 text-left text-subhead text-foreground hover:text-primary ${FOCO}`}>
                      <span className="w-3.5 flex-none text-footnote tabular-nums text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0">{t}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          )}
        </aside>

        <div className="relative flex min-h-0 min-w-0 flex-col">
          <button type="button" aria-label="Cerrar" onClick={onClose} className={`absolute right-7 top-3.5 z-10 grid size-[36px] place-items-center rounded-ctl bg-muted-foreground/15 text-foreground ${FOCO}`}>
            <X className="size-3.5" aria-hidden />
          </button>
          <div ref={cuerpo} className="an-pc min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 pb-[18px] pt-3.5 tabular-nums">{children}</div>
        </div>
      </div>
    </Sheet>
  )
}
