/*
  Seed (crear) un perfil de usuario en Firestore: /users/{uid}

  Requisitos:
  - Tener credenciales de servicio configuradas (recomendado):
      $env:GOOGLE_APPLICATION_CREDENTIALS="C:\ruta\service-account.json"

  Uso:
    node scripts/seed_user_profile.js --uid <UID> --email <email> --nombre <Nombre> --apellido <Apellido> --rol usuario

  Flags:
    --activo true|false (default: true)
    --force (si el doc existe, lo actualiza)

  Nota: usando firebase-admin, esto escribe directo (no aplica firestore.rules).
*/

const admin = require('firebase-admin')

const ALLOWED_ROLES = new Set(['admin', 'supervisor', 'tecnico', 'usuario'])

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)

    // flags sin valor
    if (key === 'force' || key === 'help') {
      args[key] = true
      continue
    }

    const value = argv[i + 1]
    if (value == null || value.startsWith('--')) {
      args[key] = true
      continue
    }
    args[key] = value
    i++
  }
  return args
}

function toBool(v, defaultValue) {
  if (v == null) return defaultValue
  if (typeof v === 'boolean') return v
  const s = String(v).trim().toLowerCase()
  if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false
  return defaultValue
}

function printHelp() {
  console.log('=== seed_user_profile ===')
  console.log('Crea/actualiza /users/{uid} en Firestore')
  console.log('')
  console.log('Uso:')
  console.log('  node scripts/seed_user_profile.js --uid <UID> --email <email> --nombre <Nombre> --apellido <Apellido> --rol usuario')
  console.log('')
  console.log('Opcional:')
  console.log('  --activo true|false   (default: true)')
  console.log('  --force               (si existe, actualiza)')
  console.log('')
  console.log('Ejemplo (PowerShell):')
  console.log('  $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\ruta\\service-account.json"')
  console.log('  node scripts/seed_user_profile.js --uid "..." --email "..." --nombre "..." --apellido "..." --rol usuario')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    printHelp()
    process.exit(0)
  }

  const uid = String(args.uid || '').trim()
  const email = String(args.email || '').trim()
  const nombre = String(args.nombre || '').trim()
  const apellido = String(args.apellido || '').trim()
  const rol = String(args.rol || 'usuario').trim()
  const activo = toBool(args.activo, true)
  const force = Boolean(args.force)

  if (!uid || !email || !nombre || !apellido) {
    console.error('[seed_user_profile] Falta --uid/--email/--nombre/--apellido')
    printHelp()
    process.exit(1)
  }

  if (!ALLOWED_ROLES.has(rol)) {
    console.error(`[seed_user_profile] Rol inválido: ${rol}. Permitidos: ${Array.from(ALLOWED_ROLES).join(', ')}`)
    process.exit(1)
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn('[seed_user_profile] Aviso: GOOGLE_APPLICATION_CREDENTIALS no está definido. Si esto falla, configura la variable con tu service-account.json')
  }

  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    })
  }

  const db = admin.firestore()
  const ref = db.collection('users').doc(uid)
  const snap = await ref.get()

  if (snap.exists && !force) {
    console.log('[seed_user_profile] El documento ya existe. No se hizo nada (usa --force para actualizar).')
    console.log({ uid, existing: snap.data() })
    return
  }

  const now = admin.firestore.FieldValue.serverTimestamp()

  if (!snap.exists) {
    await ref.set(
      {
        email,
        nombre,
        apellido,
        rol,
        activo,
        createdAt: now,
        updatedAt: now,
      },
      { merge: false },
    )

    console.log('[seed_user_profile] Perfil creado OK')
    console.log({ uid, email, rol, activo })
    return
  }

  // force update
  const existing = snap.data() || {}
  await ref.set(
    {
      email,
      nombre,
      apellido,
      rol,
      activo,
      createdAt: existing.createdAt || now,
      updatedAt: now,
    },
    { merge: true },
  )

  console.log('[seed_user_profile] Perfil actualizado OK (--force)')
  console.log({ uid, email, rol, activo })
}

main().catch((err) => {
  console.error('[seed_user_profile] Error:', err)
  process.exit(1)
})
