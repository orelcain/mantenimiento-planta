import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { ETIQUETA_FOTO } from '@/config/bitacora'
import type { FotoEvento } from '@/services/bitacora/bitacora.types'

/**
 * Foto a pantalla completa, como el visor de Fotos de iOS: fondo negro (la foto
 * manda, en ambos temas), pasar entre las fotos del evento con flechas o
 * teclado, cerrar con Escape o tocando fuera.
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

  // onClose en ref: el padre pasa una función nueva en cada render (ver Sheet.tsx).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

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

  const boton =
    'flex size-[44px] items-center justify-center rounded-full text-white/90 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-30'

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${i + 1} de ${total}`}
      className="fixed inset-0 z-[120] flex flex-col piel-fade-in motion-reduce:animate-none"
      // Opaco, como Fotos de iOS: al 92 % se transparentaban los botones de la página (ronda 21).
      style={{ background: 'rgb(0,0,0)' }}
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-2 pt-[max(8px,env(safe-area-inset-top))] text-white" onClick={(e) => e.stopPropagation()}>
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

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2">
        <img
          src={foto.url}
          alt={ETIQUETA_FOTO[foto.etiqueta]}
          className="max-h-full max-w-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        {total > 1 && (
          <>
            <button
              type="button"
              className={`${boton} absolute left-2 top-1/2 -translate-y-1/2`}
              onClick={(e) => {
                e.stopPropagation()
                setI((v) => Math.max(0, v - 1))
              }}
              disabled={i === 0}
              aria-label="Foto anterior"
            >
              <ChevronLeft className="size-7" />
            </button>
            <button
              type="button"
              className={`${boton} absolute right-2 top-1/2 -translate-y-1/2`}
              onClick={(e) => {
                e.stopPropagation()
                setI((v) => Math.min(total - 1, v + 1))
              }}
              disabled={i === total - 1}
              aria-label="Foto siguiente"
            >
              <ChevronRight className="size-7" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
