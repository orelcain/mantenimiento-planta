/**
 * variadoresUi — escala tipográfica, ritmo y recetas de color del catálogo.
 *
 * Por qué existe: la página creció por acumulación y terminó con 13 tamaños de
 * fuente distintos (10 a 19 px), 10 valores de gap, 4 radios y 31 `color-mix`
 * escritos a mano en los componentes. Nada de eso era feo por separado — pero
 * la suma se lee como descuido, que es justo lo que distingue una herramienta
 * profesional de una hecha a la rápida.
 *
 * Esto no cambia la identidad: los colores siguen saliendo de los tokens LC del
 * Centro de Aprendizaje. Lo que aporta es CONSISTENCIA: un solo lugar donde
 * decidir cuánto mide «texto de tabla» o cuánto tiñe un chip de estado.
 */
import { LC as C } from './learningTheme'

/**
 * Escala tipográfica — 7 pasos para una UI de datos densa.
 * Sin medios puntos: la diferencia entre 12,5 y 13 px no la ve nadie, pero
 * obliga a decidir dos veces lo mismo.
 */
export const T = {
  /** 11px — etiquetas de dial, pies de KPI, unidades. */
  micro: 'text-[11px]',
  /** 12px — metadatos, notas al pie, texto secundario. */
  meta: 'text-[12px]',
  /** 13px — el caballo de batalla: celdas de tabla, notas, listas. */
  dato: 'text-[13px]',
  /** 14px — cuerpo y botones. */
  cuerpo: 'text-[14px]',
  /** 15px — subtítulos, entradilla, valores de perilla. */
  sub: 'text-[15px]',
  /** 18px — títulos de sección y de ficha. */
  titulo: 'text-[18px]',
  /** 22px — el número que se lee de un vistazo (KPI). */
  destacado: 'text-[22px]',
} as const

/**
 * Recetas de color de estado. Antes cada componente escribía su propio
 * `color-mix(in srgb, X 16%, transparent)` con porcentajes que variaban entre
 * 7 y 22 % sin criterio. Acá se decide una vez.
 */
export const tinte = {
  /** Fondo de chip o botón activo. */
  suave: (color: string) => `color-mix(in srgb, ${color} 16%, transparent)`,
  /** Fondo de fila resaltada — más tenue para no competir con el texto. */
  fila: (color: string) => `color-mix(in srgb, ${color} 8%, transparent)`,
  /** Borde de un elemento en estado activo. */
  borde: (color: string) => `color-mix(in srgb, ${color} 45%, transparent)`,
  /**
   * Fondo OPACO para celdas fijas: mezcla contra la superficie, no contra
   * transparent, o se transparenta el contenido que pasa por debajo al scrollear.
   */
  opaco: (color: string, base: string) => `color-mix(in srgb, ${color} 8%, ${base})`,
} as const

/** Estilo de un chip de estado (Placa, Confirmado, Pendiente…). */
export const chip = (color: string) => ({
  color,
  background: tinte.suave(color),
})

/** Estilo de un botón/pastilla según esté activo o no. */
export const pastilla = (activo: boolean, acento = C.aqua) => ({
  background: activo ? tinte.suave(acento) : C.bgPanel,
  border: `1px solid ${activo ? acento : C.border}`,
  color: C.ink,
  fontWeight: activo ? 600 : 400,
})

/** Superficie de tarjeta o panel. */
export const panel = {
  background: C.surface,
  border: `1px solid ${C.border}`,
} as const

/** Aviso lateral (la barra de color a la izquierda). */
export const aviso = (color: string) => ({
  color: C.inkMid,
  background: tinte.fila(color),
  borderLeft: `3px solid ${color}`,
})

/**
 * Anillo de foco. Se repetía literal 20+ veces; centralizarlo evita que alguien
 * lo olvide en un control nuevo y rompa la navegación por teclado.
 */
export const FOCO = 'outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8]'
