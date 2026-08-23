import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Índice único de números de parte de TODA la planta (7.570 códigos).
 *
 * El técnico tiene un número grabado en una pieza y no sabe de qué máquina es.
 * Antes había dos buscadores separados —planos y códigos de fabricante— y
 * 4.868 códigos quedaban fuera del de planos: justo los de la GEA, la
 * enzunchadora y Marel, que no tienen despiece navegable. Ahora un solo lugar
 * responde "es de esta máquina, se llama así, y acá está el dibujo (o la
 * ficha en Repuestos si no hay dibujo)".
 *
 * Formato compacto (arrays posicionales + tablas de máquinas y planos): 310 KB
 * en disco, ~62 KB servidos. Se carga SOLO cuando la consulta parece un número
 * de parte, no en cada tecleo.
 */
export type ParteEncontrada = {
  codigo: string
  maquina: string
  nombre: string
  /** slug del despiece navegable + hoja + figura, si esa pieza tiene dibujo. */
  plano?: string
  hoja?: number
  figura?: string
}

type Crudo = {
  maquinas: string[]
  planos: string[]
  codigos: Record<string, [number, string] | [number, string, number, number, string]>
}

const URL_INDICE = `${import.meta.env.BASE_URL}data/codigos-indice.json`
/** Un número de parte tiene al menos 5 dígitos seguidos (30835544, 1424101001). */
export const PARECE_NUMERO_PARTE = /\d{5,}/

export function useCodigosParte() {
  const [datos, setDatos] = useState<Crudo | null>(null)
  const pedido = useRef(false)

  const cargar = useCallback(() => {
    if (pedido.current) return
    pedido.current = true
    fetch(URL_INDICE)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Crudo | null) => d && setDatos(d))
      .catch(() => { pedido.current = false })
  }, [])

  const buscar = useCallback(
    (q: string, tope = 8): ParteEncontrada[] => {
      if (!datos) return []
      const v = q.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
      if (v.length < 4) return []
      const out: ParteEncontrada[] = []
      for (const [cod, fila] of Object.entries(datos.codigos)) {
        if (!cod.toUpperCase().includes(v)) continue
        const [mIdx, nombre] = fila
        const e: ParteEncontrada = {
          codigo: cod,
          maquina: datos.maquinas[mIdx] ?? '',
          nombre,
        }
        if (fila.length === 5) {
          e.plano = datos.planos[fila[2]]
          e.hoja = fila[3]
          e.figura = fila[4]
        }
        // los que tienen dibujo primero: llevan a algo que se puede mirar
        out.push(e)
        if (out.length >= tope * 3) break
      }
      out.sort((a, b) => Number(!!b.plano) - Number(!!a.plano) || a.codigo.localeCompare(b.codigo))
      return out.slice(0, tope)
    },
    [datos],
  )

  return { cargar, buscar, listo: !!datos }
}

/** Carga el índice apenas la consulta parece un número de parte. */
export function useCargaSiEsNumero(q: string, cargar: () => void) {
  useEffect(() => {
    if (PARECE_NUMERO_PARTE.test(q)) cargar()
  }, [q, cargar])
}
