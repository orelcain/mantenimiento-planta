/**
 * Helpers de tiempo Shoplogix — formato "YYYYMMDDTHHMMSS.fff".
 */

const RE_SLX = /^\d{8}T\d{6}\.\d{3}$/

function parseShoplogixTime(s) {
  if (!s || !RE_SLX.test(s)) throw new Error(`Timestamp Shoplogix inválido: ${JSON.stringify(s)}`)
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` +
              `T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}.${s.slice(16, 19)}Z`
  const d = new Date(iso)
  if (isNaN(d.getTime())) throw new Error(`Fecha inválida tras parsear: ${iso}`)
  return d
}

function toShoplogixTime(d) {
  if (isNaN(d.getTime())) throw new Error('Date inválido')
  const pad = (n, l = 2) => String(n).padStart(l, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
         `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}` +
         `.${pad(d.getUTCMilliseconds(), 3)}`
}

module.exports = { parseShoplogixTime, toShoplogixTime }
