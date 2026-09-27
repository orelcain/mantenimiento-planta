/**
 * Visor a pantalla completa de una página del manual original (render JPG del PDF).
 * Es lo que une las dos fuentes: el técnico ve el dato en la app y salta a la página
 * de la que sale, para discutirlo con el PDF en la mano.
 *
 * Zoom por pellizco y paneo con el dedo; rueda y doble clic en el PC. Oscuro a propósito,
 * como cualquier visor de imágenes: la página es la protagonista.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { FUENTES, type Fuente } from '@/data/baader200Terreno'

const MAX = 5

export function VisorPagina({ fuente, onCerrar }: { fuente: Fuente | null; onCerrar: () => void }) {
  if (!fuente) return null
  return <Visor key={`${fuente.id}-${fuente.pagina}`} inicial={fuente} onCerrar={onCerrar} />
}

function Visor({ inicial, onCerrar }: { inicial: Fuente; onCerrar: () => void }) {
  const info = FUENTES[inicial.id]
  const [pagina, setPagina] = useState(inicial.pagina)
  const [vista, setVista] = useState({ s: 1, x: 0, y: 0 })
  const punteros = useRef(new Map<number, { x: number; y: number }>())
  const pellizco = useRef<{ d: number; s: number } | null>(null)
  const ultimoToque = useRef(0)
  const cerrarRef = useRef<HTMLButtonElement>(null)

  const irA = useCallback((n: number) => {
    setPagina(Math.min(info.paginas, Math.max(1, n)))
    setVista({ s: 1, x: 0, y: 0 })
  }, [info.paginas])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cerrarRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
      else if (e.key === 'ArrowLeft') irA(pagina - 1)
      else if (e.key === 'ArrowRight') irA(pagina + 1)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [onCerrar, irA, pagina])

  /** Distancia entre los dos dedos del pellizco. */
  const distancia = () => {
    const [a, b] = [...punteros.current.values()]
    return a && b ? Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) : 1
  }

  const escalar = (s: number) => setVista(v => {
    const ns = Math.min(MAX, Math.max(1, s))
    return ns === 1 ? { s: 1, x: 0, y: 0 } : { ...v, s: ns }
  })

  const onPointerDown = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (punteros.current.size === 2) pellizco.current = { d: distancia(), s: vista.s }
  }
  const onPointerMove = (e: PointerEvent) => {
    const prev = punteros.current.get(e.pointerId)
    if (!prev) return
    const actual = { x: e.clientX, y: e.clientY }
    punteros.current.set(e.pointerId, actual)
    if (punteros.current.size === 2 && pellizco.current) {
      escalar(pellizco.current.s * (distancia() / pellizco.current.d))
    } else if (punteros.current.size === 1 && vista.s > 1) {
      setVista(v => ({ ...v, x: v.x + actual.x - prev.x, y: v.y + actual.y - prev.y }))
    }
  }
  const onPointerUp = (e: PointerEvent) => {
    punteros.current.delete(e.pointerId)
    if (punteros.current.size < 2) pellizco.current = null
    if (e.pointerType !== 'mouse' && punteros.current.size === 0) {
      const ahora = Date.now()
      if (ahora - ultimoToque.current < 300) escalar(vista.s > 1 ? 1 : 2.5)
      ultimoToque.current = ahora
    }
  }

  const titulo = `${info.corto} · pág. ${pagina}`
  const foco = 'rounded-full text-white hover:bg-white/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'
  const boton = `grid size-[44px] shrink-0 place-items-center ${foco}`
  const botonPagina = `inline-flex h-[44px] items-center gap-1 px-3 text-subhead ${foco}`

  return (
    <div role="dialog" aria-modal="true" aria-label={`${info.titulo}, página ${pagina}`} className="piel-fade-in fixed inset-0 z-[110] flex select-none flex-col bg-black">
      <div className="flex items-center gap-2 px-2 pb-1 pt-[max(8px,env(safe-area-inset-top))] text-white">
        <button ref={cerrarRef} type="button" aria-label="Cerrar" onClick={onCerrar} className={boton}>
          <X aria-hidden className="size-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-headline">{titulo}</div>
          <div className="truncate text-footnote text-white/60">{info.titulo}</div>
        </div>
        <span className="size-[44px] shrink-0" aria-hidden />
      </div>

      <div
        className="relative flex-1 touch-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={e => escalar(vista.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))}
        onDoubleClick={() => escalar(vista.s > 1 ? 1 : 2.5)}
      >
        <img
          src={info.urlPagina(pagina)}
          alt={`${info.titulo}, página ${pagina}`}
          draggable={false}
          className="absolute inset-0 m-auto max-h-full max-w-full bg-white object-contain"
          style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.s})` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1 text-white">
        <button type="button" onClick={() => irA(pagina - 1)} disabled={pagina <= 1} className={botonPagina}>
          <ChevronLeft aria-hidden className="size-5" /> Pág. {pagina - 1 || ''}
        </button>
        <span className="text-footnote text-white/60 tabular-nums">{pagina} de {info.paginas}</span>
        <button type="button" onClick={() => irA(pagina + 1)} disabled={pagina >= info.paginas} className={botonPagina}>
          Pág. {pagina < info.paginas ? pagina + 1 : ''} <ChevronRight aria-hidden className="size-5" />
        </button>
      </div>
    </div>
  )
}
