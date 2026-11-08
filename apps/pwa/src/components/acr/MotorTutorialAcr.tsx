/**
 * MotorTutorialAcr — el motor del tutorial narrado por ARIA (guion v2: 11 capítulos, 27 pasos).
 * Corre sobre la tarjeta R1 y no guarda nada: quien lo monta le pasa cómo preparar la práctica de
 * cada paso, cómo escribir y qué hacer con cada acción.
 *
 * Capa fija en el body, encima de las hojas: un anillo que oscurece todo lo demás, un pulso de toque
 * y la barra de ARIA abajo (columna de celular; en PC, centrada y de 560 px). La barra tiene un
 * índice de capítulos: saltar a uno y seguir desde ahí.
 *
 * Cada paso: 1) `preparar(indice)` deja la práctica como la dejaron los pasos anteriores; 2) los
 * `momentos` del paso caen en su fracción del audio; 3) el paso avanza cuando termina su audio
 * (+500 ms). Si el audio falla, lo lee la voz del navegador (`speak` de lib/ariaVoice); si tampoco
 * hay voz, avanza por tiempo.
 */
import { useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/piel'
import { speak, stopSpeaking } from '@/lib/ariaVoice'
import {
  CAPITULOS,
  ESTADO_INICIAL,
  PASOS_TUTORIAL,
  siguienteEstado,
  urlAudio,
  type AccionTutorial,
} from './tutorialAcr'

const RETARDO_SIGUIENTE_MS = 500
const ESPERA_ESCRIBIR_MS = 600
const DURACION_TOQUE_MS = 700
const LETRA_MS = 38
/** Mientras aparece una hoja, el anillo se vuelve a medir durante este tiempo. */
const BUSCAR_OBJETIVO_MS = 1600
/** Si el audio no empieza a sonar en este tiempo (sin red, bloqueado), habla el respaldo. */
const ESPERA_ARRANQUE_MS = 12000
/** Tope de seguridad tras lo que le queda al audio cuando suena (por si `ended` no llega). */
const MARGEN_TOPE_MS = 2500

export interface MotorTutorialAcrProps {
  onCerrar: () => void
  /** Llega al final del guion. */
  onTerminar: () => void
  /** Deja la práctica como debe estar al empezar el paso `indice`. */
  preparar: (indice: number) => void
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

/** Una marca se busca por su atributo data-tutorial; lo que empieza con «[» ya es un selector. */
const selectorDe = (id: string): string => (id.startsWith('[') ? id : `[data-tutorial="${id}"]`)

/** Rectángulo en coordenadas de viewport del elemento, o null si no está visible. */
function rectDe(id: string): Rect | null {
  const el = document.querySelector<HTMLElement>(selectorDe(id))
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
}

/** Tiempo de lectura de respaldo (sin audio ni voz). */
const tiempoLectura = (texto: string): number => Math.max(3500, texto.length * 62)

export function MotorTutorialAcr({ onCerrar, onTerminar, preparar, escribir, accion }: MotorTutorialAcrProps) {
  // Montar el motor = empezar el tutorial (regresión del 08-11: quedaba en «inactivo»).
  const [est, dispatch] = useReducer(siguienteEstado, ESTADO_INICIAL, (e) => siguienteEstado(e, { tipo: 'iniciar' }))
  const [objetivo, setObjetivo] = useState<string | null>(null)
  const [anillo, setAnillo] = useState<Rect | null>(null)
  const [toque, setToque] = useState<{ r: Rect; n: number } | null>(null)
  const [indiceAbierto, setIndiceAbierto] = useState(false)
  /** Alto de la barra de ARIA: para no tapar el objetivo (se corre el scroll o la barra sube). */
  const barraRef = useRef<HTMLDivElement | null>(null)
  const altoBarraRef = useRef(0)
  const [altoBarra, setAltoBarra] = useState(0)
  const [altoVentana, setAltoVentana] = useState(() => (typeof window === 'undefined' ? 0 : window.innerHeight))
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioIndiceRef = useRef(-1)
  const precargaRef = useRef<{ indice: number; audio: HTMLAudioElement } | null>(null)
  /** Cada cambio de paso o de pausa abre un «turno»: los temporizadores viejos se descartan. */
  const turnoRef = useRef(0)
  // Los callbacks de quien monta el motor, siempre al día sin reiniciar el guion.
  const cbRef = useRef({ escribir, accion, onTerminar, preparar })
  cbRef.current = { escribir, accion, onTerminar, preparar }

  // Anillo: se busca un rato (la hoja que lo contiene puede estar abriéndose) y se sigue en
  // cada scroll o resize.
  useEffect(() => {
    if (!objetivo) {
      setAnillo(null)
      return
    }
    let scrolleado = false
    const medir = () => {
      const r = rectDe(objetivo)
      if (r && !scrolleado) {
        scrolleado = true
        const el = document.querySelector<HTMLElement>(selectorDe(objetivo))
        if (el) {
          // El margen inferior hace que el centrado deje el objetivo por encima de la barra.
          el.style.scrollMarginBottom = `${altoBarraRef.current + 16}px`
          el.scrollIntoView({ block: 'center', behavior: reducidoMovimiento() ? 'auto' : 'smooth' })
        }
      }
      setAnillo(r)
    }
    medir()
    const inicio = Date.now()
    const buscar = window.setInterval(() => {
      medir()
      if (Date.now() - inicio > BUSCAR_OBJETIVO_MS) window.clearInterval(buscar)
    }, 200)
    let frame = 0
    const alCambiar = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(medir)
    }
    window.addEventListener('resize', alCambiar)
    window.addEventListener('scroll', alCambiar, true)
    return () => {
      window.clearInterval(buscar)
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', alCambiar)
      window.removeEventListener('scroll', alCambiar, true)
    }
  }, [objetivo])

  // Alto de la barra y de la ventana, al día.
  useEffect(() => {
    const el = barraRef.current
    const medir = () => {
      altoBarraRef.current = el?.offsetHeight ?? 0
      setAltoBarra(altoBarraRef.current)
      setAltoVentana(window.innerHeight)
    }
    medir()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir)
    if (el) ro?.observe(el)
    window.addEventListener('resize', medir)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', medir)
    }
  }, [])

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
    if (!paso) return
    const texto = paso.texto
    cbRef.current.preparar(indice)
    setObjetivo(paso.objetivo)

    const pulsar = (id: string) => {
      const r = rectDe(id)
      if (!r) return
      setToque({ r, n: Date.now() })
      window.setTimeout(() => setToque(null), DURACION_TOQUE_MS)
    }

    // Escribir la respuesta: letra a letra en el estado de la tarjeta (no en el DOM).
    if (paso.escribir) {
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

    // Audio. Si ya hay uno de este paso (se reanuda tras pausa), se sigue desde donde quedó.
    // Si el paso siguiente ya estaba precargado, se usa ese: sin espera de red entre pasos.
    let audio = audioRef.current
    if (!audio || audioIndiceRef.current !== indice || audio.ended) {
      audio?.pause()
      const precargado = precargaRef.current
      audio =
        precargado && precargado.indice === indice
          ? precargado.audio
          : new Audio(urlAudio(import.meta.env.BASE_URL, indice))
      audioRef.current = audio
      audioIndiceRef.current = indice
    }
    const a = audio
    // Precarga del que sigue.
    if (indice + 1 < PASOS_TUTORIAL.length && precargaRef.current?.indice !== indice + 1) {
      const sig = new Audio(urlAudio(import.meta.env.BASE_URL, indice + 1))
      sig.preload = 'auto'
      precargaRef.current = { indice: indice + 1, audio: sig }
    }

    // Momentos: cada uno en su fracción del audio que queda. Se programan una vez, cuando el audio
    // empieza a SONAR (no cuando empieza el paso: con red lenta la carga correría los gestos), o
    // con el tiempo de lectura si habla el respaldo.
    let programados = false
    const programar = () => {
      if (programados || !vigente()) return
      programados = true
      const total = Number.isFinite(a.duration) && a.duration > 0 ? a.duration * 1000 : tiempoLectura(texto)
      const yaSonado = Number.isFinite(a.currentTime) ? a.currentTime * 1000 : 0
      for (const m of paso.momentos ?? []) {
        const espera = Math.max(0, m.en * total - yaSonado)
        window.setTimeout(() => {
          if (!vigente()) return
          if (m.accion) cbRef.current.accion(m.accion)
          if (m.objetivo) setObjetivo(m.objetivo)
          if (m.tocar) {
            const id = m.tocar
            // Tras la acción la hoja puede estar abriéndose: el pulso espera un cuadro.
            requestAnimationFrame(() => pulsar(id))
          }
        }, espera)
      }
    }
    // Una sola salida por corrida: el fin del audio, el respaldo o el tope de tiempo, lo que
    // llegue primero. Sin tope, un `play()` que nunca resuelve dejaba el tutorial pegado.
    // El tope cuenta desde que el audio SUENA: contado desde el inicio del paso, una carga lenta
    // (wifi de planta) hacía avanzar antes de que terminara la frase.
    let avanzado = false
    const terminado = () => {
      if (avanzado || !vigente()) return
      avanzado = true
      window.setTimeout(() => {
        if (vigente()) dispatch({ tipo: 'audioTerminado', indice })
      }, RETARDO_SIGUIENTE_MS)
    }
    let respaldoUsado = false
    const respaldo = () => {
      if (respaldoUsado || avanzado || !vigente()) return
      respaldoUsado = true
      window.clearTimeout(arranque)
      a.pause()
      programar()
      speak(texto, { onend: terminado, onerror: () => window.setTimeout(terminado, tiempoLectura(texto)) })
    }
    let tope = 0
    const alSonar = () => {
      if (!vigente() || respaldoUsado) return
      window.clearTimeout(arranque)
      programar()
      window.clearTimeout(tope)
      const restante = Number.isFinite(a.duration) && a.duration > 0
        ? (a.duration - a.currentTime) * 1000
        : tiempoLectura(texto)
      tope = window.setTimeout(terminado, restante + MARGEN_TOPE_MS)
    }
    // Si en ESPERA_ARRANQUE_MS no empezó a sonar (sin red, bloqueado), lo lee el respaldo.
    const arranque = window.setTimeout(respaldo, ESPERA_ARRANQUE_MS)
    a.onplaying = alSonar
    a.onended = terminado
    a.onerror = respaldo
    a.play().catch(respaldo)
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

  const paso = PASOS_TUTORIAL[est.indice]
  const capitulo = paso?.capitulo ?? 1
  const sonando = est.fase === 'hablando'
  // Objetivo fijo abajo (pie de una hoja, confirmación) que la barra taparía: la barra sube.
  // Solo si arriba hay espacio; si el objetivo ocupa toda la pantalla, se queda abajo.
  // El botón «Índice» vive en la barra: iluminarlo no la mueve (si no, la barra saltaría sin fin).
  const barraArriba =
    anillo != null &&
    objetivo !== 't-indice' &&
    altoBarra > 0 &&
    anillo.y + anillo.h > altoVentana - altoBarra - 16 &&
    anillo.y > altoBarra + 28

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

  const saltar = (c: number) => {
    setIndiceAbierto(false)
    dispatch({ tipo: 'saltar', capitulo: c })
  }

  return createPortal(
    <>
      {anillo && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[125] rounded-[18px] outline outline-[3px] outline-primary transition-all duration-[450ms] motion-reduce:transition-none"
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
          className="pointer-events-none fixed z-[126] -translate-x-1/2 -translate-y-1/2"
          style={{ left: toque.r.x + toque.r.w / 2, top: toque.r.y + toque.r.h / 2 }}
        >
          <span className="block size-11 rounded-full border-2 border-primary bg-white/55 animate-ping [animation-iteration-count:1] motion-reduce:hidden" />
        </div>
      )}

      <div
        ref={barraRef}
        role="region"
        aria-label="Tutorial de ARIA"
        data-posicion={barraArriba ? 'arriba' : 'abajo'}
        className={`fixed ${barraArriba ? 'top-[max(12px,env(safe-area-inset-top))]' : 'bottom-3'} left-2.5 right-2.5 z-[130] flex max-h-[70dvh] flex-col gap-2.5 rounded-[22px] bg-card p-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.18)] lg:left-1/2 lg:right-auto lg:w-[560px] lg:-translate-x-1/2`}
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
          <span className="ml-auto truncate font-normal text-muted-foreground tabular-nums">
            {capitulo}/{CAPITULOS.length} · {CAPITULOS[capitulo - 1]}
          </span>
        </div>

        {indiceAbierto ? (
          <nav aria-label="Capítulos del tutorial" className="-mx-1 flex min-h-0 flex-col overflow-y-auto">
            {CAPITULOS.map((titulo, i) => (
              <button
                key={titulo}
                type="button"
                onClick={() => saltar(i + 1)}
                aria-current={i + 1 === capitulo ? 'step' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-ctl px-2 text-left text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  i + 1 === capitulo ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground'
                }`}
              >
                <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}</span>
                {titulo}
              </button>
            ))}
          </nav>
        ) : (
          <p aria-live="polite" className="min-h-[60px] text-body text-foreground">
            {paso?.texto}
          </p>
        )}

        <div className="flex gap-1.5" aria-hidden="true">
          {/* Un tramo por capítulo. */}
          {CAPITULOS.map((t, n) => (
            <span
              key={t}
              className={`h-1 flex-1 rounded-full ${n + 1 <= capitulo ? 'bg-primary' : 'bg-muted-foreground/20'}`}
            />
          ))}
        </div>

        {/* A 375 px caben los cuatro: Pausa y Siguiente se reparten el ancho; Índice y Cerrar, lo justo. */}
        <div className="flex gap-1.5">
          <Button variant="tinted" className="min-w-0 flex-1 px-3" onClick={alPausarOSeguir}>
            {sonando ? 'Pausa' : est.fase === 'fin' ? 'Repetir' : 'Seguir'}
          </Button>
          <Button
            variant="tinted"
            className="min-w-0 flex-1 px-3"
            disabled={est.fase === 'fin'}
            onClick={() => dispatch({ tipo: 'siguiente' })}
          >
            Siguiente
          </Button>
          <Button
            data-tutorial="t-indice"
            variant="plain"
            className="shrink-0 px-3"
            aria-expanded={indiceAbierto}
            onClick={() => setIndiceAbierto((v) => !v)}
          >
            Índice
          </Button>
          <Button variant="plain" className="shrink-0 px-3" onClick={alCerrar}>
            Cerrar
          </Button>
        </div>
      </div>
    </>,
    document.body,
  )
}
