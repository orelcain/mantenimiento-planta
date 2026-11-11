import { ACCION_CUADRANTE, agruparComentarios, comentariosDe, nivelPrioridad, type CalculoJK, type InformeJK, type TurnoJK } from '@/services/shoplogix/jackKnife'
import { causasAtacar } from '@/services/shoplogix/jackKnifeLectura'
import { dec1 } from '@/utils/formatoNumeros'
import { LECTURA_CUERPO, SeccionLectura } from '@/components/piel/Lectura'
import { TJK_BOTON, TJK_CUERPO, TJK_NOTA } from './jackKnifeTablero'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListCell, ListGroup } from '@/components/piel'
import { AcrLectura } from '@/components/acr/AcrLectura'
import type { Acr } from '@/services/acr/acr.types'
import type { ResumenCausaJK } from '@/services/acr/acrHistorial'

/** Estado del análisis de una causa, en la fila de «Atacar ahora». */
function PillAnalisis({ r }: { r: ResumenCausaJK | undefined }) {
  if (!r || r.total === 0) return <Marca punto="bg-warning">Sin análisis</Marca>
  if (r.fuertesHechas > 0) return <Marca punto="bg-success">Acción fuerte hecha</Marca>
  return <span className="text-footnote text-muted-foreground">{`${r.total} análisis`}</span>
}

/** Punto de color de estado + palabra. Sin píldora. */
function Marca({ punto, children }: { punto: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-footnote text-foreground">
      <span className={`size-2 shrink-0 rounded-full ${punto}`} aria-hidden="true" />
      {children}
    </span>
  )
}

/** Los análisis de la causa seleccionada; cada fila abre la lectura, que lleva a Causa raíz. */
function SeccionAnalisis({ causa, resumen }: { causa: string; resumen: ResumenCausaJK }) {
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState<Acr | null>(null)
  return (
    <section className="border-t-2 border-primary pt-3">
      <h3 className="text-headline font-semibold">{causa}</h3>
      <p className="text-footnote text-muted-foreground">
        {`${resumen.total} análisis, ${resumen.fuertesHechas} con acción fuerte hecha`}
      </p>
      <div className="mt-2">
        <ListGroup>
          {resumen.acrs.map((a) => (
            <ListCell
              key={a.id}
              title={a.equipo}
              subtitle={a.definicion}
              value={a.estado === 'cerrado' ? 'Cerrado' : 'Borrador'}
              chevron
              onClick={() => setAbierto(a)}
            />
          ))}
        </ListGroup>
      </div>
      {abierto && (
        <AcrLectura
          open
          acr={abierto}
          onClose={() => setAbierto(null)}
          onEditar={() => navigate(`/causa-raiz#acr=${abierto.id}`)}
        />
      )}
    </section>
  )
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)

/**
 * «Atacar ahora» en modo lectura (piel Apple): una fila con filete por causa, con
 * «Analizar» con borde a la derecha; abajo, la recomendación y los comentarios más
 * repetidos. Cierra con la nota de la causa crónica más costosa.
 */
export function AtacarAhoraLectura({ calc, turnos, elegirCausa = () => {}, analisis, onAnalizar, pc = false }: {
  calc: CalculoJK; turnos: TurnoJK[]; elegirCausa?: (k: string) => void
  analisis?: ReadonlyMap<string, ResumenCausaJK>
  onAnalizar?: (causa: string) => void
  /** Tablero de PC: una línea por causa (estado y el comentario más repetido), botón de 36 px. */
  pc?: boolean
}) {
  const atacar = causasAtacar(calc)
  const cronica = [...calc.pts].filter(p => p.q === 'cro').sort((a, b) => b.min - a.min)[0]
  const comentariosCronica = cronica ? comentariosDe(turnos, calc.desde, calc.hasta, cronica.k, Infinity) : []
  const masRepetido = comentariosCronica.length ? agruparComentarios(comentariosCronica)[0] : undefined
  if (pc) {
    return <section data-testid="jk-atacar">
      <h2 className={TJK_NOTA + ' m-0 mb-1'}>Atacar ahora</h2>
      {!atacar.length && <p className={TJK_CUERPO + ' border-t border-border py-2 text-muted-foreground'}>Sin causas de nivel 1 o 2.</p>}
      {atacar.map(p => {
        const r = analisis?.get(p.k)
        const estado = !analisis ? '' : !r || r.total === 0 ? 'Sin análisis. ' : r.fuertesHechas > 0 ? 'Acción fuerte hecha. ' : `${r.total} análisis. `
        const top = agruparComentarios(comentariosDe(turnos, calc.desde, calc.hasta, p.k, Infinity))[0]
        return <div key={p.k} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-border py-2 ${TJK_CUERPO}`}>
          <div className="min-w-0">
            <p className="m-0">
              <button type="button" className="text-left font-semibold text-ink-crit hover:underline" onClick={() => elegirCausa(p.k)}>{p.k}</button>
              <span>, {p.ev} {plural(p.ev, 'detención', 'detenciones')} de {dec1(p.mttr)} min</span>
            </p>
            {(estado || top) && <p className={TJK_NOTA + ' m-0 truncate'}>{estado}{top ? `${top.texto} ×${top.n}` : ''}</p>}
          </div>
          {onAnalizar && (r?.total ?? 0) === 0 && (
            <button type="button" className={TJK_BOTON} onClick={() => onAnalizar(p.k)}>Analizar</button>
          )}
        </div>
      })}
    </section>
  }
  return <SeccionLectura titulo="Atacar ahora" testId="jk-atacar">
    {!atacar.length && <p className="text-muted-foreground">Sin causas de nivel 1 o 2.</p>}
    {atacar.map(p => {
      const r = analisis?.get(p.k)
      const estado = !analisis ? '' : !r || r.total === 0 ? 'Sin análisis. ' : r.fuertesHechas > 0 ? 'Acción fuerte hecha. ' : `${r.total} análisis. `
      return <div key={p.k} className={`border-t border-border py-2.5 ${LECTURA_CUERPO}`}>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0">
            <button type="button" className="text-left font-semibold text-ink-crit hover:underline min-h-11 lg:min-h-0" onClick={() => elegirCausa(p.k)}>{p.k}</button>
            <span>, {p.ev} {plural(p.ev, 'detención', 'detenciones')} de {dec1(p.mttr)} min</span>
          </p>
          {onAnalizar && (r?.total ?? 0) === 0 && (
            <button type="button" className="shrink-0 rounded-ctl border border-border px-3 min-h-11 text-brand-ink lg:min-h-0 lg:py-1" onClick={() => onAnalizar(p.k)}>Analizar</button>
          )}
        </div>
        <p className="mt-1">{estado}{ACCION_CUADRANTE[p.q]}</p>
        {agruparComentarios(comentariosDe(turnos, calc.desde, calc.hasta, p.k, Infinity)).slice(0, 2).map(g => <p key={g.texto} className="mt-1 break-words text-footnote text-muted-foreground">{g.texto} ×{g.n}</p>)}
      </div>
    })}
    {cronica && masRepetido && <p className="mt-3 text-footnote text-muted-foreground">
      <span className="font-semibold text-foreground">{cronica.k}, {comentariosCronica.length} {plural(comentariosCronica.length, 'comentario', 'comentarios')}.</span>{' '}
      El más repetido: {masRepetido.texto.replace(/[.!?…]+$/, '')}.
    </p>}
  </SeccionLectura>
}

export function JackKnifeListas({ calc, informe, turnos, elegirCausa = () => {}, lamina = false, analisis, causaSel = null, onAnalizar }: {
  calc: CalculoJK; informe: InformeJK | null; turnos: TurnoJK[]; elegirCausa?: (k: string) => void; lamina?: boolean
  /** Análisis de causa raíz por causa. Sin él (lámina, Yal) no aparecen las marcas de análisis. */
  analisis?: ReadonlyMap<string, ResumenCausaJK>
  causaSel?: string | null
  /** «Analizar» en «Atacar ahora» para una causa sin análisis. Sin él no aparece el botón. */
  onAnalizar?: (causa: string) => void
}) {
  const atacar = [...calc.pts].filter(p => nivelPrioridad(p, calc.un, calc.um) <= 2).sort((a,b) => nivelPrioridad(a, calc.un, calc.um) - nivelPrioridad(b, calc.un, calc.um) || b.min-a.min).slice(0,2)
  const analisisSel = causaSel ? analisis?.get(causaSel) : undefined
  return <div className="space-y-4 text-footnote" style={lamina ? { fontSize: 20, lineHeight: 1.4 } : undefined}>
    <section className="border-t-2 border-warning pt-3">
      <h3 className="text-headline font-semibold" style={lamina ? { fontSize: 26 } : undefined}>Atacar ahora</h3>
      {!atacar.length && <p className="text-muted-foreground">Sin causas de nivel 1 o 2.</p>}
      {atacar.map(p => <div key={p.k} className="py-2">
        <button className="min-h-[44px] text-left font-semibold" onClick={() => elegirCausa(p.k)}>{p.k} · <span className="tabular-nums">{p.ev} det. · {dec1(p.mttr)} min</span></button>
        {analisis && (
          <div className="my-1 flex min-h-[44px] items-center justify-between gap-3">
            <PillAnalisis r={analisis.get(p.k)} />
            {onAnalizar && (analisis.get(p.k)?.total ?? 0) === 0 && (
              <button type="button" className="min-h-[44px] shrink-0 font-medium text-primary" onClick={() => onAnalizar(p.k)}>
                Analizar
              </button>
            )}
          </div>
        )}
        <p>{ACCION_CUADRANTE[p.q]}</p>
        {agruparComentarios(comentariosDe(turnos, calc.desde, calc.hasta, p.k, Infinity)).slice(0,lamina ? 1 : 2).map(g => <p key={g.texto} className="mt-1 break-words text-muted-foreground">{lamina && g.texto.length > 90 ? g.texto.slice(0, 88).trimEnd() + '…' : g.texto} ×{g.n}</p>)}{/* sin line-clamp: html2canvas no lo soporta y corta el texto */}
      </div>)}
    </section>
    {causaSel && analisisSel && <SeccionAnalisis causa={causaSel} resumen={analisisSel} />}
    {(['mejoraron', 'empeoraron'] as const).map(tipo =><section key={tipo} className={'border-t-2 pt-3 ' + (tipo === 'mejoraron' ? 'border-success' : 'border-destructive')}>
      <h3 className="text-headline font-semibold" style={lamina ? { fontSize: 26 } : undefined}>{tipo === 'mejoraron' ? 'Mejoraron' : 'Empeoraron'} ({informe?.[tipo].length ?? 0})</h3>
      {!informe && <p className="text-muted-foreground">Sin comparación con eventos.</p>}
      {informe?.[tipo].slice(0,3).map(k => {
        const f = informe.filas.find(f => f.causa === k)!
        return <button key={k} className="block min-h-[44px] text-left tabular-nums" onClick={() => elegirCausa(k)}>{k}: {dec1(f.minAntes10)} → {dec1(f.minAhora10)} min cada 10 turnos</button>
      })}
      {(informe?.[tipo].length ?? 0) > 3 && <p className="text-muted-foreground">y {informe![tipo].length - 3} más</p>}
    </section>)}
    {informe && !lamina && <p className="text-caption text-muted-foreground">{[
      informe.aparecieron.length ? 'Aparecieron: ' + informe.aparecieron.join(', ') : '',
      informe.sinHistoria.length ? 'Sin historia: ' + informe.sinHistoria.join(', ') : '',
      informe.desaparecieron.length ? 'Desaparecieron: ' + informe.desaparecieron.join(', ') : '',
    ].filter(Boolean).join(' · ')}</p>}
  </div>
}
