/**
 * La franja de rango de «Ritmo en vivo» (spec §6): 44 px bajo el gráfico con la mini curva del turno y una ventana con dos asas
 * que se arrastran. La ventana ES la `ventana` compartida del gráfico (`useZoomGesto`): los atajos «Turno | 1 h | 15 min», la
 * rueda con Ctrl, el pellizco y el arrastre del gráfico la mueven, y la franja la sigue; moverla aquí acerca o aleja el gráfico.
 *
 *   · arrastrar el cuerpo de la ventana la recorre; arrastrar un asa cambia su inicio o su fin (mínimo 10 min);
 *   · tocar fuera de la ventana la centra ahí;
 *   · las asas miden 4 × 20 a la vista y 44 de ancho al toque (también por teclado: flechas, 5 min por paso).
 *
 * La geometría (`aplicarArrastre`, `trazoMini`) es pura y se prueba aparte. Solo `transform`/`opacity`/`left`+`width` de una
 * caja de 44 px, que no pesa; no hay estado de React por cuadro del arrastre más que la `ventana` misma.
 */
import { useRef, type KeyboardEvent, type PointerEvent as PE } from 'react'
import type { Punto } from './ejeTurno'
import { ajustarVentana, aplicarArrastre, trazoMini, type ModoArrastre } from './rangoZoom'
import type { Ventana } from './useZoomGesto'

const RADIO_ASA_PX = 44 // = ancho al toque del asa (.rv-rango-asa), medido desde el borde hacia adentro

export function FranjaRango({ totalMin, ventana, onVentana, puntos, yMax }: {
  totalMin: number
  /** La ventana compartida; null = todo el turno. */
  ventana: Ventana | null
  onVentana: (v: Ventana | null) => void
  /** El acumulado del turno (la misma curva del gráfico). */
  puntos: readonly Punto[]
  yMax: number
}) {
  const caja = useRef<HTMLDivElement>(null)
  const arrastre = useRef<{ modo: ModoArrastre; f0: number; base: Ventana; w: number } | null>(null)
  const v = ventana ?? { desdeMin: 0, hastaMin: totalMin }
  const pct = (m: number) => `${(Math.min(totalMin, Math.max(0, m)) / totalMin) * 100}%`
  /* Una ventana que cubre todo el turno es «Turno»: sin ventana, para que el gráfico vuelva a su zoom 1. */
  const publicar = (n: Ventana) => onVentana(n.hastaMin - n.desdeMin >= totalMin - 0.5 ? null : n)

  const alBajar = (ev: PE<HTMLDivElement>) => {
    const el = caja.current
    if (!el || !(totalMin > 0)) return
    const r = el.getBoundingClientRect()
    if (r.width <= 0) return
    const f = ((ev.clientX - r.left) / r.width) * totalMin
    const pxMin = r.width / totalMin
    const da = Math.abs(f - v.desdeMin) * pxMin
    const db = Math.abs(f - v.hastaMin) * pxMin
    let modo: ModoArrastre = 'mover'
    let base = v
    if (da < RADIO_ASA_PX && da <= db) modo = 'inicio'
    else if (db < RADIO_ASA_PX) modo = 'fin'
    else if (f < v.desdeMin || f > v.hastaMin) {
      /* Tocar fuera: la ventana se centra ahí y desde ahí se la puede seguir arrastrando. */
      const ancho = v.hastaMin - v.desdeMin
      base = ajustarVentana({ desdeMin: f - ancho / 2, hastaMin: f + ancho / 2 }, totalMin)
      publicar(base)
    }
    arrastre.current = { modo, f0: f, base, w: r.width }
    el.setPointerCapture?.(ev.pointerId)
  }
  const alMover = (ev: PE<HTMLDivElement>) => {
    const a = arrastre.current
    const el = caja.current
    if (!a || !el) return
    const r = el.getBoundingClientRect()
    const f = ((ev.clientX - r.left) / (r.width || a.w)) * totalMin
    publicar(aplicarArrastre(a.modo, f - a.f0, a.base, totalMin))
  }
  const alSoltar = () => { arrastre.current = null }

  const tecla = (modo: 'inicio' | 'fin') => (ev: KeyboardEvent<HTMLElement>) => {
    const paso = ev.key === 'ArrowLeft' ? -5 : ev.key === 'ArrowRight' ? 5 : 0
    if (!paso) return
    ev.preventDefault()
    publicar(aplicarArrastre(modo, paso, v, totalMin))
  }
  const trazo = trazoMini(puntos, totalMin, yMax)

  return (
    <div
      ref={caja}
      className="rv-rango"
      role="group"
      aria-label="Rango del turno que se ve"
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
    >
      <svg viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden>
        {trazo && <path d={trazo} fill="none" stroke="var(--v2-acento)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
      </svg>
      <div className="rv-rango-vent" style={{ left: pct(v.desdeMin), width: `${(Math.min(totalMin, v.hastaMin - v.desdeMin) / totalMin) * 100}%` }}>
        <span
          className="rv-rango-asa rv-rango-asa-i"
          role="slider" tabIndex={0} aria-label="Inicio de lo que se ve"
          aria-valuemin={0} aria-valuemax={Math.round(totalMin)} aria-valuenow={Math.round(v.desdeMin)}
          onKeyDown={tecla('inicio')}
        />
        <span
          className="rv-rango-asa rv-rango-asa-d"
          role="slider" tabIndex={0} aria-label="Fin de lo que se ve"
          aria-valuemin={0} aria-valuemax={Math.round(totalMin)} aria-valuenow={Math.round(v.hastaMin)}
          onKeyDown={tecla('fin')}
        />
      </div>
    </div>
  )
}
