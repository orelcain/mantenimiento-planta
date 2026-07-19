/**
 * Reduce el croma de un hex −50% en OKLCH (mezcla hacia gris manteniendo
 * matiz y luminosidad) — el mismo tratamiento aplicado a la paleta semántica
 * en tailwind.config.js (2026-07-19, ver /antarfood-design-system).
 *
 * Para colores que vienen EN LOS DATOS (los states de Shoplogix traen
 * `color: "#ff0000"` crudo) y por lo tanto no pasan por los tokens de
 * Tailwind. Implementación de referencia: Björn Ottosson (OKLab).
 * Cacheado: los states repiten un puñado de colores miles de veces.
 */

const cache = new Map<string, string>()

function srgbToLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c: number): number {
  const v = Math.max(0, Math.min(1, c))
  const out = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  return Math.round(Math.max(0, Math.min(1, out)) * 255)
}

function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ]
}

function oklabToHex(L: number, a: number, b: number): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
  const r = linearToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
  const g = linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
  const bb = linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(bb)}`
}

// Oklab del gris #808080 (acromático): L≈0.5998, a≈b≈0
const GRAY_L = rgbToOklab(128, 128, 128)[0]

/**
 * −50% croma para un color de acento. Acepta `#rgb` y `#rrggbb`; cualquier
 * otro formato (rgba(), nombres, undefined) se devuelve tal cual.
 */
export function softenAccentHex(hex: string): string {
  const cached = cache.get(hex)
  if (cached) return cached

  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
  if (!match) return hex
  let h = match[1]!
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')

  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)

  const [L, a, bb] = rgbToOklab(r, g, b)
  const C = Math.hypot(a, bb)
  const H = Math.atan2(bb, a)
  const newL = (L + GRAY_L) / 2
  const newC = C / 2 // el gris aporta croma 0

  const result = oklabToHex(newL, newC * Math.cos(H), newC * Math.sin(H))
  cache.set(hex, result)
  return result
}
