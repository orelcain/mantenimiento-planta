/**
 * ImageLightbox â€“ Visor de imÃ¡genes a pantalla completa
 *
 * - Pellizco (zoom desde el punto entre los dedos) y paneo con un dedo, fluidos.
 * - Rueda del mouse (zoom en el cursor), arrastre con el mouse.
 * - Doble toque / doble clic: zoom Ã—2,5 en ese punto, o volver a 1Ã—.
 * - Deslizar a los lados (sin zoom) o flechas: foto anterior/siguiente.
 * - Teclas: Esc cerrar, â†/â†’ navegar, +/- zoom.
 *
 * Por quÃ© asÃ­ (2026-10-11, reporte de Danilo en el celular: Â«parpadea, se fuerza hacia
 * diferentes ladosÂ»): antes cada movimiento pasaba por setState y una transiciÃ³n CSS de
 * 150 ms, asÃ­ que la imagen perseguÃ­a al dedo con retraso; el pellizco escalaba desde el
 * centro y no desde los dedos; el doble toque se detectaba al APOYAR el dedo, asÃ­ que tocar
 * y enseguida pellizcar saltaba entre 1Ã— y 2,5Ã—; y el paneo no tenÃ­a lÃ­mites. Ahora el
 * transform se escribe directo en el <img> (sin React por cuadro), la matemÃ¡tica vive en
 * `lib/zoomVisor` (probada) y el doble toque se decide al SOLTAR un toque corto y quieto.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { acotarPaneo, acotarZoom, zoomEnPunto, VISTA_INICIAL, type Vista } from '@/lib/zoomVisor'

interface ImageLightboxProps {
  photos: string[]
  initialIndex?: number
  onClose: () => void
}

const PASO_BOTON = 1.4
const ZOOM_DOBLE = 2.5
const TAP_MS = 250
const DOBLE_MS = 300
const MOVIDO_PX = 10
const SWIPE_PX = 60

type Punto = { x: number; y: number }
type Gesto =
  | { tipo: 'pinch'; v0: Vista; d0: number; m0: Punto }
  | { tipo: 'pan'; v0: Vista; p0: Punto; t0: number; movido: boolean; ultimo: Punto }
  | null

export function ImageLightbox({ photos, initialIndex = 0, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex)
  const [zoomUi, setZoomUi] = useState(1)
  const areaRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const vista = useRef<Vista>(VISTA_INICIAL)
  const gesto = useRef<Gesto>(null)
  const ultimoTap = useRef<{ t: number; p: Punto } | null>(null)
  const raton = useRef<{ v0: Vista; p0: Punto } | null>(null)
  const indexRef = useRef(index)
  indexRef.current = index

  const photo = photos[index]

  /** Punto relativo al centro del Ã¡rea visible. */
  const relativo = useCallback((clientX: number, clientY: number): Punto => {
    const r = areaRef.current?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 }
  }, [])

  const aplicar = useCallback((v: Vista, animar = false) => {
    const img = imgRef.current
    const area = areaRef.current
    let w = v
    if (img && area) {
      w = acotarPaneo(v, { imgW: img.offsetWidth, imgH: img.offsetHeight, contW: area.clientWidth, contH: area.clientHeight })
    }
    vista.current = w
    if (img) {
      img.style.transition = animar ? 'transform 180ms ease-out' : 'none'
      img.style.transform = `translate3d(${w.x}px, ${w.y}px, 0) scale(${w.z})`
    }
    setZoomUi((z) => (Math.abs(z - w.z) > 0.01 ? w.z : z))
  }, [])

  const reiniciar = useCallback((animar = false) => aplicar(VISTA_INICIAL, animar), [aplicar])

  const zoomCentro = useCallback((factor: number) => {
    aplicar(zoomEnPunto(vista.current, acotarZoom(vista.current.z * factor), { x: 0, y: 0 }), true)
  }, [aplicar])

  const irA = useCallback((i: number) => {
    setIndex(Math.max(0, Math.min(photos.length - 1, i)))
  }, [photos.length])

  // Foto nueva: vista inicial
  useEffect(() => { reiniciar() }, [index, reiniciar])

  // Precargar imÃ¡genes vecinas (anterior + siguiente)
  useEffect(() => {
    const toPreload = [photos[index - 1], photos[index + 1]].filter((s): s is string => typeof s === 'string')
    toPreload.forEach((src) => { const img = new Image(); img.src = src })
  }, [index, photos])

  // Teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape': onClose(); break
        case 'ArrowLeft': irA(indexRef.current - 1); break
        case 'ArrowRight': irA(indexRef.current + 1); break
        case '+': case '=': zoomCentro(PASO_BOTON); break
        case '-': zoomCentro(1 / PASO_BOTON); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, irA, zoomCentro])

  // Gestos tÃ¡ctiles y rueda: listeners nativos NO pasivos (React los registra pasivos y en
  // iOS el navegador se queda con el pellizco y hace zoom de la pÃ¡gina).
  useEffect(() => {
    const area = areaRef.current
    if (!area) return

    const dobleToque = (p: Punto) => {
      if (vista.current.z > 1.05) reiniciar(true)
      else aplicar(zoomEnPunto(vista.current, ZOOM_DOBLE, p), true)
    }

    const inicioPan = (t: Touch, esTap: boolean): Gesto => {
      const p = relativo(t.clientX, t.clientY)
      return { tipo: 'pan', v0: vista.current, p0: p, t0: esTap ? Date.now() : 0, movido: !esTap, ultimo: p }
    }

    // Los botones (flechas) reciben su toque normal: bloquear el touch les quitarÃ­a el clic.
    const enBoton = (e: Event) => e.target instanceof Element && !!e.target.closest('button')

    const onStart = (e: TouchEvent) => {
      if (enBoton(e)) return
      e.preventDefault()
      if (e.touches.length >= 2) {
        const a = e.touches[0]!
        const b = e.touches[1]!
        gesto.current = {
          tipo: 'pinch',
          v0: vista.current,
          d0: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
          m0: relativo((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2),
        }
        ultimoTap.current = null // un pellizco nunca cuenta como toque
      } else if (e.touches.length === 1) {
        gesto.current = inicioPan(e.touches[0]!, true)
      }
    }

    const onMove = (e: TouchEvent) => {
      e.preventDefault()
      const g = gesto.current
      if (!g) return
      if (g.tipo === 'pinch' && e.touches.length >= 2) {
        const a = e.touches[0]!
        const b = e.touches[1]!
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
        const m = relativo((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2)
        aplicar(zoomEnPunto(g.v0, g.v0.z * (d / g.d0), g.m0, m))
      } else if (g.tipo === 'pan' && e.touches.length === 1) {
        const t = e.touches[0]!
        const p = relativo(t.clientX, t.clientY)
        g.ultimo = p
        if (!g.movido && Math.hypot(p.x - g.p0.x, p.y - g.p0.y) > MOVIDO_PX) g.movido = true
        if (g.v0.z > 1.01) aplicar({ z: g.v0.z, x: g.v0.x + (p.x - g.p0.x), y: g.v0.y + (p.y - g.p0.y) })
      }
    }

    const onEnd = (e: TouchEvent) => {
      if (enBoton(e) && !gesto.current) return
      e.preventDefault()
      const g = gesto.current
      if (!g) return
      if (g.tipo === 'pinch') {
        if (e.touches.length === 1) {
          // Queda un dedo: sigue arrastrando desde donde estÃ¡, sin saltos.
          gesto.current = inicioPan(e.touches[0]!, false)
        } else if (e.touches.length === 0) {
          gesto.current = null
          if (vista.current.z < 1.03) reiniciar(true)
        }
        return
      }
      if (e.touches.length > 0) return
      gesto.current = null
      const dx = g.ultimo.x - g.p0.x
      const dy = g.ultimo.y - g.p0.y
      // Deslizar para cambiar de foto (solo sin zoom)
      if (g.v0.z <= 1.01 && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
        irA(indexRef.current + (dx < 0 ? 1 : -1))
        ultimoTap.current = null
        return
      }
      // Toque corto y quieto: Â¿segundo toque de un doble toque?
      if (!g.movido && g.t0 && Date.now() - g.t0 < TAP_MS) {
        const prev = ultimoTap.current
        if (prev && Date.now() - prev.t < DOBLE_MS && Math.hypot(prev.p.x - g.p0.x, prev.p.y - g.p0.y) < 40) {
          ultimoTap.current = null
          dobleToque(g.p0)
        } else {
          ultimoTap.current = { t: Date.now(), p: g.p0 }
        }
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = relativo(e.clientX, e.clientY)
      aplicar(zoomEnPunto(vista.current, vista.current.z * Math.exp(-e.deltaY * 0.0015), p))
    }

    // Safari (iOS/macOS): evita su zoom de pÃ¡gina propio con el pellizco.
    const bloquear = (e: Event) => e.preventDefault()

    area.addEventListener('touchstart', onStart, { passive: false })
    area.addEventListener('touchmove', onMove, { passive: false })
    area.addEventListener('touchend', onEnd, { passive: false })
    area.addEventListener('touchcancel', onEnd, { passive: false })
    area.addEventListener('wheel', onWheel, { passive: false })
    area.addEventListener('gesturestart', bloquear)
    area.addEventListener('gesturechange', bloquear)
    return () => {
      area.removeEventListener('touchstart', onStart)
      area.removeEventListener('touchmove', onMove)
      area.removeEventListener('touchend', onEnd)
      area.removeEventListener('touchcancel', onEnd)
      area.removeEventListener('wheel', onWheel)
      area.removeEventListener('gesturestart', bloquear)
      area.removeEventListener('gesturechange', bloquear)
    }
  }, [aplicar, reiniciar, relativo, irA])

  // Mouse (escritorio): arrastrar con zoom, doble clic
  const onMouseDown = (e: React.MouseEvent) => {
    if (vista.current.z <= 1.01) return
    e.preventDefault()
    raton.current = { v0: vista.current, p0: { x: e.clientX, y: e.clientY } }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    const r = raton.current
    if (!r) return
    aplicar({ z: r.v0.z, x: r.v0.x + (e.clientX - r.p0.x), y: r.v0.y + (e.clientY - r.p0.y) })
  }
  const onMouseUp = () => { raton.current = null }
  const onDoubleClick = (e: React.MouseEvent) => {
    if (vista.current.z > 1.05) reiniciar(true)
    else aplicar(zoomEnPunto(vista.current, ZOOM_DOBLE, relativo(e.clientX, e.clientY)), true)
  }

  // Portal a <body> + pointer-events explÃ­cito: cuando el lightbox se abre desde
  // dentro de un Dialog modal de Radix, Radix deja el <body> con
  // pointer-events:none mientras el modal estÃ¡ abierto â€” el lightbox se veÃ­a
  // pero NINGÃšN tap le llegaba (en desktop nadie lo notÃ³ porque Esc funciona;
  // en mÃ³vil no hay Esc y quedabas atrapado).
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/95 flex flex-col select-none"
      style={{ pointerEvents: 'auto' }}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* Top bar (padding extra arriba por el notch/barra de estado en PWA instalada) */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-black/60 text-white"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <span className="text-sm font-medium">
          {photos.length > 1 ? `${index + 1} / ${photos.length}` : 'Vista de imagen'}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => zoomCentro(PASO_BOTON)} className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Acercar">
            <ZoomIn className="h-5 w-5" />
          </button>
          <button onClick={() => zoomCentro(1 / PASO_BOTON)} className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Alejar">
            <ZoomOut className="h-5 w-5" />
          </button>
          {zoomUi > 1.01 && (
            <button onClick={() => reiniciar(true)} className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Restablecer">
              <RotateCcw className="h-5 w-5" />
            </button>
          )}
          <div className="w-px h-5 bg-white/20 mx-1" />
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Cerrar (Esc)">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        ref={areaRef}
        className="flex-1 flex items-center justify-center overflow-hidden relative"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onDoubleClick={onDoubleClick}
        style={{ cursor: zoomUi > 1.01 ? (raton.current ? 'grabbing' : 'grab') : 'default', touchAction: 'none' }}
      >
        <img
          ref={imgRef}
          src={photo}
          alt={`Foto ${index + 1}`}
          className="max-w-full max-h-full object-contain pointer-events-none will-change-transform"
          draggable={false}
        />

        {/* Nav arrows */}
        {photos.length > 1 && (
          <>
            {index > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); irA(index - 1) }}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 rounded-full transition-colors text-white"
                aria-label="Foto anterior"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            {index < photos.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); irA(index + 1) }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 rounded-full transition-colors text-white"
                aria-label="Foto siguiente"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Bottom thumbnails (if multiple) */}
      {photos.length > 1 && (
        <div className="flex items-center justify-center gap-2 px-4 py-3 bg-black/60 overflow-x-auto">
          {photos.map((url, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`w-12 h-12 rounded-card overflow-hidden border-2 transition-all flex-shrink-0 ${
                i === index ? 'border-white scale-110' : 'border-white/20 opacity-60 hover:opacity-100'
              }`}
            >
              <img src={url} alt={`Miniatura ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Zoom indicator */}
      {zoomUi > 1.01 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/70 text-white text-xs rounded-full font-mono">
          {Math.round(zoomUi * 100)}%
        </div>
      )}
    </div>,
    document.body,
  )
}
