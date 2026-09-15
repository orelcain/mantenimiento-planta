/**
 * Los «nombres comunes» (apodos) de un repuesto — cuándo hay algo que guardar.
 *
 * POR QUÉ EXISTE
 * --------------
 * El editor en línea de la tabla guarda al perder el foco (`onBlur`), y guardaba SIEMPRE:
 * tocar «+ agregar apodos» y tocar en otra parte, sin escribir nada, hacía
 *
 *   - una escritura en `repuestos` que cambia `updatedAt` (la «última actualización» miente),
 *   - una entrada en `audit_log`,
 *   - la recarga del catálogo COMPLETO (~7.700 documentos + la jerarquía),
 *   - y el aviso «Nombres comunes guardados», sin que se guardara nada nuevo.
 *
 * Medido el 15-09 en producción: el ANILLO 35310055 (3300040044) no tenía el campo y quedó con
 * `nombresComunes: []` y su `updatedAt` de junio pasó a hoy, por abrir y cerrar el editor.
 */

/** Lo que el usuario escribió, como lista: separada por comas, sin espacios sobrantes ni vacíos. */
export function apodosDesdeTexto(texto: string): string[] {
  return texto.split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * ¿Cambió algo? Ausente y lista vacía son lo mismo; el orden SÍ cuenta (el primero es el que se
 * muestra), y también mayúsculas y acentos: corregirlos es un cambio legítimo.
 */
export function apodosCambiaron(anteriores: readonly string[] | undefined, nuevos: readonly string[]): boolean {
  const a = (anteriores ?? []).map((s) => s.trim()).filter(Boolean)
  if (a.length !== nuevos.length) return true
  return a.some((v, i) => v !== nuevos[i])
}
