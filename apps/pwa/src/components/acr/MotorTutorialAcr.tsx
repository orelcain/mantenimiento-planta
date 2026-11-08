/**
 * MotorTutorialAcr — el motor del tutorial narrado por ARIA (SPEC_ACR_TUTORIAL.md §2). Corre sobre la
 * tarjeta R1 y no guarda nada: quien lo monta le pasa las acciones (escribir, proponer, corregir,
 * guardar) y decide qué pasa con lo que había escrito.
 *
 * Capa fija en el body, encima del Sheet: un anillo que oscurece todo lo demás, un pulso de toque
 * y la barra de ARIA abajo (columna de celular; en PC, centrada y de 560 px). El paso avanza cuando
 * termina su audio (+500 ms). Si el audio falla, lo lee la voz del navegador (`speak` de
 * lib/ariaVoice); si tampoco hay voz, avanza por tiempo.
 */
import { useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/piel'
import { speak, stopSpeaking } from '@/lib/ariaVoice'
import {
  ESTADO_INICIAL,
  PASOS_TUTORIAL,
  TEXTO_CIERRE,
  siguienteEstado,
  urlAudio,
  type AccionTutorial,
} from './tutorialAcr'

const RETARDO_SIGUIENTE_MS = 500
const ESPERA_ANILLO_MS = 350
const ESPERA_ESCRIBIR_MS = 600
const ESPERA_TOQUE_MS = 700
const DURACION_TOQUE_MS = 700
const LETRA_MS = 38

export interface MotorTutorialAcrProps {
  onCerrar: () => void
  /** Llega al final del guion (ARIA dijo el cierre). */
  onTerminar: () => void
  escribir: (campo: 'porQue' | 'queHacemos', texto: string) => void
  accion: (a: AccionTutorial) => void
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const reducidoMovimiento = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/** Rectángulo en coordenadas de viewport del elemento `data-tutorial`, o null si no está visible. */
function rectDe(id: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-tutorial="${id}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
}

/** Tiempo de lectura de respaldo (sin audio ni voz): el mismo de la versión de referencia. */
const tiempoLectura = (texto: string): number => Math.max(3500, texto.length * 62)

export function MotorTutorialAcr({ onCerrar, onTerminar, escribir, accion }: MotorTutorialAcrProps) {
  const [est, dispatch] = useReducer(siguienteEstado, ESTADO_INICIAL)
  const [objetivo, setObjetivo] = useState<string | null>(null)
  const [anillo, setAnillo] = useState<Rect | null>(null)
  const [toque, setToque] = useState<{ r: Rect; n: number } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioIndiceRef = useRef(-1)
  /** Cada cambio de paso o de pausa abre un «turno»: los temporizadores viejos se descartan. */
  const turnoRef = useRef(0)
  // Los callbacks de quien monta el motor, siempre al día sin reiniciar el guion.
  const cbRef = useRef({ escribir, accion, onTerminar })
  cbRef.current = { escribir, accion, onTerminar }

  // Anillo: se mide al cambiar de paso y en cada scroll o resize.
  useEffect(() => {
    if (!objetivo) {
      setAnillo(null)
      return
    }
    const medir = () => setAnillo(rectDe(objetivo))
    const el = document.querySelector<HTMLElement>(`[data-tutorial="${objetivo}"]`)
    el?.scrollIntoView({ block: 'center', behavior: reducidoMovimiento() ? 'auto' : 'smooth' })
    const t = window.setTimeout(medir, ESPERA_ANILLO_MS)
    let frame = 0
    const alCambiar = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(medir)
    }
    window.addEventListener('resize', alCambiar)
    window.addEventListener('scroll', alCambiar, true)
    return () => {
      window.clearTimeout(t)
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', alCambiar)
      window.removeEventListener('scroll', alCambiar, true)
    }
  }, [objetivo])

  // Guion: un efecto por paso. Al pausar se corta todo; al seguir, el mismo paso vuelve a correr.
  useEffect(() => {
    const turno = ++turnoRef.current
    const vigente = () => turno === turnoRef.current
    const { fase, indice } = est

    if (fase === 'pausado') {
      audioRef.current?.pause()
      stopSpeaking()
      return
    }
    if (fase === 'fin') {
      setObjetivo(null)
      cbRef.current.onTerminar()
      return
    }
    if (fase !== 'hablando') return

    const paso = PASOS_TUTORIAL[indice]
    const texto = paso ? paso.texto : TEXTO_CIERRE
    setObjetivo(paso?.objetivo ?? null)

    const pulsar = (id: string) => {
      const r = rectDe(id)
      if (!r) return
      setToque({ r, n: Date.now() })
      window.setTimeout(() => setToque(null), DURACION_TOQUE_MS)
    }

    // Escribir la respuesta: letra a letra en el estado de la tarjeta (no en el DOM).
    if (paso?.escribir) {
      const { campo, texto: completo } = paso.escribir
      if (reducidoMovimiento()) {
        cbRef.current.escribir(campo, completo)
      } else {
        let n = 0
        const letra = () => {
          if (!vigente()) return
          n++
          cbRef.current.escribir(campo, completo.slice(0, n))
          if (n < completo.length) window.setTimeout(letra, LETRA_MS)
        }
        window.setTimeout(letra, ESPERA_ESCRIBIR_MS)
      }
    }

    // Toque: pulso sobre lo que se toca y luego la acción real de la tarjeta.
    if (paso && (paso.tocar || paso.accion)) {
      window.setTimeout(() => {
        if (!vigente()) return
        if (paso.tocar) pulsar(paso.tocar)
        if (paso.accion) cbRef.current.accion(paso.accion)
      }, ESPERA_TOQUE_MS)
    }

    // Audio. Si ya hay uno de este paso (se reanuda tras pausa), se sigue desde donde quedó.
    const terminado = () => {
      window.setTimeout(() => dispatch({ tipo: 'audioTerminado', indice }), RETARDO_SIGUIENTE_MS)
    }
    const respaldo = () => {
      // Sin audio: la voz del navegador con el mismo texto; si tampoco, avanza por tiempo.
      let hecho = false
      const fin = () => {
        if (hecho) return
        hecho = true
        terminado()
      }
      speak(texto, { onend: fin, onerror: () => window.setTimeout(fin, tiempoLectura(texto)) })
      window.setTimeout(fin, tiempoLectura(texto) + 4000)
    }
    let audio = audioRef.current
    if (!audio || audioIndiceRef.current !== indice || audio.ended) {
      audio?.pause()
      audio = new Audio(urlAudio(import.meta.env.BASE_URL, indice))
      audioRef.current = audio
      audioIndiceRef.current = indice
      audio.onended = terminado
      audio.onerror = respaldo
    }
    audio.play().catch(respaldo)

    // Cada corrida ya invalida a la anterior al empezar (`++turnoRef`): no hace falta cleanup.
    // `est` entero: el efecto depende de fase e índice; los callbacks van por ref.
  }, [est])

  // Al desmontar (cerrar o cambiar de hoja): silencio y ningún temporizador pendiente.
  useEffect(
    () => () => {
      turnoRef.current++
      audioRef.current?.pause()
      audioRef.current = null
      stopSpeaking()
    },
    [],
  )

  const paso = est.indice < PASOS_TUTORIAL.length ? PASOS_TUTORIAL[est.indice] : undefined
  const sonando = est.fase === 'hablando'
  const subtitulo = paso ? paso.texto : TEXTO_CIERRE

  const alCerrar = () => {
    turnoRef.current++
    audioRef.current?.pause()
    stopSpeaking()
    dispatch({ tipo: 'cerrar' })
    onCerrar()
  }

  const alPausarOSeguir = () => {
    if (est.fase === 'hablando') dispatch({ tipo: 'pausar' })
    else if (est.fase === 'pausado') dispatch({ tipo: 'seguir' })
    else if (est.fase === 'fin') dispatch({ tipo: 'repetir' })
  }

  return createPortal(
    <>
      {anillo && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[110] rounded-[18px] outline outline-[3px] outline-primary transition-all duration-[450ms] motion-reduce:transition-none"
          style={{
            left: anillo.x - 6,
            top: anillo.y - 6,
            width: anillo.w + 12,
            height: anillo.h + 12,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
          }}
        />
      )}

      {toque && (
        <div
          key={toque.n}
          aria-hidden="true"
          className="pointer-events-none fixed z-[111] -translate-x-1/2 -translate-y-1/2"
          style={{ left: toque.r.x + toque.r.w / 2, top: toque.r.y + toque.r.h / 2 }}
        >
          <span className="block size-11 rounded-full border-2 border-primary bg-white/55 animate-ping [animation-iteration-count:1] motion-reduce:hidden" />
        </div>
      )}

      <div
        role="region"
        aria-label="Tutorial de ARIA"
        className="fixed bottom-3 left-2.5 right-2.5 z-[110] flex flex-col gap-2.5 rounded-[22px] bg-card p-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.18)] lg:left-1/2 lg:right-auto lg:w-[560px] lg:-translate-x-1/2"
      >
        <div className="flex items-center gap-2 text-footnote font-semibold text-primary">
          <span className="flex h-3.5 items-end gap-0.5" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <i
                key={i}
                className={`block h-1 w-[3px] rounded-full bg-primary motion-reduce:animate-none ${sonando ? 'animate-pulse' : ''}`}
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </span>
          ARIA
        </div>

        <p aria-live="polite" className="min-h-[60px] text-body text-foreground">
          {subtitulo}
        </p>

        <div className="flex gap-1.5" aria-hidden="true">
          {/* Un punto por paso, más uno para el cierre. */}
          {Array.from({ length: PASOS_TUTORIAL.length + 1 }, (_, n) => (
            <span
              key={n}
              className={`h-1 flex-1 rounded-full ${n <= est.indice ? 'bg-primary' : 'bg-muted-foreground/20'}`}
            />
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="tinted" className="flex-1" onClick={alPausarOSeguir}>
            {sonando ? 'Pausa' : est.fase === 'fin' ? 'Repetir' : 'Seguir'}
          </Button>
          <Button
            variant="tinted"
            className="flex-1"
            disabled={est.fase === 'fin'}
            onClick={() => dispatch({ tipo: 'siguiente' })}
          >
            Siguiente
          </Button>
          <Button variant="plain" onClick={alCerrar}>
            Cerrar
          </Button>
        </div>
      </div>
    </>,
    document.body,
  )
}
