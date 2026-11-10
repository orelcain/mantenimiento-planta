/**
 * «Tiempo perdido» y «Fallas de equipos» en PC: una ventana expediente. A la izquierda lo que se pierde y de quién fue, más lo
 * de Mantención; a la derecha las tablas que lo respaldan, cada una cerrada con su total. En celular sigue la hoja de siempre.
 * Mockup aprobado (opción A): https://claude.ai/artifact/J53xtaZDqhYx47BAsie8Nc
 */
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Sheet } from '@/components/piel'
import { DUENO_UI } from './duenoUi'
import { nombreCausa } from './desgloseVista'
import { RELLENO, dec, hhmm, horas, int, type MonitorV2Props } from './MonitorV2'
import { duenosOrdenados, etiquetaTurno, parte, tituloPerdido, totalMaquinas } from './cifrasExpediente'

type Datos = Pick<MonitorV2Props, 'perdidas' | 'perdidasMaquina' | 'causas' | 'programadas' | 'mant' | 'mantPorMaquina' | 'eventos' | 'turnoId' | 'cerrado'>

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
const CAB = 'grid min-h-6 items-center gap-x-3.5 border-t border-foreground text-footnote text-muted-foreground'
const FILA = 'grid min-h-[34px] items-center gap-x-3.5 border-t border-border text-subhead text-foreground'
const TOTAL = 'grid min-h-[30px] items-center gap-x-3.5 border-t border-foreground text-subhead font-semibold text-foreground'
const COL_CAUSAS = 'grid-cols-[minmax(0,1fr)_170px_60px_104px_56px]'
const COL_MAQ = 'grid-cols-[minmax(0,1fr)_60px_96px_120px_100px_88px]'
const COL_FALLAS = 'grid-cols-[120px_160px_minmax(0,1fr)_88px]'
const COL_DUENO = 'grid-cols-[minmax(0,1fr)_92px_44px]'

function Dueno({ dueno, breve }: { dueno: keyof typeof RELLENO; breve?: boolean }) {
  return (
    <span className="min-w-0 truncate">
      <span aria-hidden className="mr-1.5 inline-block size-[7px] rounded-full align-[1px]" style={{ background: RELLENO[dueno] }} />
      {breve ? DUENO_UI[dueno].corto.replace(/ · .*$/, '') : DUENO_UI[dueno].corto}
    </span>
  )
}

function Seccion({ titulo, children, className = '' }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={titulo} className={className}>
      <h3 className="mb-1.5 text-headline text-foreground">{titulo}</h3>
      {children}
    </section>
  )
}

function Clave({ k, v, nota }: { k: string; v: string; nota?: string }) {
  return (
    <div className="flex min-h-8 items-baseline justify-between gap-2.5 border-t border-border pt-1.5 text-subhead text-foreground">
      <span>{k}</span>
      <span className="tabular-nums">{v}{nota && <span className="ml-1 text-footnote text-muted-foreground">{nota}</span>}</span>
    </div>
  )
}

export interface CifrasExpedientePCProps { open: boolean; onClose: () => void; datos: Datos }

export function CifrasExpedientePC({ open, onClose, datos: p }: CifrasExpedientePCProps) {
  const duenos = duenosOrdenados(p.perdidas)
  const total = duenos.reduce((a, x) => a + x.min, 0)
  const totalCausas = p.causas.reduce((a, c) => a + c.min, 0)
  const vecesCausas = p.causas.reduce((a, c) => a + c.veces, 0)
  const tm = totalMaquinas(p.mantPorMaquina)
  const eventos = p.eventos.slice().sort((a, b) => a.desde.localeCompare(b.desde))
  const minFallas = eventos.reduce((a, e) => a + e.min, 0)
  const turno = etiquetaTurno(p.turnoId)
  const titulo = tituloPerdido(total, p.causas, horas)
  const porMaquina = p.perdidasMaquina && p.perdidasMaquina.maquinas > 1 ? p.perdidasMaquina : null

  return (
    <Sheet open={open} onClose={onClose} presentacionPC="libre" title="Tiempo perdido y fallas">
      <div className="v2-vars grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]">
        <aside aria-label="Resumen del tiempo perdido" className="min-h-0 overflow-y-auto overscroll-contain border-r border-border bg-background px-5 py-[18px]">
          {turno && <p className="text-footnote text-muted-foreground">{`${turno}${p.cerrado ? '' : ', en curso'}`}</p>}
          <p className="mt-3 text-title2 tabular-nums text-foreground">{horas(total)}</p>
          <p className="mb-4 text-footnote text-muted-foreground">
            {porMaquina ? `de línea perdidos (${int(porMaquina.min)} min de máquina ÷ ${porMaquina.maquinas})` : 'de línea perdidos'}
          </p>

          <h3 className="mb-0.5 text-headline text-foreground">De quién fue</h3>
          {duenos.map((x) => (
            <div key={x.dueno} className={`${FILA} ${COL_DUENO} !min-h-8 !gap-x-2.5`}>
              <Dueno dueno={x.dueno} breve />
              <span className="text-right tabular-nums">{horas(x.min)}</span>
              <span className="text-right tabular-nums">{`${parte(x.min, total)} %`}</span>
            </div>
          ))}
          <div className={`${TOTAL} ${COL_DUENO} !gap-x-2.5`}>
            <span>Total</span>
            <span className="text-right tabular-nums">{horas(total)}</span>
            <span className="text-right tabular-nums">{total > 0 ? '100 %' : '0 %'}</span>
          </div>

          <h3 className="mb-0.5 mt-[22px] text-headline text-foreground">Lo de Mantención</h3>
          {p.mant ? (
            <>
              <Clave k="Fallas" v={int(p.mant.fallas)} nota={p.mant.fallas > 0 ? `${horas(p.mant.fallaMin)} de máquina` : undefined} />
              {p.mant.mttr != null && <Clave k="Minutos por falla" v={`${dec(p.mant.mttr)} min`} nota={p.mant.mttrPrevio != null ? `antes ${dec(p.mant.mttrPrevio)}` : undefined} />}
              {p.mant.dispPct != null && <Clave k="Disponibilidad técnica" v={`${dec(p.mant.dispPct)} %`} />}
            </>
          ) : (
            <p className="border-t border-border pt-2 text-footnote text-muted-foreground">Shoplogix no publicó los datos de Mantención de este turno.</p>
          )}
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col">
          <header className="flex flex-none items-center justify-between gap-5 border-b border-border px-7 pb-3 pt-3.5">
            <h2 className="text-title2">{titulo}</h2>
            <button type="button" aria-label="Cerrar" onClick={onClose} className={`grid size-[36px] flex-none place-items-center rounded-ctl bg-muted-foreground/15 text-foreground ${FOCO}`}>
              <X className="size-3.5" aria-hidden />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 pb-[18px] pt-4 tabular-nums">
            <Seccion titulo="Qué la detuvo">
              {p.causas.length === 0 ? (
                <p className="border-t border-border py-2 text-subhead text-muted-foreground">Sin causas registradas en el turno.</p>
              ) : (
                <>
                  <div className={`${CAB} ${COL_CAUSAS}`}><span>Causa</span><span>Dueño</span><span className="text-right">Veces</span><span className="text-right">Min. de línea</span><span className="text-right">Parte</span></div>
                  {p.causas.map((c) => (
                    <div key={c.causa} className={`${FILA} ${COL_CAUSAS}`}>
                      <span className="min-w-0 truncate" title={c.causa}>{c.causa}</span>
                      <Dueno dueno={c.dueno} />
                      <span className="text-right">{int(c.veces)}</span>
                      <span className="text-right">{horas(c.min)}</span>
                      <span className="text-right">{`${parte(c.min, totalCausas)} %`}</span>
                    </div>
                  ))}
                  <div className={`${TOTAL} ${COL_CAUSAS}`}><span>Total</span><span /><span className="text-right">{int(vecesCausas)}</span><span className="text-right">{horas(totalCausas)}</span><span className="text-right">100 %</span></div>
                </>
              )}
              {p.programadas.length > 0 && (
                <p className="mt-2 text-footnote text-muted-foreground">
                  {`Programado, no cuenta como pérdida: ${p.programadas.map((c) => `${nombreCausa(c.causa).toLowerCase()} ${horas(c.min)}`).join(', ')}.`}
                </p>
              )}
            </Seccion>

            {p.mantPorMaquina.length > 0 && (
              <Seccion titulo="Fallas de equipos por máquina" className="mt-6">
                <div className={`${CAB} ${COL_MAQ}`}><span>Máquina</span><span className="text-right">Fallas</span><span className="text-right">Min. falla</span><span className="text-right">Micro</span><span className="text-right">Disponib.</span><span className="text-right">MTTR</span></div>
                {p.mantPorMaquina.map((m) => (
                  <div key={m.name} className={`${FILA} ${COL_MAQ}`}>
                    <span className="min-w-0 truncate">{m.name}</span>
                    <span className="text-right">{int(m.fallas)}</span>
                    <span className="text-right">{horas(m.fallaMin)}</span>
                    <span className="text-right">{`${int(m.microN)} · ${horas(m.microMin)}`}</span>
                    <span className="text-right">{m.disp != null ? `${dec(m.disp)} %` : '—'}</span>
                    <span className="text-right">{m.mttr != null ? `${dec(m.mttr)} min` : '—'}</span>
                  </div>
                ))}
                <div className={`${TOTAL} ${COL_MAQ}`}>
                  <span>Línea</span>
                  <span className="text-right">{int(tm.fallas)}</span>
                  <span className="text-right">{horas(tm.fallaMin)}</span>
                  <span className="text-right">{`${int(tm.microN)} · ${horas(tm.microMin)}`}</span>
                  <span className="text-right">{p.mant?.dispPct != null ? `${dec(p.mant.dispPct)} %` : '—'}</span>
                  <span className="text-right">{p.mant?.mttr != null ? `${dec(p.mant.mttr)} min` : '—'}</span>
                </div>
              </Seccion>
            )}

            <Seccion titulo="Cada falla" className="mt-6">
              {eventos.length === 0 ? (
                <p className="border-t border-border py-2 text-subhead text-muted-foreground">Sin fallas de equipos en el turno.</p>
              ) : (
                <>
                  <div className={`${CAB} ${COL_FALLAS}`}><span>Hora</span><span>Máquina</span><span>Causa</span><span className="text-right">Min.</span></div>
                  {eventos.map((e, i) => (
                    <div key={`${e.desde}-${i}`} className={`${FILA} ${COL_FALLAS}`}>
                      <span>{`${hhmm(e.desde)}–${hhmm(e.hasta)}`}</span>
                      <span className="min-w-0 truncate">{e.maquina}</span>
                      <span className="min-w-0 truncate">{e.causas.join(' · ') || 'Falla técnica'}</span>
                      <span className="text-right">{horas(e.min)}</span>
                    </div>
                  ))}
                  <div className={`${TOTAL} ${COL_FALLAS}`}><span>{`${eventos.length} ${eventos.length === 1 ? 'falla' : 'fallas'}`}</span><span /><span /><span className="text-right">{horas(minFallas)}</span></div>
                </>
              )}
            </Seccion>

            <p className="mt-2.5 text-footnote text-muted-foreground">
              {porMaquina
                ? `Minutos de línea: una máquina detenida de ${porMaquina.maquinas} cuenta 1/${porMaquina.maquinas}. Las fallas se cuentan en minutos de máquina. Cada fila se redondea al minuto.`
                : 'Las fallas se cuentan en minutos de máquina. Cada fila se redondea al minuto.'}
            </p>
          </div>
        </div>
      </div>
    </Sheet>
  )
}
