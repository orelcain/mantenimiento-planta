/**
 * Rutas de «herramienta» del Centro de Aprendizaje: pantallas que ocupan todo el teléfono
 * (sin barra inferior, sin botón flotante de ARIA) y llevan su propio EncabezadoHerramienta.
 *
 * - `lienzo`: la herramienta es un panel/plano que necesita todo el alto y no scrollea la página
 *   (HMI Knuro, Grader y Bombeo, Perilla 5, Tarjeta A3C, planos eléctricos abiertos y los dos
 *   editores de admin de HMI).
 * - `lectura`: página de lectura con scroll normal pero igual de pantalla completa (fichas de
 *   máquina, terreno del Baader 200, Variadores, catálogo de planos, Por confirmar de la A3C).
 * - `null`: todo lo demás, incluido el hub /aprendizaje, que conserva su barra inferior.
 *
 * Lista EXPLÍCITA a propósito: «todo lo que cuelga de /aprendizaje» arrastraría pantallas que no
 * tienen encabezado propio (p. ej. /aprendizaje/admin) y dejaría al usuario sin forma de volver.
 */
export type ModoHerramienta = 'lienzo' | 'lectura' | null

const sinBarraFinal = (p: string) => p.replace(/\/+$/, '') || '/'

export function modoHerramienta(pathname: string): ModoHerramienta {
  const p = sinBarraFinal(pathname)

  // Editores de administración de los HMI (iframe a pantalla útil).
  if (p === '/hmi-knuro' || p === '/hmi-grader') return 'lienzo'

  if (!p.startsWith('/aprendizaje/')) return null
  const r = p.slice('/aprendizaje/'.length)

  if (r === 'hmi-knuro' || r.startsWith('hmi-knuro/')) return 'lienzo'
  if (r === 'hmi-grader' || r === 'hmi-bombeo-s2' || r === 'perilla-5') return 'lienzo'
  if (r === 'baader-142/tarjeta-a3c') return 'lienzo'
  // Plano abierto (hoja): lienzo. El catálogo /aprendizaje/planos es una lista: lectura.
  if (r.startsWith('planos/')) return 'lienzo'

  if (r === 'planos' || r === 'variadores' || r === 'baader-142/tarjeta-a3c/por-confirmar') return 'lectura'
  if (r.startsWith('maquina/')) return 'lectura'
  if (r === 'baader-200/terreno' || r.startsWith('baader-200/terreno/')) return 'lectura'

  return null
}
