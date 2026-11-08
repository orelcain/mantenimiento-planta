/**
 * Verificador de sincronía del tutorial ACR (solo lo usa la vitrina /dev/acr).
 *
 * Escucha `tutorial-acr:gesto` que emite el motor. 700 ms después de cada gesto revisa la marca:
 * 1) existe; 2) tiene área y cae dentro del viewport (tolerancia 4 px); 3) el punto central lo
 * atiende ese control (el propio, un hijo o el padre directo) y no la barra de ARIA u otra capa;
 * 4) el instante del audio que suena está a ≤ 0,35 s del esperado (cuando no habla el respaldo).
 */
import type { GestoTutorial } from './tutorialAcr'

const ESPERA_REVISION_MS = 700
const TOLERANCIA_VIEWPORT_PX = 4
const TOLERANCIA_SEG = 0.35

export interface ResultadoGesto {
  indice: number
  pasoId: string
  id: string
  tipo: GestoTutorial['tipo']
  ok: boolean
  fallas: string[]
  /** `real − esperado` en segundos; null si habló el respaldo de voz. */
  desfase: number | null
}

/** Igual que el motor: un id de `data-tutorial`, o un selector si empieza con «[». */
const selectorDe = (id: string): string => (id.startsWith('[') ? id : `[data-tutorial="${id}"]`)

function revisar(g: GestoTutorial): ResultadoGesto {
  const fallas: string[] = []
  const desfase = g.real === null ? null : g.real - g.esperado
  const el = document.querySelector<HTMLElement>(selectorDe(g.id))
  if (!el) {
    fallas.push('la marca no existe en pantalla')
  } else {
    const r = el.getBoundingClientRect()
    const cabe = r.height <= window.innerHeight
    const dentro =
      r.left >= -TOLERANCIA_VIEWPORT_PX &&
      r.right <= window.innerWidth + TOLERANCIA_VIEWPORT_PX &&
      // Lo que mide más que la pantalla (la vista de lectura en el celular) no puede caber entero:
      // basta con que cubra el centro de la pantalla.
      (cabe
        ? r.top >= -TOLERANCIA_VIEWPORT_PX && r.bottom <= window.innerHeight + TOLERANCIA_VIEWPORT_PX
        : r.top < window.innerHeight / 2 && r.bottom > window.innerHeight / 2)
    if (r.width <= 0 || r.height <= 0) {
      fallas.push('la marca no tiene área (oculta)')
    } else if (!dentro) {
      fallas.push('la marca queda fuera del viewport')
    } else {
      const top = document.elementFromPoint(r.left + r.width / 2, cabe ? r.top + r.height / 2 : window.innerHeight / 2)
      const es = top !== null && (top === el || el.contains(top) || top === el.parentElement)
      if (!es) {
        const capa = top ? describirCapa(top) : 'nada'
        fallas.push(`la tapa otra capa: ${capa}`)
      }
    }
  }
  if (desfase !== null && Math.abs(desfase) > TOLERANCIA_SEG) {
    fallas.push(`desfase de ${desfase.toFixed(2)} s (tolerancia ${TOLERANCIA_SEG} s)`)
  }
  return {
    indice: g.indice,
    pasoId: g.pasoId,
    id: g.id,
    tipo: g.tipo,
    ok: fallas.length === 0,
    fallas,
    desfase,
  }
}

/** Nombre corto de la capa que tapa la marca, para leerlo en la tabla. */
function describirCapa(el: Element): string {
  const marca = el.closest('[data-tutorial]')?.getAttribute('data-tutorial')
  if (marca) return `data-tutorial=«${marca}»`
  const etiqueta = el.getAttribute('aria-label') ?? el.tagName.toLowerCase()
  return `«${etiqueta}»`
}

/**
 * Empieza a escuchar los gestos del tutorial. `detener()` deja de escuchar, revisa de inmediato
 * los gestos que aún esperaban su revisión y devuelve todas las filas en orden de llegada.
 */
export function iniciarVerificacion(): { detener(): ResultadoGesto[] } {
  const filas: ResultadoGesto[] = []
  const pendientes = new Map<number, GestoTutorial>()

  const alGesto = (e: Event) => {
    const g = (e as CustomEvent<GestoTutorial>).detail
    const clave = window.setTimeout(() => {
      pendientes.delete(clave)
      filas.push(revisar(g))
      // El toque se revisa en el instante del pulso: lo que provoca (abrir una hoja, alargar la
      // cadena) cubre o mueve el botón 150 ms después, y eso es lo esperado.
    }, g.tipo === 'tocar' ? 0 : ESPERA_REVISION_MS)
    pendientes.set(clave, g)
  }
  window.addEventListener('tutorial-acr:gesto', alGesto)

  return {
    detener() {
      window.removeEventListener('tutorial-acr:gesto', alGesto)
      for (const [clave, g] of pendientes) {
        window.clearTimeout(clave)
        filas.push(revisar(g))
      }
      pendientes.clear()
      return [...filas]
    },
  }
}
