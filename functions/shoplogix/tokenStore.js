/**
 * Shoplogix Token Store — Firestore-backed token management.
 *
 * Almacena DOS tipos de datos en Firestore:
 *
 *   system/shoplogixToken (doc) — tokens OAuth (access + refresh)
 *     access_token:  string
 *     refresh_token: string
 *     expires_at:    Timestamp
 *     obtained_at:   Timestamp
 *     method:        'ropc' | 'refresh'
 *
 *   system/shoplogixCredentials (doc) — credenciales de login (opcional)
 *     user:     string  — email de login
 *     password: string  — contraseña
 *     set_at:   Timestamp — cuándo se guardaron
 *
 * Por qué Firestore y no Secret Manager:
 *   Firebase Functions v2 valida que los secrets existan en Secret Manager
 *   en DEPLOY time. Si el secret no existe, el deploy falla con 404. Para
 *   evitar que el CI explote antes de que el operador configure credenciales,
 *   las guardamos en Firestore (cifradas en reposo por GCP, acceso controlado
 *   por Firestore security rules).
 *
 * `getValidAccessToken(db, creds?, logger)` es la función principal:
 *   1. Lee el token almacenado
 *   2. Si sigue vigente (> BUFFER_MS antes de expirar) → lo devuelve
 *   3. Si está próximo a vencer → refresh con refresh_token
 *   4. Si el refresh falla → re-login completo con user/pass
 *   5. Si no hay creds → lanza AUTH_EXPIRED (no puede auto-login)
 *
 * Integración con el sync:
 *   const { getValidAccessToken } = require('./tokenStore')
 *   const creds = await getStoredCredentials(db)
 *   const accessToken = await getValidAccessToken(db, creds, logger)
 *   await syncShift({ db, accessToken, ... })
 */

const { loginWithPassword, refreshAccessToken } = require('./auth')

/** Path de tokens OAuth en Firestore */
const TOKEN_DOC = 'system/shoplogixToken'

/** Path de credenciales de login en Firestore */
const CREDS_DOC = 'system/shoplogixCredentials'

/**
 * Margen antes del vencimiento para renovar el token (5 minutos).
 * Si el token expira en < BUFFER_MS → se renueva proactivamente.
 */
const BUFFER_MS = 5 * 60 * 1000

/**
 * Lee el token almacenado en Firestore.
 * @returns {{ access_token, refresh_token, expires_at: Date } | null}
 */
async function getStoredToken(db) {
  try {
    const snap = await db.doc(TOKEN_DOC).get()
    if (!snap.exists) return null
    const data = snap.data()
    if (!data?.access_token) return null
    return {
      access_token:  data.access_token,
      refresh_token: data.refresh_token ?? null,
      expires_at:    data.expires_at?.toDate?.() ?? null,
    }
  } catch (e) {
    // No bloquear el sync por un error de lectura del token
    return null
  }
}

/**
 * Persiste tokens en Firestore.
 * @param {object} tokens - { access_token, refresh_token, expires_in (segundos) }
 * @param {string} method - 'ropc' | 'refresh'
 */
async function saveToken(db, tokens, method = 'ropc') {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + (tokens.expires_in ?? 3600) * 1000)
  await db.doc(TOKEN_DOC).set({
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_at:    expiresAt,
    obtained_at:   now,
    method,
  }, { merge: true })
}

/**
 * Obtiene un access_token válido, renovando o re-logueando si es necesario.
 *
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {{ user: string, password: string } | null} creds  — si null, solo intenta refresh
 * @param {import('firebase-functions').logger | console} log
 * @returns {Promise<string>} access_token vigente
 */
async function getValidAccessToken(db, creds, log = console) {
  const now = Date.now()

  // ── 1. Leer token almacenado ──────────────────────────────────────────────
  const stored = await getStoredToken(db)

  if (stored?.access_token && stored.expires_at) {
    const msToExpiry = stored.expires_at.getTime() - now
    if (msToExpiry > BUFFER_MS) {
      // Token vigente con margen suficiente — usarlo directamente
      log.info('[tokenStore] access_token vigente, vence en', Math.round(msToExpiry / 60000), 'min')
      return stored.access_token
    }
    log.info('[tokenStore] access_token próximo a expirar, renovando…')
  }

  // ── 2. Intentar refresh ────────────────────────────────────────────────────
  if (stored?.refresh_token) {
    try {
      const tokens = await refreshAccessToken({ refreshToken: stored.refresh_token })
      await saveToken(db, tokens, 'refresh')
      log.info('[tokenStore] access_token renovado via refresh_token')
      return tokens.access_token
    } catch (e) {
      log.warn('[tokenStore] refresh_token falló, intentando re-login:', e.message)
      // Caída al bloque de re-login abajo
    }
  }

  // ── 3. Re-login completo ───────────────────────────────────────────────────
  if (!creds?.user || !creds?.password) {
    const err = new Error('[tokenStore] No hay token válido ni credenciales para re-login. Configurar SHOPLOGIX_USER + SHOPLOGIX_PASS.')
    err.code = 'AUTH_EXPIRED'
    throw err
  }

  try {
    const tokens = await loginWithPassword({ user: creds.user, password: creds.password })
    await saveToken(db, tokens, 'ropc')
    log.info('[tokenStore] re-login ROPC exitoso')
    return tokens.access_token
  } catch (e) {
    // Propagar LOGIN_FAILED o AUTH_EXPIRED
    const err = new Error(`[tokenStore] Re-login falló: ${e.message}`)
    err.code = e.code ?? 'AUTH_EXPIRED'
    throw err
  }
}

/**
 * Limpia el token almacenado (útil para forzar re-login en el próximo sync).
 */
async function clearStoredToken(db) {
  try {
    await db.doc(TOKEN_DOC).delete()
  } catch (_) { /* ignore */ }
}

/**
 * Lee las credenciales de login desde Firestore `system/shoplogixCredentials`.
 * Retorna null si no están configuradas (modo cookie legacy activo).
 *
 * Para configurar las credenciales, usar el helper CLI:
 *   node scripts/set-shoplogix-creds.js <user> <password>
 * O directamente desde Firebase Console → Firestore → system/shoplogixCredentials
 */
async function getStoredCredentials(db) {
  try {
    const snap = await db.doc(CREDS_DOC).get()
    if (!snap.exists) return null
    const data = snap.data()
    if (!data?.user || !data?.password) return null
    return { user: data.user, password: data.password }
  } catch (e) {
    return null
  }
}

/**
 * Persiste credenciales de login en Firestore.
 * Solo debe llamarse desde un admin autenticado o desde un script de setup.
 */
async function saveCredentials(db, { user, password }) {
  await db.doc(CREDS_DOC).set({
    user,
    password,
    set_at: new Date(),
  })
}

module.exports = {
  TOKEN_DOC,
  CREDS_DOC,
  getStoredToken,
  saveToken,
  getValidAccessToken,
  clearStoredToken,
  getStoredCredentials,
  saveCredentials,
}
