/**
 * El resto del Monitor en PC como ventana expediente (opción A del lienzo «Resto del Monitor en PC», 10-11-2026,
 * https://claude.ai/artifact/63YCbtUkkuQV1EDVKAxBcg): «Piezas del turno», «Ritmo», «Al cierre» y «Máquinas». A la izquierda la
 * cifra y lo que la acompaña; a la derecha un título que dice el dato y las tablas que lo respaldan, cada una cerrada con su
 * total. Misma forma que `CifrasExpedientePC` y `DetalleExpedientePC`. En celular siguen la capa y la hoja de siempre.
 *
 * El contenido vive en un componente hijo de `Sheet`: con la ventana cerrada no se monta, así las cifras vivas no se suscriben
 * al reloj mientras nadie mira.
 */
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Sheet } from '@/components/piel'
import type { HourlyRow } from '@/services/shoplogix/monitorHourly'
import { CAB, FILA, FOCO, TOTAL } from './expedienteTabla'
import { etiquetaTurno } from './cifrasExpediente'
import { contraMetaHora, pctMeta, tituloCierre, tituloMaquinas, tituloPiezas, tituloRitmo, totalHoras } from './turnoExpediente'
import { useCifrasVivas } from './useCifrasVivas'
import { horasEnCuadro } from './horaAHoraViva'
import { etiquetaMaquina } from './ritmoVivo'
import { adelanteAtras, relojDe } from './ejeTurno'
import { RitmoTablaPC } from './RitmoBaaders'
import { dec, hhmm, horas, int, type MonitorV2Props } from './MonitorV2'
import { filasDeBaader } from './baadersMinuto'
import type { RelojDeDatos } from './useRelojDeDatos'

// ── La forma común ───────────────────────────────────────────────────────────

function Forma({ resumen, costado, titulo, onClose, children }: { resumen: string; costado: ReactNode; titulo: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="v2-vars grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]">
      <aside aria-label={resumen} className="min-h-0 overflow-y-auto overscroll-contain border-r border-border bg-background px-5 py-[18px] tabular-nums">{costado}</aside>
      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex flex-none items-center justify-between gap-5 border-b border-border px-7 pb-3 pt-3.5">
          <h2 className="text-title2">{titulo}</h2>
          <button type="button" aria-label="Cerrar" onClick={onClose} className={`grid size-[36px] flex-none place-items-center rounded-ctl bg-muted-foreground/15 text-foreground ${FOCO}`}>
            <X className="size-3.5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 pb-[18px] pt-4 tabular-nums">{children}</div>
      </div>
    </div>
  )
}

/** Lo primero del costado: qué es y de qué turno, la cifra a 22 px y su referencia. */
function Cabeza({ rotulo, p, cifra, nota }: { rotulo: string; p: Pick<MonitorV2Props, 'turnoId' | 'cerrado'>; cifra: ReactNode; nota?: ReactNode }) {
  const turno = etiquetaTurno(p.turnoId)
  return (
    <>
      <p className="text-footnote text-muted-foreground">{`${rotulo}${turno ? ` · ${turno}` : ''}${p.cerrado ? '' : ', en curso'}`}</p>
      <p className="mt-3 text-title2 text-foreground">{cifra}</p>
      {nota && <p className="mb-4 text-footnote text-muted-foreground">{nota}</p>}
    </>
  )
}

function Clave({ k, v, nota }: { k: string; v: ReactNode; nota?: string }) {
  return (
    <div className="flex min-h-8 items-baseline justify-between gap-2.5 border-t border-border pt-1.5 text-subhead text-foreground">
      <span>{k}</span>
      <span className="text-right">{v}{nota && <span className="ml-1 text-footnote text-muted-foreground">{nota}</span>}</span>
    </div>
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

const H3 = 'mb-0.5 mt-[22px] text-headline text-foreground'

// ── Piezas del turno ─────────────────────────────────────────────────────────

type Previo = { label: string; modo: 'al-cierre' | 'a-esta-hora'; piezas: number; diff: number }

export interface PiezasExpedientePCProps {
  abierta: boolean
  onClose: () => void
  p: MonitorV2Props
  /** Las piezas que dice la franja (`piezasMostradas`): con el turno cerrado, o sin reloj, la cifra de todo. */
  mostradas: number
  /** La curva acumulada contra la meta (`Curva` de MonitorV2, ya armada). */
  grafico: ReactNode
  /** El turno anterior en el instante del cuadro (la misma cuenta de la leyenda del gráfico) y su respaldo; null sin curva previa. */
  previo: { calc: (tMs: number | null, hechas: number) => Previo | null; respaldo: Previo } | null
  /** Sin curva con qué alinear el minuto: «a esta altura» de siempre (`p.vsAyer`). */
  vsAyer: { label: string; pieces: number; diff: number } | null
}

export function PiezasExpedientePC(props: PiezasExpedientePCProps) {
  return (
    <Sheet open={props.abierta} onClose={props.onClose} presentacionPC="libre" title="Piezas del turno">
      <CuerpoPiezas {...props} />
    </Sheet>
  )
}

function CuerpoPiezas({ onClose, p, mostradas, grafico, previo, vsAyer }: PiezasExpedientePCProps) {
  const vivas = useCifrasVivas()
  const enVivo = !p.cerrado && vivas != null
  const hechas = enVivo ? Math.round(vivas.hechas) : mostradas
  const meta = p.meta && p.meta > 0 ? p.meta : null
  const pct = pctMeta(hechas, meta)
  const prev = previo ? ((enVivo ? previo.calc(vivas.tMs, vivas.hechas) : null) ?? previo.respaldo) : null

  const base = p.horas
  const { filas, porMaquina } = base && enVivo && vivas
    ? horasEnCuadro({ filas: base.filas, porMaquina: base.porMaquina, hechas: vivas.hechas, hechasPorMaquina: vivas.porMaquina, tMs: vivas.tMs })
    : { filas: base?.filas ?? [], porMaquina: base?.porMaquina ?? [] }
  const metaHora = base?.metaPorHora ?? null
  const tot = totalHoras(filas, porMaquina, metaHora)
  const titulo = tituloPiezas(hechas, meta, filas)
  const piezasDe = (nombre: string, respaldo: number) => vivas?.porMaquina?.find((m) => m.nombre === nombre)?.valor ?? respaldo

  const costado = (
    <>
      <Cabeza rotulo="Piezas del turno" p={p} cifra={`${int(hechas)} pz`} nota={meta != null ? `de una meta de ${int(meta)}` : 'sin meta cargada para este turno'} />
      {pct != null && <Clave k="Hecho" v={`${pct} %`} />}
      {meta != null && (hechas >= meta
        ? <Clave k="Sobre la meta" v={hechas > meta ? `${int(hechas - meta)} pz` : 'en la meta'} />
        : <Clave k={p.cerrado ? 'Faltaron' : 'Faltan'} v={`${int(meta - hechas)} pz`} />)}
      {!p.cerrado && vivas?.cuota != null && <Clave k={`Meta a las ${vivas.tMs != null ? relojDe(vivas.tMs) : 'esta hora'}`} v={`${int(vivas.cuota)} pz`} />}
      {/* El turno anterior y, en su propia fila, dónde queda este contra él: «6.685 atrás» junto a las piezas del otro se leía al revés. */}
      {prev && (
        <>
          <Clave k={`${prev.label} ${prev.modo === 'al-cierre' ? 'al cierre' : 'a esta hora'}`} v={`${int(prev.piezas)} pz`} />
          <Clave k={p.cerrado ? 'Este turno, contra él' : 'Hoy, contra él'} v={adelanteAtras(prev.diff)} />
        </>
      )}
      {!prev && vsAyer && (
        <>
          <Clave k={`${vsAyer.label} a esta hora`} v={`${int(vsAyer.pieces)} pz`} />
          <Clave k="Hoy, contra él" v={adelanteAtras(vsAyer.diff)} />
        </>
      )}

      {p.maquinas.length > 1 && (
        <>
          <h3 className={H3}>Por máquina</h3>
          <div role="table" aria-label="Piezas por máquina">
            <div role="row" className={`${CAB} grid-cols-[minmax(0,1fr)_80px]`}><span role="columnheader">Máquina</span><span role="columnheader" className="text-right">Piezas</span></div>
            {p.maquinas.map((m) => (
              <div key={m.name} role="row" className={`${FILA} grid-cols-[minmax(0,1fr)_80px] !min-h-8`}>
                <span role="cell" className="min-w-0 truncate">{m.name}</span>
                <span role="cell" className="text-right">{int(piezasDe(m.name, m.piezas))}</span>
              </div>
            ))}
            <div role="row" className={`${TOTAL} grid-cols-[minmax(0,1fr)_80px]`}><span role="cell">Línea</span><span role="cell" className="text-right">{int(hechas)}</span></div>
          </div>
        </>
      )}
    </>
  )

  const cols = `116px minmax(0,1fr) ${porMaquina.map(() => '84px').join(' ')}${metaHora != null ? ' 112px' : ''}`
  const est = { gridTemplateColumns: cols }
  const marca = (h: HourlyRow) => (h.partial && !p.cerrado ? 'en curso' : null)

  return (
    <Forma resumen="Resumen de las piezas del turno" costado={costado} titulo={titulo} onClose={onClose}>
      {grafico && <Seccion titulo="Acumulado contra la meta">{grafico}</Seccion>}
      {filas.length > 0 && (
        <Seccion titulo="Hora a hora" className={grafico ? 'mt-6' : ''}>
          <div role="table" aria-label="Piezas por hora de la línea y de cada máquina">
            <div role="row" className={CAB} style={est}>
              <span role="columnheader">Hora</span>
              <span role="columnheader" className="text-right">Línea</span>
              {porMaquina.map((m) => <span key={m.nombre} role="columnheader" className="truncate text-right">{etiquetaMaquina(m.nombre)}</span>)}
              {metaHora != null && <span role="columnheader" className="text-right">Contra la meta</span>}
            </div>
            {filas.map((h, i) => {
              const c = metaHora != null ? contraMetaHora(h, metaHora) : null
              const m = marca(h)
              return (
                <div key={h.hourStart} role="row" className={FILA} style={est}>
                  <span role="cell">{`${hhmm(h.from)}–${hhmm(h.to)}`}{m && <span className="ml-1.5 text-footnote text-muted-foreground">{m}</span>}</span>
                  <span role="cell" className="text-right">{int(h.pieces)}</span>
                  {porMaquina.map((mq) => <span key={mq.nombre} role="cell" className="text-right">{mq.piezas[i] != null ? int(mq.piezas[i]!) : '—'}</span>)}
                  {c != null && <span role="cell" className="text-right" style={c < 0 ? { color: 'var(--v2-mal-texto)' } : undefined}>{c > 0 ? `+${int(c)}` : c < 0 ? `−${int(-c)}` : '0'}</span>}
                </div>
              )
            })}
            <div role="row" className={TOTAL} style={est}>
              <span role="cell">Turno</span>
              <span role="cell" className="text-right">{int(tot.linea)}</span>
              {tot.maquinas.map((v, i) => <span key={porMaquina[i]!.nombre} role="cell" className="text-right">{int(v)}</span>)}
              {tot.contraMeta != null && <span role="cell" className="text-right" style={tot.contraMeta < 0 ? { color: 'var(--v2-mal-texto)' } : undefined}>{tot.contraMeta > 0 ? `+${int(tot.contraMeta)}` : tot.contraMeta < 0 ? `−${int(-tot.contraMeta)}` : '0'}</span>}
            </div>
          </div>
          <p className="mt-2 text-footnote text-muted-foreground">
            {metaHora != null && `Contra la meta: piezas de la hora menos la meta de ${int(metaHora)} pz por hora, en proporción a los minutos que cubre la fila. `}
            {tot.linea !== hechas && `Las horas suman ${int(tot.linea)} pz: llegan hasta el último tramo de 5 min que Shoplogix sincronizó; las ${int(hechas)} pz del turno son la cifra de la franja.`}
          </p>
        </Seccion>
      )}
    </Forma>
  )
}

// ── Ritmo, Al cierre y Máquinas ──────────────────────────────────────────────

export type ClaveVentana = 'ritmo' | 'cierre' | 'maquinas'

export interface TurnoExpedientePCProps {
  clave: ClaveVentana | null
  onClose: () => void
  p: MonitorV2Props
  reloj: RelojDeDatos
}

const NOMBRE: Record<ClaveVentana, string> = { ritmo: 'Ritmo', cierre: 'Al cierre', maquinas: 'Máquinas' }

export function TurnoExpedientePC(props: TurnoExpedientePCProps) {
  return (
    <Sheet open={props.clave != null} onClose={props.onClose} presentacionPC="libre" title={props.clave ? NOMBRE[props.clave] : ''}>
      {props.clave === 'ritmo' && <CuerpoRitmo {...props} />}
      {props.clave === 'cierre' && <CuerpoCierre {...props} />}
      {props.clave === 'maquinas' && <CuerpoMaquinas {...props} />}
    </Sheet>
  )
}

function CuerpoRitmo({ onClose, p, reloj }: TurnoExpedientePCProps) {
  const filas = filasDeBaader(p, p.eje ?? null)
  const necesario = p.ritmoPedido ?? p.ritmoNecesario
  const titulo = tituloRitmo({ ritmo: p.ritmo, necesario, normal: p.ritmoInfo.medianaCpm, cerrado: p.cerrado })
  const costado = (
    <>
      <Cabeza rotulo="Ritmo" p={p} cifra={p.ritmo != null ? `${dec(p.ritmo)} pz/min` : '—'} nota="promedio del turno, mientras la línea anda" />
      {!p.cerrado && p.ritmoMedia15 != null && <Clave k="Media 15 min" v={`${dec(p.ritmoMedia15)} pz/min`} />}
      {necesario != null && <Clave k="Necesario para la meta" v={`${dec(necesario)} pz/min`} />}
      {p.ritmoInfo.medianaCpm != null && <Clave k="Lo normal de la línea" v={`${dec(p.ritmoInfo.medianaCpm)} pz/min`} />}
      {p.ritmoInfo.mejorCpm != null && <Clave k="Mejor turno" v={`${dec(p.ritmoInfo.mejorCpm)} pz/min`} />}
      {p.setPoint != null && <Clave k="Set point" v={`${dec(p.setPoint, 0)} pz/min`} />}
      <p className="mt-2 text-footnote text-muted-foreground">
        {`«Andando» descuenta los minutos detenidos: es la velocidad real cuando la línea produce.${p.ritmoInfo.muestras ? ` Lo normal es la mediana de ${p.ritmoInfo.muestras} turnos.` : ''}${p.setPoint != null && (p.ritmoInfo.setPointMetodo || p.ritmoInfo.setPointFecha) ? ` Set point: ${[p.ritmoInfo.setPointMetodo, p.ritmoInfo.setPointFecha].filter(Boolean).join(', ')}.` : ''}`}
      </p>
    </>
  )
  return (
    <Forma resumen="Resumen del ritmo" costado={costado} titulo={titulo} onClose={onClose}>
      <RitmoTablaPC p={p} reloj={reloj} filas={filas} clases={{ cab: CAB, fila: FILA, total: TOTAL }} />
    </Forma>
  )
}

function CuerpoCierre({ onClose, p }: TurnoExpedientePCProps) {
  const vivas = useCifrasVivas()
  const meta = p.meta && p.meta > 0 ? p.meta : null
  const hechas = vivas && !p.cerrado ? Math.round(vivas.hechas) : p.piezas
  const faltan = meta != null ? Math.max(0, meta - hechas) : (p.cierre?.faltan ?? null)
  const titulo = tituloCierre(p.proyeccion, meta, p.cierre?.hora)
  const c = p.cierre
  const costado = (
    <>
      <Cabeza rotulo="Al cierre" p={p} cifra={p.proyeccion != null ? `${int(p.proyeccion)} pz` : '—'} nota={c?.hora ? `proyección hasta las ${c.hora}` : 'proyección del turno'} />
      {meta != null && <Clave k="Meta del turno" v={`${int(meta)} pz`} />}
      {faltan != null && <Clave k="Faltan para la meta" v={`${int(faltan)} pz`} />}
      {c?.quedaMin != null && <Clave k="Tiempo que queda" v={horas(c.quedaMin)} />}
      {c?.colacionMin != null && c.colacionMin > 0 && <Clave k="Colación pendiente" v={horas(c.colacionMin)} />}
    </>
  )
  const filasRitmo: Array<{ k: string; v: string; nota?: string }> = [
    ...(p.ritmoNecesario != null ? [{ k: 'Para llegar a la meta', v: `${dec(p.ritmoNecesario)} pz/min`, nota: 'en el tiempo que queda' }] : []),
    ...(c?.extraCpm != null ? [{ k: 'Con una hora extra', v: `${dec(c.extraCpm)} pz/min`, nota: c.extraFactible ? 'alcanzable' : 'fuera de alcance' }] : []),
    ...(!p.cerrado && p.ritmoMedia15 != null ? [{ k: 'La línea, últimos 15 min', v: `${dec(p.ritmoMedia15)} pz/min`, nota: 'andando' }] : []),
    ...(p.ritmo != null ? [{ k: 'La línea, promedio del turno', v: `${dec(p.ritmo)} pz/min`, nota: 'andando' }] : []),
  ]
  const est = { gridTemplateColumns: 'minmax(0,1fr) 140px minmax(0,1fr)' }
  return (
    <Forma resumen="Resumen del cierre" costado={costado} titulo={titulo} onClose={onClose}>
      {filasRitmo.length > 0 ? (
        <Seccion titulo="El ritmo que pide la meta">
          <div role="table" aria-label="Ritmo que pide la meta y ritmo de la línea">
            <div role="row" className={CAB} style={est}><span role="columnheader">Ritmo</span><span role="columnheader" className="text-right">Pz/min</span><span role="columnheader">Nota</span></div>
            {filasRitmo.map((f) => (
              <div key={f.k} role="row" className={FILA} style={est}>
                <span role="cell">{f.k}</span>
                <span role="cell" className="text-right">{f.v}</span>
                <span role="cell" className="text-muted-foreground">{f.nota ?? ''}</span>
              </div>
            ))}
          </div>
        </Seccion>
      ) : (
        <p className="border-t border-border py-2 text-subhead text-muted-foreground">Sin ritmo con qué proyectar el cierre.</p>
      )}
      <p className="mt-2 text-footnote text-muted-foreground">Proyección: piezas de ahora + el ritmo andando × los minutos productivos que quedan (sin la colación pendiente).</p>
    </Forma>
  )
}

function CuerpoMaquinas({ onClose, p }: TurnoExpedientePCProps) {
  const corriendo = p.maquinas.filter((m) => m.status === 'produciendo').length
  const piezas = p.maquinas.reduce((a, m) => a + m.piezas, 0)
  const est = { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr) 92px 92px 84px 76px' }
  const estado = (m: MonitorV2Props['maquinas'][number]) => (m.status === 'detenida'
    ? { color: 'var(--v2-mal)', texto: `${m.razon ?? 'Detenida'}${m.desdeMin != null ? `, hace ${Math.round(m.desdeMin)} min` : ''}` }
    : m.status === 'produciendo' ? { color: 'var(--v2-acento)', texto: 'Corriendo' } : { color: 'var(--v2-gris)', texto: 'Sin datos' })
  const costado = (
    <>
      <Cabeza rotulo="Máquinas" p={p} cifra={`${corriendo} de ${p.maquinas.length}`} nota="corriendo ahora" />
      <Clave k="Piezas de la línea" v={`${int(piezas)} pz`} />
      {p.ritmo != null && <Clave k="Ritmo de la línea" v={`${dec(p.ritmo)} pz/min`} nota="andando" />}
    </>
  )
  return (
    <Forma resumen="Resumen de las máquinas" costado={costado} titulo={tituloMaquinas(p.maquinas)} onClose={onClose}>
      <Seccion titulo="Cada máquina">
        <div role="table" aria-label="Estado y ritmo de cada máquina">
          <div role="row" className={CAB} style={est}>
            <span role="columnheader">Máquina</span><span role="columnheader">Estado</span>
            <span role="columnheader" className="text-right">Ahora</span><span role="columnheader" className="text-right">Promedio</span>
            <span role="columnheader" className="text-right">Piezas</span><span role="columnheader" className="text-right">Arriba</span>
          </div>
          {p.maquinas.map((m) => {
            const e = estado(m)
            return (
              <div key={m.name} role="row" className={FILA} style={est}>
                <span role="cell" className="min-w-0 truncate">{m.name}</span>
                <span role="cell" className="min-w-0 truncate"><span aria-hidden className="mr-1.5 inline-block size-[7px] rounded-full align-[1px]" style={{ background: e.color }} />{e.texto}</span>
                <span role="cell" className="text-right">{m.ahora != null ? dec(m.ahora) : '—'}</span>
                <span role="cell" className="text-right">{m.promedio != null ? dec(m.promedio) : '—'}</span>
                <span role="cell" className="text-right">{int(m.piezas)}</span>
                <span role="cell" className="text-right">{m.dispPct != null ? `${dec(m.dispPct, 0)} %` : '—'}</span>
              </div>
            )
          })}
          <div role="row" className={TOTAL} style={est}>
            <span role="cell">Línea</span><span role="cell" className="font-normal">{`${corriendo} de ${p.maquinas.length} corriendo`}</span>
            <span role="cell" /><span role="cell" className="text-right">{p.ritmo != null ? dec(p.ritmo) : '—'}</span>
            <span role="cell" className="text-right">{int(piezas)}</span><span role="cell" />
          </div>
        </div>
        <p className="mt-2 text-footnote text-muted-foreground">Ahora y Promedio en piezas por minuto. Arriba: % del turno con la máquina disponible.</p>
      </Seccion>
    </Forma>
  )
}
