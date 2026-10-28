/**
 * Globo de ayuda del Duelo para PC. Un solo globo para toda la vista: cualquier elemento con `data-tip="texto"`
 * (HTML o SVG) lo dispara con el mouse, con el foco del teclado (`tabIndex={0}`) o con un toque.
 *
 * Accesible: el elemento activo recibe `aria-describedby` apuntando al globo mientras está abierto, Escape lo cierra
 * y el texto es de 12 px. Solo se anima `opacity` y `transform`. En SVG, cada elemento lleva además un `<title>` de
 * respaldo para los lectores que no siguen el foco.
 */
import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react'
import { createPortal } from 'react-dom'

interface Abierto { texto: string; x: number; y: number }

const MARGEN = 150

export function useGloboDuelo() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [abierto, setAbierto] = useState<Abierto | null>(null)
  const objetivo = useRef<Element | null>(null)

  const cierra = useCallback(() => {
    objetivo.current?.removeAttribute('aria-describedby')
    objetivo.current = null
    setAbierto(null)
  }, [])

  const abre = useCallback((el: Element, x: number, y: number) => {
    const texto = el.getAttribute('data-tip')
    if (!texto) return
    if (objetivo.current !== el) {
      objetivo.current?.removeAttribute('aria-describedby')
      el.setAttribute('aria-describedby', id)
      objetivo.current = el
    }
    setAbierto((a) => (a && a.texto === texto && Math.abs(a.x - x) < 2 && Math.abs(a.y - y) < 2 ? a : { texto, x, y }))
  }, [id])

  const buscar = (t: EventTarget | null) => (t instanceof Element ? t.closest('[data-tip]') : null)

  const alMover = (ev: RPointerEvent<HTMLElement>) => {
    if (ev.pointerType === 'touch') return
    const el = buscar(ev.target)
    if (el) abre(el, ev.clientX, ev.clientY)
    else if (objetivo.current) cierra()
  }
  const alBajar = (ev: RPointerEvent<HTMLElement>) => {
    if (ev.pointerType !== 'touch') return
    const el = buscar(ev.target)
    if (el && el !== objetivo.current) abre(el, ev.clientX, ev.clientY)
    else cierra()
  }
  const alEnfocar = (ev: FocusEvent<HTMLElement>) => {
    const el = buscar(ev.target)
    if (!el || !(ev.target as Element).matches(':focus-visible')) return
    const r = el.getBoundingClientRect()
    abre(el, r.left + r.width / 2, r.top)
  }
  const alTecla = (ev: KeyboardEvent<HTMLElement>) => { if (ev.key === 'Escape') cierra() }

  useEffect(() => cierra, [cierra])

  const manejadores = {
    onPointerMove: alMover,
    onPointerDown: alBajar,
    onPointerLeave: (ev: RPointerEvent<HTMLElement>) => { if (ev.pointerType !== 'touch') cierra() },
    onFocus: alEnfocar,
    onBlur: cierra,
    onKeyDown: alTecla,
  }

  const globo = abierto && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="dpc-globo-pos"
          style={{ transform: `translate(${Math.round(Math.min(Math.max(abierto.x, MARGEN), window.innerWidth - MARGEN))}px, ${Math.round(abierto.y)}px)` }}
        >
          <div id={id} role="tooltip" className="dpc-globo v2-tip" data-abajo={abierto.y < 140 ? '1' : undefined}>{abierto.texto}</div>
        </div>,
        document.body,
      )
    : null

  return { manejadores, globo }
}
