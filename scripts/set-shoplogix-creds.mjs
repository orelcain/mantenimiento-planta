/**
 * Script de configuración de credenciales Shoplogix (Fase 2b.1).
 *
 * Guarda user/password en Firestore system/shoplogixCredentials para
 * que las Cloud Functions puedan hacer auto-login ROPC sin necesitar
 * secrets de Secret Manager.
 *
 * Uso:
 *   node scripts/set-shoplogix-creds.mjs <user> <password>
 *
 * Ejemplo:
 *   node scripts/set-shoplogix-creds.mjs jperez@aquachile.cl MiPass123
 *
 * Para verificar que se guardó:
 *   node scripts/set-shoplogix-creds.mjs --check
 *
 * Para borrar (vuelve a modo cookie):
 *   node scripts/set-shoplogix-creds.mjs --delete
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const CREDS_DOC = 'system/shoplogixCredentials'

// ── Buscar service account ──────────────────────────────────────────────────

function findServiceAccount() {
  const candidates = [
    './serviceAccountKey.json',
    './functions/serviceAccountKey.json',
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ].filter(Boolean)

  for (const p of candidates) {
    const abs = resolve(p)
    if (existsSync(abs)) return abs
  }
  return null
}

// ── Main ────────────────────────────────────────────────────────────────────

const [,, arg1, arg2] = process.argv

const saPath = findServiceAccount()
if (!saPath) {
  console.error('[error] No se encontró serviceAccountKey.json. Colocarlo en la raíz del proyecto.')
  process.exit(1)
}

const app = initializeApp({ credential: cert(JSON.parse(readFileSync(saPath, 'utf-8'))) })
const db = getFirestore(app)

if (arg1 === '--check') {
  const snap = await db.doc(CREDS_DOC).get()
  if (!snap.exists || !snap.data()?.user) {
    console.log('⚪ Sin credenciales en Firestore — modo cookie legado activo')
  } else {
    const d = snap.data()
    console.log(`✅ Credenciales guardadas: user=${d.user} | set_at=${d.set_at?.toDate?.()}`)
  }
  process.exit(0)
}

if (arg1 === '--delete') {
  await db.doc(CREDS_DOC).delete()
  console.log('🗑️  Credenciales eliminadas — modo cookie legado restaurado')
  process.exit(0)
}

if (!arg1 || !arg2) {
  console.error('Uso: node scripts/set-shoplogix-creds.mjs <user> <password>')
  console.error('     node scripts/set-shoplogix-creds.mjs --check')
  console.error('     node scripts/set-shoplogix-creds.mjs --delete')
  process.exit(1)
}

await db.doc(CREDS_DOC).set({
  user:     arg1,
  password: arg2,
  set_at:   new Date(),
})

console.log(`✅ Credenciales guardadas para usuario: ${arg1}`)
console.log('   El próximo sync usará auto-login ROPC automáticamente.')
process.exit(0)
