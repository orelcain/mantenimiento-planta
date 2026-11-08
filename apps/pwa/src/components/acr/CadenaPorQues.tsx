/**
 * CadenaPorQues — la cadena «¿Y por qué?» bajo la pregunta 2 de la tarjeta R1 del ACR.
 *
 * El porqué 1 es la pregunta 2 (la escribe `AcrRapidoSheet`). Aquí van los extra (hasta 4 más,
 * 5 en total). La pantalla completa muestra la misma cadena como escalera. Los datos son los
 * mismos en las dos vistas: se editan por `onCambiarPrimero` / `onCambiarExtras`.
 * Spec: spec-porques-paso1.md §2.
 */
import { Maximize2 } from 'lucide-react'
import { Button, Pill, Sheet } from '@/components/piel'
import { SpeechTextarea } from '@/components/ui/SpeechTextarea'
import { TONO_NIVEL } from '@/services/acr/acr.types'
import { MAX_PORQUES, cadenaPorQues } from '@/services/acr/acrLogica'

/** Mismo campo que las preguntas de `AcrRapidoSheet` (copia de la clase, no se exporta de allí). */
const CAMPO =
  'w-full rounded-ctl border-0 bg-muted-foreground/10 px-3 py-2.5 text-campo leading-snug text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary'

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
}: CadenaPorQuesProps) {
  const todos = [primero, ...extras]
  const ultimoVacio = (todos[todos.length - 1] ?? '').trim() === ''
  const llena = todos.length >= MAX_PORQUES
  const hayExtraConTexto = extras.some((e) => e.trim() !== '')
  // La pill «Latente candidata» va en el último porqué con texto, solo si ya hay un extra con texto.
  const indiceCandidata = hayExtraConTexto ? indiceUltimoNoVacio(todos) : -1
  // N de la fila: largo de la cadena (sin vacíos), mínimo 1.
  const n = Math.max(1, cadenaPorQues({ queSeRompio, porQue: primero, queHacemos: '', porQues: extras }).length)

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

      <div className="flex flex-wrap items-center gap-3">
        <Button data-tutorial="t-ypq" variant="tinted" size="sm" disabled={ultimoVacio || llena} onClick={agregar}>
          ＋ ¿Y por qué?
        </Button>
        <span className="text-footnote text-muted-foreground tabular-nums">{`${n} de ${MAX_PORQUES} · opcional`}</span>
      </div>

      <div>
        <Button data-tutorial="t-pantalla" variant="plain" size="sm" onClick={() => onPantalla(true)}>
          <Maximize2 />
          Pantalla completa
        </Button>
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
