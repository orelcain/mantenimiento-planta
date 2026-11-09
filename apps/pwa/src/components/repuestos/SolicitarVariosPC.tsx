/**
 * «Solicitar repuestos» en PC: lo marcado a la izquierda, siempre a la vista, y el catálogo como
 * tabla a la derecha. Solo dibuja: el estado vive en `SolicitarVariosSheet`.
 * Mockup aprobado (opción A): https://claude.ai/artifact/8dtNRitge961vZ3Z8gPVpt
 */
import { Loader2, Minus, Plus, X } from 'lucide-react'
import { Button, Sheet } from '@/components/piel'
import { partesEquipo } from '@/components/acr/acrExpedienteTextos'
import { Checkbox } from '@/components/ui/checkbox'
import { avisoDeStock, type NivelStock } from '@/hooks/repuestos/solicitudDeRepuesto'
import { cn } from '@/lib/utils'
import { nombreVisible } from '@/utils/repuestos/nombreVisible'
import { sePuedePedir, TITULO_GRUPO, type GrupoSolicitable, type PiezaSolicitable } from '@/utils/repuestos/solicitudMultiple'

/** Mismas columnas en encabezado y filas. */
const FILA = 'grid grid-cols-[22px_minmax(0,1fr)_100px_104px_62px_100px_112px] items-center gap-x-3'
const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
const PASO = `flex size-7 items-center justify-center rounded-ctl border border-border text-foreground hover:bg-muted-foreground/10 ${FOCO}`
const COLOR_AVISO: Record<NivelStock, string> = {
  desconocido: 'text-muted-foreground',
  ok: 'text-muted-foreground',
  insuficiente: 'text-ink-warn',
  'sin-stock': 'text-ink-crit',
}

function colorBodega(stock: number): string {
  if (stock === 0) return 'bg-fill-critical'
  return stock === 1 ? 'bg-fill-warning' : 'bg-fill-ok'
}

export interface SolicitarVariosPCProps {
  open: boolean
  onClose: () => void
  maquina: string
  piezas: PiezaSolicitable[]
  grupos: { grupo: GrupoSolicitable; piezas: PiezaSolicitable[] }[]
  resumen: { repuestos: number; unidades: number; avisos: Map<string, string> }
  seleccion: Map<string, number>
  leyendoStock: boolean
  query: string
  onQuery: (valor: string) => void
  onAlternar: (pieza: PiezaSolicitable, marcar: boolean) => void
  onFijar: (clave: string, cantidad: number) => void
  observaciones: string
  onObservaciones: (valor: string) => void
  enviando: boolean
  error: string | null
  onEnviar: () => void
}

export function SolicitarVariosPC({
  open, onClose, maquina, piezas, grupos, resumen, seleccion, leyendoStock, query, onQuery,
  onAlternar, onFijar, observaciones, onObservaciones, enviando, error, onEnviar,
}: SolicitarVariosPCProps) {
  const { tipo, nombre } = partesEquipo(maquina)
  const conSap = piezas.filter(sePuedePedir).length
  const marcadas = piezas.filter((p) => seleccion.has(p.clave))
  const rotulo = resumen.repuestos === 0 ? 'Solicitar' : `Solicitar ${resumen.repuestos} ${resumen.repuestos === 1 ? 'repuesto' : 'repuestos'}`

  return (
    <Sheet open={open} onClose={onClose} presentacionPC="libre" title="Solicitar repuestos">
      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]">
        <aside aria-label="Repuestos a solicitar" className="flex min-h-0 flex-col border-r border-border bg-background">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3 pt-[18px]">
            {tipo && <p className="text-footnote text-muted-foreground">{tipo}</p>}
            <p className="text-headline text-foreground">{nombre}</p>
            <p className="mb-3.5 text-footnote text-muted-foreground">{`${conSap} con SAP${leyendoStock ? ', leyendo stock…' : ''}`}</p>

            <h3 className="mb-1 text-headline text-foreground">A solicitar</h3>
            {marcadas.length === 0 ? (
              <p className="border-t border-border pt-2 text-subhead text-muted-foreground">Marca los repuestos en la tabla.</p>
            ) : (
              <>
                {marcadas.map((p) => {
                  const cantidad = seleccion.get(p.clave) ?? 1
                  const aviso = avisoDeStock(p.stock, cantidad)
                  return (
                    <div key={p.clave} className="border-t border-border py-[7px]">
                      <div className="flex items-baseline justify-between gap-2.5">
                        <span className="min-w-0 text-subhead text-foreground">{nombreVisible(p).titulo}</span>
                        <span className="flex flex-none items-center gap-1.5 text-subhead tabular-nums text-foreground">
                          {`${cantidad} UN`}
                          <button type="button" aria-label={`Quitar ${nombreVisible(p).titulo}`} onClick={() => onAlternar(p, false)} className={`text-muted-foreground ${FOCO}`}>
                            <X className="size-3.5" aria-hidden />
                          </button>
                        </span>
                      </div>
                      <p className={cn('text-footnote', COLOR_AVISO[aviso.nivel])}>{aviso.texto}</p>
                    </div>
                  )
                })}
                <div className="flex justify-between gap-3 border-t border-foreground pt-[5px] text-footnote tabular-nums text-foreground">
                  <span>
                    {`${resumen.repuestos} ${resumen.repuestos === 1 ? 'repuesto' : 'repuestos'}`}
                    {resumen.avisos.size > 0 && `, ${resumen.avisos.size} ${resumen.avisos.size === 1 ? 'aviso' : 'avisos'}`}
                  </span>
                  <span>{`${resumen.unidades} UN`}</span>
                </div>
              </>
            )}

            <label className="mt-4 block">
              <span className="mb-[5px] block text-footnote text-muted-foreground">Observación, va en todas</span>
              <textarea
                value={observaciones}
                onChange={(e) => onObservaciones(e.target.value)}
                maxLength={200}
                rows={3}
                placeholder="Para el cambio de cuchillas del lunes"
                className="w-full resize-none rounded-ctl border border-border bg-transparent px-2.5 py-2 text-subhead text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
              />
            </label>
            {error && <p role="alert" className="mt-2 text-footnote font-semibold text-ink-crit">{error}</p>}
          </div>
          <div className="flex flex-none items-center justify-between gap-2.5 border-t border-border px-5 py-2.5">
            <Button variant="plain" size="sm" className="!min-h-[36px] !px-0 !text-subhead !font-normal" onClick={onClose} disabled={enviando}>
              Cancelar
            </Button>
            <Button size="sm" className="!min-h-[36px] !rounded-ctl !px-[18px] !text-subhead" onClick={onEnviar} disabled={enviando || resumen.repuestos === 0}>
              {enviando ? <Loader2 className="animate-spin" /> : null}
              {rotulo}
            </Button>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col">
          <header className="flex flex-none items-center justify-between gap-5 border-b border-border px-7 pb-3 pt-3.5">
            <h2 className="text-title2">Solicitar repuestos</h2>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className={`grid size-[36px] flex-none place-items-center rounded-ctl bg-muted-foreground/15 text-foreground ${FOCO}`}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </header>

          <div className="flex-none px-7 pb-2.5 pt-3.5">
            <input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              autoComplete="off"
              aria-label="Buscar repuesto"
              placeholder="Buscar por nombre, SAP o código de fabricante"
              className="h-[36px] w-full rounded-ctl border border-border bg-background px-2.5 text-subhead text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <div className="min-h-[420px] flex-1 overflow-y-auto overscroll-contain px-7 pb-3">
            <div className={`${FILA} sticky top-0 z-10 min-h-6 border-t border-foreground bg-card text-footnote text-muted-foreground`}>
              <span />
              <span>Repuesto</span>
              <span>SAP</span>
              <span>Fabricante</span>
              <span className="text-right">Máquina</span>
              <span>Bodega</span>
              <span className="text-right">Cantidad</span>
            </div>
            {grupos.length === 0 && <p className="border-t border-border py-6 text-center text-subhead text-muted-foreground">Ningún repuesto coincide.</p>}
            {grupos.map(({ grupo, piezas: lista }) => (
              <section key={grupo}>
                <h3 className="pb-[3px] pt-2.5 text-footnote text-muted-foreground">{`${TITULO_GRUPO[grupo]}, ${lista.length}`}</h3>
                {lista.map((p) => {
                  const pedible = sePuedePedir(p)
                  const cantidad = seleccion.get(p.clave)
                  const marcada = cantidad != null
                  const nv = nombreVisible(p)
                  const st = p.stock
                  const conocido = st?.configurado && typeof st.stockActual === 'number'
                  return (
                    <div key={p.clave} className={cn(FILA, 'min-h-[34px] border-t border-border', marcada && 'bg-primary/[0.08]', !pedible && 'opacity-60')}>
                      <Checkbox checked={marcada} disabled={!pedible} onCheckedChange={(v) => onAlternar(p, v === true)} aria-label={`Marcar ${nv.titulo}`} className="size-[15px]" />
                      <button type="button" disabled={!pedible} onClick={() => onAlternar(p, !marcada)} title={nv.oficial ?? undefined} className={`min-w-0 truncate text-left text-subhead text-foreground ${FOCO}`}>
                        {p.textoBreve || nv.esComun ? nv.titulo : <span className="italic text-muted-foreground">Sin nombre</span>}
                      </button>
                      <span className="text-subhead tabular-nums text-foreground">{pedible ? p.codigoSAP : <span className="text-muted-foreground">Sin SAP</span>}</span>
                      <span className="truncate text-subhead tabular-nums text-muted-foreground">{p.codigoFabricante ?? ''}</span>
                      <span className="text-right text-subhead tabular-nums text-foreground">{p.cantidadPorMaquina ?? ''}</span>
                      <span className="truncate text-subhead tabular-nums text-foreground">
                        {pedible && conocido ? (
                          <>
                            <span aria-hidden className={`mr-1.5 inline-block size-[7px] rounded-full align-[1px] ${colorBodega(st.stockActual ?? 0)}`} />
                            {`${st.stockActual}${st.ubicacionBodega ? ` · ${st.ubicacionBodega}` : ''}`}
                          </>
                        ) : pedible ? (
                          <span className="text-muted-foreground">Sin registro</span>
                        ) : null}
                      </span>
                      {marcada ? (
                        <span className="flex items-center justify-end gap-1.5">
                          <button type="button" aria-label="Menos" onClick={() => onFijar(p.clave, cantidad - 1)} className={PASO}>
                            <Minus className="size-3" aria-hidden />
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            aria-label={`Cantidad de ${nv.titulo}`}
                            value={cantidad}
                            onChange={(e) => onFijar(p.clave, Number(e.target.value))}
                            className="h-7 w-8 rounded-ctl bg-transparent text-center text-subhead tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                          <button type="button" aria-label="Más" onClick={() => onFijar(p.clave, cantidad + 1)} className={PASO}>
                            <Plus className="size-3" aria-hidden />
                          </button>
                        </span>
                      ) : (
                        <span />
                      )}
                    </div>
                  )
                })}
              </section>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  )
}
