/**
 * validate-plant-integration.js — Smoke test de integración Shoplogix → Firestore.
 *
 * Verifica que los docs escritos por syncDay para una planta/fecha cumplan todos
 * los invariantes que deben mantenerse siempre. Útil para:
 *   - Onboarding de una planta nueva (ej. Filete)
 *   - Verificar un re-sync manual después de un bug
 *   - Diagnóstico rápido cuando la UI muestra datos incorrectos
 *
 * Uso:
 *   node scripts/validate-plant-integration.js <plantSlug> [dateKey]
 *   node scripts/validate-plant-integration.js yal 2026-04-29
 *   node scripts/validate-plant-integration.js chonchi          # usa ayer Chile
 *
 * Exit 0 = todos los checks PASS.
 * Exit 1 = al menos un check FAIL o error de conexión.
 *
 * Usa serviceAccountKey.json en la raíz del proyecto (igual que nukeShifts.js).
 */

const admin = require('firebase-admin')

// ── CLI args ──────────────────────────────────────────────────────────────────

const VALID_PLANTS = ['yal', 'chonchi', 'filete']
const plantSlug = process.argv[2]
if (!VALID_PLANTS.includes(plantSlug)) {
  console.error(`Uso: node scripts/validate-plant-integration.js <${VALID_PLANTS.join('|')}> [YYYY-MM-DD]`)
  process.exit(1)
}

/** Ayer en Chile (DST-aware, America/Santiago) como YYYY-MM-DD. */
function yesterdayChile() {
  const { toChileWall } = require('../shoplogix/polling')
  const wall = toChileWall(new Date())
  return new Date(wall.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10)
}

const dateKey = process.argv[3] || yesterdayChile()
if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
  console.error(`dateKey inválido: "${dateKey}". Formato esperado: YYYY-MM-DD`)
  process.exit(1)
}

// ── Firebase init ─────────────────────────────────────────────────────────────

const serviceAccount = require('../../serviceAccountKey.json')
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId:  'mantenimiento-planta-771a3',
})
const db = admin.firestore()

// ── Validaciones ──────────────────────────────────────────────────────────────

const VAL_TOL_MS = 5 * 60_000   // 5 min de tolerancia en los bounds

/**
 * Retorna array de strings con los problemas encontrados en un doc de máquina.
 * Array vacío = doc OK.
 */
function validateMachineDoc(data, shiftId) {
  const issues = []

  // 1. scheduleSource debe ser 'intervals' para docs sincronizados con syncDay
  if (data.scheduleSource !== 'intervals') {
    issues.push(`scheduleSource='${data.scheduleSource}' — debería ser 'intervals' (doc legacy o corrupción)`)
  }

  // 2. scheduledStart/scheduledEnd deben existir y ser coherentes
  const sStart = data.scheduledStart?.toDate?.() ?? (data.scheduledStart instanceof Date ? data.scheduledStart : null)
  const sEnd   = data.scheduledEnd?.toDate?.()   ?? (data.scheduledEnd   instanceof Date ? data.scheduledEnd   : null)

  if (!sStart || !sEnd) {
    issues.push('scheduledStart o scheduledEnd ausentes')
  } else if (sStart.getTime() >= sEnd.getTime()) {
    issues.push(`scheduledStart (${sStart.toISOString()}) >= scheduledEnd (${sEnd.toISOString()})`)
  }

  // 3. Intervals dentro de la ventana del turno
  const rawIntervals = Array.isArray(data.intervals) ? data.intervals : []
  if (rawIntervals.length === 0) {
    // Advertencia, no error: turno sin producción es posible
    issues.push('WARN: intervals vacíos (sin producción registrada)')
  } else if (sStart && sEnd) {
    const winLo = sStart.getTime() - VAL_TOL_MS
    const winHi = sEnd.getTime()   + VAL_TOL_MS
    const outOfWindow = rawIntervals.filter(iv => {
      const ts = iv.startAt?.toDate?.()?.getTime() ?? (iv.startAt instanceof Date ? iv.startAt.getTime() : NaN)
      if (!Number.isFinite(ts)) return true  // timestamp inválido → fuera de ventana
      return ts < winLo || ts > winHi
    })
    if (outOfWindow.length > 0) {
      const first = outOfWindow[0]
      const firstTs = first.startAt?.toDate?.()?.toISOString() ?? String(first.startAt)
      issues.push(
        `${outOfWindow.length}/${rawIntervals.length} intervals fuera de ventana ` +
        `[${sStart.toISOString()}→${sEnd.toISOString()}]. Primer fuera: ${firstTs}`,
      )
    }
  }

  // 4. dataQualityIssues escritas por la Capa 1 de la Cloud Function
  const cloudIssues = Array.isArray(data.dataQualityIssues) ? data.dataQualityIssues : []
  if (cloudIssues.length > 0) {
    issues.push(`dataQualityIssues (Capa 1 CF): ${cloudIssues.join(' | ')}`)
  }

  // 5. totalCycles coherente con intervals
  const totalCycles = Number(data.totalCycles ?? 0)
  const sumCycles   = rawIntervals.reduce((acc, iv) => acc + Number(iv.cycles ?? 0), 0)
  if (rawIntervals.length > 0 && Math.abs(totalCycles - sumCycles) > sumCycles * 0.02) {
    // Tolerar 2% de diferencia (redondeo)
    issues.push(`totalCycles=${totalCycles} ≠ Σintervals.cycles=${sumCycles} (delta>${((Math.abs(totalCycles-sumCycles)/Math.max(1,sumCycles))*100).toFixed(1)}%)`)
  }

  return issues
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 Validando integración Shoplogix → Firestore`)
  console.log(`   Planta : ${plantSlug}`)
  console.log(`   Día    : ${dateKey}\n`)

  // Leer todos los shifts del día
  const shiftsCol = db.collection(`shoplogix/${plantSlug}/shifts`)
  const shiftsSnap = await shiftsCol
    .where('dateKey', '==', dateKey)
    .get()

  if (shiftsSnap.empty) {
    console.log(`⚠  Sin shifts en Firestore para ${plantSlug}/${dateKey}`)
    console.log('   ¿Se ejecutó syncDay para este día?\n')
    process.exit(1)
  }

  const shiftIds = shiftsSnap.docs.map(d => d.data().shiftId || d.id).sort()
  console.log(`   Turnos encontrados: ${shiftIds.join(', ')}\n`)

  let totalChecks = 0
  let totalFails  = 0
  let totalWarns  = 0

  for (const shiftDoc of shiftsSnap.docs) {
    const shiftId = shiftDoc.data().shiftId || shiftDoc.id
    const machinesSnap = await shiftDoc.ref.collection('machines').get()

    console.log(`── ${shiftId} (${machinesSnap.size} máquinas) ──`)

    if (machinesSnap.empty) {
      console.log(`   ⚠  Sin docs de máquinas\n`)
      totalFails++
      continue
    }

    for (const machineDoc of machinesSnap.docs) {
      const data = machineDoc.data()
      const name = data.machineName || machineDoc.id
      const issues = validateMachineDoc(data, shiftId)

      totalChecks++

      const hardFails = issues.filter(i => !i.startsWith('WARN:'))
      const warns     = issues.filter(i => i.startsWith('WARN:'))

      if (hardFails.length > 0) {
        console.log(`   ❌ ${name}`)
        hardFails.forEach(i => console.log(`      → ${i}`))
        totalFails++
      } else if (warns.length > 0) {
        console.log(`   ⚠  ${name}`)
        warns.forEach(i => console.log(`      → ${i}`))
        totalWarns++
      } else {
        const ivCount  = (data.intervals || []).length
        const cycles   = Number(data.totalCycles ?? 0)
        const sch      = data.scheduleSource ?? '?'
        console.log(`   ✅ ${name} — ${ivCount} intervals, ${cycles} ciclos, source=${sch}`)
      }
    }
    console.log()
  }

  // ── Resumen ──────────────────────────────────────────────────────────────────

  console.log('═'.repeat(55))
  if (totalFails === 0 && totalWarns === 0) {
    console.log(`✅ PASS — ${totalChecks} máquina(s) OK, sin issues`)
  } else if (totalFails === 0) {
    console.log(`⚠  PASS con advertencias — ${totalChecks} máquina(s), ${totalWarns} warn(s)`)
  } else {
    console.log(`❌ FAIL — ${totalFails} fallo(s) en ${totalChecks} máquina(s) verificadas`)
  }
  console.log()

  process.exit(totalFails > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('\n❌ Error de conexión:', err.message)
  process.exit(1)
})
