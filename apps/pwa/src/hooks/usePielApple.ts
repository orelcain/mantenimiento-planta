/**
 * usePielApple — ¿la piel Apple está activa? (`<html data-skin="apple">`).
 *
 * Los componentes del grader tienen dos formas: la piel anterior (intacta) y la
 * piel Apple (informe de una columna). La CSS ya distingue las pieles con
 * `:root[data-skin="apple"]`; este hook deja que el JSX haga lo mismo en los
 * casos donde la forma cambia (tablas, orden de bloques), no solo los colores.
 *
 * Observa el atributo: si la piel cambia en caliente (ControlIntensidad,
 * `aplicarPielAlDocumento`), el componente se repinta sin recargar.
 */
import { useEffect, useState } from 'react'

const leer = (): boolean =>
  typeof document !== 'undefined' && document.documentElement.getAttribute('data-skin') === 'apple'

export function usePielApple(): boolean {
  const [apple, setApple] = useState<boolean>(leer)

  useEffect(() => {
    setApple(leer())
    const mo = new MutationObserver(() => setApple(leer()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin'] })
    return () => mo.disconnect()
  }, [])

  return apple
}
