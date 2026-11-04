/**
 * Los globos de la franja «El turno completo» (A2-2a): el ⓘ de «minutos a ritmo» (con «Ver desglose») y el ⓘ de «carros con pieza»
 * (solo en las Baaders). Los textos salen de la sección «OK de la Etapa 2» del spec (mockup v7); las cifras las calcula quien llama.
 *
 * Abrir y cerrar: solo con clic o toque (el puntero encima no abre nada). `aria-expanded` sigue el estado.
 * Va en flujo (no flotando): el zoom de la franja recorta lo que se sale de su caja.
 */
import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { useGlobo } from './desgloseVista'
import type { VaraUmbral } from './perilla'

/** El ⓘ: un botón circular de 22 px con el área táctil de 44. */
export function BotonInfo({ etiqueta, abierto, alCambiar }: { etiqueta: string; abierto: boolean; alCambiar: (v: boolean) => void }) {
  const interaccion = useGlobo(abierto, alCambiar)
  return (
    <button
      type="button"
      aria-label={etiqueta}
      {...interaccion}
      className="tap-44 ml-1 inline-flex h-[22px] w-[22px] items-center justify-center rounded-full align-middle text-muted-foreground"
      style={{ border: '1px solid currentColor' }}
    >
      <Info className="h-3.5 w-3.5" aria-hidden />
    </button>
  )
}

/** Un globo: la cabeza en negrita, los párrafos y, si lo hay, el botón. Va bajo la cabecera de la fila. */
function Globo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div role="dialog" aria-label={etiqueta} className="v2-tip mt-2 rounded-card px-4 py-3 text-[13px] leading-snug text-muted-foreground tabular-nums">
      {children}
    </div>
  )
}

export interface DatosGloboRitmo {
  linea: boolean
  nombre: string
  /** Minutos a ritmo (la cifra del frente) y minutos del turno. */
  n: number
  total: number
  /** Umbral entero «a ritmo» de la vara vigente. */
  umbral: number
  vara: VaraUmbral
  /** Con una Baader: los minutos sin ser «a ritmo» que estuvo detenida (`detenida`) y los bajos sin detención (`bajo`). */
  detenida: number
  bajo: number
  /** Carros con pieza de la Baader o de la línea; null si no se pueden calcular (sin el dato completo). */
  carros: number | null
  onVerDesglose: () => void
}

/** Globo de «minutos a ritmo»: lo que cuenta el umbral, de dónde sale y con qué se compara; y «Ver desglose». */
export function GloboRitmo(d: DatosGloboRitmo) {
  const p = d.vara.cpm ?? 0
  const conPerilla = d.vara.fuente === 'perilla'
  const optimo = d.vara.modo === 'optimo'
  const otros = d.total - d.n
  const etiqueta = d.linea ? 'Minutos a ritmo de la línea' : `Minutos a ritmo de la ${d.nombre}`
  return (
    <Globo etiqueta={etiqueta}>
      <p className="text-[15px] font-semibold leading-snug text-foreground">
        {`${d.n} de ${d.total} minutos llegaron a ${d.umbral} o más por minuto.`}
      </p>
      {d.linea
        ? (
          <>
            <p className="mt-2">{`La línea suma la vara de sus Baader (${p}). Mientras una no tenga perilla, el umbral es el 75 % de esa suma; con las 3, la suma de sus umbrales.`}</p>
            {d.carros != null && <p className="mt-2">Carros con pieza de la línea: <b className="font-semibold text-foreground">{d.carros} %</b>, la suma de sus Baader.</p>}
          </>
        )
        : (
          <>
            <p className="mt-2">
              {!conPerilla
                ? `Sin perilla anotada, el umbral es el 75 % de la meta de Shoplogix (${p}).`
                : optimo
                  ? `Es la perilla completa. Con la cadena llena, Shoplogix registra ${p - 1}, ${p} o ${p + 1} según dónde cae el corte de cada minuto: los de ${p - 1} no cuentan.`
                  : `El umbral es la perilla ${p} menos 1: con la cadena llena, Shoplogix registra ${p - 1}, ${p} o ${p + 1} según dónde cae el corte de cada minuto.`}
              {` De los otros ${otros}, ${d.detenida} con la Baader detenida y ${d.bajo} bajo ${d.umbral}.`}
            </p>
            {d.carros != null && <p className="mt-2">Con la pantalla de la Baader se compara <b className="font-semibold text-foreground">carros con pieza: {d.carros} %</b>.</p>}
          </>
        )}
      <button
        type="button"
        onClick={d.onVerDesglose}
        className="tap-44 mt-2 inline-flex h-[44px] items-center text-[15px] font-semibold text-brand-ink"
      >
        Ver desglose
      </button>
    </Globo>
  )
}

export interface DatosGloboCarros {
  nombre: string
  carros: number
  /** Con perilla: su cifra; sin ella, la meta de Shoplogix. */
  conPerilla: boolean
  perilla: number | null
  meta: number | null
}

/** Globo de «carros con pieza» de una Baader: de dónde sale la cifra y por qué debería parecerse a la pantalla de la Baader. */
export function GloboCarros(d: DatosGloboCarros) {
  const vara = d.conPerilla
    ? `la perilla en ${d.perilla}`
    : `la meta de Shoplogix (${d.meta}), porque no tiene perilla anotada`
  return (
    <Globo etiqueta={`Carros con pieza de la ${d.nombre}`}>
      <p className="text-[15px] font-semibold leading-snug text-foreground">{`${d.carros} % de los carros llevaron pieza.`}</p>
      <p className="mt-2">{`Se calcula con los datos de Shoplogix: piezas contadas ÷ las que habrían pasado con ${vara}. Solo cuentan los minutos en que la Baader anduvo 30 s o más, sin los de la línea entera en cero.`}</p>
      <p className="mt-2">Por eso, en teoría, debería ser similar a la ocupación de carros que muestra la pantalla de la Baader.</p>
    </Globo>
  )
}
