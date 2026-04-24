/**
 * Cliente Shoplogix API — autenticación y queries.
 *
 * Autenticación — estrategia actual (Fase 2b.0):
 *   Lee la cookie completa desde el secret SHOPLOGIX_COOKIE (Google Secret
 *   Manager). Se actualiza manualmente cuando expira (~8h).
 *
 * Estrategia futura (Fase 2b.1 — cuando capturemos el flujo de login):
 *   Lee SHOPLOGIX_USER + SHOPLOGIX_PASS desde Secret Manager y hace login
 *   automático + refresh.
 *
 * Headers realistas para no parecer bot:
 *   - User-Agent de Edge actual (Windows)
 *   - Referer del whiteboard
 *   - Accept-Language es-CL
 */

const BASE = 'https://saas139.shoplogix.com'

/** User-Agent de Edge 147 en Windows — realista. */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0'

/** Headers comunes para hacer parecer request de browser real. */
function browserHeaders(cookie) {
  return {
    'Cookie': cookie,
    'Accept': 'application/json, */*',
    'Accept-Language': 'es-CL,es;q=0.9,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'User-Agent': UA,
    'Referer': `${BASE}/whiteboard/`,
    'Sec-Ch-Ua': '"Microsoft Edge";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Pragma': 'no-cache',
    'Priority': 'u=1, i',
  }
}

/**
 * Ejecuta una query.axd GET. Lanza si HTTP no es 2xx o si la cookie expiró (401).
 */
async function queryShoplogix({ cookie, type, params = {} }) {
  if (!cookie) throw new Error('[shoplogix] cookie vacía')
  const url = new URL(`${BASE}/web/query.axd`)
  url.searchParams.set('type', type)
  url.searchParams.set('format', 'json')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))

  const res = await fetch(url.toString(), { method: 'GET', headers: browserHeaders(cookie) })

  if (res.status === 401 || res.status === 403) {
    const err = new Error(`[shoplogix] Auth expirada (HTTP ${res.status}). Refrescar SHOPLOGIX_COOKIE.`)
    err.code = 'AUTH_EXPIRED'
    err.status = res.status
    throw err
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`[shoplogix] HTTP ${res.status} en ${type}: ${body.slice(0, 200)}`)
  }
  return res.json()
}

/**
 * Valida que la cookie sigue viva llamando al endpoint más barato (tree).
 * Retorna true/false sin lanzar.
 */
async function validateCookie(cookie) {
  try {
    const data = await queryShoplogix({ cookie, type: 'tree' })
    return !!(data && data.serverid)
  } catch (e) {
    return false
  }
}

module.exports = {
  BASE,
  browserHeaders,
  queryShoplogix,
  validateCookie,
}
