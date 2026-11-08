/**
 * CadenaPorQues — la cadena «¿Y por qué?» bajo la pregunta 2 de la tarjeta R1 del ACR.
 *
 * El porqué 1 es la pregunta 2 (la escribe `AcrRapidoSheet`). Aquí van los extra (hasta 4 más,
 * 5 en total). La pantalla completa muestra la misma cadena como escalera. Los datos son los
 * mismos en las dos vistas: se editan por `onCambiarPrimero` / `onCambiarExtras`.
 * Spec: spec-porques-paso1.md §2. «ARIA pregunta» (forma B) va en la misma fila que «Pantalla completa».
 */
import { useEffect, useRef, useState } from 'react'
import { Maximize2, Sparkles } from 'lucide-react'
import { Button, Pill, Sheet } from '@/components/piel'
import { SpeechTextarea } from '@/components/ui/SpeechTextarea'
import { logger } from '@/lib/logger'
import { TONO_NIVEL } from '@/services/acr/acr.types'
import { MAX_PORQUES, cadenaPorQues } from '@/services/acr/acrLogica'
import type { PreguntarPorQue } from '@/services/acr/preguntarPorQue'

/** Mismo campo que las preguntas de `AcrRapidoSheet` (copia de la clase, no se exporta de allí). */
const CAMPO =
  'w-full rounded-ctl border-0 bg-muted-foreground/10 px-3 py-2.5 text-campo leading-snug text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary'

/** Preferencia de la forma de «ARIA pregunta»: solo cambia el aspecto del botón, nunca llama a la IA. */
const CLAVE_PREFERENCIA_ARIA = 'acr-porques-modo'

function leerPreferenciaAria(): boolean {
  try {
    return localStorage.getItem(CLAVE_PREFERENCIA_ARIA) === 'aria'
  } catch {
    return false
  }
}

function guardarPreferenciaAria(): void {
  try {
    localStorage.setItem(CLAVE_PREFERENCIA_ARIA, 'aria')
  } catch {
    // Sin almacenamiento el botón vuelve a su forma normal; no pasa nada más.
  }
}

/** Sigue el estado de la red (`online` / `offline`) mientras la cadena está abierta. */
function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine)
  useEffect(() => {
    const alConectar = () => setEnLinea(true)
    const alCortar = () => setEnLinea(false)
    window.addEventListener('online', alConectar)
    window.addEventListener('offline', alCortar)
    return () => {
      window.removeEventListener('online', alConectar)
      window.removeEventListener('offline', alCortar)
    }
  }, [])
  return enLinea
}

export interface CadenaPorQuesProps {
  /** Porqué 1 (pregunta 2). */
  primero: string
  /** Porqués 2..5, en orden. */
  extras: string[]
  onCambiarPrimero: (valor: string) => void
  onCambiarExtras: (valor: string[]) => void
  pantallaAbierta: boolean
  onPantalla: (abierta: boolean) => void
  /** Prefijo de los ids de los campos (no se repiten con la pregunta 2). */
  idBase: string
  /** Lo que se rompió: va como descripción de la pantalla completa. */
  queSeRompio: string
  /** Pide la siguiente pregunta a ARIA (`preguntarPorQue` en la app; simulada en la vitrina). */
  preguntar: PreguntarPorQue
  /** Equipo, para el contexto que recibe ARIA. */
  equipo: string
  /** Se llama cuando el técnico responde a ARIA: el porqué entra a la cadena. */
  onUsoAria: () => void
  /** Tarjeta de «ARIA pregunta» abierta (la controla el padre, así el tutorial también la abre). */
  ariaAbierta: boolean
  onAria: (abierta: boolean) => void
  /** En el tutorial: pregunta fija. Con valor, la IA nunca se llama. */
  preguntaPractica?: string | null
}

/**
 * Etiqueta del porqué `n` (≥2). La respuesta anterior ya está a la vista justo arriba: citar un
 * pedazo de ella («¿por qué "al entrar el pescado"?») se leía torpe (preview, 08-11), así que la
 * pregunta es la misma para todos los porqués.
 */
function etiquetaPorQue(n: number): string {
  return `Porqué ${n} · ¿y por qué pasa eso?`
}

/** Índice del último porqué con texto, o -1 si no hay ninguno. */
function indiceUltimoNoVacio(lista: string[]): number {
  for (let i = lista.length - 1; i >= 0; i--) {
    if ((lista[i] ?? '').trim() !== '') return i
  }
  return -1
}

export function CadenaPorQues({
  primero,
  extras,
  onCambiarPrimero,
  onCambiarExtras,
  pantallaAbierta,
  onPantalla,
  idBase,
  queSeRompio,
  preguntar,
  equipo,
  onUsoAria,
  ariaAbierta,
  onAria,
  preguntaPractica = null,
}: CadenaPorQuesProps) {
  const todos = [primero, ...extras]
  const ultimoVacio = (todos[todos.length - 1] ?? '').trim() === ''
  const llena = todos.length >= MAX_PORQUES
  const hayExtraConTexto = extras.some((e) => e.trim() !== '')
  // La pill «Latente candidata» va en el último porqué con texto, solo si ya hay un extra con texto.
  const indiceCandidata = hayExtraConTexto ? indiceUltimoNoVacio(todos) : -1
  // La cadena sin vacíos: es lo que recibe ARIA. N de la fila: su largo, mínimo 1.
  const cadenaLimpia = cadenaPorQues({ queSeRompio, porQue: primero, queHacemos: '', porQues: extras })
  const n = Math.max(1, cadenaLimpia.length)

  // ── «ARIA pregunta» ──────────────────────────────────────────────────────
  const enLinea = useEnLinea()
  const sinSenal = !enLinea && preguntaPractica == null
  const [modoAria, setModoAria] = useState(leerPreferenciaAria)
  const [pregunta, setPregunta] = useState<string | null>(null)
  const [pensandoAria, setPensandoAria] = useState(false)
  const [respuestaAria, setRespuestaAria] = useState('')
  const [ariaFallo, setAriaFallo] = useState(false)
  /** Id de la última solicitud: una respuesta vieja (la tarjeta ya cambió) se descarta. */
  const solicitudRef = useRef(0)

  /** Pide a ARIA la siguiente pregunta. En el tutorial, la fija sin tocar la IA. */
  const pedirPregunta = (cadena: string[]) => {
    const id = ++solicitudRef.current
    setAriaFallo(false)
    if (preguntaPractica != null) {
      setPensandoAria(false)
      setPregunta(preguntaPractica)
      return
    }
    setPregunta(null)
    setPensandoAria(true)
    preguntar({ equipo, queSeRompio, cadena })
      .then((p) => {
        if (id === solicitudRef.current) setPregunta(p)
      })
      .catch((e: unknown) => {
        if (id !== solicitudRef.current) return
        logger.warn('ARIA no pudo preguntar por el porqué; se escribe a mano', {
          motivo: e instanceof Error ? e.message : String(e),
        })
        // Cierra la tarjeta sin tocar lo escrito: la cadena y el texto del técnico se quedan.
        setAriaFallo(true)
        onAria(false)
      })
      .finally(() => {
        if (id === solicitudRef.current) setPensandoAria(false)
      })
  }

  // Las funciones de abajo leen siempre el render actual, sin reiniciar el efecto.
  const pedirRef = useRef(pedirPregunta)
  pedirRef.current = pedirPregunta
  const cadenaRef = useRef(cadenaLimpia)
  cadenaRef.current = cadenaLimpia

  // Se pide la pregunta al ABRIR la tarjeta (el técnico tocó el botón, o el tutorial la abrió).
  // Al cerrarla se invalida lo que quede en vuelo y se limpia la pregunta.
  useEffect(() => {
    if (!ariaAbierta) {
      solicitudRef.current++
      setPregunta(null)
      setPensandoAria(false)
      return
    }
    pedirRef.current(cadenaRef.current)
  }, [ariaAbierta])

  /**
   * Responder: el texto entra como porqué nuevo (o reemplaza el campo vacío del final), se pide la
   * siguiente pregunta, y si la cadena llega a 5 la tarjeta se cierra.
   */
  const responder = () => {
    const texto = respuestaAria.trim()
    if (texto === '' || pregunta == null) return
    const hayVacioFinal = extras.length > 0 && (extras[extras.length - 1] ?? '').trim() === ''
    const nuevas = hayVacioFinal ? [...extras.slice(0, -1), texto] : [...extras, texto]
    const nuevaCadena = cadenaPorQues({ queSeRompio, porQue: primero, queHacemos: '', porQues: nuevas })
    onCambiarExtras(nuevas)
    onUsoAria()
    guardarPreferenciaAria()
    setModoAria(true)
    setRespuestaAria('')
    if (nuevaCadena.length >= MAX_PORQUES) {
      onAria(false)
      return
    }
    pedirPregunta(nuevaCadena)
  }

  /** «Ya llegué a la causa» y «Escribo yo»: se cierra la tarjeta y se descarta lo que estaba escrito. */
  const cerrarAria = () => {
    setRespuestaAria('')
    onAria(false)
  }

  const ariaDeshabilitado = primero.trim() === '' || llena || sinSenal

  const agregar = () => onCambiarExtras([...extras, ''])

  return (
    <div className="flex flex-col gap-3">
      {extras.length > 0 && (
        <div data-tutorial="t-porques" className="ml-2 flex flex-col gap-3 border-l-2 border-muted-foreground/25 pl-4">
          {extras.map((valor, i) => {
            const numero = i + 2
            const id = `${idBase}-porque-${numero}`
            return (
              <div key={numero} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={id} className="text-footnote font-semibold text-foreground">
                    {etiquetaPorQue(numero)}
                  </label>
                  {indiceCandidata === i + 1 && <Pill tone={TONO_NIVEL.latente}>Latente candidata</Pill>}
                </div>
                <SpeechTextarea
                  id={id}
                  rows={2}
                  maxLength={2000}
                  aria-label={`Porqué ${numero}`}
                  value={valor}
                  onChange={(e) => onCambiarExtras(extras.map((v, j) => (j === i ? e.target.value : v)))}
                  className={`${CAMPO} resize-y pr-14`}
                />
                <div>
                  <Button
                    variant="plain"
                    size="sm"
                    aria-label={`Quitar porqué ${numero}`}
                    onClick={() => onCambiarExtras(extras.filter((_, j) => j !== i))}
                  >
                    Quitar
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {ariaAbierta && (
        <div data-tutorial="t-aria-card" className="flex flex-col gap-3 rounded-card bg-card p-4">
          <p className="text-footnote font-semibold text-muted-foreground">
            {`ARIA · porqué ${cadenaLimpia.length + 1} de ${MAX_PORQUES}`}
          </p>
          {pensandoAria ? (
            <p role="status" className="text-body text-muted-foreground">
              ARIA está pensando…
            </p>
          ) : (
            pregunta != null && <p className="text-body font-semibold text-foreground">{pregunta}</p>
          )}
          <SpeechTextarea
            id={`${idBase}-aria`}
            rows={2}
            maxLength={2000}
            aria-label="Tu respuesta a ARIA"
            value={respuestaAria}
            onChange={(e) => setRespuestaAria(e.target.value)}
            className={`${CAMPO} resize-y pr-14`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="filled"
              size="sm"
              disabled={pensandoAria || pregunta == null || respuestaAria.trim() === ''}
              onClick={responder}
            >
              Responder
            </Button>
            <Button variant="plain" size="sm" onClick={cerrarAria}>
              Ya llegué a la causa
            </Button>
            <Button variant="plain" size="sm" onClick={cerrarAria}>
              Escribo yo
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button data-tutorial="t-ypq" variant="tinted" size="sm" disabled={ultimoVacio || llena} onClick={agregar}>
          ＋ ¿Y por qué?
        </Button>
        <span className="text-footnote text-muted-foreground tabular-nums">{`${n} de ${MAX_PORQUES} · opcional`}</span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            data-tutorial="t-aria-pregunta"
            variant={modoAria ? 'tinted' : 'plain'}
            size="sm"
            disabled={ariaDeshabilitado}
            onClick={() => onAria(true)}
          >
            <Sparkles />
            ARIA pregunta
          </Button>
          <Button data-tutorial="t-pantalla" variant="plain" size="sm" onClick={() => onPantalla(true)}>
            <Maximize2 />
            Pantalla completa
          </Button>
        </div>
        {sinSenal && <p className="text-footnote text-muted-foreground">Sin señal: escribe tú</p>}
        {ariaFallo && (
          <p role="status" className="text-footnote font-semibold text-ink-warn">
            ARIA no respondió. Escribe tú.
          </p>
        )}
      </div>

      <Sheet
        open={pantallaAbierta}
        onClose={() => onPantalla(false)}
        surface="grouped"
        title="5 porqués"
        description={`Se rompió: ${queSeRompio}`}
        actions={
          <Button variant="filled" size="block" onClick={() => onPantalla(false)}>
            Listo
          </Button>
        }
      >
        <ol data-tutorial="t-porques-hoja" className="flex flex-col gap-4">
          {todos.map((valor, i) => {
            const numero = i + 1
            const id = `${idBase}-hoja-${numero}`
            return (
              <li key={numero} className="flex flex-col gap-2">
                {i > 0 && <p className="text-footnote text-muted-foreground">¿Por qué?</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={id} className="text-footnote font-semibold text-foreground">
                    {`Porqué ${numero}`}
                  </label>
                  {indiceCandidata === i && <Pill tone={TONO_NIVEL.latente}>Latente candidata</Pill>}
                </div>
                <SpeechTextarea
                  id={id}
                  rows={2}
                  maxLength={2000}
                  aria-label={`Porqué ${numero}`}
                  value={valor}
                  onChange={(e) =>
                    i === 0
                      ? onCambiarPrimero(e.target.value)
                      : onCambiarExtras(extras.map((v, j) => (j === i - 1 ? e.target.value : v)))
                  }
                  className={`${CAMPO} resize-y pr-14`}
                />
              </li>
            )
          })}
        </ol>
        {!llena && (
          <div className="mt-4">
            <Button variant="tinted" size="sm" disabled={ultimoVacio} onClick={agregar}>
              ＋ ¿Y por qué?
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  )
}
