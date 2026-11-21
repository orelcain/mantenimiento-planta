/**
 * Llave del lector del espejo del grader (lógica pura, sin Firestore).
 *
 * La llave son 32 bytes aleatorios en base64url (43 caracteres). Solo se guarda su
 * sha256 en hex (id del documento `graderEspejoLlaves/{hash}`): la función de
 * ingesta la recibe en `Authorization: Bearer` y compara el hash.
 */

const RX_LLAVE = /^[A-Za-z0-9_-]{43}$/
const RX_HASH = /^[0-9a-f]{64}$/

export function esLlaveValida(llave: string): boolean {
  return RX_LLAVE.test(llave)
}

export function esHashValido(hash: string): boolean {
  return RX_HASH.test(hash)
}

/** base64url sin relleno. */
export function aBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function aHex(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const b of u) s += b.toString(16).padStart(2, '0')
  return s
}

/** sha256 en hex de un texto (UTF-8). */
export async function sha256Hex(texto: string): Promise<string> {
  const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return aHex(dig)
}

/** Llave nueva y su hash. La llave en claro NO se guarda ni se registra en ninguna parte. */
export async function generarLlave(): Promise<{ llave: string; hash: string }> {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const llave = aBase64Url(bytes)
  return { llave, hash: await sha256Hex(llave) }
}

/** Nombre corto de la llave: sin espacios sobrantes y de hasta 60 caracteres. */
export function limpiarNombre(nombre: string): string {
  return nombre.replace(/\s+/g, ' ').trim().slice(0, 60)
}
