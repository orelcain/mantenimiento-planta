import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { maquinasDePlano } from '@/data/planos'
import type { MaquinaBaader } from '@/services/baader142/perilla5Protocolo'
import { parsearMaquina } from '@/utils/aprendizaje/vinculoTerreno'

const CLAVE = (slug: string) => `plano-maquina:${slug}`

function leerGuardada(slug: string | undefined): MaquinaBaader | null {
  if (!slug) return null
  try {
    return parsearMaquina(localStorage.getItem(CLAVE(slug)))
  } catch {
    return null
  }
}

/**
 * Máquina (N1/N2/N3) en la que está parado el técnico, para los planos que sirven a varias.
 * Fuente: `?maquina=n2` (un QR pegado en la N3 abre con `?maquina=n3`); si falta, la última
 * elegida en este teléfono (`localStorage plano-maquina:<slug>`). Con varias máquinas NO hay
 * default: suponer una guardaría confirmaciones en la equivocada. Plano de una sola máquina (860): esa.
 */
export function useMaquinaPlano(slug: string | undefined) {
  const maquinas = maquinasDePlano(slug)
  const [params, setParams] = useSearchParams()

  const valida = (m: MaquinaBaader | null) => (m && maquinas.includes(m) ? m : null)
  const maquina: MaquinaBaader | null =
    valida(parsearMaquina(params.get('maquina'))) ??
    valida(leerGuardada(slug)) ??
    (maquinas.length === 1 ? (maquinas[0] ?? null) : null)

  const setMaquina = useCallback(
    (m: MaquinaBaader) => {
      if (slug) {
        try {
          localStorage.setItem(CLAVE(slug), m.replace('baader-', ''))
        } catch {
          // modo privado / cuota: queda solo en la URL
        }
      }
      // Conserva el resto de la query (?el=, ?hoja=…): `setParams({maquina})` las borraría.
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('maquina', m.replace('baader-', ''))
          return next
        },
        { replace: true },
      )
    },
    [slug, setParams],
  )

  return { maquina, setMaquina, maquinas }
}
