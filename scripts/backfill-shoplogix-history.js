/**
 * Backfill histórico Shoplogix — llama al Cloud Function shoplogixSyncHttp
 * para cada turno de graderDailySummaries que no tenga datos Shoplogix.
 *
 * La CF maneja la auth (cookie GCP Secret Manager) y escribe a Firestore.
 * Este script es idempotente: si se interrumpe y se relanza, omite los
 * turnos que ya tienen datos.
 *
 * Flags:
 *   --dry-run        Solo muestra qué haría, no llama la CF
 *   --from=YYYY-MM-DD  Procesa solo turnos desde esta fecha (default: todos)
 *   --to=YYYY-MM-DD    Hasta esta fecha (default: todos)
 *   --delay=N          Segundos entre llamadas (default: 5)
 *
 * Uso:
 *   node scripts/backfill-shoplogix-history.js
 *   node scripts/backfill-shoplogix-history.js --dry-run
 *   node scripts/backfill-shoplogix-history.js --from=2025-11-01
 */

const admin = require('firebase-admin')
const sa    = require('../serviceAccountKey.json')

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa) })
}
const db = admin.firestore()

const CF_URL = 'https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net/shoplogixSyncHttp'

const DRY_RUN  = process.argv.includes('--dry-run')
const FROM_KEY = (process.argv.find(a => a.startsWith('--from=')) || '').replace('--from=', '') || null
const TO_KEY   = (process.argv.find(a => a.startsWith('--to='))   || '').replace('--to=',   '') || null
const DELAY_MS = parseInt((process.argv.find(a => a.startsWith('--delay=')) || '').replace('--delay=', '') || '5', 10) * 1000

if (DRY_RUN) console.log('🔍 DRY RUN — no se llamará la CF\n')

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function fmt(d) {
  const now = new Date()
  const elapsed = Math.round((now - d) / 1000)
  return `+${elapsed}s`
}

async function getExistingShoplogixShifts() {
  const snap = await db.collection('shoplogix/chonchi/shifts').get()
  const existing = new Set()
  snap.docs.forEach(doc => {
    const data = doc.data()
    const okCount = (data.machines || []).filter(m => m.status === 'ok').length
    if (okCount > 0) existing.add(doc.id)
  })
  return existing
}

async function callSyncHttp(dateKey, shiftId) {
  const encodedShift = encodeURIComponent(shiftId)
  const url = `${CF_URL}?dateKey=${dateKey}&shiftId=${encodedShift}`
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  const body = await res.json()
  return { status: res.status, body }
}

async function main() {
  const startTime = new Date()
  console.log('=== BACKFILL Shoplogix → Grader histórico ===')
  console.log('Inicio:', startTime.toLocaleString('es-CL'))
  if (FROM_KEY) console.log('Desde:', FROM_KEY)
  if (TO_KEY)   console.log('Hasta:', TO_KEY)
  console.log()

  // 1. Cargar summaries
  let query = db.collection('graderDailySummaries').orderBy('dateKey')
  if (FROM_KEY) query = query.where('dateKey', '>=', FROM_KEY)
  if (TO_KEY)   query = query.where('dateKey', '<=', TO_KEY)

  console.log('Cargando graderDailySummaries...')
  const snap = await query.get()
  console.log(`  ${snap.size} turnos en el rango`)

  // 2. Shifts que ya tienen datos
  console.log('Verificando qué turnos ya tienen datos Shoplogix...')
  const existing = await getExistingShoplogixShifts()
  console.log(`  ${existing.size} turnos con datos completos (≥1 máquina OK)`)
  console.log()

  // 3. Filtrar pendientes
  const pending = snap.docs
    .map(d => ({ dateKey: d.data().dateKey, shiftId: d.data().shiftId }))
    .filter(({ dateKey, shiftId }) => !existing.has(`${dateKey}_${shiftId}`))

  console.log(`Pendientes: ${pending.length} de ${snap.size} turnos`)
  if (pending.length === 0) {
    console.log('✅ No hay nada que backfillear — todos los turnos ya tienen datos.')
    process.exit(0)
  }

  const totalTime = Math.round(pending.length * (20 + DELAY_MS / 1000) / 60)
  console.log(`Tiempo estimado: ~${totalTime} min (${DELAY_MS / 1000}s delay entre llamadas)\n`)

  if (DRY_RUN) {
    console.log('Turnos que se procesarían:')
    pending.forEach(({ dateKey, shiftId }) => console.log('  ', dateKey, shiftId))
    process.exit(0)
  }

  // 4. Backfill loop
  let ok = 0, empty = 0, errors = 0

  for (let i = 0; i < pending.length; i++) {
    const { dateKey, shiftId } = pending[i]
    const progress = `[${i + 1}/${pending.length}]`
    process.stdout.write(`${progress} ${dateKey} ${shiftId}... `)

    try {
      const { status, body } = await callSyncHttp(dateKey, shiftId)

      if (status === 401 && body.error === 'AUTH_EXPIRED') {
        console.log('\n❌ AUTH_EXPIRED — cookie expirada. Actualizar SHOPLOGIX_COOKIE en GCP Secret Manager.')
        console.log(`   Progreso: ${ok} ok, ${empty} vacíos, ${errors} errores`)
        process.exit(1)
      }

      if (status !== 200) {
        console.log(`✗ HTTP ${status}: ${body.error || 'error'}`)
        errors++
        await sleep(DELAY_MS)
        continue
      }

      const okMachines   = (body.results || []).filter(r => r.status === 'ok').length
      const emptyMachines = (body.results || []).filter(r => r.status === 'empty').length

      if (okMachines > 0) {
        const cycles = (body.results || []).reduce((s, r) => s + (r.totalCycles || 0), 0)
        console.log(`✓ ${okMachines}/3 máquinas, ${cycles.toLocaleString('es-CL')} ciclos`)
        ok++
      } else {
        console.log(`○ vacío (${emptyMachines}/3 máquinas sin datos)`)
        empty++
      }
    } catch (err) {
      console.log(`✗ ${err.message}`)
      errors++
    }

    if (i < pending.length - 1) await sleep(DELAY_MS)
  }

  const elapsed = Math.round((new Date() - startTime) / 60000)
  console.log('\n=== FIN ===')
  console.log(`Tiempo: ${elapsed} min`)
  console.log(`✓ Con datos: ${ok}`)
  console.log(`○ Vacíos (sin producción): ${empty}`)
  console.log(`✗ Errores: ${errors}`)
  process.exit(errors > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
