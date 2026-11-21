/**
 * Versión del lector del espejo y alta del instalador (lógica pura, sin Firestore).
 *
 * El instalador (`instalar-lector-espejo.ps1`) trae `$VERSION = 'eX.Y'` y la línea
 * `$ALTA = '@@ALTA@@'`. La PWA reemplaza esa marca por un código de alta de un solo
 * uso antes de que el admin lo copie; la función lo canjea por la llave real.
 */

/** Vigencia del código de alta: lo que tarda el admin en pegarlo en el PC de Matrix. */
export const VIGENCIA_ALTA_MIN = 25

const RX_VERSION_EN_LECTOR = /^\$VERSION = '(e[0-9.]+)'\r?$/m
const RX_VERSION_VALIDA = /^e\d{1,2}(\.\d{1,2}){1,2}$/
const RX_CODIGO_ALTA = /^[A-Za-z0-9_-]{43}$/
const MARCA_ALTA = "$ALTA = '@@ALTA@@'"

/** Versión que declara el lector (`eX.Y`), o `null` si no trae una válida. */
export function versionDeLector(texto: string): string | null {
  const v = RX_VERSION_EN_LECTOR.exec(texto)?.[1]
  if (!v) return null
  return RX_VERSION_VALIDA.test(v) ? v : null
}

/** Formato válido de una versión publicable (`eX`, `eX.Y` o `eX.Y.Z`). */
export function esVersionValida(version: string): boolean {
  return RX_VERSION_VALIDA.test(version)
}

/**
 * Instalador con el código de alta puesto en la marca. Reemplaza exactamente una
 * marca; si no hay una sola, o el código no tiene 43 caracteres base64url, lanza error.
 */
export function instaladorConAlta(plantilla: string, codigo: string): string {
  if (!RX_CODIGO_ALTA.test(codigo)) throw new Error('El código de alta no tiene el formato esperado.')
  const partes = plantilla.split(MARCA_ALTA)
  if (partes.length !== 2) {
    throw new Error(`El instalador debe traer la marca de alta una sola vez (encontré ${partes.length - 1}).`)
  }
  return `${partes[0]}$ALTA = '${codigo}'${partes[1]}`
}
