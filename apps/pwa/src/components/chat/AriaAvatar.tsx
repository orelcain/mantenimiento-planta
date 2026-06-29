/**
 * AriaAvatar — avatar de video web-native de ARIA.
 *
 * Porta la técnica validada 10/10 del demo local (web_avatar/demo_referencia.html):
 *   1) Video REAL (no foto): dos <video> superpuestos, idle ↔ talk_aligned.
 *   2) Alineación frame-a-frame + LOCKSTEP: talk_aligned es lip-sync sobre la PROPIA
 *      base idle → talk[i] = idle[i] (mismo cuerpo, distinta boca). Cada frame
 *      sincronizamos talk.currentTime = idle.currentTime → el crossfade cambia SOLO
 *      la boca = cero salto de pose.
 *   3) Blob-load (fetch → createObjectURL) de ambos videos → seeks instantáneos,
 *      sin stall al inicio. Sin cache-buster: el navegador cachea el .mp4 entre aperturas.
 *   4) Gate de "hablando": el motor por defecto (Web Speech API) no expone un stream
 *      de audio analizable, así que en la PWA enganchamos el estado a ariaVoice.speak
 *      (start → habla, onend → idle) vía onSpeakingChange, con el mismo suavizado
 *      ataque-rápido / release-gentil del demo. La boca para cuando ARIA termina de hablar.
 *
 * Los videos están en apps/pwa/public/aria/{idle,talk_aligned}.mp4 (≈0.5 MB c/u),
 * generados localmente con LongCat (idle, ojos abiertos) + Wav2Lip (talk sobre el idle).
 */
import { useEffect, useRef, useState } from 'react'
import { onSpeakingChange } from '@/lib/ariaVoice'

const IDLE_SRC = `${import.meta.env.BASE_URL}aria/idle.mp4`
const TALK_SRC = `${import.meta.env.BASE_URL}aria/talk_aligned.mp4`

export function AriaAvatar({ visible }: { visible: boolean }) {
  const idleRef = useRef<HTMLVideoElement>(null)
  const talkRef = useRef<HTMLVideoElement>(null)
  const speakingRef = useRef(false)
  const lvlRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)

  useEffect(() => {
    if (!visible) return
    const idle = idleRef.current
    const talk = talkRef.current
    if (!idle || !talk) return

    let cancelled = false
    const blobUrls: string[] = []

    // Precargar ambos videos COMPLETOS a memoria → seeks instantáneos (sin stall al inicio).
    void (async () => {
      try {
        const [ri, rt] = await Promise.all([fetch(IDLE_SRC), fetch(TALK_SRC)])
        if (cancelled) return
        const iu = URL.createObjectURL(await ri.blob())
        const tu = URL.createObjectURL(await rt.blob())
        if (cancelled) {
          URL.revokeObjectURL(iu)
          URL.revokeObjectURL(tu)
          return
        }
        blobUrls.push(iu, tu)
        idle.src = iu
        talk.src = tu
        await Promise.all([idle.play().catch(() => {}), talk.play().catch(() => {})])
      } catch {
        // Fallback: servir directo (el navegador hace streaming por rangos).
        if (cancelled) return
        idle.src = IDLE_SRC
        talk.src = TALK_SRC
        idle.play().catch(() => {})
        talk.play().catch(() => {})
      }
    })()

    // LOCKSTEP CONTINUO desde que carga: idle y talk alineados frame-a-frame
    // (mismo cuerpo, distinta boca). Al ir ya sincronizados, al empezar a hablar
    // NO hay seek brusco. El gate solo cruza la opacidad de la boca.
    const loop = () => {
      if (Math.abs(talk.currentTime - idle.currentTime) > 0.06) {
        talk.currentTime = idle.currentTime
      }
      const target = speakingRef.current ? 1 : 0
      const k = target > lvlRef.current ? 0.5 : 0.1 // ataque rápido, release gentil
      let lvl = lvlRef.current + (target - lvlRef.current) * k
      if (lvl < 0.01) lvl = 0
      if (lvl > 0.99) lvl = 1
      lvlRef.current = lvl
      talk.style.opacity = lvl.toFixed(3)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    const unsub = onSpeakingChange((s) => {
      speakingRef.current = s
      setIsSpeaking(s)
    })

    return () => {
      cancelled = true
      unsub()
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      blobUrls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [visible])

  if (!visible) return null

  return (
    <div
      className={`relative w-full aspect-[7/9] rounded-xl overflow-hidden bg-black border transition-shadow duration-300 ${
        isSpeaking ? 'border-primary/60 shadow-[0_0_0_2px_rgba(46,117,182,0.45)]' : 'border-border shadow'
      }`}
    >
      <video
        ref={idleRef}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        loop
        playsInline
        preload="auto"
      />
      <video
        ref={talkRef}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        loop
        playsInline
        preload="auto"
        style={{ opacity: 0 }}
      />
      <span
        className={`absolute bottom-1.5 right-1.5 w-2 h-2 rounded-full border border-black/40 ${
          isSpeaking ? 'bg-primary animate-pulse' : 'bg-green-500'
        }`}
        title={isSpeaking ? 'ARIA hablando' : 'ARIA en línea'}
      />
    </div>
  )
}
