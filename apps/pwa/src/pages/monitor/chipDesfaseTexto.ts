/** El texto y el tono del chip de desfase (`ChipDesfase`), separados del componente para poder probarlos y reusarlos. */
import type { CuadroRep, EstadoVivo } from './reproduccionMinuto'

export type TonoChip = 'vivo' | 'aldia' | 'atrasado' | 'detenida'

const TONO: Record<EstadoVivo, TonoChip> = { vivo: 'vivo', poniendose: 'aldia', atrasado: 'atrasado', detenida: 'detenida' }

/** m:ss de una cantidad de segundos (redondeada hacia abajo). */
export function mmss(s: number): string {
  const t = Math.max(0, Math.floor(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/** El texto y el tono del chip para un cuadro del reloj. */
export function chipDeCuadro(r: CuadroRep | null | undefined): { tono: TonoChip; texto: string } {
  if (!r) return { tono: 'vivo', texto: 'En vivo · 3 min de desfase' }
  switch (r.estado) {
    case 'atrasado': return { tono: 'atrasado', texto: r.ultimaLecturaHHMM ? `Shoplogix atrasado · sin datos desde ${r.ultimaLecturaHHMM}` : 'Shoplogix atrasado · sin datos' }
    case 'detenida': return { tono: 'detenida', texto: 'Línea detenida' }
    case 'poniendose': return { tono: 'aldia', texto: `Poniéndose al día · ${mmss(r.atrasoS)}` }
    default: return { tono: TONO.vivo, texto: 'En vivo · 3 min de desfase' }
  }
}
