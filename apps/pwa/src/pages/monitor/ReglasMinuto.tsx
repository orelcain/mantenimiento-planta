/**
 * «Último minuto, pieza a pieza» — la CINTA CONTINUA por Baader (spec §5 de SPEC_MONITOR_EN_VIVO_COLA; antes, la «regla del minuto»
 * de la Fase 6 del Duelo).
 *
 * Cada Baader (Ev 1, Ev 2, Ev 3 en Eviscerado; B200 en Filete) lleva una cinta de 60 s que corre sin detenerse entre minuto y
 * minuto (la cola de reproducción la alimenta) con una marca por pieza que pasa a la cadencia propia de esa Baader, y el texto
 * «1 cada X,X s» (60 ÷ piezas del último minuto cerrado; «—» si estuvo detenida). Los segundos en que la Baader estuvo parada
 * llevan trama. Es lo que Shoplogix ya entregó, vuelto a pasar con desfase: no se inventa ni una pieza (lógica en
 * `reproduccionMinuto.ts`; el dibujo en `cintaCanvas.ts` / `CintaBaader.tsx`).
 *
 * Las barras de ritmo (cada Baader y la de la línea) se llenan con `scaleX` en 600 ms cuando cierra cada minuto. El estado del
 * reloj (en vivo, poniéndose al día, Shoplogix atrasado, línea detenida) lo dice el chip de la cabecera (`ChipDesfase`), no esta nota.
 * Con `prefers-reduced-motion` la cinta es una regla en bucle sin deslizamiento y no hay pulsos.
 */
import { useEffect, useRef } from 'react'
import { CintaBaader } from './CintaBaader'
import { textoCadencia } from './cintaCanvas'
import { useCuentaCifra } from './ampliarHooks'
import { tonoRitmo } from './ejeTurno'
import { horaDeWall, type MinutoMaq, type VistaMaq } from './reproduccionMinuto'
import { unidadDeMaquinas, etiquetaMaquina } from './ritmoVivo'
import { useReproduccion, type MinutoVista, type Reproduccion } from './useReproduccionMinuto'

const int = (n: number) => Math.round(n).toLocaleString('es-CL')

/** Lo que dura el llenado de una barra al cerrar un minuto. */
export const BARRA_MS = 600

const unidadDe = (m: MinutoMaq): 'carros' | 'silletas' => unidadDeMaquinas([{ model: m.modelo, name: m.nombre }]) ?? 'carros'

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

const ESTADO_TXT: Record<MinutoMaq['estado'], (m: MinutoMaq) => string> = {
  andando: () => 'andando',
  parcial: (m) => `anduvo ${Math.round(m.segAndando)} s`,
  detenida: () => 'detenida',
}

/** La barra de ritmo: escala de 0 a 1 con el tono del ritmo contra lo esperado, y la raya de lo esperado. */
function BarraRitmo({ n, esperado }: { n: number; esperado: number | null }) {
  const tono = tonoRitmo(n, esperado)
  const tope = esperado != null && esperado > 0 ? esperado * 1.3 : Math.max(n, 1)
  return (
    <div className="rm-rb" aria-hidden>
      <i data-tono={tono} style={{ transform: `scaleX(${Math.min(1, n / tope).toFixed(3)})` }} />
      {esperado != null && esperado > 0 && <em style={{ left: `${(esperado / tope) * 100}%` }} />}
    </div>
  )
}

/**
 * Una fila. NO se vuelve a montar con cada minuto (la cinta es continua y la barra se llena sobre sí misma): lo que cambia
 * al cerrar un minuto es `r` (la cadencia y las piezas del último minuto cerrado, de ese cuadro del reloj).
 */
function FilaMaq({ rep, m, r }: { rep: Reproduccion; m: MinutoMaq; r: VistaMaq | undefined }) {
  /* El ritmo y la cadencia son del ÚLTIMO MINUTO CERRADO (el que acaba de terminar de reproducirse); en el primer minuto tras
     cargar aún no hay uno anterior y vale el que corre. Cambian una vez por minuto, no por pieza. */
  const nCerrado = r?.piezasMinutoCerrado ?? m.n
  const cadencia = r?.piezasMinutoCerrado != null ? r.cadenciaS : nCerrado > 0 ? 60 / nCerrado : null
  const ritmo = useCuentaCifra(nCerrado, BARRA_MS)
  const etiqueta = etiquetaMaquina(m.nombre)
  return (
    <li className="rm-fila">
      <div className="rm-nom">
        <span className="rm-n">{etiqueta}</span>
        <span className="rm-est" data-e={m.estado}><i aria-hidden />{ESTADO_TXT[m.estado](m)}</span>
      </div>
      <div className="rm-cnt tabular-nums"><ContadorMaq rep={rep} id={m.id} /><small>pz</small></div>
      <div className="rm-pista">
        <div className="rm-pista-fila">
          <CintaBaader rep={rep} id={m.id} etiqueta={`${etiqueta}: ${unidadDe(m)} de los últimos 60 s`} />
          <span className="rm-cad tabular-nums" data-det={cadencia == null ? 'true' : undefined}>{textoCadencia(cadencia)}</span>
        </div>
        <span className="rm-cap">{unidadDe(m)} de los últimos 60 s</span>
      </div>
      <div className="rm-rit">
        <div className="tabular-nums"><b>{int(ritmo)}</b>{m.esperado != null && <small> de {int(m.esperado)} pz/min</small>}</div>
        <BarraRitmo n={nCerrado} esperado={m.esperado} />
      </div>
    </li>
  )
}

/** La línea: la suma de las Baader del último minuto cerrado contra la suma de lo esperado, con su barra. */
function FilaLinea({ m, r }: { m: MinutoMaq[]; r: Array<VistaMaq | undefined> }) {
  const n = m.reduce((s, q, i) => s + (r[i]?.piezasMinutoCerrado ?? q.n), 0)
  const esperado = m.every((q) => q.esperado != null) ? m.reduce((s, q) => s + (q.esperado ?? 0), 0) : null
  const ritmo = useCuentaCifra(n, BARRA_MS)
  return (
    <li className="rm-fila rm-linea">
      <div className="rm-nom"><span className="rm-n">Línea</span></div>
      <div className="rm-rit">
        <div className="tabular-nums"><b>{int(ritmo)}</b>{esperado != null && esperado > 0 && <small> de {int(esperado)} pz/min</small>}</div>
        <BarraRitmo n={n} esperado={esperado} />
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
      {resto != null && resto > 0 ? ` · el contador de planta lleva ${int(resto)} más (minutos en cola)` : ''}
    </p>
  )
}

/** El bloque completo: título y una cinta por Baader. Sin reproducción activa (turno cerrado, sin serie) no dibuja nada. */
export function ReglasMinuto({ titulo = 'Último minuto, pieza a pieza' }: { titulo?: string }) {
  const rep = useReproduccion()
  const minuto = rep?.minuto
  if (!rep || !rep.activa || !minuto || minuto.maquinas.length === 0) return null
  const vistas = rep.reloj.cuadro().rep?.porMaquina ?? []
  const deMaq = (id: string) => vistas.find((v) => v.id === id)
  return (
    <section className="rm" aria-label={titulo}>
      <div className="rm-hd">
        <h4 className="rm-h">{titulo}</h4>
        <span className="rm-cap tabular-nums">últimos 60 s</span>
      </div>
      <ul className="rm-filas">
        {minuto.maquinas.map((m) => <FilaMaq key={m.id} rep={rep} m={m} r={deMaq(m.id)} />)}
        {minuto.maquinas.length > 1 && <FilaLinea m={minuto.maquinas} r={minuto.maquinas.map((m) => deMaq(m.id))} />}
      </ul>
      <Cuadre rep={rep} minuto={minuto} />
    </section>
  )
}
