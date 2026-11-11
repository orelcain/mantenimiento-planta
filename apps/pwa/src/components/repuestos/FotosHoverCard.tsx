/**
 * Tarjeta flotante de fotos al pasar el mouse por la miniatura (solo PC con puntero fino).
 * Los children (la miniatura) siguen abriendo el visor al clic; la tarjeta ofrece
 * foto grande, origen (bodega / manual) y tira de miniaturas.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { origenDeFoto } from '@/utils/repuestos/origenFoto'

const ABRIR_MS = 300
const CERRAR_MS = 150
// 3× la tarjeta original (380 px): los repuestos chicos del dibujo del manual se leen sin abrir
// el visor (Orel, 16-10-2026: «un 200 % más»). Acotada a la pantalla.
const ANCHO_MAX = 380 * 3
// Si a un lado de la miniatura cabe al menos esto, va a ese lado; si no, se monta encima.
const ANCHO_LADO_MIN = 640
const PROPORCION_FOTO = 0.75
// Encabezado (nombre + código) y relleno de la tarjeta, para que la foto quepa en el alto.
const ALTO_CROMO = 84
const ALTO_TIRA = 64
const SEPARACION = 8
const MARGEN = 8
const QUERY_PC = '(hover: hover) and (pointer: fine)'

interface Props {
  fotos: string[]
  nombre: string
  /** SAP (u otro código) bajo el nombre: la tarjeta tapa la fila, así que dice de qué repuesto son las fotos. */
  codigo?: string
  onAbrir: (index: number) => void
  children: ReactNode
  /** Clases del envoltorio (en la galería ocupa toda la foto). */
  className?: string
}

function esPC(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(QUERY_PC).matches
}

export function FotosHoverCard({ fotos, nombre, codigo, onAbrir, children, className }: Props) {
  const [pc] = useState(esPC)
  const [abierta, setAbierta] = useState(false)
  const [visible, setVisible] = useState(false)
  const [activa, setActiva] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; ancho: number; altoFoto: number } | null>(null)
  const anclaRef = useRef<HTMLSpanElement>(null)
  const tarjetaRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const limpiar = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  const programarAbrir = () => {
    limpiar()
    if (abierta) return
    timer.current = setTimeout(() => { setActiva(0); setAbierta(true) }, ABRIR_MS)
  }
  const programarCerrar = () => {
    limpiar()
    timer.current = setTimeout(() => { setAbierta(false); setVisible(false); setPos(null) }, CERRAR_MS)
  }
  const cerrarYa = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setAbierta(false)
    setVisible(false)
    setPos(null)
  }, [])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  // Posición: a la derecha de la miniatura; si no cabe, a la izquierda; acotada al viewport.
  useLayoutEffect(() => {
    if (!abierta || !anclaRef.current) return
    const r = anclaRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const derecha = vw - r.right - SEPARACION - MARGEN
    const izquierda = r.left - SEPARACION - MARGEN
    const ideal = Math.min(ANCHO_MAX, vw - 2 * MARGEN)
    let ancho = ideal
    let left: number
    if (derecha >= ideal) left = r.right + SEPARACION
    else if (izquierda >= ideal) left = r.left - SEPARACION - ideal
    else if (Math.max(derecha, izquierda) >= ANCHO_LADO_MIN) {
      ancho = Math.max(derecha, izquierda)
      left = derecha >= izquierda ? r.right + SEPARACION : r.left - SEPARACION - ancho
    } else left = Math.min(Math.max(MARGEN, r.left + r.width / 2 - ideal / 2), vw - ideal - MARGEN)
    const tira = fotos.length > 1 ? ALTO_TIRA : 0
    const altoFoto = Math.max(160, Math.min((ancho - 24) * PROPORCION_FOTO, vh - 2 * MARGEN - ALTO_CROMO - tira))
    const alto = altoFoto + ALTO_CROMO + tira
    let top = r.top + r.height / 2 - alto / 2
    top = Math.min(Math.max(MARGEN, top), Math.max(MARGEN, vh - alto - MARGEN))
    setPos({ left, top, ancho, altoFoto })
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [abierta, fotos.length])

  useEffect(() => {
    if (!abierta) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrarYa() }
    const onScroll = () => cerrarYa()
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [abierta, cerrarYa])

  if (!pc || fotos.length === 0) return <>{children}</>

  const total = fotos.length
  const idx = Math.min(activa, total - 1)
  const foto = fotos[idx] ?? ''
  const origen = origenDeFoto(foto)
  const reducido = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  return (
    <>
      <span
        ref={anclaRef}
        className={className ?? 'inline-block'}
        onMouseEnter={programarAbrir}
        onMouseLeave={programarCerrar}
        onFocus={programarAbrir}
        onBlur={programarCerrar}
      >
        {children}
      </span>
      {abierta && createPortal(
        <div
          ref={tarjetaRef}
          role="dialog"
          aria-label={`Fotos de ${nombre}`}
          onMouseEnter={limpiar}
          onMouseLeave={programarCerrar}
          style={{
            position: 'fixed',
            left: pos?.left ?? 0,
            top: pos?.top ?? 0,
            width: pos?.ancho ?? ANCHO_MAX,
            opacity: visible || reducido ? 1 : 0,
            transform: visible || reducido ? 'translateX(0)' : 'translateX(-4px)',
            transition: reducido ? 'none' : 'opacity 200ms ease-out, transform 200ms ease-out',
            visibility: pos ? 'visible' : 'hidden',
          }}
          className="tipo-ingenieria z-50 rounded-[26px] border border-border bg-card p-3 shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:shadow-none"
        >
          <div className="mb-2 px-1">
            <p className="truncate text-footnote font-medium text-foreground">{nombre}</p>
            {codigo && <p className="font-mono text-footnote font-normal text-muted-foreground">{codigo}</p>}
          </div>
          <div className="relative mx-auto w-full" style={{ height: pos?.altoFoto ?? 260 }}>
            <button
              type="button"
              onClick={() => onAbrir(idx)}
              aria-label={`Abrir foto ${idx + 1} de ${total}`}
              className="block h-full w-full overflow-hidden rounded-[18px]"
            >
              <img
                src={foto}
                alt=""
                className={`h-full w-full ${origen === 'manual' ? 'bg-white object-contain' : 'object-cover'}`}
              />
            </button>
            <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-card px-2 py-0.5 text-nota font-medium tabular-nums text-foreground">
              {idx + 1} de {total}
            </span>
            {origen !== 'otra' && (
              <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-card">
                <span
                  className={`block rounded-full px-2 py-0.5 text-nota font-medium ${
                    origen === 'bodega' ? 'bg-primary/15 text-brand-ink' : 'bg-warning/15 text-ink-warn'
                  }`}
                >
                  {origen === 'bodega' ? 'Bodega' : 'Manual'}
                </span>
              </span>
            )}
          </div>
          {total > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto p-0.5">
              {fotos.map((u, i) => (
                <button
                  key={`${i}-${u}`}
                  type="button"
                  aria-label={`Ver foto ${i + 1} de ${total}`}
                  onMouseEnter={() => setActiva(i)}
                  onFocus={() => setActiva(i)}
                  onClick={() => onAbrir(i)}
                  className={`h-12 w-16 shrink-0 overflow-hidden rounded-[10px] ${
                    i === idx ? 'outline outline-2 outline-primary' : ''
                  }`}
                >
                  <img
                    src={u}
                    alt=""
                    loading="lazy"
                    className={`h-full w-full ${origenDeFoto(u) === 'manual' ? 'bg-white object-contain' : 'object-cover'}`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
