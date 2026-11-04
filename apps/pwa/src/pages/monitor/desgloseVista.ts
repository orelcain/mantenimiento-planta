/**
 * Lo que la vista del desglose y los globos de la franja necesitan y no es un componente (A2-2a): el texto de los tiempos, el nombre
 * de cada causa, el rótulo de la vara, la detención de la línea por minuto y el hook que abre un globo. Va en un `.ts` aparte porque
 * los archivos de componente solo exportan componentes (react-refresh).
 */
import { type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { CATEGORIA_META, IMPUTACION_LEAVES, matchImputacion } from '@/services/shoplogix/imputacionTaxonomy'
import { detencionesPorMinuto } from './desglose'
import type { ParadaDetalle } from './ritmoVivo'
import type { VaraUmbral } from './perilla'

export type Unidad = 'min' | 'h'

const pad = (x: number) => String(x).padStart(2, '0')

/** Minutos en el texto del tiempo: «55» en min, «7 h 35» en h. */
export function tiempoTexto(x: number, u: Unidad): string {
  return u === 'h' ? `${Math.floor(x / 60)} h ${pad(x % 60)}` : `${x}`
}

/** Sin tilde y en minúsculas: la clave con la que se busca una palabra en la taxonomía. */
const sinTilde = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Palabras con tilde de la taxonomía («Detención», «Colación»…), por su forma sin tilde. Se arma una vez. */
let tildes: Map<string, string> | null = null
function palabrasConTilde(): Map<string, string> {
  if (tildes) return tildes
  tildes = new Map()
  const textos = [...IMPUTACION_LEAVES.map((l) => l.label), ...Object.values(CATEGORIA_META).flatMap((m) => [m.label, m.short])]
  for (const texto of textos) {
    for (const palabra of texto.split(/\s+/)) {
      const minusc = palabra.toLowerCase()
      if (minusc !== sinTilde(minusc)) tildes.set(sinTilde(minusc), minusc)
    }
  }
  return tildes
}

/**
 * Nombre legible de un motivo de Shoplogix (sin « - Paro»). Si la taxonomía reconoce el motivo, su nombre oficial. Si no, el motivo
 * en minúsculas con las tildes que la taxonomía ya usa («Micro Detencion» → «micro detención»). Una palabra que la taxonomía no
 * conoce queda tal cual, sin inventar tilde.
 */
export function nombreCausa(razon: string): string {
  const leaf = matchImputacion(razon).leaf
  if (leaf) return leaf.label.replace(/\s*-\s*Paro$/i, '')
  const base = razon.trim().replace(/\s*-\s*Paro$/i, '').toLowerCase()
  const con = palabrasConTilde()
  return base.split(/(\s+)/).map((p) => (/^\s+$/.test(p) ? p : (con.get(sinTilde(p)) ?? p))).join('')
}

/** Lo que el rótulo «a ritmo» dice entre paréntesis: de dónde sale el umbral. */
export function sufijoRitmo(vara: VaraUmbral, linea: boolean): string {
  if (vara.fuente !== 'perilla') return linea ? '(75 % de la vara)' : '(75 % de la meta)'
  if (vara.modo === 'optimo') return '(la perilla)'
  return linea ? '(suma de umbrales)' : '(perilla − 1)'
}

/**
 * La detención de la LÍNEA por minuto: está detenida si alguna de sus Baaders lo está; el motivo es el de la Baader con más segundos
 * detenidos en ese minuto (su propio motivo, el de la parada que más cubre). Pura: la franja la usa con las paradas de cada Baader.
 */
export function detencionLinea(porMaquina: Array<ParadaDetalle[] | undefined>, t0: number, n: number): { con: boolean[]; razon: Array<string | null> } {
  const por = porMaquina.map((p) => detencionesPorMinuto(p, t0, n))
  const con: boolean[] = []
  const razon: Array<string | null> = []
  for (let k = 0; k < n; k++) {
    const ini = t0 + k * 60_000
    const fin = ini + 60_000
    let mejorMs = 0
    let motivo: string | null = null
    porMaquina.forEach((ps, i) => {
      if (!por[i]!.con[k]) return
      const ms = (ps ?? []).reduce((a, p) => a + Math.max(0, Math.min(p.finMs, fin) - Math.max(p.iniMs, ini)), 0)
      if (ms > mejorMs) {
        mejorMs = ms
        motivo = por[i]!.razon[k] ?? null
      }
    })
    con.push(por.some((x) => x.con[k] === true))
    razon.push(motivo)
  }
  return { con, razon }
}

/**
 * Abre y cierra un globo: SOLO con clic o toque, con mouse o con dedo (A2-2b: el puntero encima no abre nada, así el desglose no se
 * mueve sin que lo pidan). Quien llama guarda el estado (`abierto`) y lo cambia con `alCambiar`.
 */
export function useGlobo(abierto: boolean, alCambiar: (v: boolean) => void) {
  return {
    'aria-expanded': abierto,
    onClick: () => alCambiar(!abierto),
  }
}

/** Tecla Enter o espacio: alterna el globo de una fila que no es un botón nativo. */
export function alTeclearGlobo(e: ReactKeyboardEvent<HTMLElement>, abierto: boolean, alCambiar: (v: boolean) => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    alCambiar(!abierto)
  }
}
