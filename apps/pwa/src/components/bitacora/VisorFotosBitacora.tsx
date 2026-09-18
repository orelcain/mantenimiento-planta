import { useEffect, useRef, useState, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { ETIQUETA_FOTO } from '@/config/bitacora'
import type { FotoEvento } from '@/services/bitacora/bitacora.types'

/** Desplazamiento lateral que cambia de foto y descenso que cierra el visor. */
const UMBRAL_PASAR = 60
const UMBRAL_CERRAR = 110
const ZOOM_MAX = 4
const DOBLE_TOQUE_MS = 300

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const distancia = (a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }) =>
  Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)

/**
 * Foto a pantalla completa, como el visor de Fotos de iOS: fondo negro (la foto
 * manda, en ambos temas). En el teléfono (mockup iOS 27, 17-09-2026): deslizar
 * a los lados cambia de foto, bajar el dedo cierra, doble toque amplía al doble
 * y pellizcar acerca. En el PC: flechas, teclado y Escape.
 */
export function VisorFotosBitacora({
  fotos,
  indiceInicial,
  titulo,
  onClose,
}: {
  fotos: FotoEvento[]
  indiceInicial: number
  titulo?: string
  onClose: () => void
}) {
  const [i, setI] = useState(indiceInicial)
  const total = fotos.length
  const foto = fotos[Math.min(i, total - 1)]
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  /** Arrastre sin zoom: lateral (cambiar de foto) o hacia abajo (cerrar). */
  const [arrastre, setArrastre] = useState({ x: 0, y: 0 })
  const gesto = useRef<{
    tipo: 'nada' | 'pellizco' | 'mover' | 'lateral' | 'bajar'
    x: number
    y: number
    dist: number
    zoom: number
    pan: { x: number; y: number }
  }>({ tipo: 'nada', x: 0, y: 0, dist: 0, zoom: 1, pan: { x: 0, y: 0 } })
  const ultimoToque = useRef(0)

  // onClose en ref: el padre pasa una función nueva en cada render (ver Sheet.tsx).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const irA = (paso: -1 | 1) => setI((v) => limitar(v + paso, 0, total - 1))

  // Cada foto parte sin zoom.
  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setArrastre({ x: 0, y: 0 })
  }, [i])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
      if (e.key === 'ArrowRight') setI((v) => Math.min(total - 1, v + 1))
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1))
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [total])

  if (!foto) return null

  const alTocar = (e: TouchEvent) => {
    const [a, b] = [e.touches[0], e.touches[1]]
    if (!a) return
    if (b) {
      gesto.current = { tipo: 'pellizco', x: 0, y: 0, dist: distancia(a, b), zoom, pan }
      return
    }
    const ahora = Date.now()
    if (ahora - ultimoToque.current < DOBLE_TOQUE_MS) {
      // Doble toque: al doble, o de vuelta a la foto entera.
      ultimoToque.current = 0
      setZoom((z) => (z > 1 ? 1 : 2))
      setPan({ x: 0, y: 0 })
      gesto.current.tipo = 'nada'
      return
    }
    ultimoToque.current = ahora
    gesto.current = { tipo: zoom > 1 ? 'mover' : 'nada', x: a.clientX, y: a.clientY, dist: 0, zoom, pan }
  }

  const alMover = (e: TouchEvent) => {
    const g = gesto.current
    const [a, b] = [e.touches[0], e.touches[1]]
    if (!a) return
    if (g.tipo === 'pellizco' && b) {
      const z = limitar((g.zoom * distancia(a, b)) / Math.max(1, g.dist), 1, ZOOM_MAX)
      setZoom(z)
      if (z === 1) setPan({ x: 0, y: 0 })
      return
    }
    const dx = a.clientX - g.x
    const dy = a.clientY - g.y
    if (g.tipo === 'mover') {
      setPan({ x: g.pan.x + dx, y: g.pan.y + dy })
      return
    }
    if (g.tipo === 'nada') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      g.tipo = Math.abs(dx) > Math.abs(dy) ? 'lateral' : dy > 0 ? 'bajar' : 'nada'
    }
    if (g.tipo === 'lateral') setArrastre({ x: dx, y: 0 })
    if (g.tipo === 'bajar') setArrastre({ x: 0, y: Math.max(0, dy) })
  }

  const alSoltar = (e: TouchEvent) => {
    const g = gesto.current
    if (g.tipo === 'pellizco' && e.touches.length > 0) return
    if (g.tipo === 'lateral') {
      if (arrastre.x <= -UMBRAL_PASAR && i < total - 1) irA(1)
      else if (arrastre.x >= UMBRAL_PASAR && i > 0) irA(-1)
    }
    if (g.tipo === 'bajar' && arrastre.y >= UMBRAL_CERRAR) {
      onCloseRef.current()
      return
    }
    g.tipo = 'nada'
    setArrastre({ x: 0, y: 0 })
  }

  const boton =
    'flex size-[44px] items-center justify-center rounded-full text-white/90 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-30'
  const moviendo = gesto.current.tipo !== 'nada'
  // Al bajar el dedo, el fondo se aclara: se ve que soltar cierra.
  const opacidadFondo = 1 - Math.min(0.6, arrastre.y / 400)

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${i + 1} de ${total}`}
      className="fixed inset-0 z-[120] flex flex-col piel-fade-in"
      // Opaco, como Fotos de iOS: al 92 % se transparentaban los botones de la página (ronda 21).
      style={{ background: `rgba(0,0,0,${opacidadFondo})` }}
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between gap-3 px-2 pt-[max(8px,env(safe-area-inset-top))] text-white"
        style={{ opacity: arrastre.y ? 0 : 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 px-2">
          {titulo && <p className="truncate text-footnote text-white/70">{titulo}</p>}
          <p className="text-headline">
            {ETIQUETA_FOTO[foto.etiqueta]}
            {total > 1 && <span className="font-normal text-white/60"> · {i + 1} de {total}</span>}
          </p>
        </div>
        <button type="button" className={boton} onClick={onClose} aria-label="Cerrar">
          <X className="size-6" />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden p-2"
        onTouchStart={alTocar}
        onTouchMove={alMover}
        onTouchEnd={alSoltar}
        onTouchCancel={alSoltar}
      >
        <img
          src={foto.url}
          alt={ETIQUETA_FOTO[foto.etiqueta]}
          draggable={false}
          className={`max-h-full max-w-full select-none object-contain ${moviendo ? '' : 'transition-transform duration-200 ease-out motion-reduce:transition-none'}`}
          style={{
            transform: `translate(${pan.x + arrastre.x}px, ${pan.y + arrastre.y}px) scale(${zoom * (1 - Math.min(0.25, arrastre.y / 800))})`,
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation()
            setZoom((z) => (z > 1 ? 1 : 2))
            setPan({ x: 0, y: 0 })
          }}
        />
        {total > 1 && (
          <>
            {/* Flechas solo con mouse: en el teléfono se desliza. */}
            <button
              type="button"
              className={`${boton} absolute left-2 top-1/2 -translate-y-1/2 [@media(hover:none)]:hidden`}
              onClick={(e) => {
                e.stopPropagation()
                irA(-1)
              }}
              disabled={i === 0}
              aria-label="Foto anterior"
            >
              <ChevronLeft className="size-7" />
            </button>
            <button
              type="button"
              className={`${boton} absolute right-2 top-1/2 -translate-y-1/2 [@media(hover:none)]:hidden`}
              onClick={(e) => {
                e.stopPropagation()
                irA(1)
              }}
              disabled={i === total - 1}
              aria-label="Foto siguiente"
            >
              <ChevronRight className="size-7" />
            </button>
          </>
        )}
      </div>

      {total > 1 && (
        <div className="flex justify-center gap-2 pb-[max(20px,env(safe-area-inset-bottom))] pt-3" aria-hidden style={{ opacity: arrastre.y ? 0 : 1 }}>
          {fotos.map((f, k) => (
            <span key={f.path} className={`size-[7px] rounded-full ${k === i ? 'bg-white' : 'bg-white/35'}`} />
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
}
