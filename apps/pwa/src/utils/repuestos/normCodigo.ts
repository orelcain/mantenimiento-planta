/**
 * Clave de match de un código de fabricante: sin separadores ni acentos, en mayúsculas
 * («999 0608» y «9990608» son el mismo). Pura, sin Firestore: la usan el id de las altas de código
 * (`alta_<normCodigo>`) y la búsqueda de existentes (`useRepuestosExistentes`).
 */
/**
 * ALINEADA con firestore.rules (`codigoFabricante.upper().replace('[^A-Z0-9]', '')`): solo mayúsculas y A-Z0-9,
 * sin quitar ceros ni otra cosa. Si se cambia aquí hay que cambiar la regla. Una letra que `toUpperCase` de JS
 * expande («ß» → «SS») podría diferir del `upper()` de las reglas; no existe en códigos de fabricante.
 */
export const normCodigo = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
