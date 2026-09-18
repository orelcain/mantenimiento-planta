/**
 * Vigia mensual del almacenamiento (Cloud Storage del proyecto).
 *
 * Nacio de la pregunta de Orel (18-09-2026): "como manejamos la escalada de
 * fotos para no gastar mas plata". La medicion de ese dia dijo que las fotos de
 * la bitacora son el 0,2% del bucket y que el grueso son otros archivos — o sea
 * que el riesgo no es el que uno supone. Por eso esto MIDE en vez de suponer, y
 * avisa antes de que el numero importe, no despues (la fuga de costos de agosto
 * se descubrio por la factura).
 *
 * Que revisa:
 *   1. TECHO         el total del bucket contra los 5 GB que Firebase no cobra.
 *   2. CRECIMIENTO   cuanto subio desde la corrida anterior; un salto raro es
 *                    una fuga (un proceso subiendo de mas, un backfill suelto).
 *   3. HUERFANOS     objetos en bitacora/ que ningun evento menciona: archivos
 *                    que se pagan para siempre sin que nadie los pueda ver.
 *   4. CLASE         cuanto bajo ya a COLDLINE la regla de ciclo de vida.
 *
 * Uso:
 *   node scripts/vigia-almacenamiento.cjs
 *   node scripts/vigia-almacenamiento.cjs --probar-aviso
 *
 * Corre solo el dia 1 de cada mes via el Programador de tareas de Windows (ver
 * `vigia-almacenamiento.cmd`) y avisa por Telegram SOLO si hay algo que mirar.
 *
 * Salida: reporte por consola + archivo, y exit code
 *   0 = todo bien   1 = hay algo que mirar   2 = el script no pudo correr
 *
 * Necesita del repo (ambos gitignored, se leen en runtime):
 *   serviceAccountKey.json   — credencial
 *   functions/.env           — TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID
 */

const fs = require('fs')
const path = require('path')

/** El clon donde viven las credenciales (gitignored: no estan en los worktrees). */
const CLON_PRINCIPAL = 'D:\\a\\APP leventamiento de insidencias en planta'

const REPO = fs.existsSync(path.join(__dirname, '..', 'package.json'))
  ? path.join(__dirname, '..')
  : CLON_PRINCIPAL

let admin
try {
  admin = require('firebase-admin')
} catch {
  admin = require(path.join(REPO, 'node_modules', 'firebase-admin'))
}

const BUCKET = 'mantenimiento-planta-771a3.firebasestorage.app'
/** Lo que Firebase no cobra: 5 GB almacenados. */
const GRATIS_GB = 5
/** Avisar al acercarse, no al pasarlo: da tiempo a decidir sin apuro. */
const AVISO_GB = 4
const ALERTA_GB = 8
/** Un salto mayor a esto entre corridas es raro y hay que mirarlo. */
const SALTO_GB = 1.5
/** Lo que de verdad cuesta menos. El resto (STANDARD, y su nombre viejo REGIONAL) es tarifa llena. */
const CLASES_FRIAS = ['NEARLINE', 'COLDLINE', 'ARCHIVE']

/**
 * Los reportes se escriben FUERA del repo (son datos de cada corrida, no
 * codigo) y en su propia subcarpeta: al lado vive la copia de respaldo del
 * script que usa la tarea programada, y mezclarlos ensucia las dos cosas.
 */
const DIR_REPORTES = process.env.VIGIA_ALMACENAMIENTO_REPORTES
  || path.join(process.env.USERPROFILE || process.env.HOME || REPO,
    'OneDrive', 'ANTARFOOD', '_HERRAMIENTAS', 'vigia-almacenamiento', 'reportes')
const ESTADO = path.join(DIR_REPORTES, 'ultima-medicion.json')

const hallazgos = []
const lineas = []
const say = (s) => { console.log(s); lineas.push(s) }
const GB = (bytes) => bytes / 1024 ** 3
const gb = (bytes) => `${GB(bytes).toFixed(2)} GB`
const mb = (bytes) => `${(bytes / 1024 ** 2).toFixed(1)} MB`

/**
 * `functions/.env` esta gitignored: existe en el clon principal, NO en los
 * worktrees. Sin esta busqueda, correr el vigia desde un worktree no avisaba
 * por Telegram y el error se leia igual que "todo bien" (18-09-2026).
 */
function env(nombre) {
  for (const base of [REPO, CLON_PRINCIPAL]) {
    const archivo = path.join(base, 'functions', '.env')
    if (!fs.existsSync(archivo)) continue
    const m = fs.readFileSync(archivo, 'utf8').match(new RegExp(`^${nombre}=(.+)$`, 'm'))
    if (m) return m[1].trim()
  }
  return null
}

/** Aviso por Telegram — SOLO cuando hay algo que mirar (un "todo bien" mensual es ruido). */
async function avisarTelegram(texto) {
  try {
    const token = env('TELEGRAM_BOT_TOKEN')
    const chat = env('TELEGRAM_CHAT_ID')
    if (!token || !chat) { console.log('  (sin credenciales de Telegram — aviso omitido)'); return }
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: texto, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(30000),
    })
    console.log(r.ok ? '  aviso enviado a Telegram' : `  Telegram respondio ${r.status}: ${(await r.text()).slice(0, 160)}`)
  } catch (e) {
    console.log(`  no se pudo avisar por Telegram: ${e.message}`)
  }
}

async function main() {
  if (process.argv.includes('--probar-aviso')) {
    await avisarTelegram('🧪 <b>Vigia de almacenamiento</b>\nPrueba del canal. Si llego esto, el aviso real tambien va a llegar.')
    return 0
  }

  // Misma historia que el .env: la credencial vive en el clon principal.
  const credencial = [REPO, CLON_PRINCIPAL]
    .map((b) => path.join(b, 'serviceAccountKey.json'))
    .find((f) => fs.existsSync(f))
  if (!credencial) throw new Error('No se encontro serviceAccountKey.json')
  admin.initializeApp({
    credential: admin.credential.cert(require(credencial)),
    storageBucket: BUCKET,
  })
  const bucket = admin.storage().bucket()
  const [files] = await bucket.getFiles()

  const porPrefijo = new Map()
  let total = 0
  let enColdline = 0
  for (const f of files) {
    const prefijo = f.name.split('/')[0] || '(raiz)'
    const size = Number(f.metadata.size) || 0
    const p = porPrefijo.get(prefijo) || { n: 0, bytes: 0 }
    p.n++; p.bytes += size
    porPrefijo.set(prefijo, p)
    total += size
    // OJO: la clase de este bucket es REGIONAL (nombre legacy de STANDARD), no
    // 'STANDARD'. Comparar por "distinto de STANDARD" daba 100% frio (18-09-2026).
    if (CLASES_FRIAS.includes(f.metadata.storageClass)) enColdline += size
  }

  const hoy = new Date().toISOString().slice(0, 10)
  say(`Vigia de almacenamiento · ${hoy}`)
  say(`Bucket: ${BUCKET}`)
  say('')
  say(`TOTAL: ${gb(total)} en ${files.length} objetos  (sin costo hasta ${GRATIS_GB} GB)`)
  if (enColdline) say(`  de eso, ${gb(enColdline)} ya bajo a clase fria (5 veces mas barato)`)
  say('')
  say('Por carpeta:')
  for (const [k, v] of [...porPrefijo].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 12)) {
    say(`  ${k.padEnd(16)} ${String(v.n).padStart(5)} obj  ${mb(v.bytes).padStart(10)}`)
  }

  // 1. TECHO
  if (GB(total) >= ALERTA_GB) {
    hallazgos.push(`El bucket va en ${gb(total)}: ya pasa los ${ALERTA_GB} GB. Toca decidir que se archiva o se borra.`)
  } else if (GB(total) >= AVISO_GB) {
    hallazgos.push(`El bucket va en ${gb(total)} y lo gratis llega hasta ${GRATIS_GB} GB. Conviene mirar que carpeta esta creciendo.`)
  }

  // 2. CRECIMIENTO desde la corrida anterior
  let previo = null
  try { previo = JSON.parse(fs.readFileSync(ESTADO, 'utf8')) } catch { /* primera corrida */ }
  if (previo) {
    const delta = total - previo.total
    say('')
    say(`Desde ${previo.fecha}: ${delta >= 0 ? '+' : ''}${gb(delta)}`)
    for (const [k, v] of [...porPrefijo].sort((a, b) => b[1].bytes - a[1].bytes)) {
      const antes = previo.porPrefijo?.[k]?.bytes ?? 0
      const d = v.bytes - antes
      if (Math.abs(d) > 50 * 1024 ** 2) say(`  ${k.padEnd(16)} ${d >= 0 ? '+' : ''}${mb(d)}`)
    }
    if (GB(delta) >= SALTO_GB) {
      hallazgos.push(`Subio ${gb(delta)} desde ${previo.fecha}, mas de lo esperable: revisar que carpeta crecio.`)
    }
  } else {
    say('')
    say('(primera corrida: no hay con que comparar todavia)')
  }

  // 3. HUERFANOS en bitacora/
  const db = admin.firestore()
  const snap = await db.collection('bitacoraEventos').get()
  const usados = new Set()
  for (const d of snap.docs) {
    for (const f of (d.data().fotos || [])) {
      if (f?.path) usados.add(f.path)
      if (f?.thumbPath) usados.add(f.thumbPath)
    }
  }
  const objsBitacora = files.filter((f) => f.name.startsWith('bitacora/'))
  const huerfanos = objsBitacora.filter((f) => !usados.has(f.name))
  const bytesHuerfanos = huerfanos.reduce((a, o) => a + (Number(o.metadata.size) || 0), 0)
  say('')
  say(`Fotos de bitacora: ${objsBitacora.length} objetos · huerfanos: ${huerfanos.length} (${mb(bytesHuerfanos)})`)
  if (huerfanos.length > 20 || GB(bytesHuerfanos) > 0.2) {
    hallazgos.push(`Hay ${huerfanos.length} fotos huerfanas (${mb(bytesHuerfanos)}): ningun evento las menciona y se siguen pagando.`)
    for (const h of huerfanos.slice(0, 5)) say(`    huerfano: ${h.name}`)
  }

  // 4. CLASE — la regla de ciclo de vida sigue puesta. Si alguien la borra, los
  // respaldos del Grader vuelven a costar tarifa llena sin que se note.
  const [metaBucket] = await bucket.getMetadata()
  const reglas = metaBucket.lifecycle?.rule ?? []
  if (!reglas.length) {
    hallazgos.push('El bucket se quedo SIN regla de ciclo de vida: los respaldos viejos vuelven a pagar tarifa llena.')
  } else {
    say('')
    say(`Reglas de ciclo de vida: ${reglas.length}`)
    for (const r of reglas) say(`  ${r.condition?.matchesPrefix?.join(', ') || 'todo'} · a los ${r.condition?.age} dias → ${r.action?.storageClass || r.action?.type}`)
  }

  // Estado para la proxima corrida
  fs.mkdirSync(DIR_REPORTES, { recursive: true })
  fs.writeFileSync(ESTADO, JSON.stringify({
    fecha: hoy,
    total,
    porPrefijo: Object.fromEntries([...porPrefijo].map(([k, v]) => [k, v])),
  }, null, 1), 'utf8')

  say('')
  if (hallazgos.length) {
    say('HAY QUE MIRAR:')
    for (const h of hallazgos) say(`  · ${h}`)
  } else {
    say('Todo dentro de lo esperado.')
  }

  const archivo = path.join(DIR_REPORTES, `${hoy}${hallazgos.length ? '-REVISAR' : ''}.txt`)
  fs.writeFileSync(archivo, lineas.join('\r\n'), 'utf8')
  say(`\nreporte: ${archivo}`)

  if (hallazgos.length) {
    await avisarTelegram(
      `📦 <b>Almacenamiento: ${gb(total)}</b>\n\n` +
      hallazgos.map((h) => `· ${h}`).join('\n') +
      `\n\nDetalle en <code>${archivo}</code>`,
    )
  }
  return hallazgos.length ? 1 : 0
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error(e)
  process.exit(2)
})
