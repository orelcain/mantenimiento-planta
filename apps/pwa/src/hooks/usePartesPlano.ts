import { useEffect, useState } from 'react'
import { assetPlano } from '@/data/planos'

/** Una pieza física curada a mano, vinculada a una designación del plano
 *  eléctrico (B14, S00...). Viene de scripts/planos/partes_curadas_142.json. */
export type ParteFisica = {
  nr: string
  es: string
  de: string
  fig: string
  hoja: number
  pos: string
  /** 'catalogo' = el cruce sale del catálogo BAADER 2006, sin verificar en
   *  terreno. Cualquier otro valor se trata como propuesto, nunca confirmado. */
  confianza: string
  /** Cruce SAP, si el código de fabricante tiene match en el maestro de
   *  repuestos. Solo un subconjunto de aparatos lo trae. */
  sap?: string
  sapNombre?: string
  sapUbicacion?: string
}

/** Una familia de aparatos por letra IEC 81346 (K, Q, F, S, Y, M, SM, B...):
 *  las figuras del despiece donde vive esa familia, para cuando NO hay una
 *  pieza exacta vinculada por designación (ej. K7 sin fila propia). */
export type ParteFamilia = {
  etiqueta: string
  figuras: { fig: string; hoja: number; titulo: string; n: number }[]
}

export type PartesPlano = {
  /** slug del plano de despiece al que salta el botón "Ver en el despiece". */
  despiece: string
  aparatos: Record<string, ParteFisica[]>
  /** Letra -> zona sugerida en el despiece. Solo 888/860 por ahora. */
  familias?: Record<string, ParteFamilia>
}

/**
 * El puente eléctrico → pieza física: `partes.json` vive solo en los planos
 * que ya tienen esa curaduría (888/860 por ahora). Si el plano no lo trae,
 * el fetch falla y la ficha del aparato se degrada sin el bloque "Pieza
 * física", sin romper nada más.
 */
export function usePartesPlano(slug: string | undefined) {
  const [partes, setPartes] = useState<PartesPlano | null>(null)

  useEffect(() => {
    setPartes(null)
    if (!slug) return
    let vivo = true
    fetch(assetPlano(slug, 'partes.json'))
      .then((r) => (r.ok ? (r.json() as Promise<PartesPlano>) : null))
      .then((d) => {
        if (vivo) setPartes(d)
      })
      .catch(() => {
        if (vivo) setPartes(null)
      })
    return () => {
      vivo = false
    }
  }, [slug])

  return partes
}
