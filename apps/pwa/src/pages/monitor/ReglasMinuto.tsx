/**
 * «Regla del minuto» (Fase 6 del Duelo, variante A del mockup `docs/mockups/reproduccion_minuto.html`).
 *
 * Una regla de 0 a 60 s por Baader (Ev 1, Ev 2, Ev 3 en Eviscerado; B200 en Filete) con los carros (Baader 142) o las
 * silletas (Baader 200) del minuto marcados en tenue y un cabezal que los va encendiendo. Los segundos en que la
 * Baader estuvo detenida llevan trama. Es el minuto CERRADO que Shoplogix ya entregó, vuelto a pasar con desfase:
 * no se inventa ni una pieza (lógica en `reproduccionMinuto.ts`).
 *
 * Movimiento (DESIGN.md §8, excepción «reloj de datos»): solo `transform` y `opacity`. El cabezal es un `translateX`
 * por cuadro; cada pieza pulsa con escala y opacidad (600 ms); la barra de ritmo se desliza con `scaleX` en 1 s. Con
 * `prefers-reduced-motion` no hay cabezal ni pulsos: el minuto cae entero al llegar.
 */
import { memo, useEffect, useRef, useState } from 'react'
import { useCuentaCifra } from './ampliarHooks'
import { tonoRitmo } from './ejeTurno'
import { SEG_MINUTO, horaDeWall, horaPlantaDeUtc, type MinutoMaq } from './reproduccionMinuto'
import { unidadDeMaquinas, etiquetaMaquina } from './ritmoVivo'
import { useReproduccion, type MinutoVista, type Reproduccion } from './useReproduccionMinuto'
import type { CuadroReloj } from './useRelojDeDatos'

const int = (n: number) => Math.round(n).toLocaleString('es-CL')

/** El texto fijo que pide el spec, tal cual. */
export const NOTA_REPRODUCCION = 'reproducción del último minuto · 1 min de desfase'

const unidadDe = (m: MinutoMaq): 'carros' | 'silletas' => unidadDeMaquinas([{ model: m.modelo, name: m.nombre }]) ?? 'carros'

// ── La nota ──────────────────────────────────────────────────────────────────

/**
 * «reproducción del último minuto · 1 min de desfase». Si la lectura se atrasa (pasado 1,5 × el intervalo) cambia a
 * «sin lectura nueva desde hh:mm» y el punto pasa a ámbar: lo que se ve está quieto en el último minuto cerrado.
 */
export function NotaReproduccion({ rep, minuto }: { rep: Reproduccion; minuto: MinutoVista }) {
  const [atrasada, setAtrasada] = useState(() => rep.reloj.cuadro().atrasada)
  useEffect(() => {
    const ver = () => setAtrasada(rep.reloj.cuadro().atrasada)
    ver()
    const t = setInterval(ver, 1000)
    return () => clearInterval(t)
  }, [rep.reloj])
  const desde = horaPlantaDeUtc(minuto.pulsoAtMs) ?? horaDeWall(minuto.finMs)
  return (
    <span className="rm-nota" role="status" aria-live="polite" data-estado={atrasada ? 'retenida' : 'ok'}>
      <i className="rm-nota-punto" aria-hidden />
      <span>{atrasada ? `sin lectura nueva desde ${desde}` : NOTA_REPRODUCCION}</span>
    </span>
  )
}

// ── Una Baader ───────────────────────────────────────────────────────────────

/** El contador de la Baader: escribe el texto solo cuando cambia el entero (sube un escalón por pieza). */
function ContadorMaq({ rep, id }: { rep: Reproduccion; id: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inicial = rep.reloj.cuadro().rep?.porMaquina.find((m) => m.id === id)?.valor
  const ultimo = useRef(inicial != null ? int(inicial) : '–')
  useEffect(() => rep.reloj.alCuadro((c) => {
    const v = c.rep?.porMaquina.find((m) => m.id === id)?.valor
    const el = ref.current
    if (v == null || !el) return
    const t = int(v)
    if (t !== ultimo.current) { ultimo.current = t; el.textContent = t }
  }), [rep.reloj, id])
  return <span ref={ref}>{ultimo.current}</span>
}

/** Los segundos del minuto en que la Baader NO andaba: el complemento de sus tramos andando. */
function huecos(m: MinutoMaq): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let previo = 0
  for (const [a, b] of [...m.tramos, [SEG_MINUTO, SEG_MINUTO] as const]) {
    if (a - previo > 0.5) out.push([previo, a])
    previo = b
  }
  return out
}

const pct = (seg: number) => `${(seg / SEG_MINUTO) * 100}%`

const Regla = memo(function Regla({ rep, m }: { rep: Reproduccion; m: MinutoMaq }) {
  const marcas = useRef<Array<HTMLElement | null>>([])
  const cabezal = useRef<HTMLDivElement>(null)
  const sil = unidadDe(m) === 'silletas'
  const reducido = rep.reloj.reducido

  useEffect(() => {
    let previas = 0
    let primera = true
    return rep.reloj.alCuadro((c: CuadroReloj) => {
      const r = c.rep?.porMaquina.find((x) => x.id === m.id)
      if (!r) return
      /* Las piezas se encienden en orden: solo se toca el nodo cuando sube la cuenta; la 1ª vez (o al saltar) sin pulso. */
      for (let j = previas; j < r.encendidas; j++) {
        const el = marcas.current[j]
        if (!el) continue
        el.dataset.on = 'true'
        if (!primera && c.rep?.animando) {
          el.dataset.pulso = 'true'
          el.addEventListener('animationend', () => { delete el.dataset.pulso }, { once: true })
        }
      }
      previas = Math.max(previas, r.encendidas)
      primera = false
      const ph = cabezal.current
      if (ph) {
        ph.style.transform = `translateX(${(c.frac * 100).toFixed(2)}%)` // decimal-tecnico: porcentaje CSS del cabezal
        ph.style.opacity = c.rep?.animando ? '0.7' : '0'
      }
    })
  }, [rep.reloj, m])

  return (
    <div className="rm-regla" aria-hidden>
      {[15, 30, 45].map((s) => <i key={s} className="rm-q" style={{ left: pct(s) }} />)}
      {huecos(m).map(([a, b]) => <i key={a} className="rm-stop" style={{ left: pct(a), width: pct(b - a) }} />)}
      {m.horario.map((t, j) => (
        <i key={j} ref={(el) => { marcas.current[j] = el }} className={`rm-mk${sil ? ' rm-sil' : ''}`} style={{ left: pct(t) }} />
      ))}
      {!reducido && <div ref={cabezal} className="rm-ph"><i /></div>}
    </div>
  )
})

const ESTADO_TXT: Record<MinutoMaq['estado'], (m: MinutoMaq) => string> = {
  andando: () => 'andando',
  parcial: (m) => `anduvo ${Math.round(m.segAndando)} s`,
  detenida: () => 'detenida',
}

function FilaMaq({ rep, m, iniMs }: { rep: Reproduccion; m: MinutoMaq; iniMs: number }) {
  const ritmo = useCuentaCifra(m.n, 1000)
  const tono = tonoRitmo(m.n, m.esperado)
  const tope = m.esperado != null && m.esperado > 0 ? m.esperado * 1.3 : Math.max(m.n, 1)
  return (
    <li className="rm-fila">
      <div className="rm-nom">
        <span className="rm-n">{etiquetaMaquina(m.nombre)}</span>
        <span className="rm-est" data-e={m.estado}><i aria-hidden />{ESTADO_TXT[m.estado](m)}</span>
      </div>
      <div className="rm-cnt tabular-nums"><ContadorMaq rep={rep} id={m.id} /><small>pz</small></div>
      <div className="rm-pista">
        <Regla key={iniMs} rep={rep} m={m} />
        <span className="rm-cap">{unidadDe(m)} del minuto · {m.n} {m.n === 1 ? 'pieza' : 'piezas'}</span>
      </div>
      <div className="rm-rit">
        <div className="tabular-nums"><b>{int(ritmo)}</b>{m.esperado != null && <small> de {int(m.esperado)} pz/min</small>}</div>
        <div className="rm-rb" aria-hidden>
          <i data-tono={tono} style={{ transform: `scaleX(${Math.min(1, m.n / tope).toFixed(3)})` }} />
          {m.esperado != null && m.esperado > 0 && <em style={{ left: `${(m.esperado / tope) * 100}%` }} />}
        </div>
      </div>
    </li>
  )
}

// ── El bloque ────────────────────────────────────────────────────────────────

/**
 * El cierre del minuto: cuando termina de caer la última pieza, el contador de la línea vale exactamente la suma de
 * los minutos cerrados. Se dice lo que queda por fuera (el minuto en curso, que el contador de planta ya tiene).
 */
function Cuadre({ rep, minuto }: { rep: Reproduccion; minuto: MinutoVista }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => rep.reloj.alCuadro((c) => { ref.current?.setAttribute('data-on', c.rep && !c.rep.animando ? 'true' : 'false') }), [rep.reloj])
  const c = rep.reloj.cuadro().rep
  const cerrado = c?.totalFinal ?? null
  const contador = rep.tope?.total ?? null
  const resto = cerrado != null && contador != null ? contador - cerrado : null
  return (
    <p ref={ref} className="rm-cuadre tabular-nums" data-on="false">
      <i aria-hidden />
      cierre {horaDeWall(minuto.finMs)} · {cerrado != null ? int(cerrado) : '–'} pz = suma de las Baader
      {resto != null && resto > 0 ? ` · el contador de planta lleva ${int(resto)} más (minuto en curso)` : ''}
    </p>
  )
}

/** El bloque completo: título, nota y una regla por Baader. Sin reproducción activa (turno cerrado, sin serie) no dibuja nada. */
export function ReglasMinuto({ titulo = 'Último minuto, pieza a pieza' }: { titulo?: string }) {
  const rep = useReproduccion()
  const minuto = rep?.minuto
  if (!rep || !rep.activa || !minuto || minuto.maquinas.length === 0) return null
  return (
    <section className="rm" aria-label={titulo}>
      <div className="rm-hd">
        <h4 className="rm-h">{titulo}</h4>
        <span className="rm-cap tabular-nums">{horaDeWall(minuto.iniMs)}–{horaDeWall(minuto.finMs)}</span>
        <NotaReproduccion rep={rep} minuto={minuto} />
      </div>
      <ul className="rm-filas">
        {minuto.maquinas.map((m) => <FilaMaq key={m.id} rep={rep} m={m} iniMs={minuto.iniMs} />)}
      </ul>
      <Cuadre rep={rep} minuto={minuto} />
    </section>
  )
}

