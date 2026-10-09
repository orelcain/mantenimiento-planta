/**
 * Practicar: «se encendió el LED N, ¿qué es?» y «se activa X, ¿qué LED prende?», sobre un
 * recorte del dibujo real de la regleta (solo números, sin los nombres, para no regalar la
 * respuesta). Racha y mejor racha quedan en el teléfono: son el registro honesto de cuánto
 * domina la persona la tarjeta, sin inventar más métricas.
 */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/piel'
import type { Pregunta, Texto } from '@/data/baader142A3c'
import { cn } from '@/lib/utils'
import {
  colorLed,
  guardarRacha,
  leerRacha,
  nuevoQuiz,
  recorteRegleta,
  reiniciar,
  responder,
  siguiente,
  type ModeloA3c,
} from '@/utils/aprendizaje/a3c'
import { CapaTextos } from './LienzoA3c'

function Recorte({ modelo, dibujo, textos, leds, mostrar, alto }: { modelo: ModeloA3c; dibujo: string; textos: Texto[]; leds: number[]; mostrar: boolean; alto?: string }) {
  const rc = recorteRegleta(modelo, leds[0] ?? 0)
  if (!rc) return null
  const [x, y, w, h] = rc.viewBox
  return (
    <figure>
      <div className="rounded-card bg-card p-2">
        <svg
          viewBox={`${x} ${y} ${w} ${h}`}
          className={cn('block h-auto w-full', alto ?? 'max-h-[430px]')}
          style={{ ['--escala' as string]: 2 }}
          role="img"
          aria-label={`Regleta ${rc.regleta.desde}–${rc.regleta.hasta} del plano${mostrar && leds.length ? `, LED ${leds.join(', ')} encendido` : ''}`}
        >
          <g className="a3c-dibujo" dangerouslySetInnerHTML={{ __html: dibujo }} />
          <g className="a3c-dibujo">
            <CapaTextos textos={textos} idioma="or" soloNumeros />
          </g>
          {mostrar &&
            leds.map(n => {
              const l = modelo.bornes.get(n)?.led
              if (!l) return null
              return (
                <g key={n} className={cn('a3c-led a3c-quiz', colorLed(n) === 'g' && 'a3c-verde')} data-led={n}>
                  <circle className="a3c-halo" cx={l.x} cy={l.y} r={6} />
                  <circle className="a3c-anillo" cx={l.x} cy={l.y} r={4} />
                  <circle className="a3c-nucleo" cx={l.x} cy={l.y} r={2.7} />
                </g>
              )
            })}
        </svg>
      </div>
      <figcaption className="mt-1.5 text-nota text-muted-foreground">
        <span className="font-mono">X5 {rc.regleta.desde}–{rc.regleta.hasta}</span> · hoja 23/45
      </figcaption>
    </figure>
  )
}

export interface QuizA3cProps {
  modelo: ModeloA3c
  dibujo: string
  textos: Texto[]
  preguntas: Pregunta[]
  dosColumnas: boolean
  /** Vuelve al modo Explorar (estado vacío). */
  onVolver?: () => void
}

export function QuizA3c({ modelo, dibujo, textos, preguntas, dosColumnas, onVolver }: QuizA3cProps) {
  const [s, setS] = useState(() => {
    const r = leerRacha()
    return nuevoQuiz(preguntas.length, r.racha, r.mejor)
  })
  useEffect(() => guardarRacha(s.racha, s.mejor), [s.racha, s.mejor])

  const total = s.orden.length
  const q = preguntas[s.orden[s.pos] ?? -1]
  const respondida = s.elegida !== null

  const cabecera = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-footnote text-muted-foreground">Pregunta {s.pos + 1} de {total}</span>
        <span className="font-mono text-footnote font-semibold tabular-nums text-muted-foreground" data-testid="racha">
          Racha {s.racha} · mejor {s.mejor}
        </span>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden>
        {s.orden.map((_, i) => (
          <i
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full',
              s.aciertos[i] === true ? 'bg-ink-ok' : s.aciertos[i] === false ? 'bg-ink-crit' : i === s.pos ? 'bg-primary' : 'bg-muted',
            )}
          />
        ))}
      </div>
    </>
  )

  const errores = useMemo(() => s.orden.filter((_, i) => s.aciertos[i] === false), [s.orden, s.aciertos])

  if (s.revision) {
    const ok = s.aciertos.filter(Boolean).length
    return (
      <div className={cn('mt-4', dosColumnas && 'mx-auto max-w-[560px]')}>
        <div className="rounded-card bg-card p-4">
          <p className="text-footnote text-muted-foreground">Resultado de la ronda</p>
          <p className="mt-1 font-mono text-stat tabular-nums">
            {ok} <span className="font-sans text-headline font-normal text-muted-foreground">de {total}</span>
          </p>
          <p className="mt-2 font-mono text-footnote font-semibold text-muted-foreground">Mejor racha: {s.mejor}</p>
        </div>
        {errores.length > 0 && (
          <div className="mt-5">
            <h3 className="px-4 pb-2 text-subhead font-semibold text-muted-foreground">Para repasar</h3>
            <ul className="overflow-hidden rounded-card bg-card">
              {errores.map(i => {
                const p = preguntas[i]
                if (!p) return null
                return (
                  <li key={i} className="flex gap-3 px-4 py-3">
                    <span className="min-w-[44px] font-mono font-semibold text-ink-crit">{p.ops[p.ok]?.[0]}</span>
                    <span className="min-w-0 text-subhead">
                      {p.q}
                      <small className="block text-footnote text-muted-foreground">{p.why}</small>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          {errores.length > 0 && <Button onClick={() => setS(x => reiniciar(x, preguntas.length, true))}>Repetir los errores</Button>}
          <Button variant={errores.length ? 'tinted' : 'filled'} onClick={() => setS(x => reiniciar(x, preguntas.length, false))}>
            Ronda nueva
          </Button>
        </div>
      </div>
    )
  }
  if (!q) {
    return (
      <div className="mt-4 rounded-card bg-card p-4" role="status">
        <p className="text-subhead">No hay preguntas de práctica disponibles para este diseño.</p>
        {onVolver && (
          <Button className="mt-3" variant="tinted" onClick={onVolver}>
            Volver a explorar
          </Button>
        )}
      </div>
    )
  }

  const ledsVisibles = respondida && q.after ? q.after : q.lit
  const ref = q.lit.length ? q.lit : q.after ?? []
  // En PC el recorte crece con el alto de la ventana (descontada la cabecera); en el teléfono, 430 px como siempre.
  const tablero = (
    <Recorte
      modelo={modelo}
      dibujo={dibujo}
      textos={textos}
      leds={ledsVisibles.length ? ledsVisibles : ref}
      mostrar={ledsVisibles.length > 0}
      alto={dosColumnas ? 'max-h-[max(430px,calc(100dvh-260px))]' : undefined}
    />
  )
  const opciones = (
    <div className="flex flex-col gap-2" role="group" aria-label="Respuestas">
      {q.ops.map(([cod, desc], i) => {
        const estado = respondida ? (i === q.ok ? 'ok' : i === s.elegida ? 'ko' : '') : ''
        return (
          <button
            key={i}
            type="button"
            disabled={respondida}
            onClick={() => setS(x => responder(x, preguntas, i))}
            className={cn(
              'flex min-h-[52px] w-full items-center gap-2.5 rounded-ctl bg-card px-3.5 py-2 text-left text-subhead leading-tight',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default',
              estado === 'ok' && 'bg-ink-ok/[0.12] text-ink-ok',
              estado === 'ko' && 'bg-ink-crit/[0.12] text-ink-crit',
            )}
          >
            <span className="min-w-[36px] font-mono font-semibold">{cod}</span>
            {desc && <span>{desc}</span>}
          </button>
        )
      })}
    </div>
  )
  const retro = respondida && (
    <div className="mt-3">
      <p className="text-subhead leading-snug" role="status">
        <b className={s.elegida === q.ok ? 'text-ink-ok' : 'text-ink-crit'}>{s.elegida === q.ok ? 'Correcto.' : 'No.'}</b> {q.why}
      </p>
      <Button className="mt-3" onClick={() => setS(siguiente)}>
        {s.pos < total - 1 ? 'Siguiente' : 'Ver resultado'}
      </Button>
    </div>
  )

  if (dosColumnas) {
    return (
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_440px] items-start gap-7">
        <div>{tablero}</div>
        <div>
          {cabecera}
          <p className="my-3 text-headline leading-snug">{q.q}</p>
          {opciones}
          {retro}
        </div>
      </div>
    )
  }
  return (
    <div className="mt-4">
      {cabecera}
      <p className="my-3 text-headline leading-snug">{q.q}</p>
      <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3.5">
        <div>{tablero}</div>
        <div>
          {opciones}
          {retro}
        </div>
      </div>
    </div>
  )
}
