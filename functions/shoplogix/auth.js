/**
 * Shoplogix Auto-Login — Fase 2b.1
 *
 * Estrategia: OAuth 2.0 Resource Owner Password Credentials (ROPC) grant.
 * identity.shoplogix.com expone `grant_type=password` lo que permite
 * autenticación server-side sin interacción del usuario ni headless browser.
 *
 * Flujo normal:
 *   SHOPLOGIX_USER + SHOPLOGIX_PASS → ROPC → access_token + refresh_token
 *   → Bearer en query.axd
 *
 * Flujo renovación (cada ~50 min, antes de expirar):
 *   refresh_token → nuevo access_token (sin user/pass)
 *
 * Flujo fallback (refresh expirado):
 *   Re-login completo con user/pass
 *
 * NOTA sobre client_secret:
 *   SAAS139 parece ser un cliente público (no requiere client_secret en
 *   el authorize redirect público). Si el token endpoint lo requiere, el
 *   error será 'invalid_client' y habrá que localizarlo en el JS del app.
 *
 * Descubrimiento OIDC: identity.shoplogix.com/.well-known/openid-configuration
 *   authorization_endpoint: /connect/authorize
 *   token_endpoint:         /connect/token
 *   grant_types_supported:  [authorization_code, password, refresh_token, ...]
 */

const IDENTITY_BASE = 'https://identity.shoplogix.com'

/** Client ID extraído del redirect: ?client_id=SAAS139 */
const CLIENT_ID = 'SAAS139'

/** Scopes del authorize redirect: openid email profile slx */
const SCOPES = 'openid email profile slx'

/**
 * Login con credenciales → tokens OIDC vía ROPC.
 * @returns {{ access_token, refresh_token, id_token, expires_in, token_type }}
 */
async function loginWithPassword({ user, password }) {
  if (!user || !password) throw new Error('[shoplogix-auth] user/password vacíos')

  const body = new URLSearchParams({
    grant_type: 'password',
    client_id:  CLIENT_ID,
    username:   user,
    password:   password,
    scope:      SCOPES,
  })

  const res = await fetch(`${IDENTITY_BASE}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)')
    const err = new Error(
      `[shoplogix-auth] Login ROPC falló: HTTP ${res.status} — ${text.slice(0, 300)}`
    )
    err.code = 'LOGIN_FAILED'
    err.status = res.status
    throw err
  }

  const tokens = await res.json()
  if (!tokens.access_token) {
    const err = new Error(`[shoplogix-auth] Login OK pero sin access_token: ${JSON.stringify(tokens).slice(0, 200)}`)
    err.code = 'LOGIN_FAILED'
    throw err
  }
  return tokens
}

/**
 * Renovar access_token con refresh_token (sin user/pass).
 * @returns {{ access_token, refresh_token, expires_in, token_type }}
 */
async function refreshAccessToken({ refreshToken }) {
  if (!refreshToken) throw new Error('[shoplogix-auth] refreshToken vacío')

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    client_id:     CLIENT_ID,
    refresh_token: refreshToken,
  })

  const res = await fetch(`${IDENTITY_BASE}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)')
    const err = new Error(
      `[shoplogix-auth] Refresh falló: HTTP ${res.status} — ${text.slice(0, 300)}`
    )
    err.code = 'REFRESH_FAILED'
    err.status = res.status
    throw err
  }

  const tokens = await res.json()
  if (!tokens.access_token) {
    const err = new Error(`[shoplogix-auth] Refresh OK pero sin access_token`)
    err.code = 'REFRESH_FAILED'
    throw err
  }
  return tokens
}

module.exports = {
  IDENTITY_BASE,
  CLIENT_ID,
  SCOPES,
  loginWithPassword,
  refreshAccessToken,
}
