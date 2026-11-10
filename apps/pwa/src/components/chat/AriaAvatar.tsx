/**
 * AriaAvatar — avatar de video de ARIA con polo y expresiones.
 *
 * Dos <video> superpuestos:
 *   - reposo: clip con la boca cerrada en ida y vuelta (loop sin salto), siempre en marcha.
 *   - habla: el clip de la expresión que corresponde al tono de lo que ARIA dice
 *     (saludo, explicando, buena noticia, error, alerta; ver lib/ariaTono.ts).
 * Al empezar a hablar se carga el clip del tono, parte desde 0 y entra con un fundido
 * rápido; al terminar sale con un fundido suave y se pausa.
 *
 * Los clips (apps/pwa/public/aria/polo/*.mp4, 448 × 576, ~500 KB en total) salen de LongCat
 * con la voz de Aiko y la boca contenida por deformación (Videos/LTX-Videos/ARIA-avatar-test/
 * biblioteca_polo/silencio/boca_contenida.py). Se bajan como blob para que el cambio sea instantáneo:
 * primero el reposo y después el resto en segundo plano.
 */
import { useEffect, useRef, useState } from 'react'
import { onSpeakingChange } from '@/lib/ariaVoice'
import type { TonoAvatar } from '@/lib/ariaTono'

const BASE = `${import.meta.env.BASE_URL}aria/polo/`
const REPOSO = `${BASE}reposo.mp4`
const TONOS: TonoAvatar[] = ['explicando', 'saludo', 'buena_noticia', 'error', 'alerta']
const urlTono = (t: TonoAvatar) => `${BASE}${t}.mp4`

/** Tres tamaños, un solo componente: círculo (cabecera, 40 px), riel (escritorio) y escenario (celular al hablar). */
export type TamanoAvatar = 'circulo' | 'riel' | 'escenario'

export function AriaAvatar({ visible, tamano = 'riel' }: { visible: boolean; tamano?: TamanoAvatar }) {
  const reposoRef = useRef<HTMLVideoElement>(null)
  const hablaRef = useRef<HTMLVideoElement>(null)
  const speakingRef = useRef(false)
  const lvlRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)

  useEffect(() => {
    if (!visible) return
    const reposo = reposoRef.current
    const habla = hablaRef.current
    if (!reposo || !habla) return

    let cancelled = false
    const blobs = new Map<string, string>()
    const bajar = async (url: string) => {
      if (blobs.has(url)) return blobs.get(url)!
      const r = await fetch(url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const u = URL.createObjectURL(await r.blob())
      if (cancelled) { URL.revokeObjectURL(u); throw new Error('cancelado') }
      blobs.set(url, u)
      return u
    }

    void (async () => {
      try {
        reposo.src = await bajar(REPOSO)
      } catch {
        if (cancelled) return
        reposo.src = REPOSO // sin blob: el navegador lo sirve por rangos
      }
      reposo.play().catch(() => {})
      // El resto en segundo plano, de a uno, para no competir con la respuesta de ARIA.
      for (const t of TONOS) {
        if (cancelled) return
        await bajar(urlTono(t)).catch(() => {})
      }
    })()

    const loop = () => {
      const target = speakingRef.current ? 1 : 0
      const k = target > lvlRef.current ? 0.35 : 0.12 // entra rápido, sale suave
      let lvl = lvlRef.current + (target - lvlRef.current) * k
      if (lvl < 0.01) lvl = 0
      if (lvl > 0.99) lvl = 1
      if (lvl === 0 && lvlRef.current > 0) habla.pause()
      lvlRef.current = lvl
      habla.style.opacity = lvl.toFixed(3)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    const unsub = onSpeakingChange((s, tono) => {
      speakingRef.current = s
      setIsSpeaking(s)
      if (!s) return
      const url = urlTono(tono)
      const src = blobs.get(url) ?? url
      if (habla.dataset.tono !== tono) {
        habla.src = src
        habla.dataset.tono = tono
      }
      habla.currentTime = 0
      habla.play().catch(() => {})
    })

    return () => {
      cancelled = true
      unsub()
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      blobs.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [visible])

  if (!visible) return null

  // Rostro del video (448 × 576) en x 48 %, y 17 %: el recorte del círculo y del escenario lo mantiene.
  const rostro = { objectPosition: '48% 17%' }
  const marco = tamano === 'circulo'
    ? `relative size-10 shrink-0 overflow-hidden rounded-full bg-black ${isSpeaking ? 'ring-2 ring-primary ring-offset-[3px] ring-offset-background' : ''}`
    : tamano === 'escenario'
      ? 'relative h-[min(52dvh,470px)] w-full overflow-hidden bg-black'
      : `relative w-full aspect-[7/9] rounded-card overflow-hidden bg-black border transition-shadow duration-300 ${
          isSpeaking ? 'border-primary/60 shadow-[0_0_0_2px_rgb(var(--brand)/0.45)]' : 'border-border shadow'
        }`

  return (
    <div className={marco}>
      <video
        ref={reposoRef}
        style={rostro}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        loop
        playsInline
        preload="auto"
      />
      <video
        ref={hablaRef}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        loop
        playsInline
        preload="auto"
        style={{ opacity: 0, ...rostro }}
      />
      {tamano !== 'circulo' && (
        <span
          className={`absolute bottom-1.5 right-1.5 w-2 h-2 rounded-full border border-black/40 ${
            isSpeaking ? 'bg-primary animate-pulse' : 'bg-fill-ok'
          }`}
          title={isSpeaking ? 'ARIA hablando' : 'ARIA en línea'}
        />
      )}
    </div>
  )
}
