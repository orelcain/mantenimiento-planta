/**
 * Colores de las curvas del comparador. Hoy siempre el primero.
 *
 * En archivo aparte para que el gráfico y la lista de días usen exactamente la
 * misma serie: el punto de la fila tiene que ser del color de su línea, y dos
 * copias de la lista terminan divergiendo. (Además, exportar constantes desde
 * un módulo de componentes rompe el fast-refresh de Vite.)
 */
export const COLORES = ['#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fb923c', '#94a3b8', '#c084fc']

/** La cuota. Ámbar para que no se confunda con ningún día. */
export const COLOR_META = '#f59e0b'
